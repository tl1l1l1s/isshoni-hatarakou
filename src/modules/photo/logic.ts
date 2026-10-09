// 스티커 사진의 순수 계산 (COM-15). 찍기 설정, 함께 찍기 진행, 한 장 배치, 꾸미기 문서와 되돌리기
import { z } from 'zod';
import type { SceneSpec } from '@core/types';

export interface Size { width: number; height: number }
export interface Rect extends Size { x: number; y: number }
export interface Pt { x: number; y: number }

/** 촬영 자리 수. 한 번에 찍는 사람은 4명까지다 */
export const SLOTS = 4;
/** 컷마다 세는 초 */
export const COUNTDOWN = 5;
const CUT_MS = COUNTDOWN * 1000;
/** 자리 주인이 사라진 뒤 다른 사람이 덮을 수 있는 시간. rules.ts에도 같은 값이 있다 */
export const SLOT_STALE_MS = 15 * 60_000;
/** 창이 열려 있는 동안 내 자리 시각을 고치는 간격 */
export const SLOT_REFRESH_MS = 5 * 60_000;
/** 촬영 시작 뒤 마지막 셔터 시각을 이만큼 넘기면 끝난 촬영으로 본다 (진행자가 사라진 경우) */
const RUN_GRACE_MS = 15_000;
/** 하루 촬영 한도의 상한. 규칙(rules.ts)이 이 값을 넘는 횟수를 막고 앱은 tunable photoDailyCap까지만 센다 */
export const DAILY_CAP_MAX = 400;

export type Orient = 'wide' | 'tall';
export const ORIENTS: Array<[Orient, string]> = [['wide', '가로'], ['tall', '세로']];
/** 세로 2컷은 컷이 너무 좁아 캐릭터가 겹치므로 뺀다 */
export const CUTS: Record<Orient, number[]> = { wide: [1, 2, 4], tall: [1, 4] };
/** 결과 한 장. 검은 테두리 안에 컷을 놓는다 */
export const SHEET: Record<Orient, Size> = { wide: { width: 960, height: 720 }, tall: { width: 720, height: 960 } };
const BORDER = 24, GAP = 12;

/** 컷 자리. 1컷은 한 장 가득, 2컷은 좌우로, 4컷은 2행 2열 */
export function cutRects(o: Orient, n: number): Rect[] {
  const s = SHEET[o];
  const cols = n === 1 ? 1 : 2, rows = n === 4 ? 2 : 1;
  const width = (s.width - BORDER * 2 - GAP * (cols - 1)) / cols;
  const height = (s.height - BORDER * 2 - GAP * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => ({ x: BORDER + (i % cols) * (width + GAP), y: BORDER + Math.floor(i / cols) * (height + GAP), width, height }));
}

export const BACKGROUNDS: Array<[string, string]> = [
  ['#ffffff', '하양'], ['#ffd9e4', '분홍'], ['#d3e9ff', '하늘'], ['#d5f4e5', '민트'], ['#fff2b8', '노랑'], ['#e6dbff', '보라'],
];

export type FilterId = 'none' | 'soft' | 'ps1' | 'mono' | 'dawn' | 'vintage';
/** css는 Canvas filter, pixel은 그만큼 거칠게 줄였다 키우는 배율 */
export const FILTERS: Array<{ id: FilterId; label: string; css: string; pixel?: number }> = [
  { id: 'none', label: '없음', css: 'none' },
  { id: 'soft', label: '뽀샤시', css: 'brightness(1.1) contrast(0.92) saturate(1.15) blur(0.6px)' },
  { id: 'ps1', label: 'PS1', css: 'saturate(1.3) contrast(1.15)', pixel: 4 },
  { id: 'mono', label: '흑백', css: 'grayscale(1) contrast(1.1)' },
  { id: 'dawn', label: '새벽', css: 'sepia(0.25) hue-rotate(190deg) saturate(1.3) brightness(0.95)' },
  { id: 'vintage', label: '빈티지', css: 'sepia(0.55) contrast(0.9) brightness(1.05) saturate(0.85)' },
];

export type FrameId = 'none' | 'heart' | 'star' | 'film' | 'own';
export const FRAMES: Array<[FrameId, string]> = [['none', '없음'], ['heart', '하트'], ['star', '별'], ['film', '필름']];

/** 거리: W로 다가가고 S로 물러난다 */
export const DISTANCES: Array<[SceneSpec['framing'], string]> = [['full', '전신'], ['bust', '상반신'], ['face', '얼굴']];

// ---- 함께 찍기 ----
// 방에서는 mod/photo/r/{방} 아래 slots, cfg, p, shots에 둔다. 자세는 정수로 줄여 보낸다

const int = (min: number, max: number) => z.number().int().min(min).max(max);
/** 자세. x는 내 칸 너비의 10분의 1 단위로 옮긴 양, f는 돌아섬, z는 거리(DISTANCES 번호), j는 점프를 시작한 서버 시각 */
export const Pose = z.object({ x: int(-10, 10), f: int(0, 1), z: int(0, 2), j: z.number() });
export type Pose = z.infer<typeof Pose>;
export const POSE0: Pose = { x: 0, f: 0, z: 0, j: 0 };
export const Slot = z.object({ uid: z.string(), at: z.number() });
export type Slot = z.infer<typeof Slot>;
/** 촬영 설정. own은 내 프레임 해시이고 없으면 빈 문자열이다 */
const Setup = z.object({
  o: z.enum(['wide', 'tall']), n: int(1, 4), bg: z.string(),
  fl: z.enum(['none', 'soft', 'ps1', 'mono', 'dawn', 'vintage']), fr: z.enum(['none', 'heart', 'star', 'film', 'own']), own: z.string(),
});
export type Setup = z.infer<typeof Setup>;
/** 진행자가 쓰는 설정. t0은 촬영을 시작한 서버 시각이고 0이면 쉬는 중이다. 컷 i는 t0 + (i + 1) * 5초에 찍는다 */
export const Cfg = Setup.extend({ t0: z.number() });
export type Cfg = z.infer<typeof Cfg>;
/** 컷에 찍힌 사람. l은 외형 해시(빈 문자열이면 기본 외형), y는 점프 높이(컷 높이의 100분의 1) */
const ShotPerson = z.object({ l: z.string(), x: int(-10, 10), f: int(0, 1), z: int(0, 2), y: int(0, 20) });
export type ShotPerson = z.infer<typeof ShotPerson>;
/** 진행자가 셔터 때 남긴 컷. 모든 PC가 이 기록만으로 같은 컷을 그린다 */
export const Shot = Setup.extend({ t0: z.number(), ppl: z.array(ShotPerson).optional() });
export type Shot = z.infer<typeof Shot>;

/** 촬영 키 (A, D로 옮기고 Q, E로 돌고 W, S로 다가가거나 물러난다). 점프(Space)는 서버 시각이 필요해서 세션이 다룬다. 모르는 키면 null */
export function keyPose(p: Pose, code: string): Pose | null {
  const clamp = (v: number, max: number, min = 0) => Math.min(max, Math.max(min, v));
  if (code === 'KeyA' || code === 'KeyD') return { ...p, x: clamp(p.x + (code === 'KeyA' ? -1 : 1), 10, -10) };
  if (code === 'KeyQ' || code === 'KeyE') return { ...p, f: code === 'KeyQ' ? 1 : 0 };
  if (code === 'KeyW' || code === 'KeyS') return { ...p, z: clamp(p.z + (code === 'KeyW' ? 1 : -1), DISTANCES.length - 1) };
  return null;
}

export const JUMP_MS = 500;
/** Space: 뛰는 중이 아니면 지금 서버 시각에 점프를 시작한다 */
export const jump = (p: Pose, now: number): Pose => (now - p.j < JUMP_MS ? p : { ...p, j: now });
/** j에 시작한 점프의 now 때 높이 (컷 높이 비율) */
export const liftAt = (j: number, now: number) => (now >= j && now - j < JUMP_MS ? Math.sin(((now - j) / JUMP_MS) * Math.PI) * 0.12 : 0);

/** 서버의 slots는 배열이나 객체로 온다. 형식이 맞지 않는 자리는 빈자리로 본다 */
export const slotsOf = (v: unknown): Array<Slot | null> =>
  Array.from({ length: SLOTS }, (_, i) => Slot.safeParse((v as Record<number, unknown> | null)?.[i]).data ?? null);
/** 이 자리를 내가 잡을 수 있는지. 빈자리, 내 자리, 15분 지난 자리 */
export const canTake = (s: Slot | null, uid: string, now: number) => !s || s.uid === uid || now - s.at > SLOT_STALE_MS;
/** 진행자 자리: 사람이 있는 가장 작은 번호. 없으면 -1 */
export const hostSlot = (slots: Array<Slot | null>) => slots.findIndex(Boolean);

/** 촬영이 진행 중인지. 진행자가 사라져 마지막 셔터 뒤 15초가 지나면 끝난 것으로 본다 */
export const running = (c: Cfg, now: number) => c.t0 > 0 && now <= c.t0 + c.n * CUT_MS + RUN_GRACE_MS;
/** 지금 세는 컷 번호와 남은 초 */
export function countdown(c: Cfg, now: number): { cut: number; left: number } {
  const cut = Math.min(c.n - 1, Math.max(0, Math.floor((now - c.t0) / CUT_MS)));
  return { cut, left: Math.max(1, Math.ceil((c.t0 + (cut + 1) * CUT_MS - now) / 1000)) };
}
/** 셔터 시각이 지났는데 아직 기록이 없는 컷 번호 */
export const dueCuts = (c: Cfg, taken: Record<string, Shot>, now: number) =>
  Array.from({ length: c.n }, (_, i) => i).filter((i) => now >= c.t0 + (i + 1) * CUT_MS && taken[i]?.t0 !== c.t0);
/** t0 촬영의 컷이 모두 모였으면 번호 순서로, 아니면 null */
export function fullRun(shots: Record<string, Shot>, t0: number): Shot[] | null {
  const n = shots[0]?.n ?? 0;
  const run = Array.from({ length: n }, (_, i) => shots[i]).filter((s): s is Shot => s?.t0 === t0);
  return n && run.length === n ? run : null;
}
/** 서버의 shots도 배열이나 객체로 온다 */
export function shotsOf(v: unknown): Record<string, Shot> {
  const out: Record<string, Shot> = {};
  for (const [k, raw] of Object.entries((v ?? {}) as Record<string, unknown>)) {
    const r = Shot.safeParse(raw);
    if (r.success) out[k] = r.data;
  }
  return out;
}

// ---- 꾸미기 ----

export type PenId = 'basic' | 'rainbow' | 'outline' | 'hollow' | 'glow';
export const PENS: Array<[PenId, string]> = [['basic', '기본'], ['rainbow', '무지개'], ['outline', '외곽선'], ['hollow', '속 빈'], ['glow', '글로우']];
export const INKS: Array<[string, string]> = [
  ['#222222', '검정'], ['#ffffff', '흰색'], ['#ff5a7a', '빨강'], ['#ff9f43', '주황'], ['#ffd93d', '노랑'], ['#4cd38a', '초록'], ['#4aa8ff', '파랑'], ['#a77bff', '보라'],
];
/** 스티커 12종. OS 컬러 이모지 글꼴로 그려서 그림 파일을 따로 두지 않는다 */
export const STICKERS = ['💖', '⭐', '✨', '🎀', '🌸', '🍀', '🐱', '🐶', '🍓', '☁️', '🎵', '👑'];
export const STICKER_SIZE = 120;
const SIZE_MIN = 24, SIZE_MAX = 480;

export interface Stroke { pen: PenId; color: string; width: number; pts: number[] }
export interface Sticker { e: string; x: number; y: number; size: number; rot: number }
export interface Doc { strokes: Stroke[]; stickers: Sticker[] }
export const EMPTY: Doc = { strokes: [], stickers: [] };

/** 되돌리기 목록. at이 지금 문서이고 새로 바꾸면 앞으로 갈 문서를 버린다 */
export interface History { list: Doc[]; at: number }
export const push = (h: History, d: Doc): History => ({ list: [...h.list.slice(0, h.at + 1), d], at: h.at + 1 });
export const undo = (h: History): History => ({ ...h, at: Math.max(0, h.at - 1) });
export const redo = (h: History): History => ({ ...h, at: Math.min(h.list.length - 1, h.at + 1) });

/** 돌아간 스티커의 오른쪽 위 모서리 (손잡이 자리) */
export function handleOf(s: Sticker): Pt {
  const h = s.size / 2, r = (s.rot * Math.PI) / 180;
  return { x: s.x + h * Math.cos(r) + h * Math.sin(r), y: s.y + h * Math.sin(r) - h * Math.cos(r) };
}

/** p를 덮는 맨 위 스티커의 번호 */
export function stickerAt(stickers: Sticker[], p: Pt): number | null {
  for (let i = stickers.length - 1; i >= 0; i--) {
    const s = stickers[i]!, r = (s.rot * Math.PI) / 180, dx = p.x - s.x, dy = p.y - s.y;
    if (Math.abs(dx * Math.cos(r) + dy * Math.sin(r)) <= s.size / 2 && Math.abs(-dx * Math.sin(r) + dy * Math.cos(r)) <= s.size / 2) return i;
  }
  return null;
}

/** 손잡이를 p0에서 p로 끌면 가운데에서 멀어진 비율만큼 키우고 각도 차이만큼 돌린다. s는 끌기 시작할 때 값 */
export function twist(s: Sticker, p0: Pt, p: Pt): Sticker {
  const d0 = Math.hypot(p0.x - s.x, p0.y - s.y) || 1;
  const turn = Math.atan2(p.y - s.y, p.x - s.x) - Math.atan2(p0.y - s.y, p0.x - s.x);
  return { ...s, size: Math.min(SIZE_MAX, Math.max(SIZE_MIN, (s.size * Math.hypot(p.x - s.x, p.y - s.y)) / d0)), rot: Math.round(s.rot + (turn * 180) / Math.PI) };
}

/** 내려받는 파일 이름. 방에서 받은 사진은 64KB로 줄이면서 WebP가 되었을 수 있어서 바이트로 확장자를 고른다 */
export function fileName(at: Date, bytes?: Uint8Array): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const webp = bytes && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  return `스티커사진-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.${webp ? 'webp' : 'png'}`;
}
