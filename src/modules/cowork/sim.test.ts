// 코어 런타임 여러 개가 메모리 허브 하나를 함께 쓰는 시뮬레이터 (src/modules/gacha/sim.test.ts와 같은 방식)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../preload/api';
import pomodoro from '@modules/pomodoro';
import { start as startTimer, type Local } from '@modules/pomodoro/logic';
import rooms from '@modules/rooms';
import { createRoom, joinRoom } from '@modules/rooms/state';
import cowork from './index';
import { LEAD_MS } from './logic';
import { begin, end, join, open, viewOf } from './state';

const M = 60_000;
let hub: MemoryHub;

async function app(name: string) {
  const disk = new Map<string, unknown>();
  const notes: Array<{ title: string; body: string }> = [];
  const bridge = {
    version: 0,
    invoke: async (ch: string, args: { path?: string; data?: unknown; title?: string; body?: string }) => {
      if (ch === 'store.read') return disk.get(args.path!) ?? null;
      if (ch === 'store.write') disk.set(args.path!, args.data);
      if (ch === 'notify.show') notes.push({ title: args.title!, body: args.body! });
      return null;
    },
    on: () => () => {},
    invokeModule: async () => null,
  } as unknown as Bridge;
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn(`dev-${name}`);
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: { name } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  const ms = [rooms, pomodoro, cowork] as ModuleManifest[];
  await core.preloadLocal(ms);
  await core.start(ms);
  await vi.advanceTimersByTimeAsync(0);
  const toasts = () => core.toasts.get().map((t) => t.text);
  const bubble = (who: string) => core.bubbleOf(core.seats.get().find((s) => s.uid === who)!);
  return { core, uid, ctx: core.ctxs.get('cowork')!.ctx, rooms: core.ctxs.get('rooms')!.ctx, pomo: core.ctxs.get('pomodoro')!.ctx, notes, toasts, bubble };
}

describe('같이 작업하기 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('연 사람이 시작하면 참여자들이 같은 끝 시각으로 집중하고 쉬며 공유한 목표만 방에 쓴다', async () => {
    const a = await app('alice');
    expect(await createRoom(a.rooms, 4)).toBeNull();
    const code = a.ctx.room.current()!;
    const b = await app('bob');
    expect(await joinRoom(b.rooms, code)).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);

    // alice가 열면 자동으로 참여하고 bob에게 초대 알림이 한 번 뜬다
    expect(await open(a.ctx, { title: '원고', f: 50, b: 10 }, '비밀 목표', false)).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.toasts()).toContain('alice님이 같이 작업하기를 열었어요.');
    expect(a.toasts()).not.toContain('alice님이 같이 작업하기를 열었어요.');
    const sid = viewOf(a.ctx).cur!.id;
    expect(hub.read(`mod/cowork/r/${code}/parts/alice`)).toEqual({ sid, at: expect.any(Number), v: 1 });
    expect(viewOf(a.ctx).goal).toBe('비밀 목표');

    expect(await join(b.ctx, '러프 끝내기', true)).toBe(true);
    expect(hub.read(`mod/cowork/r/${code}/parts/bob`)).toMatchObject({ sid, goal: '러프 끝내기' });
    // 시작 전에는 머리 위에 띄우지 않는다
    expect(a.bubble('bob') ?? '').not.toMatch(/함께/);

    // 개설자가 아닌 bob은 시작하지 못하고 끝내지도 못한다
    await expect(begin(b.ctx)).rejects.toThrow('지금은 시작할 수 없어요.');
    await expect(end(b.ctx)).rejects.toThrow('이미 끝난 세션이에요.');

    await begin(a.ctx);
    await vi.advanceTimersByTimeAsync(LEAD_MS + 1000);
    expect(b.toasts()).toContain('함께 집중을 시작해요. 50분 집중해요.');
    expect(a.bubble('bob')).toBe('함께 집중 50분 남음');
    expect(b.bubble('alice')).toBe('함께 집중 50분 남음');

    // 진행 중에는 방에 쓰지 않는다
    const before = JSON.stringify(hub.read(`mod/cowork/r/${code}`));
    await vi.advanceTimersByTimeAsync(12 * M);
    expect(JSON.stringify(hub.read(`mod/cowork/r/${code}`))).toBe(before);
    expect(b.bubble('bob')).toBe('함께 집중 38분 남음');

    await vi.advanceTimersByTimeAsync(38 * M);
    expect(b.toasts()).toContain('집중이 끝났어요. 10분 쉬어요.');
    expect(b.notes).toContainEqual({ title: '같이 작업하기', body: '집중이 끝났어요. 10분 쉬어요.' });
    // 휴식 중에는 새로 참여하지 못한다
    const c = await app('carol');
    expect(await joinRoom(c.rooms, code)).toBeNull();
    await expect(join(c.ctx, '', false)).rejects.toThrow('지금은 참여할 수 없어요.');

    await vi.advanceTimersByTimeAsync(10 * M);
    expect(a.notes).toContainEqual({ title: '같이 작업하기', body: '같이 작업이 끝났어요.' });
    expect(a.bubble('alice') ?? '').not.toMatch(/함께/);
  });

  it('참여 중에 개인 뽀모도로를 시작하면 세션에서 나오고 두 사람이 동시에 열면 하나만 남는다', async () => {
    const a = await app('alice');
    await createRoom(a.rooms, 4);
    const code = a.ctx.room.current()!;
    const b = await app('bob');
    await joinRoom(b.rooms, code);
    await vi.advanceTimersByTimeAsync(1000);

    const both = await Promise.allSettled([open(a.ctx, { title: '', f: 25, b: 5 }, '', false), open(b.ctx, { title: '', f: 25, b: 5 }, '', false)]);
    expect(both.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(both.find((r) => r.status === 'rejected')).toMatchObject({ reason: new Error('이미 같이 작업하는 중이에요.') });
    const winner = both[0]!.status === 'fulfilled' ? a : b;
    const other = winner === a ? b : a;
    await join(other.ctx, '', false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hub.read(`mod/cowork/r/${code}/parts/${other.uid}`)).toBeTruthy();

    other.pomo.local.update<Local>('device', (l) => ({ ...l, run: startTimer(l, Date.now()) }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(hub.read(`mod/cowork/r/${code}/parts/${other.uid}`)).toBeNull();
    expect(other.toasts()).toContain('개인 뽀모도로를 시작해서 같이 작업하기에서 나왔어요.');

    // 방 주인 alice는 bob이 연 세션도 끝낸다
    await end(a.ctx);
    await vi.advanceTimersByTimeAsync(1000);
    expect(viewOf(b.ctx).cur?.st).toBe('stop');
  });

  it('방을 나오면 그 방의 내 참여를 지운다', async () => {
    const a = await app('alice');
    await createRoom(a.rooms, 4);
    const code = a.ctx.room.current()!;
    await open(a.ctx, { title: '', f: 25, b: 5 }, '', false);
    expect(hub.read(`mod/cowork/r/${code}/parts/alice`)).toBeTruthy();
    await a.ctx.room.leave();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hub.read(`mod/cowork/r/${code}/parts/alice`)).toBeNull();
    expect(viewOf(a.ctx).code).toBeNull();
  });
});
