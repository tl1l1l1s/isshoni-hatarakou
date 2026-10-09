// 가짜 ctx로 안 읽은 수, 알림, 말풍선 만료를 확인한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '@core/types';
import { msgKey, SAY_MS, type Item, type Local } from './logic';
import { CHAT_OFF, flash, intercept, ROOM_CHANGED, says, send, setOpen, view, watchRoom } from './state';

const item = (t: number, uid: string, text = 'x'): Item => ({ key: msgKey(t, uid), value: { uid, name: uid, text, at: t, v: 1 } });

function fake(read: Local['read'] = {}) {
  let local: Local = { read };
  let onRoom = (_c: string | null) => {};
  let onList = (_i: Item[]) => {};
  let onCfg = (_v: { on: boolean } | null) => {};
  const set = vi.fn(async () => {});
  const ctx = {
    self: { uid: () => 'me', name: () => 'me' },
    room: { current: () => null, onChange: (fn: typeof onRoom) => ((onRoom = fn), () => {}) },
    server: {
      room: () => ({
        watch: (_k: string, fn: typeof onCfg) => ((onCfg = fn), () => {}),
        watchList: (_k: string, _o: unknown, fn: typeof onList) => ((onList = fn), () => {}),
        set,
      }),
    },
    local: { get: () => local, update: (_s: string, fn: (l: Local) => Local) => void (local = fn(local)) },
    notify: vi.fn(),
    bus: { emit: vi.fn() },
    seats: { refresh: vi.fn() },
    ui: { open: vi.fn() },
    timers: { at: (ms: number, fn: () => void) => clearTimeout.bind(null, setTimeout(fn, ms)) },
    clock: { serverNow: () => 1_000 },
  } as unknown as Ctx;
  watchRoom(ctx);
  return { ctx, enter: (c: string) => onRoom(c), push: (i: Item[]) => onList(i), cfg: (v: { on: boolean }) => onCfg(v), local: () => local, set };
}

describe('안 읽은 수와 알림 (COM-02)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('처음 들어온 방의 지난 대화는 읽은 것으로 치고 그 뒤 남의 메시지만 세며 창을 열면 0이 된다', () => {
    const f = fake();
    f.enter('R');
    const old = item(1, 'bob');
    f.push([old]);
    expect(view(f.ctx).unread).toBe(0);
    expect(f.local().read.R).toBe(old.key);
    expect(f.ctx.notify).not.toHaveBeenCalled();

    const mine = item(3, 'me');
    f.push([old, item(2, 'bob', '안녕'), mine]);
    expect(view(f.ctx).unread).toBe(1);
    expect(f.ctx.notify).toHaveBeenCalledTimes(1);
    expect(f.ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'bob', body: '안녕' }));
    expect(f.ctx.bus.emit).toHaveBeenCalledWith('chat.heard', { uid: 'bob' });

    setOpen(f.ctx, true);
    expect(view(f.ctx).unread).toBe(0);
    expect(f.local().read.R).toBe(mine.key);
    // 열려 있는 동안 온 것은 바로 읽고 알리지 않는다
    f.push([old, item(2, 'bob'), mine, item(4, 'bob')]);
    expect(view(f.ctx).unread).toBe(0);
    expect(f.ctx.notify).toHaveBeenCalledTimes(1);
  });

  it('다시 켜면 저장해 둔 읽은 자리 뒤부터 센다', () => {
    const a = item(1, 'bob');
    const f = fake({ R: a.key });
    f.enter('R');
    f.push([a, item(2, 'bob'), item(3, 'carol')]);
    expect(view(f.ctx).unread).toBe(2);
    // 지난 대화는 알리지 않는다
    expect(f.ctx.notify).not.toHaveBeenCalled();
  });

  it('새 메시지는 보낸 사람 머리 위에 6초 뜬다', () => {
    const f = fake();
    f.enter('R');
    f.push([]);
    f.push([item(2, 'bob', '안녕')]);
    expect(says.get('bob')?.text).toBe('안녕');
    vi.advanceTimersByTime(SAY_MS);
    expect(says.has('bob')).toBe(false);
  });
});

describe('말풍선 만료 (COM-09)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('새 글이 덮으면 앞 글의 타이머는 지우지 않고 뜰 때와 질 때 좌석을 다시 그린다', () => {
    const { ctx } = fake();
    const map = new Map<string, { text: string }>();
    flash(ctx, map, 'bob', '하나', 6_000);
    expect(ctx.seats.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_000);
    flash(ctx, map, 'bob', '둘', 6_000);
    vi.advanceTimersByTime(3_000);
    expect(map.get('bob')?.text).toBe('둘');
    expect(ctx.seats.refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(3_000);
    expect(map.has('bob')).toBe(false);
    expect(ctx.seats.refresh).toHaveBeenCalledTimes(3);
  });
});

describe('보내기', () => {
  it('키는 시각_uid이고 서버 시각으로 쓰며 채팅이 꺼져 있으면 거절한다', async () => {
    const f = fake();
    f.enter('R');
    await send(f.ctx, '  안녕  ');
    expect(f.set).toHaveBeenCalledWith(msgKey(1_000, 'me'), { uid: 'me', name: 'me', text: '안녕', at: { '.sv': 'timestamp' }, v: 1 });
    await send(f.ctx, '   ');
    expect(f.set).toHaveBeenCalledTimes(1);
    f.cfg({ on: false });
    await expect(send(f.ctx, '안녕')).rejects.toThrow(CHAT_OFF);
  });

  it('글을 쓸 때 들어가 있던 방과 지금 방이 다르면 보내지 않는다 (다시 보내기)', async () => {
    const f = fake();
    f.enter('A');
    await expect(send(f.ctx, '안녕', 'B')).rejects.toThrow(ROOM_CHANGED);
    expect(f.set).not.toHaveBeenCalled();
    await send(f.ctx, '안녕', 'A');
    expect(f.set).toHaveBeenCalledTimes(1);
  });

  it('intercept가 받은 글은 채팅으로 보내지 않는다 (춤 명령, 날리기)', async () => {
    const f = fake();
    f.enter('R');
    const off = intercept(f.ctx, (t) => t === '/80');
    await send(f.ctx, ' /80 ');
    expect(f.set).not.toHaveBeenCalled();
    off();
    await send(f.ctx, '/80');
    expect(f.set).toHaveBeenCalledTimes(1);
  });
});
