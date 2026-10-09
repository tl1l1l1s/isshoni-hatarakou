// 방별 가챠 계산 (9.3 OUR-02, 10.9 GCH-01부터 GCH-08까지). 서버와 화면 없이 시험한다
import { z } from 'zod';
import { DAY_BOUNDARY_MS, KST_OFFSET_MS } from '@shared/constants';
import { Sha256 } from '@shared/schemas';
import { dayKey } from '@shared/time';
import type { InventoryItem } from './api';

export const DEFAULT_SEC_PER_TICKET = 3600;
export const ITEM_NAME_MAX = 20;

/** mod/gacha/r/{code}/cfg. 없으면 기본값 */
export const Cfg = z.object({
  adders: z.enum(['owner', 'members']).default('owner'),
  secPerTicket: z.number().int().min(60).max(86_400).default(DEFAULT_SEC_PER_TICKET),
  /** 방을 지울 때 뽑은 아이템을 남길지 함께 지울지 */
  onRemove: z.enum(['keep', 'revoke']).default('keep'),
  v: z.literal(1).default(1),
});
export type Cfg = z.infer<typeof Cfg>;

/** mod/gacha/r/{code}/items/{itemId} */
export const Item = z.object({
  name: z.string().min(1).max(ITEM_NAME_MAX),
  file: Sha256,
  w: z.number().int().min(1).max(100),
  by: z.string(),
  st: z.enum(['on', 'off']),
  at: z.number(),
  /** 기간 한정 아이템의 시작과 끝 서버 시각. 이 안에서만 뽑힌다 (GCH-04) */
  from: z.number().optional(),
  until: z.number().optional(),
  v: z.literal(1),
});
export type Item = z.infer<typeof Item>;
export type Entry = Item & { id: string };

/** mod/gacha/r/{code}/tomb/{itemId}. 방 전체는 _room */
export const Tomb = z.object({ mode: z.enum(['keep', 'revoke']), at: z.number() });
export type Tomb = z.infer<typeof Tomb>;
export const ROOM_TOMB = '_room';

/** mod/gacha/u/{uid}/r/{code}/got/{itemId} */
export const Got = z.object({ n: z.number().int().min(1), name: z.string(), file: Sha256, at: z.number() });
export type Got = z.infer<typeof Got>;

/** mod/gacha/u/{uid}/r/{code} */
export interface Rec { sec: number; spent: number; bonus: number; v: 1; got?: Record<string, Got> }
export const EMPTY: Rec = { sec: 0, spent: 0, bonus: 0, v: 1 };

export const readCfg = (v: unknown): Cfg => Cfg.safeParse(v ?? {}).data ?? Cfg.parse({});

/** 형식이 틀린 got 항목 하나 때문에 방 전체를 버리지 않도록 항목마다 거른다 */
export function readRec(v: unknown): Rec {
  const o = (v ?? {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' ? x : 0);
  const got = Object.entries((o.got ?? {}) as Record<string, unknown>).filter(([, g]) => Got.safeParse(g).success);
  return { sec: num(o.sec), spent: num(o.spent), bonus: num(o.bonus), v: 1, got: Object.fromEntries(got) as Record<string, Got> };
}

/** 형식이 맞는 아이템을 넣은 순서로 */
export function entries(items: unknown): Entry[] {
  return Object.entries((items ?? {}) as Record<string, unknown>)
    .flatMap(([id, raw]) => {
      const r = Item.safeParse(raw);
      return r.success ? [{ ...r.data, id }] : [];
    })
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

/** 지금 뽑을 수 있는 아이템. 켜 둔 것 가운데 기간 안인 것 (GCH-04) */
export const inPeriod = (e: Pick<Item, 'from' | 'until'>, now: number): boolean => (e.from ?? -Infinity) <= now && now < (e.until ?? Infinity);
export const pool = (all: Entry[], now: number): Entry[] => all.filter((e) => e.st === 'on' && inPeriod(e, now));

/** 날짜 칸(YYYY-MM-DD)의 하루 시작 서버 시각. 하루는 dayKey처럼 오전 6시에 바뀐다 */
export const dayStart = (day: string): number => Date.parse(day) - KST_OFFSET_MS + DAY_BOUNDARY_MS;

/** 10/5부터 10/31까지 같은 기간 글. 기간이 없으면 null */
export function periodText(e: Pick<Item, 'from' | 'until'>): string | null {
  const md = (ms: number) => dayKey(ms).slice(5).split('-').map(Number).join('/');
  const parts = [e.from !== undefined && `${md(e.from)}부터`, e.until !== undefined && `${md(e.until - 1)}까지`].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** 같은 아이템을 이만큼 모으면 색을 바꿀 수 있다 (GCH-05). 서버 조정값 hueUnlockCount의 기본값 */
export const HUE_UNLOCK_DEFAULT = 4;

/** 남은 뽑기. 저장하지 않고 계산한다. 기준 시간을 늘려 음수가 되면 0 */
export const tickets = (sec: number, spt: number, bonus: number, spent: number): number =>
  Math.max(0, Math.floor(sec / spt) + bonus - spent);

/** 남은 뽑기가 하나 더 늘 때까지 더 쌓아야 하는 초 */
export const secToNext = (sec: number, spt: number, bonus: number, spent: number): number =>
  Math.max(Math.floor(sec / spt) + 1, spent - bonus + 1) * spt - sec;

export const odds = (p: Array<{ w: number }>): number[] => {
  const total = p.reduce((s, e) => s + e.w, 0);
  return p.map((e) => e.w / total);
};

export function percent(p: number): string {
  const x = p * 100;
  return x > 0 && x < 0.1 ? '0.1% 미만' : `${Number(x.toFixed(1))}%`;
}

export function duration(sec: number): string {
  const m = Math.ceil(sec / 60);
  const [h, mm] = [Math.floor(m / 60), m % 60];
  return h ? `${h}시간${mm ? ` ${mm}분` : ''}` : `${m}분`;
}

/** 가중치 누적합에서 하나를 고른다. rnd는 [0, 1) */
export function draw<T extends { w: number }>(p: T[], rnd: number): T | null {
  let x = rnd * p.reduce((s, e) => s + e.w, 0);
  for (const e of p) if ((x -= e.w) < 0) return e;
  return p.at(-1) ?? null;
}

/** 뽑기 transaction 본문. 남은 뽑기가 없으면 undefined(취소) */
export function applyDraw(cur: Rec | null, item: Entry, spt: number, at: number): Rec | undefined {
  // Firebase가 처음에 빈 값으로 부를 수 있다. 빈 기록을 돌려주면 서버 값이 다르면 서버 값으로 다시 부른다
  if (!cur) return EMPTY;
  if (tickets(cur.sec, spt, cur.bonus, cur.spent) < 1) return undefined;
  const g = cur.got?.[item.id];
  const next: Got = g ? { ...g, n: g.n + 1 } : { n: 1, name: item.name, file: item.file, at };
  return { ...cur, spent: cur.spent + 1, got: { ...cur.got, [item.id]: next } };
}

export function inventoryOf(code: string, got: Rec['got']): InventoryItem[] {
  return Object.entries(got ?? {}).map(([itemId, g]) => ({ key: `${code}/${itemId}`, room: code, itemId, name: g.name, file: g.file, n: g.n, at: g.at }));
}

/** 보관함의 방마다 모은 종 수 (GCH-06). 방 아이템 목록을 읽었으면 지금 방에 있는 아이템 가운데 가진 종 수를 쓰고
 *  방이 지워졌거나 읽지 못했거나 아이템이 없으면 가진 종 수만 쓴다 */
export function kinds(mine: Array<{ itemId: string }>, room: Array<{ id: string }> | null | undefined): string {
  if (!room?.length) return `${mine.length}종`;
  const ids = new Set(room.map((e) => e.id));
  return `${mine.filter((i) => ids.has(i.itemId)).length}/${room.length}종`;
}

export const sortInventory = (xs: InventoryItem[]): InventoryItem[] =>
  xs.toSorted((a, b) => (a.room < b.room ? -1 : a.room > b.room ? 1 : a.at - b.at || (a.itemId < b.itemId ? -1 : 1)));

export type Tombs = Record<string, { mode?: unknown } | undefined> | null;

/** 함께 지우기로 빠질 got 항목 id */
export function revokedIds(got: Rec['got'], tombs: Tombs): string[] {
  const ids = Object.keys(got ?? {});
  return tombs?.[ROOM_TOMB]?.mode === 'revoke' ? ids : ids.filter((id) => tombs?.[id]?.mode === 'revoke');
}

/**
 * 서버 기록 목록과 삭제 표시로 보관함을 다시 만든다. drop은 서버에서 지울 got 항목.
 * 목록(limit 50)에 없는 방의 항목은 확인할 수 없어서 그대로 둔다
 */
export function reconcile(prev: InventoryItem[], rows: Array<{ code: string; got: Rec['got'] }>, tombs: Record<string, Tombs>) {
  const listed = new Set(rows.map((r) => r.code));
  const next = prev.filter((i) => !listed.has(i.room));
  const drop: Record<string, string[]> = {};
  for (const { code, got } of rows) {
    const ids = revokedIds(got, tombs[code] ?? null);
    if (ids.length) drop[code] = ids;
    next.push(...inventoryOf(code, got).filter((i) => !ids.includes(i.itemId)));
  }
  return { inventory: sortInventory(next), drop };
}
