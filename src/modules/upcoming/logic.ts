// 다가오는 일정 목록과 오늘 알릴 일정 (HOM-22). ctx 없이 시험하는 순수 함수
import { z } from 'zod';
import type { DdayCard } from '@modules/dday/api';
import { addDays, daysBetween, type PlanItem } from '@modules/scheduler/api';

/** 오늘부터 며칠 뒤까지 보여 주고 배지로 세는지 */
export const DAYS = 7;

export const Settings = z.object({ notify: z.boolean().default(true) });
export type Settings = z.infer<typeof Settings>;
/** 오늘 이미 알린 항목 키. 날이 바뀌면 비운다 */
export const Local = z.object({ day: z.string(), sent: z.array(z.string()) });
export type Local = z.infer<typeof Local>;

export interface Entry { key: string; date: string; title: string; who: string; kind: 'plan' | 'dday'; notify: boolean }

/** 오늘부터 DAYS일 뒤까지의 내 일정, 친구 공개 일정, 내 D-day를 날짜 순서로 */
export function upcoming(plans: PlanItem[], cards: DdayCard[], today: string): Entry[] {
  const end = addDays(today, DAYS);
  return [
    ...plans.map((p): Entry => ({ key: `p/${p.owner}/${p.id}`, date: p.date, title: p.title, who: p.who, kind: 'plan', notify: true })),
    ...cards.map((c): Entry => ({ key: `d/${c.id}`, date: c.date, title: c.name, who: '', kind: 'dday', notify: c.notify })),
  ]
    .filter((e) => e.date >= today && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 오늘 날짜인 항목 가운데 아직 알리지 않은 것과 새 알린 기록. D-day는 알림 받기를 켠 카드만 알린다 */
export function dueToday(list: Entry[], today: string, sent: Local): { due: Entry[]; next: Local } {
  const prev = sent.day === today ? sent.sent : [];
  const due = list.filter((e) => e.date === today && e.notify && !prev.includes(e.key));
  return { due, next: { day: today, sent: [...prev, ...due.map((e) => e.key)] } };
}

export const noticeText = (due: Entry[]): string => due.map((e) => (e.who ? `${e.who}님의 ${e.title}` : e.title)).join(', ');

export function whenText(date: string, today: string): string {
  const d = daysBetween(today, date);
  return d === 0 ? '오늘' : d === 1 ? '내일' : `${d}일 뒤`;
}
