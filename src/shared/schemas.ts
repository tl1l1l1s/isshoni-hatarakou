import { z } from 'zod';
import { NAME_MAX_LENGTH } from './constants.ts';

export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export type Sha256 = z.infer<typeof Sha256>;

/** 슬롯에 붙인 항목. 스티커의 item은 `방코드/아이템id` (10.8.2).
 *  그림은 자세 그림처럼 좌석에 맞춘 뒤(contain, 아래 정렬) 가운데를 기준으로 (x * 좌석 너비, y * 좌석 높이)만큼
 *  옮기고 scale배 키우고 rot도(시계 방향) 돌린다. 기본값은 0, 0, 1, 0 */
export const Equip = z.object({
  item: z.string().max(64),
  file: Sha256.nullable(),
  color: z.string().max(16).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().optional(),
  rot: z.number().optional(),
});
export type Equip = z.infer<typeof Equip>;

/** Equip.color 형식: h{색조 0..359도}s{채도 0..200퍼센트}. 예: h120s80. 원래 색이면 color가 없다 (AVT-08) */
export interface Tint { h: number; s: number }
export const NO_TINT: Tint = { h: 0, s: 100 };
export function parseColor(c: string | undefined): Tint | null {
  const m = c ? /^h(\d{1,3})s(\d{1,3})$/.exec(c) : null;
  return m ? { h: Number(m[1]) % 360, s: Math.min(Number(m[2]), 200) } : null;
}

/** `Appearance` v1. 저장과 주고받는 형식이라 바꾸려면 migration이 필요하다 (10.8.2). */
export const Appearance = z.object({
  v: z.literal(1),
  body: z.enum(['human', 'animal']),
  bodyExt: z.record(z.string(), z.unknown()).optional(),
  poses: z.object({ idle: Sha256.nullable(), typing: Sha256.nullable(), sleep: Sha256.nullable() }),
  slots: z.record(z.string(), z.array(Equip)),
});
export type Appearance = z.infer<typeof Appearance>;

export const emptyAppearance = (): Appearance => ({
  v: 1,
  body: 'human',
  poses: { idle: null, typing: null, sleep: null },
  slots: {},
});

/** 좌석에 남는 슬롯 (책상, 책상 소품, 바닥). 나머지(자세 그림과 스티커)는 캐릭터 몸이라 효과나 올라타기로 자리를 떠날 때 함께 움직인다 (10.8.2) */
export const SEAT_SLOTS = ['floor', 'desk', 'desk.items'];
/** 캐릭터 몸만 남긴 외형 */
export const bodyOnly = (a: Appearance): Appearance => ({ ...a, slots: Object.fromEntries(Object.entries(a.slots).filter(([k]) => !SEAT_SLOTS.includes(k))) });

/** 코어가 정하는 상태 값. 모르는 값은 'online'으로 읽는다. */
export const CORE_STATES = ['online', 'away', 'busy'] as const;
export type CoreState = (typeof CORE_STATES)[number];
export const readState = (s: unknown): CoreState =>
  (CORE_STATES as readonly unknown[]).includes(s) ? (s as CoreState) : 'online';

/** rooms/{code}/members/{uid}_{deviceId} (10.7.2) */
export const MemberRecord = z.object({
  uid: z.string().min(1).max(128),
  name: z.string().max(NAME_MAX_LENGTH),
  look: Sha256.nullable(),
  state: z.string().max(16),
  proto: z.number().int(),
  mods: z.record(z.string(), z.number().int()),
  joinedAt: z.number(),
  seenAt: z.number(),
  m: z.record(z.string(), z.record(z.string(), z.unknown())),
});
export type MemberRecord = z.infer<typeof MemberRecord>;

/** rooms/{code}/meta */
export const RoomMeta = z.object({
  kind: z.literal('work'),
  owner: z.string().min(1),
  createdAt: z.number(),
  deletedAt: z.number().optional(),
});
export type RoomMeta = z.infer<typeof RoomMeta>;

/** 메인 프로세스가 500ms마다 보내는 활동 샘플 (10.8.1) */
export const ActivitySample = z.object({
  at: z.number(),
  appKey: z.string().nullable(),
  idleSec: z.number(),
  pen: z.boolean(),
  unknownReason: z.string().nullable(),
});
export type ActivitySample = z.infer<typeof ActivitySample>;
