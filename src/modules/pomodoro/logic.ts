// 뽀모도로 계산 (FOC-07). 포커스 기록과 따로 돌고 시간을 재고 알려 주기만 한다
import { z } from 'zod';

export type Phase = 'focus' | 'short' | 'long';
export const PRESETS = { '25': { focus: 25, short: 5, long: 15 }, '50': { focus: 50, short: 10, long: 20 } } as const;

/** 진행 중인 타이머. endsAt이 null이면 일시정지이고 leftMs가 남은 시간이다. round는 1부터 센 집중 바퀴 */
export const Run = z.object({
  phase: z.enum(['focus', 'short', 'long']),
  round: z.number().int().min(1),
  endsAt: z.number().nullable(),
  leftMs: z.number().min(0),
});
export type Run = z.infer<typeof Run>;

/** 기기 범위 로컬 데이터. 진행 중인 타이머도 담아서 앱을 껐다 켜도 이어진다 */
export const Local = z.object({
  preset: z.enum(['25', '50', 'custom']).default('25'),
  focus: z.number().int().min(1).max(180).default(25),
  short: z.number().int().min(1).max(60).default(5),
  long: z.number().int().min(1).max(60).default(15),
  /** 긴 휴식을 넣을 집중 바퀴 수 */
  every: z.number().int().min(2).max(10).default(4),
  /** 휴식 끝나면 다음 집중 자동 시작 */
  auto: z.boolean().default(true),
  sound: z.boolean().default(true),
  run: Run.nullable().default(null),
});
export type Local = z.infer<typeof Local>;

/** 단계 길이(분). 프리셋이면 프리셋 값, 직접이면 고른 값 */
export const minutes = (l: Local, phase: Phase): number => (l.preset === 'custom' ? l : PRESETS[l.preset])[phase];

/** 끝난 지 이보다 오래된 타이머는 이어 가지 않는다 (앱을 끈 사이나 절전 중에 끝난 것) */
export const STALE_MS = 60_000;

export const start = (l: Local, now: number): Run => ({ phase: 'focus', round: 1, endsAt: now + minutes(l, 'focus') * 60_000, leftMs: 0 });

export const leftOf = (r: Run, now: number): number => (r.endsAt === null ? r.leftMs : Math.max(0, r.endsAt - now));

export const pause = (r: Run, now: number): Run => ({ ...r, endsAt: null, leftMs: leftOf(r, now) });
export const resume = (r: Run, now: number): Run => ({ ...r, endsAt: now + r.leftMs, leftMs: 0 });

/** 지금 단계를 마치고 다음 단계로. 건너뛴 집중 바퀴도 마친 것으로 센다.
 *  집중 다음 휴식은 바로 시작하고 휴식 다음 집중은 auto일 때만 시작한다 */
export function next(l: Local, r: Run, now: number): Run {
  const phase: Phase = r.phase !== 'focus' ? 'focus' : r.round % l.every === 0 ? 'long' : 'short';
  const round = r.phase === 'focus' ? r.round : r.round + 1;
  const ms = minutes(l, phase) * 60_000;
  return phase === 'focus' && !l.auto ? { phase, round, endsAt: null, leftMs: ms } : { phase, round, endsAt: now + ms, leftMs: 0 };
}

/** 집중 2/4처럼 이번 묶음 안의 바퀴 */
export const roundText = (l: Local, r: Run): string =>
  r.phase === 'focus' ? `집중 ${((r.round - 1) % l.every) + 1}/${l.every}` : r.phase === 'long' ? '긴 휴식' : '짧은 휴식';

/** 분:초 */
export function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
