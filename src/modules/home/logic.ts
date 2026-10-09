// 마이홈의 자료 모양과 순수 계산 (HOM-02부터 HOM-15까지)
import { z } from 'zod';
import { FILE_MAX_BASE64_BYTES, NAME_MAX_LENGTH } from '@shared/constants';
import { Sha256 } from '@shared/schemas';

export const PROFILE_MAX = 500;
export const POST_MAX = 1000;
export const STICKER_CAP = 10;
export const BOOK_MAX = 140;
export const GIFT_MSG_MAX = 60;
/** 저장해 두는 말랑이 그림 수 (내가 만든 것과 받은 선물) */
export const MALLANGI_MAX = 10;
/** 한 화면에 나와 있는 말랑이 수 (HOM-12 메모) */
export const ON_SCREEN_MAX = 5;
/** 그림을 줄이는 긴 변 (10.14의 13번, HOM-08, HOM-12) */
export const BG_SIDE = 960;
export const STICKER_SIDE = 400;
export const MALLANGI_SIDE = 160;
/** 마이홈 보기 화면 크기. 스티커와 말랑이 좌표는 이 안의 픽셀이다 */
export const VIEW = { width: 768, height: 480 };
export const STICKER_W_MIN = 24;
export const STICKER_W_MAX = 400;
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3;
export const DEFAULT_BG = '#cfe3f2';
/** 받은 기록 in/{보낸 사람} 아래에서 선물을 모아 두는 키. 나머지 키는 방명록 글이다 */
export const GIFT_KEY = 'gift';
/** 받은 기록 in/{보낸 사람} 아래 그 사람이 보낸 박수 수 (HOM-15) */
export const CLAP_KEY = 'clap';
/** 방명록을 한 번에 받는 글 수. 보낸 사람마다 이만큼 받고 더 보기를 누르면 이만큼 더 받는다 (HOM-09) */
export const BOOK_PAGE = 30;
/** 한 사람이 받는 사람에게 쌓아 둘 수 있는 받지 않은 선물 수. 앱만 센다 (HOM-14) */
export const GIFT_PENDING_MAX = 30;
/** 보낸 사람 색인 senders를 처음 만들 때 읽는 보낸 사람 수. 친구 상한 100명에 끊은 사람 몫을 더했다 */
export const SENDERS_MAX = 200;
/** 방문자 한 사람이 마이홈 하나에 하루에 보내는 박수 (HOM-15, 앱만 센다) */
export const CLAP_DAILY = 5;
export const CLAP_EMOJI_MAX = 32;
export const DEFAULT_CLAP = '👏';
export const BGM_TITLE_MAX = 200;
export const SHELF_MAX = 50;
export const MARK_TITLE_MAX = 14;
export const MARK_URL_MAX = 300;
export const MARK_SIDE = 400;
/** 마이홈 색 묶음 (HOM-07). 사용자가 고르는 내용 색이다 */
export const ACCENTS: Array<[string, string]> = [
  ['#e0559a', '분홍'], ['#e07b2a', '주황'], ['#d1453b', '빨강'], ['#2f9e5b', '초록'], ['#3a8fd9', '하늘'], ['#5a5fd6', '남색'], ['#8a5cd0', '보라'],
];

/** Firebase는 배열을 숫자 키 객체로 돌려줄 수 있고 빈 배열은 지운다 */
const listOf = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess((v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : (v ?? [])), z.array(item).max(max));

export const Anim = z.enum(['none', 'bob', 'spin']);
export type Anim = z.infer<typeof Anim>;

export const Sticker = z.object({
  file: Sha256,
  x: z.number(),
  y: z.number(),
  w: z.number().min(STICKER_W_MIN).max(STICKER_W_MAX),
  rot: z.number(),
  z: z.number().int(),
  anim: Anim,
  speed: z.number().min(SPEED_MIN).max(SPEED_MAX),
});
export type Sticker = z.infer<typeof Sticker>;

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const Bg = z.union([z.object({ color: Hex }), z.object({ file: Sha256 })]);
export type Bg = z.infer<typeof Bg>;
/** 플레이리스트에서 고른 유튜브 곡 (HOM-04) */
export const Bgm = z.object({ v: z.string().regex(/^[\w-]{11}$/), title: z.string().max(BGM_TITLE_MAX) });
export type Bgm = z.infer<typeof Bgm>;

export const Home = z.object({
  profile: z.string().max(PROFILE_MAX).default(''),
  post: z.object({ text: z.string().max(POST_MAX), at: z.number() }).optional(),
  bg: Bg.default({ color: DEFAULT_BG }),
  stickers: listOf(Sticker, STICKER_CAP),
  mallangi: listOf(Sha256, MALLANGI_MAX),
  bgm: Bgm.optional(),
  /** 마이홈 색과 창 바탕 그림 (HOM-07) */
  accent: Hex.optional(),
  wall: Sha256.optional(),
  /** 박수를 받으면 터지는 이모지 (HOM-15) */
  clap: z.string().min(1).max(CLAP_EMOJI_MAX).optional(),
  v: z.literal(1).default(1),
});
export type Home = z.infer<typeof Home>;

export const EMPTY_HOME: Home = Home.parse({});

/** 서버 값을 읽는다. 모양이 틀리면 빈 마이홈 */
export const parseHome = (raw: unknown): Home => Home.safeParse(raw ?? {}).data ?? EMPTY_HOME;

export const Book = z.object({ name: z.string().max(NAME_MAX_LENGTH), text: z.string().min(1).max(BOOK_MAX), at: z.number() });
export type Book = z.infer<typeof Book>;
export const Gift = z.object({ file: Sha256, msg: z.string().max(GIFT_MSG_MAX), name: z.string().max(NAME_MAX_LENGTH), at: z.number() });
export type Gift = z.infer<typeof Gift>;
export type Item<T> = T & { sender: string; id: string };

/** 북마크 책 한 권 (HOM-11). 공개한 책은 친구가 읽는 shelfPub에도 둔다 */
export const Mark = z.object({
  title: z.string().min(1).max(MARK_TITLE_MAX),
  url: z.string().max(MARK_URL_MAX).regex(/^https?:\/\/\S+$/),
  color: Hex,
  img: Sha256.optional(),
  pub: z.boolean(),
});
export type Mark = z.infer<typeof Mark>;
const Shelf = listOf(Mark, SHELF_MAX);
export const parseShelf = (raw: unknown): Mark[] => Shelf.safeParse(raw ?? []).data ?? [];

/** 오늘 마이홈마다 보낸 박수 수. day가 바뀌면 처음부터 센다 (HOM-15) */
const Claps = z.object({ day: z.string(), n: z.record(z.string(), z.number()) });
export type Claps = z.infer<typeof Claps>;
export const Local = z.object({ bookSeen: z.number(), giftSeen: z.number(), claps: Claps.default({ day: '', n: {} }) });
export type Local = z.infer<typeof Local>;

/** owner에게 오늘 박수를 하나 더 센 기록. 오늘 몫을 다 썼으면 null */
export function countClap(c: Claps, owner: string, day: string): Claps | null {
  const n = (c.day === day ? (c.n[owner] ?? 0) : 0) + 1;
  if (n > CLAP_DAILY) return null;
  return { day, n: { ...(c.day === day ? c.n : {}), [owner]: n } };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** 받은 기록 in 전체를 방명록 글과 선물로 나누고 새것부터 놓는다. 모양이 틀린 항목은 버린다. claps는 받은 박수 합 */
export function splitInbox(raw: unknown): { book: Array<Item<Book>>; gifts: Array<Item<Gift>>; claps: number } {
  const book: Array<Item<Book>> = [];
  const gifts: Array<Item<Gift>> = [];
  let claps = 0;
  for (const [sender, node] of Object.entries(obj(raw))) {
    for (const [id, v] of Object.entries(obj(node))) {
      if (id === CLAP_KEY) {
        if (typeof v === 'number') claps += v;
        continue;
      }
      if (id !== GIFT_KEY) {
        const b = Book.safeParse(v);
        if (b.success) book.push({ ...b.data, sender, id });
        continue;
      }
      for (const [gid, g] of Object.entries(obj(v))) {
        const p = Gift.safeParse(g);
        if (p.success) gifts.push({ ...p.data, sender, id: gid });
      }
    }
  }
  const newest = (a: { at: number }, b: { at: number }) => b.at - a.at;
  return { book: book.sort(newest), gifts: gifts.sort(newest), claps };
}

/** 받은 기록에서 화면에 쓰는 값. more는 더 오래된 방명록 글이 남아 있을 수 있는지 */
export interface Inbox { book: Array<Item<Book>>; gifts: Array<Item<Gift>>; claps: number; more: boolean }

/** 보낸 사람마다 받은 마지막 limit + 2개를 합친다. 방명록은 새것부터 limit개를 남긴다.
 *  보낸 사람 한 명이 limit + 2개를 꽉 채웠거나 합친 글이 limit개를 넘으면 more */
export function mergeInbox(rows: Map<string, Array<{ key: string; value: unknown }>>, limit: number): Inbox {
  const raw = Object.fromEntries([...rows].map(([sender, items]) => [sender, Object.fromEntries(items.map((i) => [i.key, i.value]))]));
  const { book, gifts, claps } = splitInbox(raw);
  const more = book.length > limit || [...rows.values()].some((items) => items.length >= limit + 2);
  return { book: book.slice(0, limit), gifts, claps, more };
}

/** 마지막으로 본 시각 뒤에 온 것의 수 (방명록 배지) */
export const unread = (items: Array<{ at: number }>, seen: number) => items.filter((e) => e.at > seen).length;
/** 지금까지 본 가장 늦은 시각 */
export const lastAt = (items: Array<{ at: number }>, seen: number) => Math.max(seen, ...items.map((e) => e.at));

/** base64로 바꾼 뒤 files 규칙의 64KB 안에 드는지 (10.7.6) */
export const fitsFile = (bytes: number) => Math.ceil(bytes / 3) * 4 <= FILE_MAX_BASE64_BYTES;

// ---- 스티커 ----------------------------------------------------------------

export interface Pt { x: number; y: number }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 가운데에 새 스티커를 맨 앞으로 붙인다. 꽉 찼으면 null */
export function addSticker(list: Sticker[], file: string): Sticker[] | null {
  if (list.length >= STICKER_CAP) return null;
  const z = Math.max(0, ...list.map((s) => s.z)) + 1;
  return [...list, { file, x: VIEW.width / 2, y: VIEW.height / 2, w: 120, rot: 0, z, anim: 'none', speed: 1 }];
}

/** 가운데를 p로 옮긴다. 가운데는 보기 화면 밖으로 나가지 않는다 */
export const moveSticker = (s: Sticker, p: Pt): Sticker => ({ ...s, x: Math.round(clamp(p.x, 0, VIEW.width)), y: Math.round(clamp(p.y, 0, VIEW.height)) });

/** 모서리 손잡이를 p0에서 p로 끌면 가운데에서 떨어진 거리 비율만큼 너비를 바꾼다. s0는 끌기 시작할 때 값 */
export function resizeSticker(s0: Sticker, p0: Pt, p: Pt): Sticker {
  const d0 = Math.hypot(p0.x - s0.x, p0.y - s0.y) || 1;
  return { ...s0, w: Math.round(clamp((s0.w * Math.hypot(p.x - s0.x, p.y - s0.y)) / d0, STICKER_W_MIN, STICKER_W_MAX)) };
}

/** 위쪽 회전 손잡이가 p를 가리키게 돌린다. 바로 위가 0도이고 -180..179 정수 */
export function rotateSticker(s: Sticker, p: Pt): Sticker {
  const deg = Math.round((Math.atan2(p.x - s.x, s.y - p.y) * 180) / Math.PI);
  return { ...s, rot: ((((deg + 180) % 360) + 360) % 360) - 180 };
}

/** i번 스티커를 맨 앞(1)이나 맨 뒤(-1)로 보낸다 */
export function restack(list: Sticker[], i: number, dir: 1 | -1): Sticker[] {
  const zs = list.map((s) => s.z);
  const z = dir > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
  return list.map((s, j) => (j === i ? { ...s, z } : s));
}

// ---- 말랑이 ----------------------------------------------------------------

/** 화면에 그리는 말랑이 크기와 걷기, 떨어지기, 벽 타기 속도 (px, px/ms) */
export const WALKER = 64;
export const WALK = 0.04;
export const FALL = 0.5;
export const CLIMB = 0.03;
export const FLOOR = VIEW.height - WALKER;
const RIGHT = VIEW.width - WALKER;
/** 누르면 제자리에서 뛰는 시간 (HOM-13) */
export const HOP_MS = 600;

/** act는 바닥이나 다른 말랑이 위에서 하는 일이고 t는 그 일을 더 할 시간(ms). on은 올라탄 말랑이 id (HOM-13) */
export interface Walker {
  id: number; file: string; x: number; y: number; vx: number; held: boolean;
  act: 'walk' | 'rest' | 'climb'; t: number; on: number | null; hop: number;
}

/** 걷기 2..6초, 쉬기와 벽 타기 1..3초 */
const span = (act: Walker['act'], rand: () => number) => (act === 'walk' ? 2000 + rand() * 4000 : 1000 + rand() * 2000);
const clampX = (x: number) => Math.min(RIGHT, Math.max(0, x));

/** 말랑이 모두의 dt(ms) 뒤 (HOM-12, HOM-13). 잡혀 있으면 그대로, 올라탄 말랑이는 아래 말랑이를 따라가고
 *  떠 있으면 떨어지다가 다른 말랑이 머리에 닿으면 올라탄다. 바닥에서는 걷다가 쉬고 양끝 벽에서는 돌아서거나 벽을 탄다.
 *  걷다가 앞의 말랑이에 닿으면 민다 */
export function stepAll(list: Walker[], dt: number, rand: () => number): Walker[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  const next = list.map((m0): Walker => {
    if (m0.held) return m0;
    let m = m0;
    if (m.on !== null) {
      const b = byId.get(m.on);
      // 아래 말랑이가 잡히거나 벽을 타거나 사라지면 떨어진다
      if (b && !b.held && b.act !== 'climb') return { ...m, x: b.x, y: b.y - WALKER, hop: Math.max(0, m.hop - dt) };
      m = { ...m, on: null };
    }
    if (m.hop > 0) return { ...m, hop: Math.max(0, m.hop - dt) };
    if (m.act === 'climb') {
      const y = m.y - CLIMB * dt;
      const t = m.t - dt;
      if (y > 0 && t > 0) return { ...m, y, t };
      // 벽에서 손을 놓고 반대쪽을 보며 떨어진다
      return { ...m, y: Math.max(0, y), x: clampX(m.x - Math.sign(m.vx) * 8), vx: -m.vx, act: 'walk', t: span('walk', rand) };
    }
    if (m.y < FLOOR) {
      const y = Math.min(FLOOR, m.y + FALL * dt);
      const under = list.find((o) => o.id !== m.id && !o.held && Math.abs(o.x - m.x) < WALKER / 2 && m.y + WALKER <= o.y && y + WALKER >= o.y);
      return under ? { ...m, x: under.x, y: under.y - WALKER, on: under.id, act: 'rest', t: span('rest', rand) } : { ...m, y };
    }
    const t = m.t - dt;
    if (m.act === 'rest') return t > 0 ? { ...m, t } : { ...m, act: 'walk', t: span('walk', rand), vx: rand() < 0.5 ? -WALK : WALK };
    if (t <= 0) return { ...m, act: 'rest', t: span('rest', rand) };
    const x = m.x + m.vx * dt;
    if (x > 0 && x < RIGHT) return { ...m, x, t };
    // 벽에 닿으면 반쯤은 벽을 타고 나머지는 돌아선다. vx는 벽 쪽을 그대로 본다
    return rand() < 0.5 ? { ...m, x: clampX(x), act: 'climb', t: span('climb', rand) } : { ...m, x: clampX(x), vx: -m.vx, t };
  });
  // 밀기: 바닥에서 걷는 말랑이가 바로 앞 바닥의 말랑이에 닿으면 같은 만큼 밀어낸다
  for (const a of next) {
    if (a.held || a.on !== null || a.act !== 'walk' || a.y < FLOOR || a.hop > 0) continue;
    next.forEach((b, i) => {
      if (b === a || b.held || b.on !== null || b.y < FLOOR || b.act === 'climb') return;
      const gap = b.x - a.x;
      if (Math.sign(gap) === Math.sign(a.vx) && Math.abs(gap) < WALKER * 0.6) next[i] = { ...b, x: clampX(b.x + a.vx * dt) };
    });
  }
  return next;
}

/** 그림 가운데 하나로 위에서 떨어지는 말랑이를 더한다. 그림이 없거나 화면에 꽉 찼으면 null */
export function summon(list: Walker[], files: string[], rand: () => number): Walker[] | null {
  if (!files.length || list.length >= ON_SCREEN_MAX) return null;
  const file = files[Math.floor(rand() * files.length)]!;
  const id = Math.max(0, ...list.map((m) => m.id)) + 1;
  const vx = rand() < 0.5 ? -WALK : WALK;
  return [...list, { id, file, x: Math.round(rand() * RIGHT), y: 0, vx, held: false, act: 'walk', t: span('walk', rand), on: null, hop: 0 }];
}

/** 글 속 http, https 주소를 링크 조각으로 나눈다 (HOM-05) */
export function linkify(text: string): Array<{ text: string; url?: string }> {
  const out: Array<{ text: string; url?: string }> = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], url: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
