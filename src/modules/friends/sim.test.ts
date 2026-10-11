// 코어 런타임 두 개가 메모리 허브 하나를 함께 쓰는 친구 신청, 수락, 초대 흐름 (rooms/sim.test.ts와 같은 방식)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../preload/api';
import friends from './index';
import { accept, answer, cancel, decline, invite, requestByCode, snap, unfriend } from './state';

let hub: MemoryHub;
const notes: string[] = [];

const bridge = {
  version: 0,
  invoke: async (ch: string, args: { body?: string }) => {
    if (ch === 'notify.show') notes.push(args.body!);
    return null;
  },
  on: () => () => {},
  invokeModule: async () => null,
} as unknown as Bridge;

async function app(name: string, friendCode: string) {
  hub.write(`users/${name}/public`, { v: 1, name, friendCode });
  hub.write(`codes/${friendCode}`, name);
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn(`dev-${name}`);
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: { name, friendCode } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  const ms = [friends as ModuleManifest];
  await core.preloadLocal(ms);
  await core.start(ms);
  await vi.advanceTimersByTimeAsync(0);
  const ctx = core.ctxs.get('friends')!.ctx;
  return { core, ctx, toasts: () => core.toasts.get().map((t) => t.text), friends: () => Object.keys(snap(ctx).list ?? {}) };
}

describe('friends 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
    notes.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('코드로 신청하고 수락하면 양쪽 목록에 서로 들어가고 받은 기록이 비며 초대로 같은 방에 들어간다', async () => {
    const a = await app('alice', 'AAAA2222');
    const b = await app('bob', 'BBBB3333');

    expect(await requestByCode(a.ctx, 'mate-bbbb3333')).toBe('bob님에게 친구 신청을 보냈어요.');
    await vi.advanceTimersByTimeAsync(0);
    expect(snap(b.ctx).inbox?.alice?.req?.name).toBe('alice');
    // 받은 신청은 창을 열지 않고 알림으로 알린다 (FRD-02)
    expect(b.core.windows.open.get()).toEqual([]);
    expect(b.toasts()).toContain('alice님이 친구 신청을 보냈어요.');
    expect(notes).toEqual(['alice님이 친구 신청을 보냈어요.']);
    // 보낸 신청은 답이 올 때까지 친구창에 남고 좌석 메뉴의 친구 신청은 숨는다
    expect(snap(a.ctx).sent).toEqual({ bob: { name: 'bob' } });
    expect(a.core.registry.reason('friends.request', { uid: 'bob', name: 'bob' })).toBe('이미 신청을 보냈어요.');

    await accept(b.ctx, 'alice');
    await vi.advanceTimersByTimeAsync(0);
    expect(a.friends()).toEqual(['bob']);
    expect(snap(a.ctx).sent).toEqual({});
    expect(b.friends()).toEqual(['alice']);
    expect(hub.read('mod/friends/u/alice/in')).toBeNull();
    expect(hub.read('mod/friends/u/bob/in')).toBeNull();
    expect(a.toasts()).toContain('bob님과 친구가 됐어요.');
    expect(await requestByCode(a.ctx, 'BBBB3333')).toBe('bob님은 이미 친구예요.');

    const code = await b.ctx.room.create();
    expect((await b.ctx.room.join(code)).ok).toBe(true);
    expect(await invite(b.ctx, 'alice', 'alice')).toBe(`alice님을 ${code} 방으로 초대했어요.`);
    await vi.advanceTimersByTimeAsync(0);
    expect(notes.at(-1)).toBe(`bob님이 ${code} 방으로 초대했어요.`);
    expect(await answer(a.ctx, 'bob', true)).toBeNull();
    expect(a.ctx.room.current()).toBe(code);
    expect(hub.read('mod/friends/u/alice/in')).toBeNull();

    // 끊으면 내 목록에서만 빠진다
    await unfriend(a.ctx, 'bob');
    await vi.advanceTimersByTimeAsync(0);
    expect(a.friends()).toEqual([]);
    expect(b.friends()).toEqual(['alice']);
  });

  it('보낸 신청은 상대가 거절하거나 내가 취소하면 빠지고 다시 신청할 수 있다', async () => {
    const a = await app('alice', 'AAAA2222');
    const b = await app('bob', 'BBBB3333');
    await requestByCode(a.ctx, 'BBBB3333');
    await vi.advanceTimersByTimeAsync(0);
    expect(snap(a.ctx).sent).toEqual({ bob: { name: 'bob' } });

    await decline(b.ctx, 'alice');
    await vi.advanceTimersByTimeAsync(0);
    expect(snap(a.ctx).sent).toEqual({});
    expect(a.core.registry.reason('friends.request', { uid: 'bob', name: 'bob' })).toBeNull();

    await requestByCode(a.ctx, 'BBBB3333');
    await vi.advanceTimersByTimeAsync(0);
    // 거절한 사람이 다시 보낸 신청은 목록에는 보이지만 이번 실행에서는 다시 알리지 않는다 (D3)
    expect(snap(b.ctx).inbox?.alice?.req).toBeTruthy();
    expect(notes).toEqual(['alice님이 친구 신청을 보냈어요.']);
    await cancel(a.ctx, 'bob');
    await vi.advanceTimersByTimeAsync(0);
    expect(snap(a.ctx).sent).toEqual({});
    expect(hub.read('mod/friends/u/bob/in')).toBeNull();
  });
});
