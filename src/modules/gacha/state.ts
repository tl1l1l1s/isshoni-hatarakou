// 가챠 상태와 동작. 상태는 ctx마다 따로 두어 시험에서 앱 여러 개를 한 프로세스에 띄워도 섞이지 않는다
import { useCallback, useSyncExternalStore } from 'react';
import { NOT_IN_ROOM, OFFLINE, type Ctx } from '@core/types';
import type { InventoryItem } from './api';
import {
  applyDraw, earnedOf, EMPTY, inventoryOf, Item, pool, readCfg, readRec, reconcile, ROOM_TOMB, sortInventory, tickets, draw,
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
  pendingEarned: number;
  inventory: InventoryItem[];
}

export interface Drawn { id: string; name: string; file: string; n: number }

/** 작업 초와 그때 기준으로 얻은 횟수 */
export interface Amount { sec: number; earned: number }
/** PC에 남기는 계정 데이터. pending은 방 코드별로 서버가 아직 받지 않은 초 */
export interface Local { inv: InventoryItem[]; pending: Record<string, Amount> }

interface Box {
  view: View;
  subs: Set<() => void>;
  inv: Set<(items: InventoryItem[]) => void>;
  /** 방 코드별로 서버가 아직 받지 않은 초. 보내는 중인 것도 들어 있다 */
  pending: Map<string, Amount>;
  /** 그 가운데 지금 보내는 중인 것 */
  flying: Map<string, Amount>;
  ready: boolean;
}

const ZERO: Amount = { sec: 0, earned: 0 };
const plus = (a: Amount | undefined, b: Amount | undefined, k = 1): Amount => ({
  sec: (a ?? ZERO).sec + k * (b ?? ZERO).sec,
  earned: (a ?? ZERO).earned + k * (b ?? ZERO).earned,
});

const boxes = new WeakMap<Ctx, Box>();

function box(ctx: Ctx): Box {
  let b = boxes.get(ctx);
  if (!b) {
    const view: View = { code: null, owner: false, cfg: readCfg(null), items: [], rec: EMPTY, pendingSec: 0, pendingEarned: 0, inventory: [] };
    boxes.set(ctx, (b = { view, subs: new Set(), inv: new Set(), pending: new Map(), flying: new Map(), ready: false }));
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

/** 로컬 사본에서 보관함과 지난 실행에 보내지 못한 초를 채운다 (setup) */
export function start(ctx: Ctx, l: Local): void {
  box(ctx).pending = new Map(Object.entries(l.pending));
  patch(ctx, { inventory: sortInventory(l.inv) });
}

/** 보관함을 바꾸고 빠진 항목을 알린다. stickers가 setup을 마친 뒤(ready)부터 알린다 */
function commit(ctx: Ctx, next: InventoryItem[]): void {
  const b = box(ctx);
  const prev = b.view.inventory;
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  const keys = new Set(next.map((i) => i.key));
  const removed = prev.filter((i) => !keys.has(i.key)).map((i) => i.key);
  patch(ctx, { inventory: next });
  ctx.local.update<Local>('account', (l) => ({ ...l, inv: next }));
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
  b.pending.set(code, plus(b.pending.get(code), { sec, earned: sec / b.view.cfg.secPerTicket }));
  if (code === b.view.code) showPending(ctx);
}

/** 화면의 아직 쓰지 않은 초. 보내는 중인 것은 내 기록 구독에 먼저 들어오므로 뺀다 */
function showPending(ctx: Ctx): void {
  const b = box(ctx);
  const code = b.view.code;
  const left = code ? plus(b.pending.get(code), b.flying.get(code), -1) : ZERO;
  patch(ctx, { pendingSec: left.sec, pendingEarned: left.earned });
}

/** 서버가 받지 않은 초를 PC에 남긴다. 끊긴 채 앱을 꺼도 다음 실행이 보낸다 */
function keep(ctx: Ctx): void {
  const pending = Object.fromEntries([...box(ctx).pending].filter(([, a]) => a.sec > 1e-6));
  if (JSON.stringify(ctx.local.get<Local>('account').pending) !== JSON.stringify(pending)) {
    ctx.local.update<Local>('account', (l) => ({ ...l, pending }));
  }
}

/** 작업 당시 기준으로 얻은 횟수와 초를 함께 더하고 기존 기록은 한 번만 환산한다.
 *  보내기 전에 PC에 남기고 서버가 받은 뒤에 뺀다. 종료와 절전 때도 불러서 남긴다 */
// ponytail: 서버가 받았는데 응답을 받기 전에 앱이 꺼지면 다음 실행이 같은 초를 한 번 더 보낸다. 막아야 하면 기록에 기기별 순번을 둔다
export async function flush(ctx: Ctx, only?: string): Promise<void> {
  const b = box(ctx);
  keep(ctx);
  const writes: Array<Promise<void>> = [];
  for (const code of b.pending.keys()) {
    const send = plus(b.pending.get(code), b.flying.get(code), -1);
    if ((only && code !== only) || send.sec < 1) continue;
    b.flying.set(code, plus(b.flying.get(code), send));
    writes.push(
      (async () => {
        const cfg = readCfg(await ctx.server.room(code).get('cfg'));
        const res = await ctx.server.user(['r']).transaction<Rec>(code, (cur) => {
          const rec = readRec(cur);
          return { ...rec, sec: rec.sec + send.sec, earned: earnedOf(rec, cfg) + send.earned };
        });
        if (!res.committed) throw new Error('작업 시간 저장이 취소됐어요.');
        b.pending.set(code, plus(b.pending.get(code), send, -1));
        b.flying.set(code, plus(b.flying.get(code), send, -1));
        keep(ctx);
      })().catch((e: Error) => {
        // 남긴 초는 그대로 두고 다음 flush가 다시 보낸다
        b.flying.set(code, plus(b.flying.get(code), send, -1));
        ctx.log.warn(`작업 시간을 쓰지 못했습니다: ${e.message}`);
      }),
    );
  }
  showPending(ctx);
  await Promise.all(writes);
  showPending(ctx);
}

// ---- 뽑기 ------------------------------------------------------------------

export function drawReason(ctx: Ctx): string | null {
  const v = view(ctx);
  if (!v.code) return NOT_IN_ROOM;
  // 끊긴 채 뽑으면 연결될 때까지 결과가 오지 않으므로 미리 막는다 (0033 오프라인 쓰기 정책)
  if (!ctx.connection.online()) return OFFLINE;
  if (!pool(v.items, ctx.clock.serverNow()).length) return '뽑을 아이템이 없어요.';
  if (tickets(earnedOf(v.rec, v.cfg) + v.pendingEarned, v.rec.bonus, v.rec.spent) < 1) return '남은 뽑기가 없어요.';
  return null;
}

/** 한 번 뽑는다. 남은 횟수 확인과 기록은 내 방 기록 하나의 transaction이다 (GCH-07) */
export async function drawOnce(ctx: Ctx, rnd = Math.random()): Promise<Drawn> {
  const { code, items, cfg } = view(ctx);
  const pick = draw(pool(items, ctx.clock.serverNow()), rnd);
  if (!code || !pick) throw new Error(drawReason(ctx) ?? '뽑을 아이템이 없어요.');
  await flush(ctx, code);
  let drew = false;
  const res = await ctx.server.user(['r']).transaction<Rec>(code, (cur) => {
    // 빈 칸이 있는 서버 기록도 0으로 읽어 계산한다 (예: 작업 시간만 쌓인 기록)
    const next = applyDraw(cur && readRec(cur), pick, cfg, ctx.clock.serverNow());
    drew = !!next && next.spent > (cur?.spent ?? 0);
    return next;
  });
  if (!res.committed || !drew) throw new Error('남은 뽑기가 없어요.');
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

export async function setCfg(ctx: Ctx, p: Partial<Cfg>): Promise<void> {
  const res = await ctx.server.room(roomOf(ctx)).transaction<Cfg>('cfg', (cur) => {
    const cfg = readCfg(cur);
    return { ...cfg, ...p, legacySecPerTicket: cfg.legacySecPerTicket ?? cfg.secPerTicket };
  });
  if (!res.committed) throw new Error('가챠 설정을 바꾸지 못했어요. 잠시 뒤에 다시 골라 주세요.');
}

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
