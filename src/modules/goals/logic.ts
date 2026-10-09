// 달성표 계산 (GRW-06). 하루 집중 목표 하나와 이번 주 요일별 표시만 둔다
import { z } from 'zod';

export const GOAL_HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/** mod/goals/u/{uid}/cfg. goal은 하루 목표 초이고 0이면 끔. since는 목표를 켠 날 */
export const Cfg = z.object({ goal: z.number().int().min(0).max(12 * 3600), since: z.string(), v: z.literal(1) });
export type Cfg = z.infer<typeof Cfg>;
export const NO_GOAL: Cfg = { goal: 0, since: '', v: 1 };

/** mod/goals/u/{uid}/days/{dayKey}. 그날 오늘 합계와 그날의 목표 */
export const Day = z.object({ sec: z.number().int().min(0), goal: z.number().int().min(0), v: z.literal(1) });
export type Day = z.infer<typeof Day>;

export const readCfg = (v: unknown): Cfg => Cfg.safeParse(v).data ?? NO_GOAL;

/** day가 든 주의 월요일부터 일요일까지 날짜 키. 하루는 dayKey처럼 오전 6시에 바뀐다 (FOC-05) */
export function weekOf(day: string): string[] {
  const t = Date.parse(day);
  const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000;
  return WEEKDAYS.map((_, i) => new Date(monday + i * 86_400_000).toISOString().slice(0, 10));
}

export type Mark = 'done' | 'miss' | 'today' | 'none';

const met = (d: Day | undefined) => !!d && d.goal > 0 && d.sec >= d.goal;

/** 요일 칸 표시. 목표를 켜기 전 날과 앞날은 none, 오늘은 채웠으면 done 아니면 today, 지난날은 done이나 miss */
export function markOf(day: string, today: string, since: string, rec: Day | undefined): Mark {
  if (!since || day < since || day > today) return 'none';
  if (met(rec)) return 'done';
  return day === today ? 'today' : 'miss';
}

/** 시:분:초 */
export function clock(sec: number): string {
  const s = Math.floor(sec);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

/** 10/5 */
export const shortDate = (day: string): string => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
