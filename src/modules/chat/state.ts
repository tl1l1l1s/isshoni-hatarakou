// 채팅 상태와 동작. 상태는 ctx마다 따로 둔다
import { useCallback, useSyncExternalStore } from 'react';
import { FILE_MAX_RAW_BYTES, NAME_MAX_LENGTH, SERVER_TIME } from '@shared/constants';
import type { Ctx, Dispose } from '@core/types';
import { clean, countUnread, Mine, MINE_MAX, MINE_SIDE, MSG_LIMIT, MSG_MAX, msgKey, nextTime, SAY_MS, short, type Item, type Local, type Msg } from './logic';

export const WINDOW = 'chat.room';
export const NOT_IN_ROOM = '방에 들어가 있을 때 쓸 수 있습니다.';
export const CHAT_OFF = '방 주인이 채팅을 꺼 두었습니다.';
export const ROOM_CHANGED = '방이 바뀌어 보내지 않았습니다.';

export interface View {
  code: string | null;
  /** cfg가 없으면 켜짐 (ROM-02) */
  on: boolean;
  items: Item[];
  /** 마지막으로 읽은 키. ''는 이 방에서 아직 읽은 적 없음 */
  lastRead: string;
  open: boolean;
  unread: number;
  /** 내가 등록한 이모티콘 그림 해시 (COM-18) */
  mine: string[];
}

interface Box { v: View; subs: Set<() => void>; lastT: number; seen: string | null; hooks: Set<(text: string) => boolean> }
const boxes = new WeakMap<Ctx, Box>();
function box(ctx: Ctx): Box {
  let b = boxes.get(ctx);
  if (!b) boxes.set(ctx, (b = { v: { code: null, on: true, items: [], lastRead: '', open: false, unread: 0, mine: [] }, subs: new Set(), lastT: 0, seen: null, hooks: new Set() }));
  return b;
}

/** ChatApi.intercept */
export function intercept(ctx: Ctx, fn: (text: string) => boolean): Dispose {
  const { hooks } = box(ctx);
  hooks.add(fn);
  return () => void hooks.delete(fn);
}

export const view = (ctx: Ctx): View => box(ctx).v;

function patch(ctx: Ctx, p: Partial<View>): void {
  const b = box(ctx);
  const v = { ...b.v, ...p };
  b.v = { ...v, unread: countUnread(v.items, v.lastRead, ctx.self.uid()) };
  b.subs.forEach((f) => f());
}

export function useChat(ctx: Ctx): View {
  const sub = useCallback((fn: () => void) => {
    const b = box(ctx);
    b.subs.add(fn);
    return () => void b.subs.delete(fn);
  }, [ctx]);
  return useSyncExternalStore(sub, () => view(ctx));
}

function read(ctx: Ctx, key: string): void {
  const { code, lastRead } = view(ctx);
  if (!code || key <= lastRead) return;
  ctx.local.update<Local>('account', (s) => ({ read: { ...s.read, [code]: key } }));
  patch(ctx, { lastRead: key });
}

/** 창이 열려 있는 동안은 오는 대로 읽은 것으로 친다 (COM-02) */
export function setOpen(ctx: Ctx, open: boolean): void {
  patch(ctx, { open });
  if (open) read(ctx, view(ctx).items.at(-1)?.key ?? '');
}

// ponytail: BubbleDecl.text가 ctx를 받지 않아 말풍선 글을 모듈에 하나만 둔다. 한 프로세스에 앱 여러 개를 띄우면 섞인다.
// 코어가 text(seat, ctx)로 넘겨 주면 Box로 옮긴다
export const says = new Map<string, { text: string }>();
export const emojis = new Map<string, { text: string; image?: string }>();

/** uid 머리 위에 ms 동안 띄운다. 그 사이 새 글이 덮으면 새 글의 타이머가 지운다 (COM-09). image는 그림 해시 (COM-18) */
export function flash(ctx: Ctx, map: Map<string, { text: string; image?: string }>, uid: string, text: string, ms: number, image?: string): void {
  const entry = image ? { text, image } : { text };
  map.set(uid, entry);
  ctx.seats.refresh();
  ctx.timers.at(ms, () => {
    if (map.get(uid) !== entry) return;
    map.delete(uid);
    ctx.seats.refresh();
  });
}

function onItems(ctx: Ctx, items: Item[]): void {
  const b = box(ctx);
  const first = b.seen === null;
  const fresh = first ? [] : items.filter((i) => i.key > b.seen!);
  const last = items.at(-1)?.key ?? '';
  if (last > (b.seen ?? '')) b.seen = last;
  else b.seen ??= '';
  patch(ctx, { items });
  // 처음 들어온 방의 지난 대화는 읽은 것으로 친다
  if (view(ctx).open || (first && !view(ctx).lastRead)) read(ctx, last);
  for (const i of fresh) flash(ctx, says, i.value.uid, short(i.value.text), SAY_MS);
  const heard = fresh.filter((i) => i.value.uid !== ctx.self.uid()).at(-1);
  if (heard && !view(ctx).open) ctx.notify({ title: heard.value.name, body: heard.value.text, onClick: () => ctx.ui.open(WINDOW) });
  if (heard && !view(ctx).open) ctx.bus.emit('chat.heard', { uid: heard.value.uid });
}

/** 지금 방의 채팅 설정과 최근 메시지를 구독한다 */
export function watchRoom(ctx: Ctx): void {
  let stops: Dispose[] = [];
  const onRoom = (code: string | null) => {
    stops.forEach((d) => d());
    stops = [];
    box(ctx).seen = null;
    patch(ctx, { code, on: true, items: [], lastRead: (code && ctx.local.get<Local>('account').read[code]) || '' });
    if (!code) return;
    const room = ctx.server.room(code);
    stops = [
      room.watch<{ on: boolean }>('cfg', (c) => patch(ctx, { on: c?.on ?? true })),
      room.watchList<Msg>('msgs', { limit: MSG_LIMIT, last: true }, (items) => onItems(ctx, items)),
    ];
  };
  ctx.room.onChange(onRoom);
  onRoom(ctx.room.current());
}

/** 보내지 못하면 이유를 담은 예외. to는 글을 쓸 때 들어가 있던 방이고 지금 방과 다르면 보내지 않는다 (다시 보내기) */
export async function send(ctx: Ctx, raw: string, to: string | null = view(ctx).code): Promise<void> {
  const { code, on } = view(ctx);
  if (!code) throw new Error(NOT_IN_ROOM);
  if (to !== code) throw new Error(ROOM_CHANGED);
  if (!on) throw new Error(CHAT_OFF);
  const text = clean(raw);
  if (!text) return;
  if (text.length > MSG_MAX) throw new Error(`${MSG_MAX}자까지 보낼 수 있습니다.`);
  const b = box(ctx);
  for (const fn of b.hooks) if (fn(text)) return;
  b.lastT = nextTime(ctx.clock.serverNow(), b.lastT);
  const uid = ctx.self.uid();
  await ctx.server.room(code, ['msgs']).set(msgKey(b.lastT, uid), { uid, name: ctx.self.name().slice(0, NAME_MAX_LENGTH), text, at: SERVER_TIME, v: 1 });
}

/** 이모티콘은 채팅이 꺼져 있어도 보낸다 (COM-08) */
export function sendEmoji(ctx: Ctx, e: string): void {
  if (!ctx.room.current()) return ctx.ui.toast(NOT_IN_ROOM);
  if (!ctx.room.emit('emoji', { e })) ctx.ui.toast('잠시 뒤에 다시 보내 주세요.');
}

export const setChatOn = (ctx: Ctx, code: string, on: boolean): Promise<void> => ctx.server.room(code).set('cfg', { on, v: 1 });

// ---- 내 이모티콘 (COM-18). 목록은 공개 프로필 m.chat.emo에 두어 다른 PC에서도 같다 ----

export async function loadMine(ctx: Ctx): Promise<void> {
  const p = (await ctx.users.profile(ctx.self.uid())) as { m?: { chat?: { emo?: unknown } } } | null;
  const r = Mine.safeParse(p?.m?.chat?.emo);
  if (r.success) patch(ctx, { mine: r.data });
}

function saveMine(ctx: Ctx, mine: string[]): void {
  ctx.self.setProfile({ emo: mine });
  patch(ctx, { mine });
}

/** 그림을 골라 등록한다. 48KB 이하 GIF는 움직임을 살리려고 그대로 올리고 나머지는 줄인다 */
export async function addMine(ctx: Ctx): Promise<void> {
  const file = await ctx.files.openImage();
  if (!file) return;
  const gif = String.fromCharCode(...file.bytes.subarray(0, 3)) === 'GIF';
  const bytes = gif && file.bytes.byteLength <= FILE_MAX_RAW_BYTES ? file.bytes : await ctx.files.prepareImage(file.bytes, { maxSide: MINE_SIDE });
  const hash = await ctx.files.upload(bytes);
  const { mine } = view(ctx);
  if (!mine.includes(hash)) saveMine(ctx, [...mine, hash].slice(-MINE_MAX));
}

export const removeMine = (ctx: Ctx, hash: string): void => saveMine(ctx, view(ctx).mine.filter((h) => h !== hash));

export function sendMine(ctx: Ctx, hash: string): void {
  if (!ctx.room.current()) return ctx.ui.toast(NOT_IN_ROOM);
  if (!ctx.room.emit('custom', { h: hash })) ctx.ui.toast('잠시 뒤에 다시 보내 주세요.');
}
