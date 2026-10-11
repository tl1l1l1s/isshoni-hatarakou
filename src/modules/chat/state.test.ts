// 가짜 ctx로 안 읽은 수, 알림, 말풍선 만료를 확인한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '@core/types';
import { msgKey, NOTE_GAP_MS, SAY_MS, type Item, type Local } from './logic';
import { CHAT_OFF, flash, intercept, nameOf, ROOM_CHANGED, says, send, setOpen, UNSENT, view, watchRoom } from './state';

const item = (t: number, uid: string, text = 'x', name = uid): Item => ({ key: msgKey(t, uid), value: { uid, name, text, at: t, v: 1 } });

function fake(read: Local['read'] = {}, out: Local['out'] = []) {
  let local: Local = { read, out };
  let onRoom = (_c: string | null) => {};
  let onList = (_i: Item[]) => {};
  let onCfg = (_v: { on: boolean } | null) => {};
  const set = vi.fn(async (_k: string, _v: unknown) => {});
  const settings = { fontSize: 'm', osNotify: true };
  const conn = { online: true };
  const ctx = {
    self: { uid: () => 'me', name: () => 'me' },
    room: {
      current: () => null,
      onChange: (fn: typeof onRoom) => ((onRoom = fn), () => {}),
      members: () => [{ uid: 'bob', key: 'bob_pc', name: '밥' }],
    },
    server: {
      room: () => ({
        watch: (_k: string, fn: typeof onCfg) => ((onCfg = fn), () => {}),
        watchList: (_k: string, _o: unknown, fn: typeof onList) => ((onList = fn), () => {}),
        set,
      }),
    },
    users: { profile: async (uid: string) => (uid === 'carol' ? { name: '캐롤' } : null) },
    local: { get: () => local, update: (_s: string, fn: (l: Local) => Local) => void (local = fn(local)) },
    settings: { get: () => settings },
    connection: { online: () => conn.online },
    notify: vi.fn(),
    bus: { emit: vi.fn() },
    seats: { refresh: vi.fn() },
    ui: { open: vi.fn() },
    timers: { at: (ms: number, fn: () => void) => clearTimeout.bind(null, setTimeout(fn, ms)) },
    clock: { now: () => Date.now(), serverNow: () => 1_000 },
    log: { warn: vi.fn() },
  } as unknown as Ctx;
  watchRoom(ctx);
  return { ctx, enter: (c: string) => onRoom(c), push: (i: Item[]) => onList(i), cfg: (v: { on: boolean }) => onCfg(v), local: () => local, set, settings, conn };
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
    // 제목은 글에 적힌 이름이 아니라 방 멤버 이름이다
    expect(f.ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ title: '밥', body: '안녕' }));
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

  it('서버가 거절하면 원문은 기록에만 남기고 다시 보내라고 알린다', async () => {
    const f = fake();
    f.enter('R');
    f.set.mockRejectedValueOnce(new Error('PERMISSION_DENIED: mod/chat/r/R/msgs/x'));
    await expect(send(f.ctx, '안녕')).rejects.toThrow('잠시 뒤에 다시 보내기를 눌러 주세요.');
    expect(f.ctx.log.warn).toHaveBeenCalledWith(expect.stringContaining('PERMISSION_DENIED'));
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

describe('새 메시지 OS 알림 (D5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('30초 안에 따로 온 글 다섯 개는 알림 하나와 30초 뒤 요약 하나가 되고 설정을 끄면 띄우지 않는다', () => {
    const f = fake();
    f.enter('R');
    f.push([]);
    const items: Item[] = [];
    for (let i = 1; i <= 5; i++) {
      items.push(item(i, 'bob', `메시지 ${i}`));
      f.push([...items]);
      vi.advanceTimersByTime(400);
    }
    expect(f.ctx.notify).toHaveBeenCalledTimes(1);
    expect(f.ctx.notify).toHaveBeenLastCalledWith(expect.objectContaining({ title: '밥', body: '메시지 1' }));
    vi.advanceTimersByTime(NOTE_GAP_MS);
    expect(f.ctx.notify).toHaveBeenCalledTimes(2);
    expect(f.ctx.notify).toHaveBeenLastCalledWith(expect.objectContaining({ title: '대화하기', body: '새 메시지가 4개 더 왔어요.' }));

    // 창을 열면 미뤄 둔 요약은 버린다
    items.push(item(10, 'bob'));
    f.push([...items]);
    setOpen(f.ctx, true);
    setOpen(f.ctx, false);
    vi.advanceTimersByTime(NOTE_GAP_MS);
    expect(f.ctx.notify).toHaveBeenCalledTimes(2);

    f.settings.osNotify = false;
    items.push(item(20, 'bob'));
    f.push([...items]);
    vi.advanceTimersByTime(NOTE_GAP_MS);
    expect(f.ctx.notify).toHaveBeenCalledTimes(2);
    // 앱 알림음 신호는 그대로 간다
    expect(f.ctx.bus.emit).toHaveBeenLastCalledWith('chat.heard', { uid: 'bob' });
  });
});

describe('보내는 중과 끊김 (RES-2, errors-security/F1)', () => {
  it('끊긴 동안에는 쓰지 않고 끊김 안내로 거절한다', async () => {
    const f = fake();
    f.enter('R');
    f.conn.online = false;
    await expect(send(f.ctx, '안녕')).rejects.toThrow('연결이 끊겨서 보내지 못했어요.');
    expect(f.set).not.toHaveBeenCalled();
    expect(f.local().out).toEqual([]);
  });

  it('서버가 받을 때까지 보내는 중으로 두고 그동안 이 PC 파일에 남긴다', async () => {
    says.clear();
    const f = fake();
    f.enter('R');
    f.push([]);
    let ack = () => {};
    f.set.mockImplementationOnce(() => new Promise<void>((r) => (ack = r)));
    const sent = send(f.ctx, '안녕');
    const key = msgKey(1_000, 'me');
    expect(view(f.ctx).sending).toEqual([key]);
    expect(f.local().out).toEqual([{ room: 'R', key, text: '안녕' }]);
    // 서버가 받기 전에 목록에 보여도 말풍선은 띄우지 않는다
    f.push([item(1_000, 'me', '안녕')]);
    expect(says.get('me')).toBeUndefined();
    ack();
    await sent;
    expect(view(f.ctx).sending).toEqual([]);
    expect(f.local().out).toEqual([]);
    expect(says.get('me')?.text).toBe('안녕');
  });

  it('지난 실행에서 보내는 중에 끈 글은 서버에 없으면 보내지 못한 글로, 있으면 지우기만 한다', () => {
    const lost = { room: 'R', key: msgKey(5, 'me'), text: '잃은 글' };
    const got = { room: 'R', key: msgKey(6, 'me'), text: '닿은 글' };
    const other = { room: 'Q', key: msgKey(7, 'me'), text: '다른 방' };
    const f = fake({}, [lost, got, other]);
    f.enter('R');
    f.push([item(6, 'me', '닿은 글')]);
    expect(view(f.ctx).failed).toEqual([{ text: '잃은 글', error: UNSENT, code: 'R' }]);
    expect(f.local().out).toEqual([other]);
  });
});

describe('보낸 사람 이름 (errors-security/F6)', () => {
  it('글에 적힌 이름 대신 방 멤버 이름, 방에 없으면 공개 프로필 이름을 쓴다', async () => {
    const f = fake();
    f.enter('R');
    f.push([item(1, 'bob', '코드 보내 줘', 'alice'), item(2, 'carol', '안녕', 'alice')]);
    expect(nameOf(f.ctx, view(f.ctx).items[0]!.value)).toBe('밥');
    // 프로필을 읽기 전에는 적힌 이름을 쓴다
    expect(nameOf(f.ctx, view(f.ctx).items[1]!.value)).toBe('alice');
    await vi.waitFor(() => expect(nameOf(f.ctx, view(f.ctx).items[1]!.value)).toBe('캐롤'));
  });
});
