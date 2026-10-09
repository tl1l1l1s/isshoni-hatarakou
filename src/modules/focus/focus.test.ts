import { describe, expect, it } from 'vitest';
import type { Ctx } from '@core/types';
import type { ActivitySample } from '@shared/schemas';
import focus from './index';

const PAINT = 'win:clipstudiopaint.exe';

describe('focus 모듈', () => {
  it('시간이 쌓인 샘플마다 바뀐 누적을 바로 로컬 파일에 쓴다', async () => {
    const writes: unknown[] = [];
    let onSample = (_s: ActivitySample) => {};
    const ctx = {
      local: {
        get: (s: string) => (s === 'device' ? [{ key: PAINT, label: '클튜' }, ...Array(7).fill(null)] : { day: '', todaySec: 0, todayByApp: {}, deviceTotalSec: 0, otherDevicesSec: 0 }),
        update: (_s: string, fn: (d: unknown) => unknown) => writes.push(fn(null)),
      },
      settings: { get: () => ({ rule: 'foreground', figureMode: false }) },
      room: { setMine: () => {} },
      clock: { dayKey: () => '2026-10-10', serverNow: () => Date.parse('2026-10-10T12:00:00+09:00') },
      self: { activeDevice: () => true, deviceId: () => 'pc', onActiveDevice: () => () => {} },
      server: { user: () => ({ list: async () => [], set: async () => {} }) },
      activity: { on: (fn: typeof onSample) => void (onSample = fn) },
      bus: { emit: () => {} },
      timers: { every: () => () => {} },
      lifecycle: { on: () => () => {} },
      log: { warn: () => {} },
    } as unknown as Ctx;
    await focus.setup(ctx);
    // 켤 때 읽는 다른 기기 기록이 끝나기를 기다린다
    await new Promise((r) => setTimeout(r, 0));
    writes.length = 0;

    const at = (ms: number) => onSample({ at: ms, appKey: PAINT, idleSec: 0, pen: false, unknownReason: null });
    at(0);
    expect(writes).toEqual([]);
    at(500);
    at(1000);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ day: '2026-10-10', todaySec: 1, todayByApp: { [PAINT]: 1 }, deviceTotalSec: 1 });
  });
});
