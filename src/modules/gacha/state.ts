// 가챠 상태와 동작. 상태는 ctx마다 따로 두어 시험에서 앱 여러 개를 한 프로세스에 띄워도 섞이지 않는다
import { useCallback, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import type { InventoryItem } from './api';
import {
  applyDraw, EMPTY, inventoryOf, Item, pool, readCfg, readRec, reconcile, ROOM_TOMB, sortInventory, tickets, draw,
  type Cfg, type Entry, type Rec, type Tombs,
} from './logic';

export interface View {
  code: string | null;
  owner: boolean;
  cfg: Cfg;
  /** 형식이 맞는 아이템 전부 (꺼 둔 것 포함) */
  items: Entry[];
  /** 지금 방의 내 기록 */
  rec: Rec;
  /** 아직 서버에 쓰지 않은 지금 방의 초 */
  pendingSec: number;
  inventory: InventoryItem[];
}

export interface Drawn { id: string; name: string; file: string; n: number }

interface Box {
  view: View;
  subs: Set<() => void>;
  inv: Set<(items: InventoryItem[]) => void>;
  /** 방 코드별로 아직 쓰지 않은 초 */
  pending: Map<string, number>;
  ready: boolean;
}

export const NOT_IN_ROOM = '방에 들어가 있을 때만 가챠를 쓸 수 있습니다.';
const boxes = new WeakMap<Ctx, Box>();

function box(ctx: Ctx): Box {
  let b = boxes.get(ctx);
  if (!b) {
    const view: View = { code: null, owner: false, cfg: readCfg(null), items: [], rec: EMPTY, pendingSec: 0, inventory: [] };
    boxes.set(ctx, (b = { view, subs: new Set(), inv: new Set(), pending: new Map(), ready: false }));
  }
  return b;
}

export const view = (ctx: Ctx): View => box(ctx).view;

export function patch(ctx: Ctx, p: Partial<View>): void {
  const b = box(ctx);
  b.view = { ...b.view, ...p };
  b.subs.forEach((fn) => fn());
}

export function useGacha(ctx: Ctx): View {
  const sub = useCallback((fn: () => void) => {
    const b = box(ctx);
    b.subs.add(fn);
    return () => void b.subs.delete(fn);
  }, [ctx]);
  return useSyncExternalStore(sub, () => view(ctx));
}

export function onInventory(ctx: Ctx, fn: (items: InventoryItem[]) => void): () => void {
  const b = box(ctx);
  b.inv.add(fn);
  return () => void b.inv.delete(fn);
}

/** 로컬 사본에서 보관함을 채운다 (setup) */
export function start(ctx: Ctx, cached: InventoryItem[]): void {
  patch(ctx, { inventory: sortInventory(cached) });
}

/** 보관함을 바꾸고 빠진 항목을 알린다. stickers가 setup을 마친 뒤(ready)부터 알린다 */
function commit(ctx: Ctx, next: InventoryItem[]): void {
  const b = box(ctx);
  const prev = b.view.inventory;
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  const keys = new Set(next.map((i) => i.key));
  const removed = prev.filter((i) => !keys.has(i.key)).map((i) => i.key);
  patch(ctx, { inventory: next });
  ctx.local.update<InventoryItem[]>('account', () => next);
  if (removed.length && b.ready) ctx.bus.emit('gacha.revoked', { keys: removed });
  b.inv.forEach((fn) => fn(next));
}

/** 지금 방의 내 기록이 바뀌었을 때 그 방 항목만 바꾼다 */
export function setRoomRec(ctx: Ctx, code: string, rec: Rec): void {
  patch(ctx, { rec });
  commit(ctx, sortInventory([...view(ctx).inventory.filter((i) => i.room !== code), ...inventoryOf(code, rec.got)]));
}

// ---- 횟수 ------------------------------------------------------------------

export function addSec(ctx: Ctx, code: string, sec: number): void {
  const b = box(ctx);
  b.pending.set(code, (b.pending.get(code) ?? 0) + sec);
  if (code === b.view.code) patch(ctx, { pendingSec: b.pending.get(code)! });
}

/** 쌓인 초를 서버 더하기 연산으로 쓴다. 기록이 없으면 spent, bonus, v도 함께 만든다 */
export async function flush(ctx: Ctx, only?: string): Promise<void> {
  const b = box(ctx);
  const writes: Array<Promise<void>> = [];
  for (const [code, sec] of b.pending) {
    const n = Math.floor(sec);
    if ((only && code !== only) || n < 1) continue;
    b.pending.set(code, sec - n);
    writes.push(
      ctx.server.user(['r']).update(code, { sec: { $inc: n }, spent: { $inc: 0 }, bonus: { $inc: 0 }, v: 1 }).catch((e: Error) => {
        b.pending.set(code, (b.pending.get(code) ?? 0) + n);
        ctx.log.warn(`작업 시간을 쓰지 못했습니다: ${e.message}`);
      }),
    );
  }
  const code = b.view.code;
  if (code) patch(ctx, { pendingSec: b.pending.get(code) ?? 0 });
  await Promise.all(writes);
}

// ---- 뽑기 ------------------------------------------------------------------

export function drawReason(ctx: Ctx): string | null {
  const v = view(ctx);
  if (!v.code) return NOT_IN_ROOM;
  if (!pool(v.items, ctx.clock.serverNow()).length) return '뽑을 아이템이 없습니다.';
  if (tickets(v.rec.sec + Math.floor(v.pendingSec), v.cfg.secPerTicket, v.rec.bonus, v.rec.spent) < 1) return '남은 뽑기가 없습니다.';
  return null;
}

/** 한 번 뽑는다. 남은 횟수 확인과 기록은 내 방 기록 하나의 transaction이다 (GCH-07) */
export async function drawOnce(ctx: Ctx, rnd = Math.random()): Promise<Drawn> {
  const { code, items, cfg } = view(ctx);
  const pick = draw(pool(items, ctx.clock.serverNow()), rnd);
  if (!code || !pick) throw new Error(drawReason(ctx) ?? '뽑을 아이템이 없습니다.');
  await flush(ctx, code);
  let drew = false;
  const res = await ctx.server.user(['r']).transaction<Rec>(code, (cur) => {
    // 빈 칸이 있는 서버 기록도 0으로 읽어 계산한다 (예: 작업 시간만 쌓인 기록)
    const next = applyDraw(cur && readRec(cur), pick, cfg.secPerTicket, ctx.clock.serverNow());
    drew = !!next && next.spent > (cur?.spent ?? 0);
    return next;
  });
  if (!res.committed || !drew) throw new Error('남은 뽑기가 없습니다.');
  const rec = readRec(res.value);
  if (ctx.room.current() === code) setRoomRec(ctx, code, rec);
  return { id: pick.id, name: pick.name, file: pick.file, n: rec.got?.[pick.id]?.n ?? 1 };
}

// ---- 방 주인과 멤버의 아이템 관리 ---------------------------------------------------

function roomOf(ctx: Ctx): string {
  const code = view(ctx).code;
  if (!code) throw new Error(NOT_IN_ROOM);
  return code;
}

export const canAdd = (v: View): boolean => !!v.code && (v.owner || v.cfg.adders === 'members');

/** 그림을 골라 256px 정도로 줄여 올리고 아이템을 넣는다. 그림을 고르지 않으면 false. period는 기간 한정 (GCH-04) */
export async function addItem(ctx: Ctx, name: string, w: number, period: Pick<Item, 'from' | 'until'> = {}): Promise<boolean> {
  const code = roomOf(ctx);
  const f = await ctx.files.openImage();
  if (!f) return false;
  const file = await ctx.files.upload(await ctx.files.prepareImage(f.bytes, { maxSide: 256 }));
  const now = ctx.clock.serverNow();
  const item = Item.parse({ name, file, w, by: ctx.self.uid(), st: 'on', at: now, ...period, v: 1 });
  const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await ctx.server.room(code, ['items']).set(id, item);
  return true;
}

export const setItemOn = (ctx: Ctx, id: string, on: boolean): Promise<void> =>
  ctx.server.room(roomOf(ctx), ['items']).update(id, { st: on ? 'on' : 'off' });

/** 아이템 삭제와 삭제 표시를 다중 경로 쓰기 한 번으로 보낸다. 규칙이 같은 쓰기 안의 tomb를 확인한다 */
export const removeItem = (ctx: Ctx, id: string, mode: 'keep' | 'revoke'): Promise<void> =>
  ctx.server.room(roomOf(ctx)).update('', { [`items/${id}`]: null, [`tomb/${id}`]: { mode, at: ctx.clock.serverNow() } });

export const setCfg = (ctx: Ctx, p: Partial<Cfg>): Promise<void> => ctx.server.room(roomOf(ctx)).set('cfg', { ...view(ctx).cfg, ...p });

/** 방을 지우기 직전(ctx.room.beforeRemove). 코어가 items를 지우기 전에 방 전체 삭제 표시를 쓴다 */
export async function markRoomRemoved(ctx: Ctx, code: string): Promise<void> {
  const tomb = ctx.server.room(code, ['tomb']);
  // 한 번만 만들 수 있으므로 지난 시도에서 이미 썼으면 그대로 둔다
  if (await tomb.get(ROOM_TOMB)) return;
  const { onRemove } = readCfg(await ctx.server.room(code).get('cfg'));
  await tomb.set(ROOM_TOMB, { mode: onRemove, at: ctx.clock.serverNow() });
}

// ---- 함께 지우기 동기화 ---------------------------------------------------------

/** 내 방 기록(limit 50)마다 삭제 표시를 읽고 함께 지우기 항목을 보관함과 서버에서 뺀다 (부팅 ready, 보관함 창) */
export async function sync(ctx: Ctx): Promise<void> {
  // 처음 부르는 때가 ready이므로 이때부터 빠진 항목을 알린다
  box(ctx).ready = true;
  const rows = (await ctx.server.user(['r']).list({ limit: 50 })).map((r) => ({ code: r.key, got: readRec(r.value).got }));
  const tombs: Record<string, Tombs> = Object.fromEntries(
    await Promise.all(
      rows
        .filter((r) => Object.keys(r.got ?? {}).length)
        .map(async (r) => [r.code, await ctx.server.room(r.code).get<Tombs>('tomb').catch(() => null)] as const),
    ),
  );
  const { inventory, drop } = reconcile(view(ctx).inventory, rows, tombs);
  await Promise.all(
    Object.entries(drop).map(([code, ids]) =>
      ctx.server
        .user(['r', code])
        .update('got', Object.fromEntries(ids.map((id) => [id, null])))
        .catch((e: Error) => ctx.log.warn(`${code} 방 보관함 항목을 지우지 못했습니다: ${e.message}`)),
    ),
  );
  commit(ctx, inventory);
}
