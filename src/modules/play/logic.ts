// 놀이 순수 함수와 수치 (COM-05, COM-10, COM-11, COM-13, COM-14, COM-17, CHR-11)
import { z } from 'zod';
import type { Point } from '@core/types';

export const DANCE_MS = 4_000;
/** 춤 명령 사이 간격과 깜짝쇼 조건: 같은 춤을 1분 안에 세 번 (COM-10, COM-17) */
export const DANCE_GAP_MS = 5_000;
export const SHOW_WINDOW_MS = 60_000;
export const SHOW_COUNT = 3;
/** 날아갔다 돌아오는 시간, 맞아서 납작해지는 시간, 그 뒤 어지러운 시간 (COM-11, COM-13, COM-14, CHR-11).
 *  효과가 몸을 데려간 동안은 좌석의 말풍선도 숨으므로 어지러움은 효과가 끝난 뒤 띄운다 */
export const FLY_MS = 3_200;
export const HIT_MS = 700;
export const DIZZY_MS = 2_500;
export const BOMB_MS = 800;
export const PET_MS = 1_500;
/** 주사위가 굴러가는 시간, 멈춘 결과를 보여 준 뒤 날아가기까지, 결과를 보여 주는 시간 (COM-14) */
export const ROLL_MS = 1_200;
export const ROLL_PAUSE_MS = 800;
export const ROLL_SHOW_MS = 2_000;
export const ROLL_GAP_MS = 3_000;
export const ROLL_LIMIT = 6;
export const HIT_LIMIT = 30;
/** 날리는 글이 화면을 지나는 시간과 한꺼번에 떠 있는 줄 수 (COM-05) */
export const TEXT_MS = 8_000;
export const TEXT_LINES = 30;
/** 받는 쪽은 이보다 오래된 신호를 버린다 (CHR-11) */
export const STALE_MS = 30_000;

export const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;
export const TEXT_SIZES = { l: 40, m: 28, s: 20 } as const;

const Key = z.string().min(1).max(80);
const Seed = z.number().int().min(0);
export const Dance = z.object({ key: Key, kind: z.union([z.literal(80), z.literal(150)]), show: z.boolean(), seed: Seed });
export type Dance = z.infer<typeof Dance>;
/** 때리기와 폭탄 */
export const Aim = z.object({ from: Key, to: Key, seed: Seed });
export type Aim = z.infer<typeof Aim>;
export const Pet = z.object({ to: Key });
export const Roll = z.object({ key: Key, seed: Seed });
export type Roll = z.infer<typeof Roll>;
export const Size = z.enum(['l', 'm', 's']);
export const Color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const FlyText = z.object({ key: Key, text: z.string().min(1).max(300), size: Size, color: Color.optional(), seed: Seed });
export type FlyText = z.infer<typeof FlyText>;

/** 하루 횟수 { d: 날 번호, n: 쓴 횟수 }. @shared/time의 nextQuota로 올린다 */
const Quota = z.object({ d: z.number().int(), n: z.number().int() }).nullable();
export const Local = z.object({ hit: Quota, roll: Quota, size: Size, color: Color });
export type Local = z.infer<typeof Local>;
export const initialLocal = (): Local => ({ hit: null, roll: null, size: 'm', color: '#ffffff' });

export const seed = (): number => Math.floor(Math.random() * 2 ** 31);

/** 시드로 정하는 두 주사위. 모든 PC에서 같다. 하나라도 1이면 날아간다 (COM-14, 확률 11/36) */
export const dice = (seed: number): [number, number] => [1 + (seed % 6), 1 + (Math.floor(seed / 6) % 6)];
export const busted = ([a, b]: [number, number]): boolean => a === 1 || b === 1;
export const diceText = ([a, b]: [number, number]): string => `🎲 ${FACES[a - 1]} ${FACES[b - 1]}`;

/** 같은 춤을 1분 안에 세 번 추면 깜짝쇼 (COM-17). times는 지난 춤 시각이고 돌려준 times를 다음에 넘긴다 */
export function countShow(times: number[], now: number): { show: boolean; times: number[] } {
  const recent = [...times.filter((t) => now - t < SHOW_WINDOW_MS), now];
  return recent.length >= SHOW_COUNT ? { show: true, times: [] } : { show: false, times: recent };
}

/**
 * 의자에서 튀어 나가 화면 가장자리에서 튕기다 제자리로 돌아오는 궤적 (COM-13, COM-14).
 * from은 몸 가운데, half는 몸 크기의 절반, screen은 효과 창 크기. 점은 같은 간격의 시각이고 마지막 점은 from이다.
 * 같은 rand 수열이면 같은 궤적이다. 화면 크기가 다른 PC는 튕기는 자리만 다르다
 */
export function flightPath(rand: () => number, from: Point, half: { w: number; h: number }, screen: { w: number; h: number }, steps = 48): Array<Point & { r: number }> {
  const flying = Math.round(steps * 0.8);
  const dt = ((FLY_MS / 1000) * 0.8) / flying;
  let { x, y } = from;
  let vx = (rand() < 0.5 ? -1 : 1) * (700 + rand() * 900);
  let vy = -(1000 + rand() * 700);
  const spin = (rand() * 2 - 1) * 720;
  const [minX, maxX, minY, maxY] = [half.w, Math.max(half.w, screen.w - half.w), half.h, Math.max(half.h, screen.h - half.h)];
  const out: Array<Point & { r: number }> = [];
  for (let i = 0; i <= flying; i++) {
    out.push({ x, y, r: spin * i * dt });
    vy += 2200 * dt;
    x += vx * dt;
    y += vy * dt;
    if (x < minX || x > maxX) [x, vx] = [Math.min(maxX, Math.max(minX, x)), -vx * 0.85];
    if (y < minY || y > maxY) [y, vy] = [Math.min(maxY, Math.max(minY, y)), -vy * 0.85];
  }
  const last = out.at(-1)!;
  for (let i = 1; i <= steps - flying; i++) {
    const t = i / (steps - flying);
    out.push({ x: last.x + (from.x - last.x) * t, y: last.y + (from.y - last.y) * t, r: last.r * (1 - t) });
  }
  return out;
}
