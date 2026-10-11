// 코어 런타임 여러 개가 메모리 허브 하나를 함께 쓰는 시뮬레이터 (src/modules/rooms/sim.test.ts와 같은 방식)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../preload/api';
import rooms from '@modules/rooms';
import { createRoom, joinRoom } from '@modules/rooms/state';
import type { GachaApi } from './api';
import gacha from './index';
import { drawOnce, flush, removeItem, setCfg, sync, view } from './state';

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

const H = 'a'.repeat(64);

async function app(name: string, deviceId = 'pc') {
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn(`dev-${name}`);
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId, appVersion: 'test', selfAppKey: null, profile: { name } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  // 부팅 때 동기화가 보내는 알림도 받도록 start 전에 듣는다
  const revoked: string[][] = [];
  core.bus.on('gacha.revoked', (p) => void revoked.push((p as { keys: string[] }).keys));
  const ms = [rooms, gacha] as ModuleManifest[];
  await core.preloadLocal(ms);
  await core.start(ms);
  await vi.advanceTimersByTimeAsync(0);
  const ctx = core.ctxs.get('gacha')!.ctx;
  const tick = (sec: number) => core.bus.emit('focus.tick', { sec, dayKey: '2026-10-09', appKey: 'win:app', source: 'pc' });
  return { core, server, ctx, rooms: core.ctxs.get('rooms')!.ctx, api: core.host.api('gacha') as GachaApi, revoked, tick };
}

const addItem = (ctx: Awaited<ReturnType<typeof app>>['ctx'], code: string, id: string) =>
  ctx.server.room(code, ['items']).set(id, { name: id, file: H, w: 10, by: ctx.self.uid(), st: 'on', at: 1, v: 1 });

describe('gacha 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
    disk = new Map();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('혼자 있어도 방 작업 시간을 60초마다 쓰고 한 계정의 두 PC가 동시에 뽑아도 1회만 쓴다', async () => {
    const a = await app('alice');
    // 혼자 모드의 집중 시간은 세지 않고 방에 혼자 있을 때는 센다
    a.tick(500);
    expect(await createRoom(a.rooms, 4)).toBeNull();
    const code = a.ctx.room.current()!;
    await addItem(a.ctx, code, 'hat');
    a.tick(30);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hub.read(`mod/gacha/u/alice/r/${code}`)).toEqual({ sec: 30, earned: 30 / 3600, spent: 0, bonus: 0, v: 1 });

    const b1 = await app('bob', 'pc1');
    const b2 = await app('bob', 'pc2');
    expect(await joinRoom(b1.rooms, code)).toBeNull();
    expect(await joinRoom(b2.rooms, code)).toBeNull();
    b1.tick(1800);
    b2.tick(1800.5);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hub.read(`mod/gacha/u/bob/r/${code}/sec`)).toBe(3600.5);
    expect(b1.core.registry.reason('gacha.draw')).toBeNull();

    const res = await Promise.allSettled([drawOnce(b1.ctx, 0), drawOnce(b2.ctx, 0)]);
    expect(res.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(hub.read(`mod/gacha/u/bob/r/${code}`)).toMatchObject({ spent: 1, got: { hat: { n: 1, name: 'hat', file: H } } });
    expect(b1.core.registry.reason('gacha.draw')).toBe('남은 뽑기가 없어요.');
    // 두 PC 모두 내 기록 구독으로 보관함이 같아진다
    expect(b1.api.inventory().map((i) => i.key)).toEqual([`${code}/hat`]);
    expect(b2.api.inventory().map((i) => i.key)).toEqual([`${code}/hat`]);

    // 기준이 바뀌어도 쓴 횟수와 진행률은 보존하고 이후 작업만 새 기준으로 센다
    await setCfg(a.ctx, { secPerTicket: 1800 });
    expect(view(b1.ctx).cfg.secPerTicket).toBe(1800);
    expect(b1.core.registry.reason('gacha.draw')).toBe('남은 뽑기가 없어요.');
    b1.tick(1800);
    await flush(b1.ctx);
    expect(b1.core.registry.reason('gacha.draw')).toBeNull();
  });

  it('기준 변경 전 미전송분과 오프라인 기존 기록을 여러 번 변경해도 보존한다', async () => {
    const a = await app('alice');
    await createRoom(a.rooms, 4);
    const code = a.ctx.room.current()!;
    await a.ctx.server.user(['r']).set(code, { sec: 5400, spent: 1, bonus: 0, v: 1 });
    a.tick(1800); // 이전 기준의 0.5회분, 아직 전송하지 않음
    await setCfg(a.ctx, { secPerTicket: 7200 });
    a.tick(1800); // 새 기준의 0.25회분
    await flush(a.ctx);
    expect(hub.read(`mod/gacha/u/alice/r/${code}`)).toMatchObject({ sec: 9000, earned: 2.25, spent: 1 });
    await setCfg(a.ctx, { secPerTicket: 1800 });
    const b = await app('bob');
    await b.ctx.server.user(['r']).set(code, { sec: 5400, spent: 0, bonus: 0, v: 1 });
    await joinRoom(b.rooms, code);
    b.tick(900);
    await flush(b.ctx);
    expect(hub.read(`mod/gacha/u/bob/r/${code}`)).toMatchObject({ sec: 6300, earned: 2 });
    expect(view(b.ctx).cfg.legacySecPerTicket).toBe(3600);
  });

  it('저장 실패 중 추가 작업과 기준 변경이 있어도 재시도는 당시 획득분을 한 번만 쓴다', async () => {
    const a = await app('alice');
    await createRoom(a.rooms, 4);
    const code = a.ctx.room.current()!;
    const user = a.ctx.server.user.bind(a.ctx.server);
    let reject!: (e: Error) => void;
    let fail = true;
    vi.spyOn(a.ctx.server, 'user').mockImplementation((path) => {
      const doc = user(path);
      return { ...doc, transaction: (...args) => fail
        ? new Promise((_resolve, no) => { reject = no; })
        : doc.transaction(...args) } as typeof doc;
    });
    a.tick(1800);
    const saving = flush(a.ctx);
    await vi.advanceTimersByTimeAsync(0);
    await setCfg(a.ctx, { secPerTicket: 1800 });
    a.tick(900);
    reject(new Error('offline'));
    await saving;
    expect(view(a.ctx)).toMatchObject({ pendingSec: 2700, pendingEarned: 1 });
    fail = false;
    await flush(a.ctx);
    await flush(a.ctx);
    expect(hub.read(`mod/gacha/u/alice/r/${code}`)).toMatchObject({ sec: 2700, earned: 1 });
    expect(view(a.ctx)).toMatchObject({ pendingSec: 0, pendingEarned: 0 });
  });

  it('이전 방 저장 응답이 늦어도 새 방의 횟수와 기록을 덮지 않는다', async () => {
    const a = await app('alice');
    await createRoom(a.rooms, 4);
    const first = a.ctx.room.current()!;
    const user = a.ctx.server.user.bind(a.ctx.server);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(a.ctx.server, 'user').mockImplementation((path) => {
      const doc = user(path);
      return { ...doc, transaction: async (...args) => { await gate; return doc.transaction(...args); } } as typeof doc;
    });
    a.tick(3600);
    const saving = flush(a.ctx);
    await a.ctx.room.leave();
    await createRoom(a.rooms, 4);
    const second = a.ctx.room.current()!;
    expect(second).not.toBe(first);
    a.tick(900);
    release();
    await saving;
    expect(view(a.ctx)).toMatchObject({ code: second, rec: { sec: 0, spent: 0 }, pendingSec: 900, pendingEarned: 0.25 });
    await flush(a.ctx);
    expect(hub.read(`mod/gacha/u/alice/r/${first}`)).toMatchObject({ sec: 3600, earned: 1 });
    expect(hub.read(`mod/gacha/u/alice/r/${second}`)).toMatchObject({ sec: 900, earned: 0.25 });
  });

  it('끊긴 동안 센 방 작업 초는 끊긴 채 앱을 꺼도 같은 PC의 다음 실행이 보낸다 (F2)', async () => {
    const a = await app('alice');
    await createRoom(a.rooms, 4);
    const code = a.ctx.room.current()!;
    a.tick(600);
    await flush(a.ctx);
    a.server.goOffline();
    a.tick(3000);
    void flush(a.ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(view(a.ctx)).toMatchObject({ pendingSec: 0 });
    // 끊긴 채 끈다. 방에서 나가기는 연결을 기다리므로 끝나지 않는다
    void a.core.quit();
    await vi.advanceTimersByTimeAsync(0);
    expect(hub.read(`mod/gacha/u/alice/r/${code}/sec`)).toBe(600);

    const a2 = await app('alice');
    await vi.advanceTimersByTimeAsync(0);
    expect(hub.read(`mod/gacha/u/alice/r/${code}`)).toMatchObject({ sec: 3600, earned: 1 });
    expect((disk.get('accounts/alice/modules/gacha.json') as { data: { pending: object } }).data.pending).toEqual({});
    expect(view(a2.ctx).pendingSec).toBe(0);
  });

  it('주인이 함께 지우기로 지운 아이템은 보관함 창을 열 때 빠지고 남기기는 남는다', async () => {
    const a = await app('alice');
    await createRoom(a.rooms, 4);
    const code = a.ctx.room.current()!;
    await addItem(a.ctx, code, 'hat');
    await addItem(a.ctx, code, 'pin');
    const b = await app('bob');
    await joinRoom(b.rooms, code);
    b.tick(7200);
    await drawOnce(b.ctx, 0); // hat
    await drawOnce(b.ctx, 0.99); // pin
    expect(b.api.inventory().map((i) => i.itemId)).toEqual(['hat', 'pin']);

    await removeItem(a.ctx, 'hat', 'revoke');
    await removeItem(a.ctx, 'pin', 'keep');
    expect(hub.read(`mod/gacha/r/${code}/items`)).toBeNull();
    await sync(b.ctx);
    expect(b.api.inventory().map((i) => i.itemId)).toEqual(['pin']);
    expect(b.revoked).toEqual([[`${code}/hat`]]);
    expect(hub.read(`mod/gacha/u/bob/r/${code}/got`)).toEqual({ pin: { n: 1, name: 'pin', file: H, at: expect.any(Number) } });
  });

  it('방을 함께 지우기로 지우면 오래 꺼 둔 멤버의 앱이 다음 부팅 때 보관함에서 뺀다', async () => {
    const a = await app('alice');
    await createRoom(a.rooms, 4);
    const code = a.ctx.room.current()!;
    await addItem(a.ctx, code, 'hat');
    await setCfg(a.ctx, { onRemove: 'revoke' });
    const b = await app('bob');
    await joinRoom(b.rooms, code);
    b.tick(3600);
    await drawOnce(b.ctx, 0);
    await b.core.flush();
    expect(JSON.stringify(disk.get('accounts/bob/modules/gacha.json'))).toContain(`${code}/hat`);
    await b.ctx.room.leave();

    await a.core.registry.run('rooms.remove');
    expect(hub.read(`mod/gacha/r/${code}/tomb/_room`)).toMatchObject({ mode: 'revoke' });
    expect(hub.read(`mod/gacha/r/${code}/items`)).toBeNull();
    expect(hub.read(`mod/gacha/r/${code}/cfg`)).toBeNull();

    const b2 = await app('bob');
    expect(b2.revoked).toEqual([[`${code}/hat`]]);
    expect(b2.api.inventory()).toEqual([]);
    expect(hub.read(`mod/gacha/u/bob/r/${code}/got`)).toBeNull();
  });
});
