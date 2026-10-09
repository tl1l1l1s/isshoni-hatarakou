// 스티커, 책상 소품, 바닥 오브제 꾸미기의 순수 계산 (AVT-06, AVT-07, AVT-08, AVT-09, AVT-10, AVT-13, AVT-14)
import type { Appearance, Equip, Sha256, Tint } from '@shared/schemas';
import { NO_TINT, parseColor as parseShared } from '@shared/schemas';

export type SlotId = 'sticker' | 'desk.items' | 'floor';
export type Edit = Record<SlotId, Equip[]>;
export interface Size { width: number; height: number }
export interface Point { x: number; y: number }

/** 슬롯 하나에 붙이는 수 상한 (AVT-06) */
export const CAP = 12;
export const SCALE_MIN = 0.1;
export const SCALE_MAX = 2;
/** 그림 넣기나 직접 그리기로 만든 것의 item. 가챠 key 형식이 아니라서 함께 지우기에 걸리지 않는다 */
export const OWN_ITEM = 'stickers.own';
/** 칠판 (AVT-10). 다시 그리면 새 칠판으로 바꾼다 */
export const BOARD_ITEM = 'stickers.board';

const FLOOR_SCALE = 0.35;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** scale배로 줄인 그림의 아래가 4:5 칸 아래에 닿는 y. 그림은 칸에 맞춰 아래에 붙인 뒤 가운데를 기준으로 줄어들기 때문이다 */
const floorY = (img: Size, scale: number) => round((Math.min(4 / img.width, 5 / img.height) * img.height * (1 - scale)) / 10, 3);

/** 새로 붙일 때 자리. 스티커는 가슴께(칠판은 머리 위), 소품은 책상 오른쪽, 바닥 오브제는 책상 왼쪽 바닥.
 *  바닥 오브제는 그림 크기를 알면 그림 아래가 칸 아래에 닿게 놓고 모르면 정사각 그림으로 친다 */
export const fresh = (slot: SlotId, item: string, file: Sha256, img: Size = { width: 1, height: 1 }): Equip =>
  slot === 'floor' ? { item, file, x: -0.3, y: floorY(img, FLOOR_SCALE), scale: FLOOR_SCALE, rot: 0 }
  : slot === 'desk.items' ? { item, file, x: 0.25, y: 0, scale: 0.3, rot: 0 }
  : item === BOARD_ITEM ? { item, file, x: 0, y: -0.6, scale: 0.45, rot: 0 }
  : { item, file, x: 0, y: -0.3, scale: 0.4, rot: 0 };

/** 더 붙일 수 없으면 안내 문장, 붙일 수 있으면 null */
export const capMessage = (slot: SlotId, count: number): string | null =>
  count < CAP ? null
  : slot === 'sticker' ? `스티커는 한 캐릭터에 ${CAP}개까지 붙일 수 있어요.`
  : slot === 'floor' ? `바닥 오브제는 ${CAP}개까지 놓을 수 있어요.`
  : `책상 소품은 ${CAP}개까지 올릴 수 있어요.`;

export const editOf = ({ slots }: Pick<Appearance, 'slots'>): Edit => ({ sticker: slots.sticker ?? [], 'desk.items': slots['desk.items'] ?? [], floor: slots.floor ?? [] });

/** 편집한 슬롯을 외형에 넣는다. 빈 슬롯은 키를 지운다 */
export function withEdit(a: Appearance, e: Edit): Appearance {
  const slots = { ...a.slots, ...e };
  for (const k of Object.keys(e) as SlotId[]) if (!e[k].length) delete slots[k];
  return { ...a, slots };
}

/** 함께 지우기로 빠진 아이템(gacha.revoked의 key)을 모든 슬롯에서 뺀다. 뺄 것이 없으면 같은 객체를 돌려준다 */
export function withoutKeys(slots: Appearance['slots'], keys: string[]): Appearance['slots'] {
  const gone = new Set(keys);
  if (!Object.values(slots).some((l) => l.some((e) => gone.has(e.item)))) return slots;
  return Object.fromEntries(
    Object.entries(slots)
      .map(([k, l]) => [k, l.filter((e) => !gone.has(e.item))] as const)
      .filter(([, l]) => l.length),
  );
}

/**
 * 그림이 view에 놓이는 가운데(cx, cy)와 scale 전 크기(w, h), CSS 픽셀.
 * canvas2d의 place와 같은 계산이다: contain으로 맞추고 아래에 붙인 뒤 (x * 너비, y * 높이)만큼 옮긴다
 */
export function placeOf(img: Size, e: Equip, view: Size) {
  const f = Math.min(view.width / img.width, view.height / img.height);
  const w = img.width * f, h = img.height * f;
  return { cx: view.width / 2 + (e.x ?? 0) * view.width, cy: view.height - h / 2 + (e.y ?? 0) * view.height, w, h };
}

/** 가운데를 (cx, cy) 픽셀로 옮긴다. 가운데는 view 밖으로 나가지 않는다 */
export function moveTo(img: Size, e: Equip, view: Size, cx: number, cy: number): Equip {
  const { h } = placeOf(img, e, view);
  const x = (clamp(cx, 0, view.width) - view.width / 2) / view.width;
  const y = (clamp(cy, 0, view.height) - (view.height - h / 2)) / view.height;
  return { ...e, x: round(x, 3), y: round(y, 3) };
}

/** 크기는 SCALE_MIN..SCALE_MAX, 회전은 -180..179도 정수로 맞춘다 */
export const adjust = (e: Equip, scale: number, rot: number): Equip => ({
  ...e,
  scale: round(clamp(scale, SCALE_MIN, SCALE_MAX), 2),
  rot: ((((Math.round(rot) + 180) % 360) + 360) % 360) - 180,
});

/** 손잡이를 p0에서 p로 끌면 가운데 c를 기준으로 거리 비율만큼 키우고 각도 차이만큼 시계 방향으로 돌린다. e는 끌기 시작할 때 값 */
export function twist(e: Equip, c: Point, p0: Point, p: Point): Equip {
  const d0 = Math.hypot(p0.x - c.x, p0.y - c.y) || 1;
  const turn = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(p0.y - c.y, p0.x - c.x);
  return adjust(e, ((e.scale ?? 1) * Math.hypot(p.x - c.x, p.y - c.y)) / d0, (e.rot ?? 0) + (turn * 180) / Math.PI);
}

export { NO_TINT, type Tint };
/** 원래 색이면 NO_TINT. 형식은 @shared/schemas의 parseColor */
export const parseColor = (c: string | undefined): Tint => parseShared(c) ?? NO_TINT;

export function withColor(e: Equip, t: Tint): Equip {
  const { color: _, ...rest } = e;
  const h = ((Math.round(t.h) % 360) + 360) % 360, s = clamp(Math.round(t.s), 0, 200);
  return h === 0 && s === 100 ? rest : { ...rest, color: `h${h}s${s}` };
}

// ---- 직접 그리기 (AVT-09, AVT-10) ----------------------------------------------

export interface Rect { x: number; y: number; w: number; h: number }

/** w x h 그림을 box 안에 비율을 지켜 가운데에 꽉 맞춘다 */
export function fitIn(w: number, h: number, box: Rect): Rect {
  const s = Math.min(box.w / w, box.h / h);
  return { x: box.x + (box.w - w * s) / 2, y: box.y + (box.h - h * s) / 2, w: w * s, h: h * s };
}

/** 알파가 min보다 큰 픽셀을 감싸는 사각형 (RGBA). 모두 투명하면 null. 그린 만큼만 스티커로 잘라 낸다 */
export function opaqueRect(data: Uint8ClampedArray, w: number, h: number, min = 8): Rect | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! <= min) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** 칠판 글씨. 줄은 3줄, 줄마다 20자까지 */
export const boardLines = (text: string): string[] =>
  text.split('\n').map((l) => l.trim().slice(0, 20)).filter(Boolean).slice(0, 3);
