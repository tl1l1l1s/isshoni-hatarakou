// 채팅 순수 함수와 수치 (COM-01, COM-02, COM-08, COM-09)
import { z } from 'zod';
import { Sha256 } from '@shared/schemas';

export const MSG_MAX = 300;
/** 창에 불러오는 최근 메시지 수 (COM-01) */
export const MSG_LIMIT = 100;
export const SAY_MS = 6_000;
export const EMOJI_MS = 3_000;
const SAY_CHARS = 30;

// ponytail: OS 이모지 글꼴로 그린다. 안 보이는 PC가 나오면 그림 파일로 바꾼다 (COM-08)
export const EMOJIS = ['👍', '👏', '😂', '😊', '😮', '😢', '😡', '❤️', '🎉', '🔥', '💤', '☕'] as const;

export const Msg = z.object({ uid: z.string(), name: z.string(), text: z.string().min(1).max(MSG_MAX), at: z.number(), v: z.literal(1) });
export type Msg = z.infer<typeof Msg>;
export interface Item { key: string; value: Msg }

/** 방마다 마지막으로 읽은 메시지 키 */
export const Local = z.object({ read: z.record(z.string(), z.string()) });
export type Local = z.infer<typeof Local>;

/** 서버 시각 15자리와 uid. 문자열 순서가 시각 순서이고 사람마다 다르다 */
export const msgKey = (t: number, uid: string): string => `${String(t).padStart(15, '0')}_${uid}`;

/** 같은 앱이 같은 ms에 두 번 보내도 키가 겹치지 않게 1씩 민다 */
export const nextTime = (now: number, last: number): number => Math.max(now, last + 1);

/** lastRead 뒤에 남이 보낸 메시지 수 */
export const countUnread = (items: Item[], lastRead: string, me: string): number =>
  items.filter((i) => i.key > lastRead && i.value.uid !== me).length;

export const badge = (n: number): string => (n > 9 ? '9+' : String(n));

/** 보낼 글. 비었으면 null */
export const clean = (s: string): string | null => s.trim() || null;

export const short = (s: string): string => {
  const one = s.replace(/\s+/g, ' ');
  return one.length > SAY_CHARS ? `${one.slice(0, SAY_CHARS)}…` : one;
};

/** Enter로 보낸다. 한글 조합 중 Enter는 글자를 확정할 뿐이고(코어 단축키와 같은 검사) Shift+Enter는 줄바꿈 */
export const isSendKey = (e: { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }): boolean =>
  e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229;

export const timeText = (at: number): string =>
  new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** 내 이모티콘 칸 수와 그림 긴 변 (COM-18) */
export const MINE_MAX = 8;
export const MINE_SIDE = 128;
export const Mine = z.array(Sha256).max(MINE_MAX);

/** 대화하기 창 글자 크기 네 단계 (COM-04, SET-08) */
export const FontSize = z.enum(['s', 'm', 'l', 'xl']);
export type FontSize = z.infer<typeof FontSize>;
export const FONT_SIZES: Array<{ value: FontSize; label: string }> = [
  { value: 's', label: '작게' },
  { value: 'm', label: '보통' },
  { value: 'l', label: '크게' },
  { value: 'xl', label: '아주 크게' },
];
export const FONT_PX: Record<FontSize, number> = { s: 12, m: 13, l: 15, xl: 18 };
