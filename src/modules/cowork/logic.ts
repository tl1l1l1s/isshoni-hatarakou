// 같이 작업하기 단계 계산과 세션 전이 (ROM-15). ctx 없이 시험하는 순수 함수
import { z } from 'zod';

export const TITLE_MAX = 20;
export const GOAL_MAX = 40;
export const FOCUS_MIN = 5;
export const FOCUS_MAX = 180;
export const BREAK_MIN = 0;
export const BREAK_MAX = 60;
/** 개설자가 시작을 누른 뒤 집중이 시작하기까지 */
export const LEAD_MS = 5_000;
/** 시작하지 않은 세션은 만든 지 이 시간이 지나면 끝난다 */
export const WAIT_MAX_MS = 30 * 60_000;
/** 절전이나 연결이 끊긴 사이 이보다 오래전에 끝난 단계는 알리지 않는다 (FOC-07과 같은 기준) */
export const LATE_MS = 60_000;

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** 방의 지금 세션 하나. f와 b는 분이고 at은 만든 서버 시각, go는 시작을 누른 서버 시각이다 */
export const Session = z.object({
  id: z.string().regex(ID),
  by: z.string().min(1),
  title: z.string().max(TITLE_MAX),
  f: int(FOCUS_MIN, FOCUS_MAX),
  b: int(BREAK_MIN, BREAK_MAX),
  st: z.enum(['wait', 'run', 'stop']),
  at: z.number(),
  go: z.number().optional(),
  v: z.literal(1),
});
export type Session = z.infer<typeof Session>;

/** 내 참여. sid가 지금 세션 id와 같을 때만 참여 중이다. goal은 공유를 켠 목표만 쓴다 */
export const Part = z.object({ sid: z.string().max(32), at: z.number(), goal: z.string().min(1).max(GOAL_MAX).optional(), v: z.literal(1) });
export type Part = z.infer<typeof Part>;

export const readSession = (v: unknown): Session | null => Session.safeParse(v).data ?? null;

/** 참여 기록 묶음. 모양이 틀린 기록은 버린다 */
export function readParts(v: unknown): Record<string, Part> {
  const out: Record<string, Part> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [uid, p] of Object.entries(v)) {
    const r = Part.safeParse(p);
    if (r.success) out[uid] = r.data;
  }
  return out;
}

/** wait는 시작 전, lead는 시작을 누른 뒤 5초, done은 끝났거나 세션이 없음 */
export type Phase = 'wait' | 'lead' | 'focus' | 'break' | 'done';

/** 지금 단계와 그 단계가 끝나는 서버 시각 */
export function phaseOf(s: Session | null, now: number): { phase: Phase; end: number } {
  if (!s || s.st === 'stop') return { phase: 'done', end: now };
  if (s.st === 'wait') return now > s.at + WAIT_MAX_MS ? { phase: 'done', end: now } : { phase: 'wait', end: s.at + WAIT_MAX_MS };
  const go = s.go ?? s.at;
  const focusAt = go + LEAD_MS;
  const breakAt = focusAt + s.f * 60_000;
  const endAt = breakAt + s.b * 60_000;
  if (now < focusAt) return { phase: 'lead', end: focusAt };
  if (now < breakAt) return { phase: 'focus', end: breakAt };
  if (now < endAt) return { phase: 'break', end: endAt };
  return { phase: 'done', end: endAt };
}

export const active = (s: Session | null, now: number) => phaseOf(s, now).phase !== 'done';
/** 휴식 중에는 참여하지 않는다 */
export const canJoin = (phase: Phase) => phase === 'wait' || phase === 'lead' || phase === 'focus';

/** 머리 위와 칩에 보일 남은 분. 다음 단계로 넘어가기 직전의 몇 초도 1분으로 둔다 */
export const minutesLeft = (end: number, now: number) => Math.max(1, Math.ceil((end - now) / 60_000));

/** 참여자의 머리 위 글. 시작 전에는 띄우지 않는다 */
export function bubbleText(s: Session | null, now: number): string | null {
  const { phase, end } = phaseOf(s, now);
  if (phase === 'focus') return `함께 집중 ${minutesLeft(end, now)}분 남음`;
  if (phase === 'break') return `함께 휴식 ${minutesLeft(end, now)}분 남음`;
  if (phase === 'lead') return `함께 집중 ${s!.f}분 남음`;
  return null;
}

export interface Draft { title: string; f: number; b: number }

/** 만들기. 진행 중인 세션이 있으면 undefined를 돌려 트랜잭션을 멈춘다 */
export function create(cur: Session | null, me: string, d: Draft, id: string, now: number): Session | undefined {
  if (active(cur, now)) return undefined;
  return { id, by: me, title: d.title.trim().slice(0, TITLE_MAX), f: d.f, b: d.b, st: 'wait', at: now, v: 1 };
}

/** 시작. 개설자만 시작 전 세션을 시작한다 */
export function start(cur: Session | null, me: string, now: number): Session | undefined {
  if (!cur || cur.by !== me || phaseOf(cur, now).phase !== 'wait') return undefined;
  return { ...cur, st: 'run', go: now };
}

/** 세션 끝내기. 개설자와 방 주인이 시작 전에는 취소하고 시작 뒤에는 중단한다 */
export function stop(cur: Session | null, me: string, owner: boolean, now: number): Session | undefined {
  if (!cur || !active(cur, now) || (cur.by !== me && !owner)) return undefined;
  return { ...cur, st: 'stop' };
}

/** 단계가 바뀔 때의 알림. 늦게 알게 된 단계(LATE_MS가 지남)와 시작하지 않고 30분이 지난 세션은 알리지 않는다.
 *  changedAt은 단계가 바뀐 서버 시각이고 누가 끝낸 세션은 알게 된 시각이다 */
export function notice(s: Session, from: Phase, to: Phase, changedAt: number, now: number): string | null {
  if (now - changedAt > LATE_MS) return null;
  if (to === 'done' && s.st === 'stop' && from !== 'done') return '같이 작업을 끝냈어요.';
  if (from === 'lead' && to === 'focus') return `함께 집중을 시작해요. ${s.f}분 집중해요.`;
  if (from === 'focus' && to === 'break') return `집중이 끝났어요. ${s.b}분 쉬어요.`;
  if ((from === 'focus' || from === 'break') && to === 'done' && s.st !== 'stop') return '같이 작업이 끝났어요.';
  return null;
}
