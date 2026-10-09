import { describe, expect, it } from 'vitest';
import { dueToday, noticeText, upcoming, whenText } from './logic';

const today = '2026-10-09';
const plans = [
  { id: 'a', owner: 'me', who: '', date: '2026-10-09', title: '원고 마감' },
  { id: 'b', owner: 'bob', who: '밥', date: '2026-10-12', title: '이사' },
  { id: 'c', owner: 'me', who: '', date: '2026-10-08', title: '지난 일정' },
  { id: 'd', owner: 'me', who: '', date: '2026-10-17', title: '먼 일정' },
];
const cards = [
  { id: 'x', name: '기념일', date: '2026-10-09', notify: false },
  { id: 'y', name: '시험', date: '2026-10-16', notify: true },
];

describe('다가오는 일정 (HOM-22)', () => {
  it('오늘부터 7일 뒤까지를 날짜 순서로 모은다', () => {
    expect(upcoming(plans, cards, today).map((e) => e.title)).toEqual(['원고 마감', '기념일', '이사', '시험']);
    expect(whenText('2026-10-09', today)).toBe('오늘');
    expect(whenText('2026-10-10', today)).toBe('내일');
    expect(whenText('2026-10-12', today)).toBe('3일 뒤');
  });

  it('오늘 일정은 하루에 한 번만 알리고 알림을 끈 D-day는 알리지 않는다', () => {
    const list = upcoming(plans, cards, today);
    const first = dueToday(list, today, { day: '2026-10-08', sent: ['p/me/c'] });
    expect(first.due.map((e) => e.key)).toEqual(['p/me/a']);
    expect(first.next).toEqual({ day: today, sent: ['p/me/a'] });
    expect(dueToday(list, today, first.next).due).toEqual([]);
    expect(noticeText([...first.due, { ...first.due[0]!, who: '밥', title: '이사' }])).toBe('원고 마감, 밥님의 이사');
  });
});
