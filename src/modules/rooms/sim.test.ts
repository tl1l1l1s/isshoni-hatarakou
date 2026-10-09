// 코어 런타임 여러 개가 메모리 허브 하나를 함께 쓰는 시뮬레이터 (tests/sim/room.test.ts와 같은 방식)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../preload/api';
import rooms from './index';
import type { Local } from './logic';
import { createRoom, joinRoom } from './state';

let hub: MemoryHub;
let disk: Map<string, unknown>;

const bridge = {
  version: 0,
  invoke: async (ch: string, args: { path?: string; data?: unknown }) => {
    if (ch === 'store.read') return disk.get(args.path!) ?? null;
    if (ch === 'store.write') disk.set(args.path!, args.data);
    return null;
  },
  on: () => () => {},
  invokeModule: async () => null,
} as unknown as Bridge;

async function app(name: string) {
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn(`dev-${name}`);
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: { name } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  const ms = [rooms as ModuleManifest];
  await core.preloadLocal(ms);
  await core.start(ms);
  await vi.advanceTimersByTimeAsync(0); // 자동 재입장
  const ctx = core.ctxs.get('rooms')!.ctx;
  return { core, ctx, toasts: () => core.toasts.get().map((t) => t.text), local: () => ctx.local.get<Local>('account') };
}

describe('rooms 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
    disk = new Map();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('정원 3명인 방에 넷이 거의 동시에 들어오면 가장 늦은 한 명만 스스로 나간다', async () => {
    const [a, b, c, d] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map(app));
    expect(await createRoom(a!.ctx, 3)).toBeNull();
    const code = a!.ctx.room.current()!;
    expect(hub.read(`mod/rooms/r/${code}/cfg`)).toEqual({ cap: 3, v: 1 });
    await vi.advanceTimersByTimeAsync(1_000);

    // 셋이 같은 시각에 들어온다. joinedAt이 같으면 키 순서로 dave_pc가 가장 늦다
    expect(await Promise.all([b!, c!, d!].map((x) => joinRoom(x.ctx, code)))).toEqual([null, null, null]);
    await vi.advanceTimersByTimeAsync(0);

    expect([a, b, c, d].map((x) => x!.ctx.room.current())).toEqual([code, code, code, null]);
    for (const x of [a, b, c]) expect(x!.ctx.room.members().map((s) => s.uid).sort()).toEqual(['alice', 'bob', 'carol']);
    expect(Object.keys(hub.read(`rooms/${code}/members`) as object)).toHaveLength(3);
    expect(d!.toasts()).toContain('정원 3명이 차서 방에서 나왔습니다.');
    expect(d!.local().lastRoom).toBeNull();
    // 친구가 따라 들어갈 수 있게 지금 방 코드를 계정 접속 기록에 쓴다 (나오면 지운다)
    expect(hub.read('users/bob/presence/m/rooms')).toEqual({ code });
    expect(hub.read('users/dave/presence/m/rooms')).toBeNull();

    // 주인 캐시: 주인이 아니면 rooms.remove가 이유를 돌려준다
    expect(a!.core.registry.reason('rooms.remove')).toBeNull();
    expect(b!.core.registry.reason('rooms.remove')).toBe('방 주인만 지울 수 있습니다.');
    expect(d!.core.registry.reason('rooms.remove')).toBe('방에 들어가 있지 않습니다.');
  });

  it('주인이 지운 방은 다음에 켤 때 자동 재입장에서 거절되고 최근 목록에서 빠진다', async () => {
    const a = await app('alice');
    const b = await app('bob');
    await createRoom(a.ctx, 4);
    const code = a.ctx.room.current()!;
    expect(await joinRoom(b.ctx, code)).toBeNull();
    expect(b.local()).toEqual({ lastRoom: code, recent: [code] });

    await a.core.registry.run('rooms.remove');
    await vi.advanceTimersByTimeAsync(0);
    expect(b.ctx.room.current()).toBeNull();
    expect(hub.read(`mod/rooms/r/${code}/cfg`)).toBeNull();
    expect(a.local()).toEqual({ lastRoom: null, recent: [] });

    // bob이 앱을 다시 켠다. 파일에는 지운 방이 마지막 방으로 남아 있다
    await b.core.flush();
    const b2 = await app('bob');
    expect(b2.toasts()).toContain('주인이 지운 방입니다.');
    expect(b2.local()).toEqual({ lastRoom: null, recent: [] });
  });

  it('스스로 나가면 다음에 켤 때 다시 들어가지 않고 그냥 끄면 다시 들어간다', async () => {
    const a = await app('alice');
    await createRoom(a.ctx, 2);
    const code = a.ctx.room.current()!;
    await a.core.flush();
    expect((await app('alice')).ctx.room.current()).toBe(code);

    await a.core.registry.run('rooms.leave');
    await a.core.flush();
    expect((await app('alice')).ctx.room.current()).toBeNull();
  });
});
