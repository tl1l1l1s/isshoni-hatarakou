// 코어 런타임 두 개가 메모리 허브 하나를 함께 쓰며 방 이벤트와 계정 접속 상태를 주고받는다 (M2b 계약)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import { defineModule, type AccountPresence, type RoomEventMsg } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../src/preload/api';

let hub: MemoryHub;

const bridge = { version: 0, invoke: async () => null, on: () => () => {}, invokeModule: async () => null } as unknown as Bridge;

const demo = defineModule({
  id: 'demo',
  roomEvents: { wave: { schema: z.object({ n: z.number() }), perMinute: 2 } },
  accountPresence: { code: z.string().nullable() },
  setup: () => undefined,
});

async function app(name: string) {
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn(`dev-${name}`);
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: { name } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  await core.start([demo]);
  const ctx = core.ctxs.get('demo')!.ctx;
  const waves: Array<RoomEventMsg<{ n: number }>> = [];
  ctx.room.onEvent<{ n: number }>('wave', (e) => waves.push(e));
  return { server, ctx, waves };
}

describe('방 이벤트와 계정 접속 상태 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('두 클라이언트가 방 이벤트를 주고받고 보낸 앱이 60초 뒤에 지운다', async () => {
    const a = await app('alice');
    const b = await app('bob');
    expect(a.ctx.room.emit('wave', { n: 0 })).toBe(false); // 방 밖
    const code = await a.ctx.room.create();
    await a.ctx.room.join(code);
    await b.ctx.room.join(code);

    expect(a.ctx.room.emit('wave', { n: 1 })).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(b.waves).toEqual([{ uid: 'alice', at: expect.any(Number), payload: { n: 1 }, self: false }]);
    expect(a.waves).toEqual([{ uid: 'alice', at: expect.any(Number), payload: { n: 1 }, self: true }]);

    expect(() => a.ctx.room.emit('wave', { n: 'x' })).toThrow('schema');
    expect(() => a.ctx.room.emit('nope', {})).toThrow('선언하지 않은');
    expect(a.ctx.room.emit('wave', { n: 2 })).toBe(true);
    expect(a.ctx.room.emit('wave', { n: 3 })).toBe(false); // 분당 2번
    await vi.advanceTimersByTimeAsync(0);
    expect(b.waves.map((e) => e.payload.n)).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(hub.read(`rooms/${code}/ev`)).toBeNull();
    expect(b.waves).toHaveLength(2);
  });

  it('서로의 계정 접속 상태를 보고 연결이 끊기면 offline이 된다. m은 친구에게만 보인다', async () => {
    const a = await app('alice');
    const b = await app('bob');
    hub.write('mod/friends/u/alice/list/bob', true);
    a.ctx.self.setPresence({ code: 'ABCDEF' });
    expect(() => a.ctx.self.setPresence({ other: 1 })).toThrow('선언하지 않은');

    const seenByB: Array<AccountPresence | null> = [];
    const seenByA: Array<AccountPresence | null> = [];
    b.ctx.users.watchPresence('alice', (p) => seenByB.push(p));
    a.ctx.users.watchPresence('bob', (p) => seenByA.push(p));
    await vi.advanceTimersByTimeAsync(0);
    expect(seenByB.at(-1)).toMatchObject({ online: true, m: { demo: { code: 'ABCDEF' } } });
    expect(seenByA.at(-1)).toMatchObject({ online: true, m: {} });

    a.server.goOffline();
    expect(seenByB.at(-1)).toMatchObject({ online: false, m: { demo: { code: 'ABCDEF' } } });
    a.server.goOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(seenByB.at(-1)).toMatchObject({ online: true });
    b.server.goOffline();
    expect(seenByA.at(-1)).toMatchObject({ online: false });
  });
});
