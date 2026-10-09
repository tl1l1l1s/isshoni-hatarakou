// 스케줄러 일정 모양과 달력 계산 (HOM-16). ctx 없이 시험하는 순수 함수
import { z } from 'zod';
import { addDays } from './api';

export const TITLE_MAX = 40;
export const MEMO_MAX = 200;
/** 구독하는 일정 수. 키가 날짜로 시작해서 날짜가 늦은 쪽부터 남는다 */
export const LIST_MAX = 300;

export const Plan = z.object({
  date: z.iso.date(),
  title: z.string().min(1).max(TITLE_MAX),
  memo: z.string().max(MEMO_MAX),
  pub: z.boolean(),
  v: z.literal(1),
});
export type Plan = z.infer<typeof Plan>;
export type Row = Plan & { id: string };

export const Settings = z.object({ weekStart: z.enum(['sun', 'mon']).default('sun') });
export type Settings = z.infer<typeof Settings>;

/** 키를 날짜로 시작해서 키 순서가 곧 날짜 순서다 */
export const planId = (date: string, rand: string) => `${date}_${rand}`;

/** 서버 목록을 읽는다. 모양이 틀린 항목은 버린다 */
export const parsePlans = (rows: Array<{ key: string; value: unknown }>): Row[] =>
  rows.flatMap(({ key, value }) => {
    const p = Plan.safeParse(value);
    return p.success ? [{ ...p.data, id: key }] : [];
  });

/** 일정 하나를 쓰는 다중 경로 쓰기. 공개 일정은 pub에도 같은 값을 두고 비공개면 pub에서 지운다.
 *  날짜를 바꾸면 키가 바뀌므로 옛 키를 함께 지운다. plan이 null이면 지우기 */
export function planWrites(oldId: string | null, id: string, plan: Plan | null): Record<string, unknown> {
  const w: Record<string, unknown> = {};
  if (oldId && oldId !== id) Object.assign(w, { [`ev/${oldId}`]: null, [`pub/${oldId}`]: null });
  w[`ev/${id}`] = plan;
  w[`pub/${id}`] = plan?.pub ? plan : null;
  return w;
}

/** 'YYYY-MM' 달을 덮는 6주 42칸의 날짜. 한 주는 일요일이나 월요일에 시작한다 */
export function monthGrid(month: string, weekStart: Settings['weekStart']): string[] {
  const first = `${month}-01`;
  const back = (new Date(Date.parse(first)).getUTCDay() - (weekStart === 'mon' ? 1 : 0) + 7) % 7;
  const start = addDays(first, -back);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdays = (weekStart: Settings['weekStart']) => (weekStart === 'mon' ? [...WEEK.slice(1), WEEK[0]!] : WEEK);
/** 10월 9일 금요일 */
export const dayTitle = (date: string) => {
  const d = new Date(Date.parse(date));
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEK[d.getUTCDay()]}요일`;
};
