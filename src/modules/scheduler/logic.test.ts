import { describe, expect, it } from 'vitest';
import { addDays, calendarDay, daysBetween } from './api';
import { dayTitle, monthGrid, parsePlans, planId, planWrites, shiftMonth, type Plan } from './logic';

const plan: Plan = { date: '2026-10-09', title: '마감', memo: '', pub: true, v: 1 };

describe('달력 날짜 (HOM-16)', () => {
  it('한국 시간 자정에 날짜가 바뀐다', () => {
    expect(calendarDay(Date.parse('2026-10-08T14:59:59Z'))).toBe('2026-10-08');
    expect(calendarDay(Date.parse('2026-10-08T15:00:00Z'))).toBe('2026-10-09');
  });

  it('날을 더하고 두 날 사이를 센다. 달과 해를 넘어간다', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-09', '2026-10-19')).toBe(10);
    expect(daysBetween('2026-10-09', '2026-10-01')).toBe(-8);
  });

  it('달력은 그 달 1일이 든 주부터 42칸이고 한 주 시작 요일을 따른다', () => {
    // 2026년 10월 1일은 목요일
    const sun = monthGrid('2026-10', 'sun');
    expect(sun).toHaveLength(42);
    expect(sun[0]).toBe('2026-09-27');
    expect(sun[4]).toBe('2026-10-01');
    expect(monthGrid('2026-10', 'mon')[0]).toBe('2026-09-28');
    // 1일이 시작 요일이면 첫 칸이 1일
    expect(monthGrid('2026-11', 'sun')[0]).toBe('2026-11-01');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(dayTitle('2026-10-09')).toBe('10월 9일 금요일');
  });
});

describe('일정 쓰기 (HOM-16)', () => {
  it('공개 일정은 pub에도 쓰고 비공개는 pub에서 지운다', () => {
    expect(planWrites(null, 'k', plan)).toEqual({ 'ev/k': plan, 'pub/k': plan });
    expect(planWrites('k', 'k', { ...plan, pub: false })).toEqual({ 'ev/k': { ...plan, pub: false }, 'pub/k': null });
  });

  it('날짜를 바꿔 키가 바뀌면 옛 키를 함께 지우고 지우기는 둘 다 지운다', () => {
    expect(planWrites('a', 'b', plan)).toEqual({ 'ev/a': null, 'pub/a': null, 'ev/b': plan, 'pub/b': plan });
    expect(planWrites('a', 'a', null)).toEqual({ 'ev/a': null, 'pub/a': null });
  });

  it('키는 날짜로 시작하고 모양이 틀린 일정은 버린다', () => {
    expect(planId('2026-10-09', 'x1')).toBe('2026-10-09_x1');
    expect(parsePlans([{ key: 'a', value: plan }, { key: 'b', value: { ...plan, title: '' } }, { key: 'c', value: { ...plan, date: '2026-13-40' } }])).toEqual([{ ...plan, id: 'a' }]);
  });
});
