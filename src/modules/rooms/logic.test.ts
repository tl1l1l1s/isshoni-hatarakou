import { describe, expect, it } from 'vitest';
import { forget, mustLeave, remember } from './logic';

const seat = (key: string, joinedAt: number, self = false) => ({ key, joinedAt, self });

describe('rooms logic', () => {
  it.each([
    ['정원 안', [seat('a', 1), seat('b', 2, true)], 2, false],
    ['내가 가장 늦게 들어옴', [seat('a', 1), seat('b', 2), seat('c', 3, true)], 2, true],
    ['내가 먼저 들어옴', [seat('a', 1, true), seat('b', 2), seat('c', 3)], 2, false],
    ['시각이 같으면 키가 뒤인 쪽', [seat('a', 1), seat('c', 5, true), seat('b', 5)], 2, true],
    ['시각이 같고 키가 앞', [seat('a', 1), seat('b', 5, true), seat('c', 5)], 2, false],
    ['내 기록을 아직 못 받음(joinedAt 0)', [seat('a', 1), seat('b', 2), seat('me', 0, true)], 2, false],
    ['정원 3명에 4명, 둘째로 늦음', [seat('a', 1), seat('b', 2), seat('c', 3, true), seat('d', 4)], 3, false],
  ])('%s', (_, seats, cap, want) => {
    expect(mustLeave(seats, cap)).toBe(want);
  });

  it('최근 방은 앞에 두고 5개까지만 남긴다', () => {
    const s = { lastRoom: null, recent: ['B', 'C', 'D', 'E', 'F'] };
    expect(remember(s, 'C')).toEqual({ lastRoom: 'C', recent: ['C', 'B', 'D', 'E', 'F'] });
    expect(remember(s, 'A')).toEqual({ lastRoom: 'A', recent: ['A', 'B', 'C', 'D', 'E'] });
    expect(forget({ lastRoom: 'A', recent: ['A', 'B'] }, 'A')).toEqual({ lastRoom: null, recent: ['B'] });
    expect(forget({ lastRoom: 'B', recent: ['A', 'B'] }, 'A')).toEqual({ lastRoom: 'B', recent: ['B'] });
  });

});
