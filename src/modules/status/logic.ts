// 자동 자리비움, 상태 고르기, 말풍선 글 (CHR-06, CHR-09, CHR-10, FOC-06). ctx 없이 시험하는 순수 함수
import { z } from 'zod';
import type { CoreState } from '@shared/schemas';

export const AUTO_AWAY_SEC = 20 * 60;
export const CUSTOM_MAX = 20;

export const Choice = z.enum(['work', 'meal', 'rest', 'busy', 'away', 'custom']);
export type Choice = z.infer<typeof Choice>;

/** 고정 상태. 작업 중은 고른 상태를 지운다 */
export const FIXED: Record<Exclude<Choice, 'custom'>, { label: string; state: CoreState | null }> = {
  work: { label: '작업 중', state: null },
  meal: { label: '밥 먹는 중', state: 'busy' },
  rest: { label: '쉬는 중', state: 'busy' },
  busy: { label: '바쁨', state: 'busy' },
  away: { label: '자리비움', state: 'away' },
};

export const Local = z.object({ choice: Choice, custom: z.string().max(CUSTOM_MAX) });
export type Local = z.infer<typeof Local>;

/** 입력 없이 20분이 지나면 자동 자리비움 */
export const isIdleAway = (idleSec: number): boolean => idleSec >= AUTO_AWAY_SEC;

/** 자동 자리비움이 6시간 이어지면 방에서 나간다. 마지막 입력부터 6시간 20분 (CHR-13, ROM-14) */
export const AUTO_LEAVE_SEC = AUTO_AWAY_SEC + 6 * 3600;
/** 나가기 1분 전에 안내 창을 띄운다 */
export const LEAVE_WARN_MS = 60_000;

/** 자동 퇴장 안내를 띄울 때인지. 직접 고른 상태(자리비움 포함)가 있거나 그림 앱이 앞에 있거나 방 주인이면 나가지 않는다 */
export function leaveDue(idleSec: number, o: { inRoom: boolean; chosen: boolean; pen: boolean; owner: boolean }): boolean {
  return o.inRoom && !o.chosen && !o.pen && !o.owner && idleSec >= AUTO_LEAVE_SEC - LEAVE_WARN_MS / 1000;
}

/** 고른 상태의 코어 상태와 말풍선 글. 직접 적은 글은 상태를 바꾸지 않아서 자동 자리비움이 그대로 동작한다 */
export function resolve(sel: Local): { state: CoreState | null; text: string } {
  if (sel.choice === 'custom') return { state: null, text: sel.custom.trim() };
  const c = FIXED[sel.choice];
  return { state: c.state, text: sel.choice === 'work' ? '' : c.label };
}

/** 남이 보낸 값이라 문자열만 받는다 */
export const statusText = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, CUSTOM_MAX) : null);

/** 분을 N시간 M분으로. 0분이면 시간만 쓴다 */
export function hm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 오늘 집중 시간 말풍선 (FOC-06). 0분이면 숨긴다 */
export const todayText = (v: unknown): string | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? `오늘 ${hm(v)}` : null;
