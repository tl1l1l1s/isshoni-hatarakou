// 마이홈 상태와 동작. 상태는 ctx마다 따로 두어 시험에서 앱 여러 개를 한 프로세스에 띄워도 섞이지 않는다
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useBlobUrls } from '@shared/blobUrl';
import type { Ctx, Dispose } from '@core/types';
import type {} from '@modules/friends/api';
import type { HomeTab } from './api';
import { BOOK_PAGE, CLAP_KEY, fitsFile, GIFT_KEY, GIFT_PENDING_MAX, lastAt, mergeInbox, parseHome, parseShelf, SENDERS_MAX, type Book, type Gift, type Home, type Inbox, type Item, type Local, type Mark } from './logic';

export interface Visit { uid: string; name: string }
interface State extends Inbox { visit: Visit | null; tabs: HomeTab[]; limit: number }

const EMPTY: State = { visit: null, book: [], gifts: [], claps: 0, more: false, tabs: [], limit: BOOK_PAGE };
const stores = new WeakMap<Ctx, { s: State; subs: Set<() => void>; stop: Dispose | null }>();

function store(ctx: Ctx) {
  let x = stores.get(ctx);
  if (!x) stores.set(ctx, (x = { s: EMPTY, subs: new Set(), stop: null }));
  return x;
}

export function patch(ctx: Ctx, p: Partial<State>): void {
  const x = store(ctx);
  x.s = { ...x.s, ...p };
  x.subs.forEach((fn) => fn());
}

export function useHomeState(ctx: Ctx): State {
  const sub = useCallback((fn: () => void) => {
    const { subs } = store(ctx);
    subs.add(fn);
    return () => void subs.delete(fn);
  }, [ctx]);
  return useSyncExternalStore(sub, () => store(ctx).s);
}

/** 다른 모듈이 더하는 마이홈 탭 (home.tabs) */
export function addTab(ctx: Ctx, tab: HomeTab): Dispose {
  const order = (t: HomeTab) => t.order ?? 0;
  patch(ctx, { tabs: [...store(ctx).s.tabs.filter((t) => t.id !== tab.id), tab].sort((a, b) => order(a) - order(b)) });
  return () => patch(ctx, { tabs: store(ctx).s.tabs.filter((t) => t !== tab) });
}

/** 보낸 사람 색인 senders가 아직 없으면 받은 기록 전체를 한 번 읽어 만든다. 색인을 두기 전에 쌓인 기록을 위한 것이다 */
async function backfillSenders(ctx: Ctx): Promise<void> {
  const rows = await ctx.server.inbox().list({ limit: SENDERS_MAX });
  if (rows.length) await ctx.server.user().update('senders', Object.fromEntries(rows.map((r) => [r.key, true])));
}

/** owner 마이홈의 받은 기록을 보낸 사람마다 마지막 limit + 2개만 구독해 합친다 (HOM-09, HOM-14, HOM-15).
 *  방명록 글 키는 보낸 시각 13자리라 clap과 gift보다 앞에 놓여서 최근 글 limit개와 박수 수와 남은 선물이 함께 온다.
 *  보낸 사람은 주인의 친구만 될 수 있어서 친구 목록과 나를 본다. 주인은 기록을 본 사람을 색인 senders에 적어 두고 함께 보므로 친구를 끊은 사람의 기록도 남는다.
 *  ponytail: 방문자는 주인의 색인을 읽지 못해 주인의 친구 가운데 나와 친구가 아닌 사람이 남긴 글과 박수를 보지 못한다. 주인 색인을 읽게 되면 그 색인으로 바꾼다 */
export function watchInboxOf(ctx: Ctx, owner: string, limit: number, fn: (v: Inbox) => void): Dispose {
  const friends = ctx.modules.get('friends');
  const me = ctx.self.uid();
  const rows = new Map<string, Array<{ key: string; value: unknown }>>();
  const stops = new Map<string, Dispose>();
  let index: string[] = [];
  const sync = () => {
    const want = new Set([...index, ...(friends?.list() ?? []).map((f) => f.uid), me]);
    want.delete(owner);
    let gone = false;
    for (const [uid, stop] of stops) {
      if (want.has(uid)) continue;
      stop();
      stops.delete(uid);
      gone = rows.delete(uid) || gone;
    }
    for (const uid of want) {
      if (stops.has(uid)) continue;
      stops.set(uid, ctx.server.userOf(owner, ['in']).watchList(uid, { limit: limit + 2, last: true }, (items) => {
        rows.set(uid, items);
        fn(mergeInbox(rows, limit));
        if (owner === me && items.length && !index.includes(uid)) void ctx.server.user(['senders']).set(uid, true).catch(() => undefined);
      }));
    }
    // 더 보기로 다시 구독할 때 새 값이 오기 전까지는 보던 목록을 그대로 둔다
    if (gone) fn(mergeInbox(rows, limit));
  };
  const offs = [friends?.onChange(sync)];
  if (owner === me) {
    offs.push(ctx.server.user().watch<Record<string, true>>('senders', (v) => {
      index = Object.keys(v ?? {});
      if (!v) void backfillSenders(ctx).catch((e: Error) => ctx.log.warn(`보낸 사람 색인 만들기 실패: ${e.message}`));
      sync();
    }));
  }
  sync();
  return () => {
    offs.forEach((off) => off?.());
    stops.forEach((stop) => stop());
  };
}

/** 내 받은 기록을 구독해 방명록과 선물함과 박수 수를 채우고 새 선물이 오면 알린다. 이전 글 더 보기는 limit를 늘려 다시 구독한다 */
export function watchInbox(ctx: Ctx, limit = BOOK_PAGE): void {
  const x = store(ctx);
  x.stop?.();
  patch(ctx, { limit });
  x.stop = watchInboxOf(ctx, ctx.self.uid(), limit, (v) => {
    patch(ctx, v);
    const seen = ctx.local.get<Local>('account').giftSeen;
    const fresh = v.gifts.filter((g) => g.at > seen);
    if (!fresh.length) return;
    ctx.local.update<Local>('account', (s) => ({ ...s, giftSeen: lastAt(fresh, s.giftSeen) }));
    ctx.notify({
      title: '말랑이 선물',
      body: fresh.length > 1 ? `말랑이 선물 ${fresh.length}개가 왔어요.` : `${fresh[0]!.name}님이 말랑이를 보냈어요.`,
      onClick: () => openHome(ctx, null),
    });
  });
}

export function openHome(ctx: Ctx, visit: Visit | null): void {
  patch(ctx, { visit });
  ctx.ui.open('home.main');
}

/** uid의 마이홈 문서. 읽는 중이면 null, 읽지 못하면 error */
export function useHomeDoc(ctx: Ctx, uid: string): { home: Home | null; error: boolean } {
  const [state, setState] = useState<{ home: Home | null; error: boolean }>({ home: null, error: false });
  useEffect(() => {
    let stop: (() => void) | null = null;
    let alive = true;
    // 규칙이 막으면 watch는 아무것도 부르지 않으므로 get으로 먼저 확인한다
    ctx.server
      .userOf(uid)
      .get('home')
      .then(() => {
        if (alive) stop = ctx.server.userOf(uid).watch('home', (raw) => setState({ home: parseHome(raw), error: false }));
      })
      .catch(() => alive && setState({ home: null, error: true }));
    return () => {
      alive = false;
      stop?.();
    };
  }, [ctx, uid]);
  return state;
}

/** 마이홈의 방명록과 받은 박수 수. 내 마이홈이면 setup이 구독한 값을 쓴다. loadMore는 이전 글을 한 쪽 더 받는다 */
export function useInbox(ctx: Ctx, uid: string, mine: boolean): Inbox & { loadMore: () => void } {
  const own = useHomeState(ctx);
  const [limit, setLimit] = useState(BOOK_PAGE);
  const [other, setOther] = useState<Inbox>({ book: [], gifts: [], claps: 0, more: false });
  useEffect(() => (mine ? undefined : watchInboxOf(ctx, uid, limit, setOther)), [ctx, uid, mine, limit]);
  if (mine) return { ...own, loadMore: () => watchInbox(ctx, own.limit + BOOK_PAGE) };
  return { ...other, loadMore: () => setLimit((n) => n + BOOK_PAGE) };
}

/** 친구 마이홈에 박수 하나. 받은 기록의 내 칸 clap을 1 올린다 (HOM-15) */
export const sendClap = (ctx: Ctx, owner: string) => ctx.server.sendTo(owner).update('', { [CLAP_KEY]: { $inc: 1 } });

/** 북마크 책장. 주인은 전체 shelf를, 친구는 공개한 책만 담은 shelfPub를 읽는다 (HOM-11) */
export function useShelf(ctx: Ctx, uid: string, mine: boolean): Mark[] {
  const [list, setList] = useState<Mark[]>([]);
  useEffect(() => ctx.server.userOf(uid).watch(mine ? 'shelf' : 'shelfPub', (raw) => setList(parseShelf(raw))), [ctx, uid, mine]);
  return list;
}

/** 책장 전체와 공개본을 한 번에 쓴다 */
export const saveShelf = (ctx: Ctx, list: Mark[]) => ctx.server.user().update('', { shelf: list, shelfPub: list.filter((m) => m.pub) });

export async function writeBook(ctx: Ctx, owner: string, text: string): Promise<void> {
  const at = ctx.clock.serverNow();
  await ctx.server.sendTo(owner).set(String(at), { name: ctx.self.name().slice(0, 20), text, at });
}

export const removeBook = (ctx: Ctx, b: Item<Book>) => ctx.server.inbox([b.sender]).remove(b.id);

/** 받는 사람이 아직 받지 않은 내 선물이 GIFT_PENDING_MAX개면 보내지 않는다. 받은 기록을 읽는 양을 묶어 두려는 앱의 한도다 */
export async function sendGift(ctx: Ctx, to: string, file: string, msg: string): Promise<void> {
  const box = ctx.server.sendTo(to, [GIFT_KEY]);
  if ((await box.list({ limit: GIFT_PENDING_MAX })).length >= GIFT_PENDING_MAX) {
    throw new Error(`친구가 아직 받지 않은 선물이 ${GIFT_PENDING_MAX}개 있어요. 친구가 선물함을 비우면 다시 보낼 수 있어요.`);
  }
  const at = ctx.clock.serverNow();
  await box.set(String(at), { file, msg, name: ctx.self.name().slice(0, 20), at });
}

export const removeGift = (ctx: Ctx, g: Item<Gift>) => ctx.server.inbox([g.sender, GIFT_KEY]).remove(g.id);

/** 말랑이 목록만 바꾼다. 편집 중인 다른 칸은 건드리지 않는다 */
export const saveMallangi = (ctx: Ctx, list: string[]) => ctx.server.user().update('home', { mallangi: list, v: 1 });

/** 그림을 줄여 올리고 해시를 돌려준다. 줄여도 64KB를 넘으면 예외 (10.14의 13번) */
export async function putImage(ctx: Ctx, bytes: Uint8Array, maxSide: number): Promise<string> {
  const out = await ctx.files.prepareImage(bytes, { maxSide });
  if (!fitsFile(out.byteLength)) throw new Error('그림이 너무 커요. 더 작거나 단순한 그림을 넣어 주세요.');
  return ctx.files.upload(out);
}

export async function pickImage(ctx: Ctx, maxSide: number): Promise<string | null> {
  const f = await ctx.files.openImage();
  return f ? putImage(ctx, f.bytes, maxSide) : null;
}

/** 실패하면 안내 문장을 토스트로 띄운다 */
export const run = (ctx: Ctx, fn: () => Promise<unknown>) => void fn().catch((e: Error) => ctx.ui.toast(e.message));

/** 친구 목록과 이름. friends 모듈이 없으면 빈 목록 */
export function useFriends(ctx: Ctx): Visit[] {
  const friends = ctx.modules.get('friends');
  const [list, setList] = useState<Visit[]>([]);
  useEffect(() => {
    if (!friends) return;
    let alive = true;
    const load = () => {
      Promise.all(friends.list().map(async ({ uid }) => ({ uid, name: String((await ctx.users.profile(uid))?.name ?? '이름 없음') })))
        .then((l) => alive && setList(l))
        .catch((e: Error) => ctx.log.warn(`친구 이름 읽기 실패: ${e.message}`));
    };
    load();
    const off = friends.onChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [ctx, friends]);
  return list;
}

/** 해시마다 그림을 한 번 받아 blob URL을 기억한다. 창이 닫히면 URL을 돌려준다 */
export const useFiles = (ctx: Ctx, hashes: string[]) => useBlobUrls(hashes, ctx.files.get);
