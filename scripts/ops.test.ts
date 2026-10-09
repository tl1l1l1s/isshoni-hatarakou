import { describe, expect, it } from 'vitest';
import { activeTunable } from '../src/renderer/core/tunables';
import { addPeriod } from './ops';

describe('addPeriod (OPS-12)', () => {
  it('값 하나는 기간 없는 항목으로 남기고 끝난 기간은 뺀다', () => {
    const now = 1000;
    const list = addPeriod([{ value: 50 }, { value: 20, from: 0, until: 500 }, { value: 40, from: 0, until: 2000 }], { value: 35, from: 1500, until: 3000 }, now);
    expect(list).toEqual([{ value: 50 }, { value: 40, from: 0, until: 2000 }, { value: 35, from: 1500, until: 3000 }]);
    expect(addPeriod(50, { value: 35, from: 1, until: 2 }, now)).toEqual([{ value: 50 }, { value: 35, from: 1, until: 2 }]);
    expect(addPeriod(null, { value: 35, from: 1, until: 2 }, now)).toEqual([{ value: 35, from: 1, until: 2 }]);
  });
  it('배열 값은 기간 없는 항목 하나가 되고 목록의 빈 칸은 뺀다', () => {
    expect(addPeriod([10, 20], { value: [5], from: 1, until: 2 }, 0)).toEqual([{ value: [10, 20] }, { value: [5], from: 1, until: 2 }]);
    const holes = [{ value: 50 }, null, { value: 40, from: 0, until: 2000 }];
    expect(addPeriod(holes, { value: 35, from: 1500, until: 3000 }, 1000)).toEqual([{ value: 50 }, { value: 40, from: 0, until: 2000 }, { value: 35, from: 1500, until: 3000 }]);
  });
  it('앱은 기간 안에서는 기간 값을, 밖에서는 기간 없는 값을 고른다', () => {
    const list = addPeriod(30, { value: 20, from: 100, until: 200 }, 0);
    expect(activeTunable(list, 99)).toBe(30);
    expect(activeTunable(list, 100)).toBe(20);
    expect(activeTunable(list, 200)).toBe(30);
  });
});
