// 채팅 상태와 동작. 상태는 ctx마다 따로 둔다
import { useCallback, useSyncExternalStore } from 'react';
import { FILE_MAX_RAW_BYTES, NAME_MAX_LENGTH, SERVER_TIME } from '@shared/constants';
import { NOT_IN_ROOM, OFFLINE, type Ctx, type Dispose } from '@core/types';
import type {} from '@modules/rooms/api';
import { clean, countUnread, Mine, MINE_MAX, MINE_SIDE, MSG_LIMIT, MSG_MAX, msgKey, nextTime, NOTE_GAP_MS, OUT_MAX, SAY_MS, short, type Item, type Local, type Msg, type Out } from './logic';

export const WINDOW = 'chat.room';
export const CHAT_OFF = '방 주인이 채팅을 꺼 두었어요.';
export const CHAT_OFF_MINE = '채팅을 꺼 두었어요. 방 설정에서 다시 켤 수 있어요.';
export const ROOM_CHANGED = '방이 바뀌어 보내지 않았어요.';
/** 지난 실행에서 서버가 받기 전에 앱이 꺼진 글 */
export const UNSENT = '보내는 중에 앱이 꺼졌어요.';

/** 채팅이 꺼져 있을 때의 안내. 끈 사람이 나면 다시 켜는 곳을 알려 준다 */
export const offText = (ctx: Ctx): string => (ctx.modules.get('rooms')?.isOwner() ? CHAT_OFF_MINE : CHAT_OFF);

/** 보내지 못한 글과 쓸 때 들어가 있던 방. 그 방에서만 다시 보낸다 */
export interface Failed { text: string; error: string; code: string }

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
  /** 서버가 받았다고 하기 전의 내 글 키. 목록에 보내는 중으로 보인다 */
  sending: string[];
  /** 창을 닫았다 열어도 남는다 */
  failed: Failed[];
  /** 방에 없는 사람의 공개 프로필 이름 (uid별) */
  names: Record<string, string>;
}

interface Box {
  v: View;
  subs: Set<() => void>;
  lastT: number;
  seen: string | null;
  hooks: Set<(text: string) => boolean>;
  /** 마지막 OS 알림 시각, 그 뒤 알리지 못한 글 수와 그 글을 알릴 타이머 (D5) */
  noteAt: number;
  more: number;
  noteTimer: Dispose | null;
  /** 프로필 이름을 읽은 uid */
  asked: Set<string>;
}
const boxes = new WeakMap<Ctx, Box>();
function box(ctx: Ctx): Box {
  let b = boxes.get(ctx);
  if (!b) {
    const v: View = { code: null, on: true, items: [], lastRead: '', open: false, unread: 0, mine: [], sending: [], failed: [], names: {} };
    b = { v, subs: new Set(), lastT: 0, seen: null, hooks: new Set(), noteAt: 0, more: 0, noteTimer: null, asked: new Set() };
    boxes.set(ctx, b);
  }
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
  ctx.local.update<Local>('account', (s) => ({ ...s, read: { ...s.read, [code]: key } }));
  patch(ctx, { lastRead: key });
}

const outbox = (ctx: Ctx, fn: (out: Out[]) => Out[]): void => ctx.local.update<Local>('account', (s) => ({ ...s, out: fn(s.out) }));

/** 창이 열려 있는 동안은 오는 대로 읽은 것으로 친다 (COM-02). 열면 미뤄 둔 OS 알림도 버린다 */
export function setOpen(ctx: Ctx, open: boolean): void {
  patch(ctx, { open });
  if (!open) return;
  box(ctx).more = 0;
  read(ctx, view(ctx).items.at(-1)?.key ?? '');
}

/** 보낸 사람 이름. 글에 적힌 name은 보낸 앱이 마음대로 적을 수 있어서 방 멤버 이름이나 공개 프로필 이름을 먼저 쓴다 */
export const nameOf = (ctx: Ctx, m: Msg): string =>
  ctx.room.members().find((s) => s.uid === m.uid && !s.local)?.name || view(ctx).names[m.uid] || m.name || '이름 없음';

/** 방에 없는 사람이 쓴 글은 공개 프로필에서 이름을 한 번 읽어 둔다 */
function learnNames(ctx: Ctx, items: Item[]): void {
  const b = box(ctx);
  const here = new Set(ctx.room.members().map((s) => s.uid));
  for (const uid of new Set(items.map((i) => i.value.uid))) {
    if (here.has(uid) || b.asked.has(uid)) continue;
    b.asked.add(uid);
    ctx.users.profile(uid).then(
      (p) => typeof p?.name === 'string' && p.name && patch(ctx, { names: { ...view(ctx).names, [uid]: p.name } }),
      () => b.asked.delete(uid),
    );
  }
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

/** 대화하기 창이 닫혀 있을 때 온 남의 글을 OS 알림으로 알린다 (COM-01, D5). 30초에 한 번만 띄우고
 *  그사이 온 글은 30초가 지나면 몇 개 더 왔는지 한 번에 알린다. 설정에서 끄면 띄우지 않는다 */
function notify(ctx: Ctx, heard: Item[]): void {
  const on = () => ctx.settings.get<{ osNotify: boolean }>().osNotify;
  if (!on()) return;
  const b = box(ctx);
  const now = ctx.clock.now();
  const onClick = () => ctx.ui.open(WINDOW);
  if (now - b.noteAt >= NOTE_GAP_MS) {
    const m = heard.at(-1)!.value;
    b.noteAt = now;
    return ctx.notify({ title: nameOf(ctx, m), body: m.text, onClick });
  }
  b.more += heard.length;
  b.noteTimer ??= ctx.timers.at(b.noteAt + NOTE_GAP_MS - now, () => {
    b.noteTimer = null;
    const n = b.more;
    b.more = 0;
    if (!n || view(ctx).open || !on()) return;
    b.noteAt = ctx.clock.now();
    ctx.notify({ title: '대화하기', body: `새 메시지가 ${n}개 더 왔어요.`, onClick });
  });
}

/** 지난 실행에서 보내는 중에 앱을 끈 글. 서버에 없으면 보내지 못한 글로 옮긴다 (RES-2) */
function recover(ctx: Ctx, items: Item[]): void {
  const { code, sending, failed } = view(ctx);
  const left = ctx.local.get<Local>('account').out.filter((o) => o.room === code && !sending.includes(o.key));
  if (!left.length) return;
  const keys = new Set(left.map((o) => o.key));
  outbox(ctx, (out) => out.filter((o) => !keys.has(o.key)));
  const lost = left.filter((o) => !items.some((i) => i.key === o.key));
  if (lost.length) patch(ctx, { failed: [...failed, ...lost.map((o) => ({ text: o.text, error: UNSENT, code: o.room }))] });
}

function onItems(ctx: Ctx, items: Item[]): void {
  const b = box(ctx);
  const first = b.seen === null;
  const fresh = first ? [] : items.filter((i) => i.key > b.seen!);
  const last = items.at(-1)?.key ?? '';
  if (last > (b.seen ?? '')) b.seen = last;
  else b.seen ??= '';
  patch(ctx, { items });
  learnNames(ctx, items);
  if (first) recover(ctx, items);
  // 처음 들어온 방의 지난 대화는 읽은 것으로 친다
  if (view(ctx).open || (first && !view(ctx).lastRead)) read(ctx, last);
  // 내 글의 말풍선은 서버가 받은 뒤에 띄운다 (send)
  const { sending } = view(ctx);
  for (const i of fresh) if (!sending.includes(i.key)) flash(ctx, says, i.value.uid, short(i.value.text), SAY_MS);
  const heard = fresh.filter((i) => i.value.uid !== ctx.self.uid());
  if (!heard.length || view(ctx).open) return;
  ctx.bus.emit('chat.heard', { uid: heard.at(-1)!.value.uid });
  notify(ctx, heard);
}

/** 지금 방의 채팅 설정과 최근 메시지를 구독한다 */
export function watchRoom(ctx: Ctx): void {
  let stops: Dispose[] = [];
  const onRoom = (code: string | null) => {
    stops.forEach((d) => d());
    stops = [];
    const b = box(ctx);
    b.seen = null;
    b.more = 0;
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
  if (text.length > MSG_MAX) throw new Error(`${MSG_MAX}자까지 보낼 수 있어요.`);
  // 끊긴 채 쓰면 이 PC에만 보낸 것처럼 보이다가 앱을 끄면 사라진다 (0033). 춤 명령과 날리기도 방으로 보내므로 함께 막는다
  if (!ctx.connection.online()) throw new Error(OFFLINE);
  const b = box(ctx);
  for (const fn of b.hooks) if (fn(text)) return;
  b.lastT = nextTime(ctx.clock.serverNow(), b.lastT);
  const uid = ctx.self.uid();
  const key = msgKey(b.lastT, uid);
  // 서버가 받기 전에 앱을 끄면 다음에 이 방에 들어올 때 보내지 못한 글로 보인다
  outbox(ctx, (out) => [...out, { room: code, key, text }].slice(-OUT_MAX));
  patch(ctx, { sending: [...view(ctx).sending, key] });
  try {
    // 규칙 거절 같은 서버 오류 원문은 기록에만 남기고 화면에는 다시 보내라는 안내만 보인다
    await ctx.server.room(code, ['msgs']).set(key, { uid, name: ctx.self.name().slice(0, NAME_MAX_LENGTH), text, at: SERVER_TIME, v: 1 }).catch((e: Error) => {
      ctx.log.warn(`채팅 보내기 실패: ${e.message}`);
      throw new Error('잠시 뒤에 다시 보내기를 눌러 주세요.');
    });
    if (view(ctx).code === code) flash(ctx, says, uid, short(text), SAY_MS);
  } finally {
    outbox(ctx, (out) => out.filter((o) => o.key !== key));
    patch(ctx, { sending: view(ctx).sending.filter((k) => k !== key) });
  }
}

export const addFailed = (ctx: Ctx, f: Failed): void => patch(ctx, { failed: [...view(ctx).failed, f] });
export const dropFailed = (ctx: Ctx, n: number): void => patch(ctx, { failed: view(ctx).failed.filter((_, i) => i !== n) });

/** 방 이벤트를 보내지 못한 까닭 (분당 한도나 끊김) */
const notSent = (ctx: Ctx): void => ctx.ui.toast(ctx.connection.online() ? '보내지 못했어요. 잠시 뒤에 다시 눌러 주세요.' : OFFLINE);

/** 이모티콘은 채팅이 꺼져 있어도 보낸다 (COM-08) */
export function sendEmoji(ctx: Ctx, e: string): void {
  if (!ctx.room.current()) return ctx.ui.toast(NOT_IN_ROOM);
  if (!ctx.room.emit('emoji', { e })) notSent(ctx);
}

export async function setChatOn(ctx: Ctx, code: string, on: boolean): Promise<void> {
  if (!ctx.connection.online()) throw new Error(OFFLINE);
  await ctx.server.room(code).set('cfg', { on, v: 1 });
}

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
  if (!ctx.connection.online()) throw new Error(OFFLINE);
  const file = await ctx.files.openImage();
  if (!file) return;
  const gif = String.fromCharCode(...file.bytes.subarray(0, 3)) === 'GIF';
  const bytes = gif && file.bytes.byteLength <= FILE_MAX_RAW_BYTES ? file.bytes : await ctx.files.prepareImage(file.bytes, { maxSide: MINE_SIDE });
  const hash = await ctx.files.upload(bytes);
  const { mine } = view(ctx);
  if (!mine.includes(hash)) saveMine(ctx, [...mine, hash].slice(-MINE_MAX));
}

export function removeMine(ctx: Ctx, hash: string): void {
  if (!ctx.connection.online()) return ctx.ui.toast(OFFLINE);
  saveMine(ctx, view(ctx).mine.filter((h) => h !== hash));
}

export function sendMine(ctx: Ctx, hash: string): void {
  if (!ctx.room.current()) return ctx.ui.toast(NOT_IN_ROOM);
  if (!ctx.room.emit('custom', { h: hash })) notSent(ctx);
}
