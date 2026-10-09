import { describe, expect, it } from 'vitest';
import { markOf, weekOf } from './logic';

describe('달성표', () => {
  it('주는 월요일부터 일요일까지다', () => {
    // 2026-10-09는 금요일
    expect(weekOf('2026-10-09')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(weekOf('2026-10-05')[0]).toBe('2026-10-05');
    expect(weekOf('2026-10-11')[0]).toBe('2026-10-05');
    expect(weekOf('2026-11-01')).toContain('2026-10-26');
  });

  const T = '2026-10-09';
  const day = (sec: number, goal = 3600) => ({ sec, goal, v: 1 as const });
  // 날짜, 목표를 켠 날, 기록, 표시
  it.each([
    ['2026-10-08', '2026-10-05', day(3600), 'done'],
    ['2026-10-08', '2026-10-05', day(3599), 'miss'],
    ['2026-10-07', '2026-10-05', undefined, 'miss'],
    ['2026-10-06', '2026-10-07', day(9999), 'none'],
    [T, '2026-10-05', day(10), 'today'],
    [T, '2026-10-05', day(3600), 'done'],
    ['2026-10-10', '2026-10-05', undefined, 'none'],
    ['2026-10-08', '', day(9999), 'none'],
    ['2026-10-08', '2026-10-05', day(9999, 0), 'miss'],
  ] as const)('%s (켠 날 %s)', (d, since, rec, mark) => {
    expect(markOf(d, T, since, rec)).toBe(mark);
  });
});
