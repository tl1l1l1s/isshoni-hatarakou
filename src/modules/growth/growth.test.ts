import { describe, expect, it } from 'vitest';
import type { Ctx } from '@core/types';
import type { ActivitySample } from '@shared/schemas';
import { dayKey } from '@shared/time';
import focus from '@modules/focus';
import type { FocusApi } from '@modules/focus/api';
import growth from './index';
import { levelOf, levelText, roundOf, tierOf, xpOf } from './logic';

describe('레벨', () => {
  // 누적 초, 레벨당 초, 레벨, 경험치 비율
  it.each([
    [0, 3600, 1, 0],
    [3599, 3600, 1, 3599 / 3600],
    [3600, 3600, 2, 0],
    [5400, 3600, 2, 0.5],
    [998 * 3600, 3600, 999, 0],
    [1e9, 3600, 999, (1e9 % 3600) / 3600],
    [90, 60, 2, 0.5],
    [3600, 7200, 1, 0.5],
  ])('%d초, %d초마다 1레벨이면 Lv.%d', (total, spl, level, xp) => {
    expect(levelOf(total, spl)).toBe(level);
    expect(xpOf(total, spl)).toBeCloseTo(xp);
  });

  // 누적 시간, 회차, 화면 레벨 (GRW-04). Lv.999는 998시간, 회차는 999시간에 넘어간다
  it.each([
    [0, 1, 1],
    [998 * 3600, 1, 999],
    [999 * 3600 - 1, 1, 999],
    [999 * 3600, 2, 1],
    [999 * 3600 * 2 + 5 * 3600, 3, 6],
    [1e12, 100, 999],
  ])('누적 %d초는 %d회차 %d레벨', (total, round, level) => {
    expect(roundOf(total, 3600)).toEqual({ round, level });
  });

  it('2회차부터 별을 붙이고 티어는 넘은 단계 수다', () => {
    expect([levelText(1, 12), levelText(2, 12)]).toEqual(['Lv.12', '☆12']);
    expect([1, 49, 50, 149, 150, 999].map((lv) => tierOf(lv, [50, 100, 150]))).toEqual([0, 0, 1, 2, 3, 3]);
  });
});

// 가짜 ctx로 focus와 growth를 함께 켜고 등록 앱 10분을 재생한다 (10.9 FOC-02 시험)
describe('focus와 growth', () => {
  const NOW = Date.parse('2026-10-09T12:00:00+09:00');
  const fake = (local: Record<string, unknown>, apis: Record<string, unknown> = {}, others: unknown[] = [{ key: 'laptop', value: { v: 1, total: 120, day: '', today: 0 } }]) => {
    const out = {
      mine: {} as Record<string, unknown>, ticks: 0, toasts: [] as string[], profile: {} as Record<string, unknown>, onSample: (_s: ActivitySample) => {},
      active: true, onActive: (_a: boolean) => {}, sets: [] as unknown[],
    };
    const ctx = {
      local: { get: (s: string) => local[s], update: (s: string, fn: (d: unknown) => unknown) => void (local[s] = fn(local[s])) },
      settings: { get: () => ({ rule: 'foregroundUntilIdle20m', figureMode: false }) },
      clock: { serverNow: () => NOW, dayKey: () => dayKey(NOW) },
      room: { setMine: (f: Record<string, unknown>) => Object.assign(out.mine, f) },
      bus: { emit: (name: string) => void (name === 'focus.tick' && out.ticks++) },
      activity: { on: (fn: (s: ActivitySample) => void) => void (out.onSample = fn) },
      timers: { every: () => () => {} },
      lifecycle: { on: () => () => {} },
      server: { user: () => ({ list: async () => others, set: async (_k: string, v: unknown) => void out.sets.push(v) }) },
      self: {
        deviceId: () => 'pc', setProfile: (p: Record<string, unknown>) => Object.assign(out.profile, p),
        activeDevice: () => out.active, onActiveDevice: (fn: (a: boolean) => void) => void (out.onActive = fn),
      },
      gates: { list: () => [], onChange: () => () => {} },
      log: { warn: () => {} },
      modules: { get: (id: string) => apis[id] },
      tunables: { get: () => 60 },
      ui: { toast: (t: string) => out.toasts.push(t) },
    };
    return { ctx: ctx as unknown as Ctx, out };
  };

  it('600초가 쌓이고 다른 기기 누적을 더해 레벨이 오른다', async () => {
    const PAINT = 'win:clipstudiopaint.exe';
    const local = { device: [{ key: PAINT, label: '클튜' }, ...Array(7).fill(null)], account: focus.local!.account!.initial() };
    const f = fake(local);
    const focusApi = (await focus.setup(f.ctx)) as FocusApi;
    const g = fake({}, { focus: focusApi });
    const growthApi = await growth.setup(g.ctx);
    await Promise.resolve();
    expect(focusApi.totalSec()).toBe(120);
    expect(growthApi.level()).toBe(3);

    for (let at = 0; at <= 600_000; at += 500) f.out.onSample({ at, appKey: PAINT, idleSec: 0, pen: false, unknownReason: null });

    expect(focusApi.todaySec()).toBe(600);
    expect(focusApi.todayByApp()).toEqual({ [PAINT]: 600 });
    expect(focusApi.totalSec()).toBe(720);
    expect(f.out.ticks).toBe(1200);
    expect(f.out.mine).toEqual({ awake: true, todayMin: 10, typing: true });
    expect(growthApi.level()).toBe(13);
    expect(g.out.profile).toEqual({ level: 13 });
    expect(g.out.mine).toEqual({ lv: 13, xp: 0, rd: 1 });
    expect(g.out.toasts.at(-1)).toContain('Lv.13');
  });

  const PAINT = 'win:clipstudiopaint.exe';
  const start = async (others?: unknown[]) => {
    const local = { device: [{ key: PAINT, label: '클튜' }, ...Array(7).fill(null)], account: focus.local!.account!.initial() };
    const f = fake(local, {}, others);
    const api = (await focus.setup(f.ctx)) as FocusApi;
    await Promise.resolve();
    const play = (from: number, to: number, appKey: string | null = PAINT) => {
      for (let at = from; at <= to; at += 500) f.out.onSample({ at, appKey, idleSec: 0, pen: false, unknownReason: appKey ? null : 'noWindow' });
    };
    return { f, api, play };
  };

  it('다른 기기에서 쓰는 중이면 세지 않고 돌아오면 그 사이를 더하지 않는다 (FOC-08)', async () => {
    const { f, api, play } = await start([]);
    play(0, 10_000);
    f.out.active = false;
    f.out.onActive(false);
    play(10_500, 20_000);
    expect(api.todaySec()).toBe(10);
    expect(f.out.sets).toHaveLength(1);
    f.out.active = true;
    play(60_000, 70_000);
    expect(api.todaySec()).toBe(20);
  });

  it('다른 기기의 같은 날 오늘 기록을 오늘에 더한다 (FOC-08)', async () => {
    const today = dayKey(NOW);
    const { api } = await start([
      { key: 'laptop', value: { v: 1, total: 900, day: today, today: 300 } },
      { key: 'old', value: { v: 1, total: 100, day: '2026-10-01', today: 100 } },
    ]);
    expect(api.todaySec()).toBe(300);
    expect(api.totalSec()).toBe(1000);
  });

  it('출처가 켜져 있으면 등록 앱이 아니어도 그 출처로 센다 (FOC-09)', async () => {
    const { f, api, play } = await start([]);
    let on = true;
    api.addSource({ id: 'phone', active: () => on });
    play(0, 10_000, null);
    on = false;
    play(10_500, 20_000, 'win:chrome.exe');
    expect(api.todayByApp()).toEqual({ phone: 10 });
    expect(f.out.mine).toMatchObject({ awake: false });
  });
});
