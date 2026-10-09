// 폰 연동 계산 (FOC-09). 폰 자동화 앱이 그림 앱을 열고 닫을 때 로그인 없이 신호를 쓴다 (keyedWrite)
import { z } from 'zod';

/** presence 기록 {"app":"..."}이 128바이트(PRESENCE_MODULE_MAX_BYTES)를 넘지 않는 길이. 한글 한 자는 3바이트다 */
export const APP_NAME_MAX = 36;
/** 닫힘 신호가 오지 않아도 열림 신호 하나는 4시간까지만 센다 */
export const OPEN_MAX_MS = 4 * 3_600_000;

/** mod/phone/u/{uid}/sig/{연결 키}. at은 서버 시각(규칙이 now와 같은지 본다) */
export const Sig = z.object({ open: z.boolean(), app: z.string().max(APP_NAME_MAX).default(''), at: z.number() });
export type Sig = z.infer<typeof Sig>;

export const readSig = (v: unknown): Sig | null => Sig.safeParse(v).data ?? null;

export type PhoneState = 'off' | 'waiting' | 'drawing' | 'expired' | 'resting';

/** 연결 상태. sig는 지금 키 칸의 신호라서 키를 새로 만들면 신호가 올 때까지 기다리는 중이다 */
export function stateOf(key: string | null, sig: Sig | null, now: number): PhoneState {
  if (!key) return 'off';
  if (!sig) return 'waiting';
  if (!sig.open) return 'resting';
  return now - sig.at < OPEN_MAX_MS ? 'drawing' : 'expired';
}

/** 32자 연결 키. 규칙은 이 문자열을 그대로 비교한다 */
export function newKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 안내 페이지 링크. 페이지가 # 뒤의 uid와 키로 신호 주소 sig/{키}.json과 본문을 만든다 */
export const linkOf = (pageUrl: string, uid: string, key: string): string => `${pageUrl}#${uid}.${key}`;
