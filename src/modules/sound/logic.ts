// 플레이리스트 순서, 유튜브 링크, 프리셋과 친구 플리, 백색소음 섞기 (SND-01..SND-09, COM-03). ctx 없이 시험하는 순수 함수
import { z } from 'zod';

export const MAX_TRACKS = 20;
export const KINDS = ['rain', 'keys', 'fire', 'cafe'] as const;
/** 채팅 알림음 세 가지 (COM-03) */
export const CHIMES = ['1', '2', '3'] as const;
export type Chime = (typeof CHIMES)[number];
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { rain: '빗소리', keys: '타자 소리', fire: '모닥불', cafe: '카페' };
export const isKind = (v: unknown): v is Kind => KINDS.includes(v as Kind);

export const Settings = z.object({
  musicVolume: z.number().int().min(0).max(100).default(60),
  noise: z.enum(['off', ...KINDS]).default('off'),
  noiseVolume: z.number().int().min(0).max(100).default(60),
  shareOthers: z.boolean().default(true),
  chatSound: z.enum(['off', ...CHIMES]).default('1'),
});
export type Settings = z.infer<typeof Settings>;

const VIDEO_ID = /^[\w-]{11}$/;
/** k는 줄마다 다른 키라서 같은 곡을 두 번 넣어도 된다. 제목은 처음 재생할 때 플레이어가 알려 준다 */
export const Track = z.object({ k: z.string(), v: z.string().regex(VIDEO_ID), title: z.string().max(200) });
export type Track = z.infer<typeof Track>;
export const PRESETS = 3;
export const PRESET_NAME_MAX = 20;
export const BIO_MAX = 140;
/** 플레이리스트 창 크기. 축소 플레이어는 플레이어 줄만 남긴 높이다 (SND-04) */
export const PLAYER = { width: 360, height: 640, miniHeight: 240 };

export const Preset = z.object({ name: z.string().max(PRESET_NAME_MAX), tracks: z.array(Track).max(MAX_TRACKS) });
export type Preset = z.infer<typeof Preset>;
/** 이 PC의 플레이리스트. 프리셋 셋, 고른 프리셋, 재생 모드, 소개글, 파도타기 잠금 (SND-01..SND-06) */
export const Playlist = z.object({
  presets: z.array(Preset).length(PRESETS),
  cur: z.number().int().min(0).max(PRESETS - 1),
  repeat: z.boolean(),
  shuffle: z.boolean(),
  bio: z.string().max(BIO_MAX),
  locked: z.boolean(),
  /** 마이홈 공개 (SND-05). 내 플리를 듣는 친구에게 내 마이홈으로 가는 사진과 이름 버튼을 보인다. 없던 기록은 켜진 것으로 읽는다 */
  home: z.boolean().default(true),
});
export type Playlist = z.infer<typeof Playlist>;
const emptyPresets = (): Preset[] => Array.from({ length: PRESETS }, () => ({ name: '', tracks: [] }));
export const initialPlaylist = (): Playlist => ({ presets: emptyPresets(), cur: 0, repeat: true, shuffle: false, bio: '', locked: false, home: true });
/** v1은 목록 하나였다. 그 목록을 프리셋 1로 옮긴다 */
export function fromV1(old: unknown): Playlist {
  const o = old as { tracks: Track[]; repeat: boolean; shuffle: boolean };
  const presets = emptyPresets();
  presets[0]!.tracks = o.tracks;
  return { ...initialPlaylist(), presets, repeat: o.repeat, shuffle: o.shuffle };
}

export const presetLabel = (p: Preset, i: number): string => p.name || `프리셋 ${i + 1}`;
/** 창 제목. 이름 없는 프리셋 1은 플레이리스트이고 친구 목록은 친구 이름 (SND-03, SND-04) */
export const playerTitle = (p: Preset, i: number, friend?: string): string =>
  friend ? `${friend}님의 플리` : p.name || (i === 0 ? '플레이리스트' : `프리셋 ${i + 1}`);

/** Firebase는 배열을 숫자 키 객체로 돌려줄 수 있고 빈 배열은 지운다 */
const listOf = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess((v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : (v ?? [])), z.array(item).max(max));
const SharedPreset = z
  .object({ name: z.string().max(PRESET_NAME_MAX).default(''), tracks: listOf(z.object({ v: z.string().regex(VIDEO_ID), title: z.string().max(200) }), MAX_TRACKS) })
  .default({ name: '', tracks: [] });
/** 친구가 읽는 사본 mod/sound/u/{uid}/share. 프리셋은 빈 칸이 생기지 않게 p0, p1, p2로 둔다 (SND-05..SND-07) */
export const SharedDoc = z.object({
  p0: SharedPreset,
  p1: SharedPreset,
  p2: SharedPreset,
  cur: z.number().int().min(0).max(PRESETS - 1).default(0),
  bio: z.string().max(BIO_MAX).default(''),
  locked: z.boolean().default(false),
  home: z.boolean().default(true),
  v: z.literal(1),
});
export interface Shared { presets: Preset[]; cur: number; bio: string; locked: boolean; home: boolean }

export function toShared(l: Playlist) {
  const [p0, p1, p2] = l.presets.map((p) => ({ name: p.name, tracks: p.tracks.map(({ v, title }) => ({ v, title })) }));
  return { p0, p1, p2, cur: l.cur, bio: l.bio, locked: l.locked, home: l.home, v: 1 };
}

/** 서버 사본을 읽는다. 곡 키는 친구와 위치로 만든다. 모양이 틀리면 null */
export function parseShared(raw: unknown, uid: string): Shared | null {
  const r = SharedDoc.safeParse(raw);
  if (!r.success) return null;
  const { p0, p1, p2, cur, bio, locked, home } = r.data;
  const presets = [p0, p1, p2].map((p, i) => ({ name: p.name, tracks: p.tracks.map((t, j) => ({ k: `${uid}:${i}:${j}`, ...t })) }));
  return { presets, cur, bio, locked, home };
}

/** 친구 프리셋을 열 때 고를 프리셋. 친구가 고른 것이 비어 있으면 곡이 있는 첫 프리셋 */
export const openPreset = (s: Shared): number => (s.presets[s.cur]?.tracks.length ? s.cur : Math.max(0, s.presets.findIndex((p) => p.tracks.length > 0)));

export interface SurfOption { uid: string; preset: number }
/** 파도타기 (SND-06). 잠그지 않은 친구의 곡이 있는 프리셋 가운데 하나를 고른다. 지금 듣는 목록은 다른 후보가 있으면 뺀다 */
export function pickSurf(friends: ReadonlyArray<{ uid: string; shared: Shared | null }>, now: string | null, rand: number): SurfOption | null {
  const all = friends.flatMap(({ uid, shared }) =>
    !shared || shared.locked ? [] : shared.presets.flatMap((p, preset) => (p.tracks.length ? [{ uid, preset }] : [])),
  );
  const pool = all.length > 1 ? all.filter((o) => `${o.uid}:${o.preset}` !== now) : all;
  return pool[Math.floor(rand * pool.length)] ?? null;
}

/** 공개 프로필의 레벨 (growth가 m.growth.level에 쓴다) */
export const levelOf = (p: Record<string, unknown> | null): number | null => {
  const lv = (p?.m as { growth?: { level?: unknown } } | undefined)?.growth?.level;
  return typeof lv === 'number' ? lv : null;
};

/** 유튜브 링크의 영상 id. watch?v=, youtu.be/, shorts/, embed/, live/와 id만 적은 것을 받는다 */
export function youTubeId(input: string): string | null {
  const s = input.trim();
  if (VIDEO_ID.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const [first, second] = u.pathname.split('/').filter(Boolean);
  const id =
    host === 'youtu.be' ? first
    : host !== 'youtube.com' && host !== 'youtube-nocookie.com' ? null
    : first === 'watch' ? u.searchParams.get('v')
    : ['embed', 'shorts', 'live', 'v'].includes(first ?? '') ? second
    : null;
  return id && VIDEO_ID.test(id) ? id : null;
}

/** 재생 순서. 셔플이면 seed로 섞어서 seed가 같으면 순서도 같다 */
export function playOrder(n: number, shuffle: boolean, seed: number): number[] {
  const a = [...Array(n).keys()];
  if (!shuffle) return a;
  let s = seed >>> 0;
  const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** current 다음(dir 1)이나 앞(dir -1) 곡의 위치. 끝을 넘으면 repeat일 때 반대쪽 끝으로, 아니면 null.
 *  고른 곡이 없으면 순서의 첫 곡 */
export function nextIndex(order: readonly number[], current: number, dir: 1 | -1, repeat: boolean): number | null {
  const at = order.indexOf(current);
  if (at < 0) return order[0] ?? null;
  const p = at + dir;
  if (p >= 0 && p < order.length) return order[p]!;
  return repeat ? order[(p + order.length) % order.length]! : null;
}

/** 같은 소리를 고른 다른 사람 가운데 타이핑 중인 사람 수에 따른 음량 비율 (SND-09) */
export const sharedRatio = (n: number): number => (n <= 0 ? 0 : n === 1 ? 0.5 : n === 2 ? 0.7 : 0.9);

/** 지금 틀 소리와 음량 비율. 종류마다 한 벌만 튼다. 내 소리는 1.0이고 다른 사람 소리는 사람이 많은 종류부터 3종류까지 */
export function mix(mine: Kind | null, others: readonly Kind[]): Map<Kind, number> {
  const count = new Map<Kind, number>();
  for (const k of others) count.set(k, (count.get(k) ?? 0) + 1);
  const out = new Map<Kind, number>();
  if (mine) out.set(mine, 1);
  for (const [k, n] of [...count].sort((a, b) => b[1] - a[1]).slice(0, 3)) if (!out.has(k)) out.set(k, sharedRatio(n));
  return out;
}

export const FADE_IN_SEC = 0.1;
export const FADE_OUT_SEC = 0.5;
/** 음량을 바꾸는 데 걸리는 초. 커질 때 0.1초, 줄 때 0.5초 (SND-08) */
export const fadeSec = (from: number, to: number): number => (to > from ? FADE_IN_SEC : to < from ? FADE_OUT_SEC : 0);
