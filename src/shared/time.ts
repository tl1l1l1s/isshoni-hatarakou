import { DAY_BOUNDARY_MS, KST_OFFSET_MS } from './constants.ts';

const DAY_MS = 86_400_000;

/** 서버 시각(ms)을 하루 키 'YYYY-MM-DD'로 바꾼다. 한국 시간 오전 6시에 날짜가 바뀐다 (10.7.2). */
export function dayKey(serverNowMs: number): string {
  return new Date(serverNowMs + KST_OFFSET_MS - DAY_BOUNDARY_MS).toISOString().slice(0, 10);
}

/** dayKey와 같은 경계로 센 1970년 1월 1일부터의 날 번호. 규칙은 날짜 문자열을 만들지 못해서 dailyQuota가 이 값을 쓴다 */
export function dayIndex(serverNowMs: number): number {
  return Math.floor((serverNowMs + KST_OFFSET_MS - DAY_BOUNDARY_MS) / DAY_MS);
}

/** dailyQuota 기록 { d: 날 번호, n: 오늘 쓴 횟수 } */
export interface QuotaRecord { d: number; n: number }

/** dailyQuota 기록을 transaction으로 1 올릴 때 쓴다. 한도에 닿았으면 undefined (취소) */
export function nextQuota(cur: QuotaRecord | null, day: number, limit: number): QuotaRecord | undefined {
  const n = cur?.d === day ? cur.n + 1 : 1;
  return n <= limit ? { d: day, n } : undefined;
}
