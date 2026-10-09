// 함께 찍기 시뮬레이터 (10.12 COM-15 시험). 코어 런타임 여러 개가 메모리 허브 하나를 함께 쓴다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../preload/api';
import rooms from '@modules/rooms';
import { createRoom, joinRoom } from '@modules/rooms/state';
import photo from './index';
import { SLOT_STALE_MS, type Setup, type Shot, type Slot } from './logic';
import { openSession, QUOTA_OUT } from './session';

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

const INIT: Setup = { o: 'wide', n: 4, bg: '#ffffff', fl: 'none', fr: 'none', own: '' };

async function app(name: string) {
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn(`dev-${name}`);
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: { name } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  const ms = [rooms, photo] as ModuleManifest[];
  await core.preloadLocal(ms);
  await core.start(ms);
  await vi.advanceTimersByTimeAsync(0);
  return { core, server, uid, ctx: core.ctxs.get('photo')!.ctx, rooms: core.ctxs.get('rooms')!.ctx };
}

describe('스티커 사진 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
    disk = new Map();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('진행자가 카운트다운 중에 끊기면 다음 자리 주인이 이어서 찍고 남은 사람 모두 같은 컷을 받는다', async () => {
    const a = await app('alice');
    expect(await createRoom(a.rooms, 4)).toBeNull();
    const code = a.ctx.room.current()!;
    const all = [a, await app('bob'), await app('carol'), await app('dave')];
    for (const x of all.slice(1)) expect(await joinRoom(x.rooms, code)).toBeNull();
    const runs = new Map<string, Shot[]>();
    const s = [];
    for (const x of all) {
      s.push(openSession(x.ctx, INIT, (shots) => runs.set(x.uid, shots)));
      await vi.advanceTimersByTimeAsync(0);
    }
    const [sa, sb, sc, sd] = s as [ReturnType<typeof openSession>, ReturnType<typeof openSession>, ReturnType<typeof openSession>, ReturnType<typeof openSession>];
    // 연 순서대로 자리를 잡고 0번 자리의 alice가 진행한다
    expect(Object.values(hub.read(`mod/photo/r/${code}/slots`) as object).map((x: { uid: string }) => x.uid)).toEqual(['alice', 'bob', 'carol', 'dave']);
    expect(s.map((x) => x.get().host)).toEqual([true, false, false, false]);
    expect(sd.get().people.map((p) => p.name)).toEqual(['alice', 'bob', 'carol', 'dave']);

    // 진행자가 아닌 사람은 설정을 바꾸지 못하고 자기 자세만 보낸다
    sb.setup({ bg: '#000000' });
    sa.setup({ n: 2 });
    sb.pose((p) => ({ ...p, x: 3 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(sc.get().cfg).toMatchObject({ n: 2, bg: '#ffffff' });
    expect(sc.get().people[1]!.pose.x).toBe(3);

    await sa.start();
    await vi.advanceTimersByTimeAsync(5_200);
    expect((hub.read(`mod/photo/r/${code}/shots/0`) as Shot).ppl!.map((p) => p.x)).toEqual([0, 3, 0, 0]);
    expect(sc.get().count).toMatchObject({ cut: 1 });

    // alice의 연결이 끊기면 자리와 자세가 지워지고 1번 자리의 bob이 진행자가 된다
    a.server.goOffline();
    await vi.advanceTimersByTimeAsync(0);
    expect(sb.get().host).toBe(true);
    await vi.advanceTimersByTimeAsync(5_200);
    const run = runs.get('bob')!;
    expect(run).toHaveLength(2);
    expect(run[1]!.ppl).toHaveLength(3);
    expect(runs.get('carol')).toEqual(run);
    expect(runs.get('dave')).toEqual(run);
    // 모든 컷을 찍으면 새 진행자가 쉬는 상태로 돌린다
    await vi.advanceTimersByTimeAsync(400);
    expect((hub.read(`mod/photo/r/${code}/cfg`) as { t0: number }).t0).toBe(0);

    // 마지막으로 나가는 사람이 세션을 지운다
    for (const x of [sb, sc, sd]) {
      x.close();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(hub.read(`mod/photo/r/${code}`)).toBeNull();
  });

  it('창을 오래 열어 둔 자리는 남이 덮지 않고 빈자리를 먼저 잡으며 잃은 자리는 끊길 때 지우지 않는다', async () => {
    const a = await app('alice');
    expect(await createRoom(a.rooms, 4)).toBeNull();
    const code = a.ctx.room.current()!;
    const slots = `mod/photo/r/${code}/slots`;
    const uids = () => Object.values((hub.read(slots) ?? {}) as Record<string, Slot | null>).map((x) => x?.uid ?? null);
    const b = await app('bob');
    expect(await joinRoom(b.rooms, code)).toBeNull();
    openSession(a.ctx, INIT, () => {});
    await vi.advanceTimersByTimeAsync(SLOT_STALE_MS + 60_000);
    // 15분이 지나도 자리 시각이 새로워서 자리가 그대로다
    expect(Date.now() - (hub.read(`${slots}/0`) as Slot).at).toBeLessThan(SLOT_STALE_MS);

    // 0번 자리가 오래되었어도 빈자리가 있으면 빈자리를 잡는다
    hub.write(`${slots}/0/at`, 1);
    openSession(b.ctx, INIT, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(uids()).toEqual(['alice', 'bob']);

    // 다른 사람이 alice의 오래된 자리를 잡으면 alice는 빈자리로 옮기고 끊겨도 그 사람 자리를 지우지 않는다
    hub.write(`${slots}/0`, { uid: 'zed', at: Date.now() });
    await vi.advanceTimersByTimeAsync(0);
    expect(uids()).toEqual(['zed', 'bob', 'alice']);
    a.server.goOffline();
    await vi.advanceTimersByTimeAsync(0);
    expect(uids()).toEqual(['zed', 'bob']);
  });

  it('하루 한도를 켜면 진행자가 시작할 때 1씩 세고 다 쓰면 시작하지 않는다', async () => {
    hub.write('mod/photo/g/tunables', { photoDailyCap: 1 });
    const a = await app('alice');
    expect(await createRoom(a.rooms, 4)).toBeNull();
    const s = openSession(a.ctx, { ...INIT, n: 1 }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(s.get().quota).toEqual({ used: 0, cap: 1 });
    // 두 번 눌러도 한 번만 센다
    await Promise.all([s.start(), s.start()]);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(s.get().quota).toEqual({ used: 1, cap: 1 });
    await expect(s.start()).rejects.toThrow(QUOTA_OUT);
    s.close();
  });
});
