import { describe, expect, it } from 'vitest';
import type { Ctx } from '@core/types';
import type { ActivitySample } from '@shared/schemas';
import type { FocusApi } from './api';
import focus from './index';

const PAINT = 'win:clipstudiopaint.exe';
const DAY = '2026-10-10';
type Rows = Array<{ key: string; value: unknown }>;

/** 가짜 ctx. rows는 기기별 기록 구독에 지금 서버 값을 다시 보낸다 */
function fake(first: Rows = []) {
  const out = { writes: [] as unknown[], onSample: (_s: ActivitySample) => {}, rows: (_r: Rows) => {} };
  const ctx = {
    local: {
      get: (s: string) => (s === 'device' ? [{ key: PAINT, label: '클튜' }, ...Array(7).fill(null)] : { day: '', todaySec: 0, todayByApp: {}, deviceTotalSec: 0, otherDevicesSec: 0 }),
      update: (_s: string, fn: (d: unknown) => unknown) => out.writes.push(fn(null)),
    },
    settings: { get: () => ({ rule: 'foreground', figureMode: false }) },
    room: { setMine: () => {} },
    clock: { dayKey: () => DAY, serverNow: () => Date.parse(`${DAY}T12:00:00+09:00`) },
    self: { activeDevice: () => true, deviceId: () => 'pc', onActiveDevice: () => () => {} },
    server: {
      user: () => ({
        watchList: (_k: string, _o: unknown, fn: (r: Rows) => void) => {
          out.rows = fn;
          fn(first);
          return () => {};
        },
        set: async () => {},
      }),
    },
    activity: { on: (fn: (s: ActivitySample) => void) => void (out.onSample = fn) },
    bus: { emit: () => {} },
    timers: { every: () => () => {} },
    lifecycle: { on: () => () => {} },
    log: { warn: () => {} },
  } as unknown as Ctx;
  return { ctx, out };
}

describe('focus 모듈', () => {
  it('시간이 쌓인 샘플마다 바뀐 누적을 바로 로컬 파일에 쓴다', async () => {
    const { ctx, out } = fake();
    await focus.setup(ctx);
    out.writes.length = 0;

    const at = (ms: number) => out.onSample({ at: ms, appKey: PAINT, idleSec: 0, pen: false, unknownReason: null });
    at(0);
    expect(out.writes).toEqual([]);
    at(500);
    at(1000);
    expect(out.writes).toHaveLength(2);
    expect(out.writes[1]).toMatchObject({ day: DAY, todaySec: 1, todayByApp: { [PAINT]: 1 }, deviceTotalSec: 1 });
  });

  it('다시 쓰는 기기가 된 뒤에 다른 기기가 늦게 올린 마지막 기록도 누적과 오늘에 더한다 (F1)', async () => {
    const { ctx, out } = fake([{ key: 'pcA', value: { v: 1, total: 10, day: DAY, today: 10 } }]);
    const api = (await focus.setup(ctx)) as FocusApi;
    expect([api.totalSec(), api.todaySec()]).toEqual([10, 10]);
    // 가져간 기기가 넘겨준 뒤 마지막 5초를 올린다
    out.rows([{ key: 'pcA', value: { v: 1, total: 15, day: DAY, today: 15 } }, { key: 'pc', value: { v: 1, total: 3, day: DAY, today: 3 } }]);
    expect([api.totalSec(), api.todaySec()]).toEqual([18, 15]);
  });
});
