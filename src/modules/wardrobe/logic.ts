// 캐릭터 외형과 슬롯을 바꾸는 순수 계산 (AVT-01, AVT-02, AVT-03, AVT-04, AVT-11, AVT-15, AVT-17, GRW-03, ACC-08, OUR-03)
import { z } from 'zod';
import { FILE_MAX_BASE64_BYTES } from '@shared/constants';
import { Appearance, emptyAppearance, Sha256 } from '@shared/schemas';
import type { Equip } from '@shared/schemas';

export const SLOT_COUNT = 3;
/** 덮어쓴 옛 모습을 남기는 기간 (ACC-08) */
export const TRASH_KEEP_MS = 10 * 86_400_000;

/** 슬롯 하나. mtime은 서버 시각이고 0이면 한 번도 고치지 않은 빈 슬롯 */
export const Char = z.object({ appearance: Appearance, mtime: z.number() });
export type Char = z.infer<typeof Char>;
export const emptyChar = (): Char => ({ appearance: emptyAppearance(), mtime: 0 });

/** 로컬 계정 데이터 v1. desks는 기본 책상 그림을 올린 해시 캐시 */
export const LocalV1 = z.object({ appearance: Appearance, desks: z.record(z.string(), Sha256) });

/** 로컬 계정 데이터 v2. 캐릭터 슬롯 3개와 지금 쓰는 슬롯, 동물 해금 시각 */
export const Local = z.object({
  active: z.number().int().min(0).max(SLOT_COUNT - 1),
  chars: z.array(Char).length(SLOT_COUNT),
  desks: z.record(z.string(), Sha256),
  unlockedAt: z.number().nullable(),
  /** 슬롯마다 마지막으로 서버와 맞춘 mtime (ACC-13). 없으면 아직 모른다 */
  synced: z.array(z.number().nullable()).optional(),
});
export type Local = z.infer<typeof Local>;

export const initialLocal = (): Local => ({ active: 0, chars: Array.from({ length: SLOT_COUNT }, emptyChar), desks: {}, unlockedAt: null });

/** v1 → v2. 쓰던 캐릭터는 1번 슬롯에 둔다. mtime 1은 서버에 기록이 있으면 서버 쪽이 이기게 하는 가장 옛 시각 */
export function migrateV1(old: unknown): Local {
  const o = LocalV1.parse(old);
  const l = initialLocal();
  l.chars[0] = { appearance: o.appearance, mtime: 1 };
  return { ...l, desks: o.desks };
}

export const activeOf = (l: Local): Appearance => l.chars[l.active]!.appearance;

export type PoseId = keyof Appearance['poses'];
export const CUSTOM_DESK = 'wardrobe.desk.custom';

/** 자세 그림 하나를 바꾼다. null이면 기본 그림으로 돌아간다 */
export const withPose = (a: Appearance, pose: PoseId, file: Sha256 | null): Appearance => ({ ...a, poses: { ...a.poses, [pose]: file } });

/** 책상을 바꾼다. null이면 책상을 뺀다. 다른 슬롯은 그대로 둔다 */
export function withDesk(a: Appearance, desk: Equip | null): Appearance {
  const { desk: _, ...rest } = a.slots;
  return { ...a, slots: desk ? { ...rest, desk: [desk] } : rest };
}

// ---- 얼굴 그리기 (AVT-03, AVT-04) ---------------------------------------------

export const POSE_IDS: PoseId[] = ['idle', 'typing', 'sleep'];
export const FACE_SIZE = 512;
export const DEFAULT_BODY_COLOR = '#ffe4ec';

/** 얼굴 그리기 편집 데이터. 다시 고칠 수 있게 Appearance.bodyExt.face에 둔다.
 *  use는 자세마다 얼굴 그리기로 만든 그림을 쓰는지(true) 직접 넣은 그림을 쓰는지(false) */
export const Face = z.object({
  tpl: z.string().max(64),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  open: Sha256.optional(),
  closed: Sha256.optional(),
  use: z.object({ idle: z.boolean(), typing: z.boolean(), sleep: z.boolean() }),
});
export type Face = z.infer<typeof Face>;

/** 저장한 얼굴 편집 데이터. 없으면 그림을 넣지 않은 자세만 얼굴 그리기로 채우는 기본값 */
export function faceOf(a: Appearance): Face {
  const r = Face.safeParse(a.bodyExt?.face);
  if (r.success) return r.data;
  return { tpl: `wardrobe.body.${a.body}`, color: DEFAULT_BODY_COLOR, use: { idle: !a.poses.idle, typing: !a.poses.typing, sleep: !a.poses.sleep } };
}

export const withFace = (a: Appearance, f: Face): Appearance => ({ ...a, bodyExt: { ...a.bodyExt, face: f } });

/** 자세 하나에 그림을 넣으면 그 자세는 넣은 그림을 쓴다 */
export const withPoseFile = (a: Appearance, pose: PoseId, file: Sha256): Appearance => {
  const f = faceOf(a);
  return withFace(withPose(a, pose, file), { ...f, use: { ...f.use, [pose]: false } });
};

export interface Rect { x: number; y: number; w: number; h: number }
export type Pt = [number, number];

/** 얼굴 칸을 size 크기 그림판에 꽉 채우는 변환. 그림판 좌표 = (좌석 좌표 - 칸 왼쪽 위) * s */
export const faceView = (r: Rect, size: number) => ({ s: size / r.w, dx: (-r.x * size) / r.w, dy: (-r.y * size) / r.w });

/** 화면에 보이는 캔버스 위 포인터 위치를 그림판 좌표로 */
export const toLocal = (x: number, y: number, box: { left: number; top: number; width: number; height: number }, size: number): Pt => [
  ((x - box.left) * size) / box.width,
  ((y - box.top) * size) / box.height,
];

/** 좌우 대칭 획 */
export const mirror = (pts: Pt[], size: number): Pt[] => pts.map(([x, y]) => [size - x, y]);

/** 도장 그림을 그림판 가운데에 frac 크기로 비율을 지켜 놓는다 */
export function fitStamp(w: number, h: number, size: number, frac: number): Rect {
  const s = (size * frac) / Math.max(w, h);
  return { x: (size - w * s) / 2, y: (size - h * s) / 2, w: w * s, h: h * s };
}

/** 가운데를 지키며 크기를 바꾼다 */
export const resizeRect = (r: Rect, w: number, h: number): Rect => ({ x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h });

/** 되돌리기와 다시 하기 */
// ponytail: 횟수 제한이 없다. 그림판을 오래 쓰면 기록이 길어지므로 필요하면 오래된 것을 바탕 그림으로 굳힌다
export interface History<T> { done: T[]; undone: T[] }
export const pushOp = <T>(h: History<T>, op: T): History<T> => ({ done: [...h.done, op], undone: [] });
export const undoOp = <T>(h: History<T>): History<T> =>
  h.done.length ? { done: h.done.slice(0, -1), undone: [...h.undone, h.done.at(-1)!] } : h;
export const redoOp = <T>(h: History<T>): History<T> =>
  h.undone.length ? { done: [...h.done, h.undone.at(-1)!], undone: h.undone.slice(0, -1) } : h;

const same = (a: Appearance, b: Appearance) => JSON.stringify(a) === JSON.stringify(b);

// ---- 동물 해금 (GRW-03) ------------------------------------------------------

/** 한 번 열리면 기준 레벨이 올라가도 닫히지 않는다 */
export const animalUnlocked = (unlockedAt: number | null, level: number | null, need: number): boolean =>
  unlockedAt !== null || (level !== null && level >= need);

export const lockedText = (need: number) => `${need}레벨이 되면 동물 캐릭터를 만들 수 있어요`;

// ---- 서버 기록 (10.7.3 perItemMtime, trash) -------------------------------------

/** Firebase는 null과 빈 객체를 저장하지 않으므로 읽을 때 poses와 slots를 채운다 */
const ServerAppearance = z.preprocess((v) => {
  if (typeof v !== 'object' || v === null) return v;
  const o = v as { poses?: object; slots?: object };
  return { ...o, poses: { idle: null, typing: null, sleep: null, ...o.poses }, slots: o.slots ?? {} };
}, Appearance);

/** mod/wardrobe/u/{uid}/chars/{slot} */
export const CharRecord = z.object({ appearance: ServerAppearance, mtime: z.number(), v: z.literal(1) });
/** mod/wardrobe/u/{uid}/trash/{mtime}_{slot}. at은 휴지통에 넣은 시각 */
export const TrashRecord = z.object({ appearance: ServerAppearance, mtime: z.number(), slot: z.number().int().min(0).max(SLOT_COUNT - 1), at: z.number(), v: z.literal(1) });
export type TrashRecord = z.infer<typeof TrashRecord>;
/** mod/wardrobe/u/{uid}/unlock */
export const UnlockRecord = z.object({ at: z.number(), v: z.literal(1) });

export const trashKey = (t: Pick<TrashRecord, 'mtime' | 'slot'>) => `${t.mtime}_${t.slot}`;
export const toTrash = (c: Char, slot: number, at: number): TrashRecord => ({ ...c, slot, at, v: 1 });

/** 슬롯마다 mtime이 늦은 쪽을 남긴다. 같으면 서버 쪽. 진 쪽은 고친 적이 있고 내용이 다를 때만 휴지통에 넣는다 */
export function mergeChars(local: Char[], remote: Array<Char | null>, now: number): { chars: Char[]; upload: number[]; trash: TrashRecord[] } {
  const upload: number[] = [];
  const trash: TrashRecord[] = [];
  const chars = local.map((l, i) => {
    const r = remote[i];
    if (!r) {
      if (l.mtime > 0) upload.push(i);
      return l;
    }
    if (r.mtime === l.mtime && same(l.appearance, r.appearance)) return l;
    const [win, lose] = l.mtime > r.mtime ? [l, r] : [r, l];
    if (win === l) upload.push(i);
    if (lose.mtime > 0 && !same(win.appearance, lose.appearance)) trash.push(toTrash(lose, i, now));
    return win === l ? l : { appearance: r.appearance, mtime: r.mtime };
  });
  return { chars, upload, trash };
}

/** 10일 지난 휴지통 항목과 읽지 못하는 항목의 키 */
export const expiredTrash = (rows: Array<{ key: string; value: unknown }>, now: number): string[] =>
  rows.filter((r) => {
    const t = TrashRecord.safeParse(r.value);
    return !t.success || now - t.data.at > TRASH_KEEP_MS;
  }).map((r) => r.key);

// ---- 캐릭터 파일 (AVT-17) -----------------------------------------------------

export const EXPORT_NAME = 'isshoni-hatarakou-캐릭터.json';
/** 그림 하나가 base64로 64KB까지라서 그림 40장 정도 */
export const EXPORT_MAX_CHARS = 3 * 1024 * 1024;

const ExportFile = z.object({
  kind: z.literal('isshoni-hatarakou.character'),
  v: z.literal(1),
  appearance: Appearance,
  files: z.record(Sha256, z.string().max(FILE_MAX_BASE64_BYTES)),
});

/** 외형이 쓰는 그림 해시 (자세 그림, 슬롯 그림, 얼굴 그리기 편집 데이터) */
export function fileRefs(a: Appearance): Sha256[] {
  const f = Face.safeParse(a.bodyExt?.face).data;
  const all = [...Object.values(a.poses), ...Object.values(a.slots).flatMap((es) => es.map((e) => e.file)), f?.open ?? null, f?.closed ?? null];
  return [...new Set(all.filter((h): h is Sha256 => h !== null))];
}

/** 그림 해시를 바꾼다. map에 없는 해시는 그대로 둔다 */
export function remapFiles(a: Appearance, map: Record<string, Sha256>): Appearance {
  const m = (h: Sha256 | null) => (h && map[h]) || h;
  const f = Face.safeParse(a.bodyExt?.face).data;
  return {
    // Firebase는 undefined 값을 받지 않으므로 없는 그림 키는 만들지 않는다
    ...(f ? withFace(a, { ...f, ...(f.open && { open: m(f.open)! }), ...(f.closed && { closed: m(f.closed)! }) }) : a),
    poses: { idle: m(a.poses.idle), typing: m(a.poses.typing), sleep: m(a.poses.sleep) },
    slots: Object.fromEntries(Object.entries(a.slots).map(([k, es]) => [k, es.map((e) => ({ ...e, file: m(e.file) }))])),
  };
}

const toB64 = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** 외형과 그림 바이트를 JSON 글자로 만든다. 남이 내 파일을 읽지 못해도 불러올 수 있게 그림을 함께 담는다 */
export function toExport(a: Appearance, files: Record<Sha256, Uint8Array>): string {
  const out = { kind: 'isshoni-hatarakou.character', v: 1, appearance: a, files: Object.fromEntries(Object.entries(files).map(([h, b]) => [h, toB64(b)])) };
  return JSON.stringify(ExportFile.parse(out));
}

/** 캐릭터 파일을 읽는다. 외형이 쓰는 그림만 돌려준다. 맞지 않으면 사용자에게 보일 문장으로 예외 */
export function fromExport(text: string): { appearance: Appearance; files: Array<[Sha256, Uint8Array]> } {
  if (text.length > EXPORT_MAX_CHARS) throw new Error('파일이 너무 큽니다.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('캐릭터 파일이 아닙니다.');
  }
  const r = ExportFile.safeParse(raw);
  if (!r.success) throw new Error('캐릭터 파일이 아니거나 그림이 너무 큽니다.');
  try {
    const files = fileRefs(r.data.appearance).flatMap((h): Array<[Sha256, Uint8Array]> => {
      const b64 = r.data.files[h];
      return b64 ? [[h, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]] : [];
    });
    return { appearance: r.data.appearance, files };
  } catch {
    throw new Error('캐릭터 파일의 그림이 깨졌습니다.');
  }
}
