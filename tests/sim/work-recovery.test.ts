import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../src/preload/api';
import focus from '@modules/focus';
import type { FocusApi } from '@modules/focus/api';
import growth from '@modules/growth';
import type { GrowthApi } from '@modules/growth/api';
import goals from '@modules/goals';
import rooms from '@modules/rooms';
import { createRoom } from '@modules/rooms/state';
import gacha from '@modules/gacha';
import { flush } from '@modules/gacha/state';
import phone from '@modules/phone';
import { OPEN_MAX_MS } from '@modules/phone/logic';
import status from '@modules/status';

async function app(modules: ModuleManifest[]) {
  const disk = new Map<string, unknown>();
  const subs = new Map<string, (v: unknown) => void>();
  const bridge = {
    version: 0,
    invoke: async (ch: string, a: { path?: string; data?: unknown }) => {
      if (ch === 'store.read') return disk.get(a.path!) ?? null;
      if (ch === 'store.write') disk.set(a.path!, a.data);
      return null;
    },
    on: (ch: string, fn: (v: unknown) => void) => { subs.set(ch, fn); return () => subs.delete(ch); },
    invokeModule: async () => null,
  } as unknown as Bridge;
  const hub = new MemoryHub();
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn('dev-work');
  const core = new CoreRuntime(
    { bridge, server, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: undefined, backend: {} as RenderBackend },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, 'accounts/work/settings.json', emptySettings()),
  );
  vi.spyOn(core.windows, 'show').mockResolvedValue();
  vi.spyOn(core.windows, 'close').mockImplementation(() => {});
  await core.preloadLocal(modules);
  await core.start(modules);
  await vi.advanceTimersByTimeAsync(0);
  const sample = async (idleSec: number, appKey: string | null = null) => {
    subs.get('activity')!({ at: Date.now(), appKey, idleSec, pen: false, unknownReason: null });
    await vi.advanceTimersByTimeAsync(0);
  };
  return { core, hub, server, uid, sample, lifecycle: (type: string) => subs.get('lifecycle')!({ type }), focus: core.host.api('focus') as FocusApi };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T05:59:58+09:00')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('폰 신호와 자리비움 통합', () => {
  it.each(['만료', '연결 해제', '키 교체'] as const)('%s 뒤부터 유휴 시간을 다시 센다', async kind => {
    const a = await app([focus, phone, status]);
    const doc = a.core.ctxs.get('phone')!.ctx.server.user();
    const key = 'a'.repeat(32);
    await doc.set('key', key);
    await doc.set(`sig/${key}`, { open: true, app: '문서', at: Date.now() });
    await a.sample(1200);
    expect(a.focus.externalActive()).toBe(true);
    expect(a.core.self.get().state).toBe('online');
    if (kind === '만료') vi.setSystemTime(Date.now() + OPEN_MAX_MS);
    else await doc.set('key', kind === '연결 해제' ? null : 'b'.repeat(32));
    await a.sample(1201);
    expect(a.focus.externalActive()).toBe(false);
    await a.sample(2399);
    expect(a.core.self.get().state).toBe('online');
    await a.sample(2400);
    expect(a.core.self.get().state).toBe('away');
  });
  it('폰 작업 중에도 수동 자리비움과 잠금이 우선하고 해제하면 복구한다', async () => {
    const a = await app([focus, phone, status]);
    const doc = a.core.ctxs.get('phone')!.ctx.server.user();
    const key = 'a'.repeat(32);
    await doc.set('key', key);
    await doc.set(`sig/${key}`, { open: true, app: '문서', at: Date.now() });
    await a.sample(3600);
    await a.core.registry.run('status.choose', { choice: 'away', custom: '' });
    await a.sample(3601);
    expect(a.core.self.get().state).toBe('away');
    await a.core.registry.run('status.choose', { choice: 'work', custom: '' });
    a.lifecycle('lock'); await a.sample(3602);
    expect(a.core.self.get().state).toBe('away');
    a.lifecycle('unlock'); await a.sample(3603);
    expect(a.core.self.get().state).toBe('online');
  });
});

it('오전 6시를 넘겨도 집중·달성표는 날짜별이고 성장·뽑기에는 중복 없이 누적한다', async () => {
  const a = await app([focus, growth, goals, rooms, gacha]);
  await createRoom(a.core.ctxs.get('rooms')!.ctx, 5);
  const code = a.core.session.current()!;
  await a.core.ctxs.get('goals')!.ctx.server.user().set('cfg', { goal: 3600, since: '2026-10-10', v: 1 });
  const ticks: { dayKey: string; sec: number }[] = [];
  a.core.bus.on('focus.tick', t => ticks.push(t as typeof ticks[number]));
  await a.sample(0, 'win:clipstudiopaint.exe');
  vi.setSystemTime(Date.now() + 1000);
  await a.sample(0, 'win:clipstudiopaint.exe'); // 전날 1초
  vi.setSystemTime(Date.now() + 2000);
  await a.sample(0, 'win:clipstudiopaint.exe'); // 전날 1초 + 오늘 1초
  a.lifecycle('suspend');
  await flush(a.core.ctxs.get('gacha')!.ctx);
  await vi.advanceTimersByTimeAsync(0);
  expect(a.focus.totalSec()).toBe(3);
  expect(a.focus.todaySec()).toBe(1);
  expect(ticks).toMatchObject([{ dayKey: '2026-10-10', sec: 1 }, { dayKey: '2026-10-10', sec: 1 }, { dayKey: '2026-10-11', sec: 1 }]);
  expect((a.core.host.api('growth') as GrowthApi).xp()).toBeCloseTo(3 / 3600);
  expect(a.hub.read(`mod/gacha/u/${a.uid}/r/${code}`)).toMatchObject({ sec: 3, earned: expect.closeTo(3 / 3600, 10) });
  expect(a.hub.read(`mod/goals/u/${a.uid}/days/2026-10-10`)).toMatchObject({ sec: 2 });
  expect(a.hub.read(`mod/goals/u/${a.uid}/days/2026-10-11`)).toMatchObject({ sec: 1 });
});
