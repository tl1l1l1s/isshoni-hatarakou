// 우편함과 확성기 상태. 우편함 창, 마이홈 탭, 상태칩, 말풍선이 같은 ctx로 읽는다
import { useCallback, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import { noteItem, parsePosts, POSTS_MAX, READ_MAX, Shout, shoutLeft, sortPosts, type Item } from './logic';
import { NOTES } from './notes';

export interface Local { read: string[] }

interface Snap { all: Item[]; mine: Item[]; read: string[] }
interface Store { snap: Snap; shout: Shout | null; subs: Set<() => void> }
const stores = new WeakMap<Ctx, Store>();

function store(ctx: Ctx): Store {
  let s = stores.get(ctx);
  if (!s) stores.set(ctx, (s = { snap: { all: [], mine: [], read: [] }, shout: null, subs: new Set() }));
  return s;
}

function patch(ctx: Ctx, p: Partial<Snap>): void {
  const s = store(ctx);
  s.snap = { ...s.snap, ...p };
  s.subs.forEach((fn) => fn());
}

export function useMail(ctx: Ctx): Snap {
  const sub = useCallback((fn: () => void) => {
    const { subs } = store(ctx);
    subs.add(fn);
    return () => void subs.delete(fn);
  }, [ctx]);
  return useSyncExternalStore(sub, () => store(ctx).snap);
}

/** 우편함에 보일 글: 전체 글, 내 우편, 앱에 든 업데이트 소식 */
export const postsOf = (s: Snap): Item[] => sortPosts([...s.all, ...s.mine, ...NOTES.map(noteItem)]);

/** 읽지 않은 글 수. 업데이트 소식은 켤 때 창으로 보여 주므로 세지 않는다 */
export const unreadOf = (s: Snap): number => [...s.all, ...s.mine].filter((p) => !s.read.includes(p.id)).length;

export function markRead(ctx: Ctx, ids: string[]): void {
  const read = store(ctx).snap.read;
  if (ids.every((id) => read.includes(id))) return;
  ctx.local.update<Local>('account', (l) => ({ read: [...new Set([...l.read, ...ids])].slice(-READ_MAX) }));
  patch(ctx, { read: ctx.local.get<Local>('account').read });
}

export function start(ctx: Ctx): void {
  patch(ctx, { read: ctx.local.get<Local>('account').read });
  // ponytail: 최근 POSTS_MAX개만 구독한다. 고정한 옛 글도 그 밖이면 보이지 않는다
  ctx.server.global().watchList('posts', { limit: POSTS_MAX, last: true }, (rows) => patch(ctx, { all: parsePosts(rows) }));
  ctx.server.user().watchList('mail', { limit: POSTS_MAX, last: true }, (rows) => patch(ctx, { mine: parsePosts(rows) }));
  // 확성기: 받을 때와 끝날 때 말풍선을 다시 그린다. 늦게 켠 PC는 남은 시간만큼 본다
  ctx.server.global().watch('shout', (v) => {
    const r = Shout.safeParse(v);
    store(ctx).shout = r.success ? r.data : null;
    ctx.seats.refresh();
    const left = shoutLeft(store(ctx).shout, ctx.clock.serverNow());
    if (left) ctx.timers.at(left, () => ctx.seats.refresh());
  });
}

/** 지금 보일 확성기 글 */
export function shoutText(ctx: Ctx): string | null {
  const s = store(ctx).shout;
  return s && shoutLeft(s, ctx.clock.serverNow()) > 0 ? s.text : null;
}
