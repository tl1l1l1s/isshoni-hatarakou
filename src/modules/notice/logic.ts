// 우편함 글과 확성기 기록의 모양, 순수 계산 (ACC-09, OPS-01, OPS-17, OPS-18).
// scripts/ops.ts도 이 파일을 읽으므로 zod 말고는 import하지 않는다
import { z } from 'zod';

export const TAGS = { notice: '공지', update: '업데이트', letter: '우편' } as const;
export type Tag = keyof typeof TAGS;

/** 글 하나의 제목과 본문 길이 상한 */
export const TITLE_MAX = 80;
export const BODY_MAX = 800;
export const LINK_MAX = 300;
/** 최근 글만 받는다 */
export const POSTS_MAX = 30;
/** 확성기는 140자까지 받고 기본 60초 동안 보여 준다 */
export const SHOUT_MAX = 140;
export const SHOUT_SEC = 60;
export const SHOUT_SEC_MAX = 600;
/** 기억하는 읽음 표시 수. 보이는 글(전체 글, 내 우편, 업데이트 소식)보다 넉넉하다 */
export const READ_MAX = 200;

/** mod/notice/g/posts/{id} 전체 글과 mod/notice/u/{uid}/mail/{id} 개인 우편. 선물하는 사람의 스크립트만 쓴다 */
export const Post = z.object({
  tag: z.enum(['notice', 'update', 'letter']),
  title: z.string().min(1).max(TITLE_MAX),
  body: z.string().max(BODY_MAX),
  link: z.string().max(LINK_MAX).regex(/^https?:\/\/\S+$/).optional(),
  pin: z.boolean().optional(),
  at: z.number(),
  v: z.literal(1),
});
export type Post = z.infer<typeof Post>;

/** mod/notice/g/shout. at은 서버 시각이고 sec초 동안 보인다 */
export const Shout = z.object({ text: z.string().min(1).max(SHOUT_MAX), at: z.number(), sec: z.number().int().min(1).max(SHOUT_SEC_MAX), v: z.literal(1) });
export type Shout = z.infer<typeof Shout>;

export interface Item extends Post { id: string }

/** 앱에 함께 넣는 업데이트 소식. 업데이트한 뒤 처음 켤 때 한 번 보여 준다 (OPS-17) */
export interface Note { version: string; at: number; title: string; body: string }

/** 모양이 맞는 글만 남긴다 */
export const parsePosts = (rows: Array<{ key: string; value: unknown }>): Item[] =>
  rows.flatMap(({ key, value }) => {
    const r = Post.safeParse(value);
    return r.success ? [{ ...r.data, id: key }] : [];
  });

/** 고정한 글을 먼저, 나머지는 새것부터 */
export const sortPosts = (xs: Item[]): Item[] => [...xs].sort((a, b) => Number(b.pin === true) - Number(a.pin === true) || b.at - a.at);

/** 확성기가 보일 남은 밀리초. 없거나 끝났으면 0 */
export const shoutLeft = (s: Shout | null, now: number): number => (s ? Math.max(0, s.at + s.sec * 1000 - now) : 0);

/** 버전 a가 b보다 앞인지 (1.2.3 형식, 숫자만 비교) */
export function older(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0;
  }
  return false;
}

/** 마지막으로 본 버전 뒤부터 지금 버전까지의 소식. 처음 켠 PC(seen이 빈 글)는 업데이트한 것이 아니라 보여 주지 않는다 */
export const newNotes = (notes: Note[], seen: string, current: string): Note[] =>
  seen ? notes.filter((n) => older(seen, n.version) && !older(current, n.version)) : [];

export const noteItem = (n: Note): Item => ({ id: `note:${n.version}`, tag: 'update', title: n.title, body: n.body, at: n.at, v: 1 });
