// 친구 목록과 받은 기록, 서버 동작. 창도 같은 ctx를 받으므로 상태는 ctx마다 하나 둔다
import { useCallback, useSyncExternalStore } from 'react';
import type { z } from 'zod';
import { NOT_IN_ROOM, type Ctx, type Dispose } from '@core/types';
import { Entry, FRIEND_CODE_LENGTH, FRIEND_MAX, friendCodeOf, INBOX_MAX, plan, profileView, Slot, type Effect } from './logic';

export interface Snap {
  /** 처음 받기 전에는 null */
  list: Record<string, Entry> | null;
  inbox: Record<string, Slot> | null;
  /** 내가 보내고 아직 답이 없는 신청 */
  sent: Record<string, { name: string }>;
}

interface Store { snap: Snap; subs: Set<() => void>; done: Set<string>; watching: Map<string, Dispose> }
const stores = new WeakMap<Ctx, Store>();

function store(ctx: Ctx): Store {
  let s = stores.get(ctx);
  if (!s) stores.set(ctx, (s = { snap: { list: null, inbox: null, sent: {} }, subs: new Set(), done: new Set(), watching: new Map() }));
  return s;
}

export const snap = (ctx: Ctx): Snap => store(ctx).snap;
export const isFriend = (ctx: Ctx, uid: string): boolean => uid in (snap(ctx).list ?? {});

export function subscribe(ctx: Ctx, fn: () => void): Dispose {
  const s = store(ctx);
  s.subs.add(fn);
  return () => void s.subs.delete(fn);
}

export function useFriends(ctx: Ctx): Snap {
  const sub = useCallback((fn: () => void) => subscribe(ctx, fn), [ctx]);
  return useSyncExternalStore(sub, () => snap(ctx));
}

function patch(ctx: Ctx, p: Partial<Snap>): void {
  const s = store(ctx);
  s.snap = { ...s.snap, ...p };
  s.subs.forEach((fn) => fn());
}

/** 처음이면 true (같은 알림이나 답장을 두 번 하지 않는다) */
function once(ctx: Ctx, key: string): boolean {
  const { done } = store(ctx);
  return !done.has(key) && Boolean(done.add(key));
}

/** 형식이 맞지 않는 항목은 버린다 */
const parsed = <T>(schema: z.ZodType<T>, items: Array<{ key: string; value: unknown }>): Record<string, T> =>
  Object.fromEntries(items.flatMap(({ key, value }) => {
    const r = schema.safeParse(value);
    return r.success ? [[key, r.data]] : [];
  }));

async function apply(ctx: Ctx, e: Effect): Promise<void> {
  const { server } = ctx;
  if (e.kind === 'befriend') await server.user(['list']).set(e.uid, { since: e.since, v: 1 });
  else if (e.kind === 'reply') await server.sendTo(e.uid).set('ok', { at: ctx.clock.serverNow() });
  else if (e.kind === 'unsend') await server.sendTo(e.uid).remove('req');
  else await (e.item ? server.inbox([e.uid]).remove(e.item) : server.inbox().remove(e.uid));
}

const nameOf = async (ctx: Ctx, uid: string) => profileView(await ctx.users.profile(uid).catch(() => null)).name ?? '친구';

/** 받은 기록을 칸마다 plan대로 처리한다. 목록과 받은 기록을 둘 다 받은 뒤에만 돈다 */
async function syncInbox(ctx: Ctx): Promise<void> {
  const { list, inbox } = snap(ctx);
  if (!list || !inbox) return;
  for (const [uid, slot] of Object.entries(inbox)) {
    try {
      const requested = slot.ok ? (await ctx.server.sendTo(uid).get('req')) !== null : false;
      const p = plan(uid, slot, { friend: uid in list, requested, now: ctx.clock.serverNow() });
      for (const e of p.effects) {
        if (e.kind === 'reply' && !once(ctx, `reply:${uid}:${slot.req!.at}`)) continue;
        await apply(ctx, e);
        if (e.kind === 'befriend') ctx.ui.toast(`${await nameOf(ctx, uid)}님과 친구가 됐어요.`);
      }
      // 받은 신청은 앱을 켤 때와 올 때 친구창을 열어 보여 준다 (FRD-02)
      if (p.request && once(ctx, `req:${uid}:${p.request.at}`)) ctx.ui.open('friends.main');
      const inv = p.invite;
      if (inv && once(ctx, `inv:${uid}:${inv.at}`)) {
        const body = `${inv.name}님이 ${inv.room} 방으로 초대했어요.`;
        ctx.ui.toast(body);
        ctx.notify({ title: '친구 초대', body, onClick: () => ctx.ui.open('friends.main') });
      }
    } catch (err) {
      ctx.log.warn(`받은 기록 처리 실패 (${uid}): ${(err as Error).message}`);
    }
  }
}

export function start(ctx: Ctx): void {
  // 한 번에 하나만 돌리고 도는 동안 바뀌면 끝난 뒤 한 번 더 돈다
  let running = false;
  let again = false;
  const sync = async () => {
    if (running) return void (again = true);
    running = true;
    do {
      again = false;
      await syncInbox(ctx);
    } while (again);
    running = false;
  };
  // ponytail: 친구 FRIEND_MAX명, 받은 칸 INBOX_MAX개까지만 구독한다. 넘으면 나머지는 보이지 않는다
  ctx.server.user().watchList('list', { limit: FRIEND_MAX }, (items) => {
    patch(ctx, { list: parsed(Entry, items) });
    void sync();
  });
  ctx.server.inbox().watchList('', { limit: INBOX_MAX }, (items) => {
    patch(ctx, { inbox: parsed(Slot, items) });
    void sync();
  });
}

/** 받은 신청 수락: 내 목록에 더하고 ok를 보낸다. 신청은 신청한 쪽 앱이 확인한 뒤 지운다 */
export async function accept(ctx: Ctx, uid: string): Promise<void> {
  const req = snap(ctx).inbox?.[uid]?.req;
  if (req) once(ctx, `reply:${uid}:${req.at}`);
  await apply(ctx, { kind: 'befriend', uid, since: ctx.clock.serverNow() });
  await apply(ctx, { kind: 'reply', uid });
}

export const decline = (ctx: Ctx, uid: string): Promise<void> => apply(ctx, { kind: 'drop', uid, item: null });

/** 내 목록에서만 지운다. 상대 목록에는 내가 남는다 */
export const unfriend = (ctx: Ctx, uid: string): Promise<void> => ctx.server.user(['list']).remove(uid);

/** 친구 신청 (FRD-02, ROM-11). 상대가 먼저 신청해 두었으면 바로 수락한다. 화면에 보여 줄 글을 돌려준다 */
export async function request(ctx: Ctx, uid: string, name: string): Promise<string> {
  if (uid === ctx.self.uid()) return '나에게는 친구 신청을 할 수 없어요.';
  if (isFriend(ctx, uid)) return `${name}님은 이미 친구예요.`;
  if (snap(ctx).inbox?.[uid]?.req) {
    await accept(ctx, uid);
    return `${name}님과 친구가 됐어요.`;
  }
  await ctx.server.sendTo(uid).set('req', { name: ctx.self.name(), at: ctx.clock.serverNow() });
  track(ctx, uid, name);
  return `${name}님에게 친구 신청을 보냈어요.`;
}

/** 보낸 신청을 상대 받은 기록에서 지켜보다가 지워지면 뺀다. 상대가 수락하면 내 앱이 지우고 거절하면 상대가 지운다.
 *  ponytail: 이 실행 동안만 기억한다. 앱을 다시 켜면 기다리는 신청이 친구창에서 빠지고 좌석 메뉴에 친구 신청이 다시 보인다 */
function track(ctx: Ctx, uid: string, name: string): void {
  const s = store(ctx);
  s.watching.get(uid)?.();
  patch(ctx, { sent: { ...s.snap.sent, [uid]: { name } } });
  const stop = ctx.server.sendTo(uid).watch('req', (v) => v === null && untrack(ctx, uid));
  if (uid in s.snap.sent) s.watching.set(uid, stop);
  else stop();
}

function untrack(ctx: Ctx, uid: string): void {
  const s = store(ctx);
  s.watching.get(uid)?.();
  s.watching.delete(uid);
  if (!(uid in s.snap.sent)) return;
  const { [uid]: _, ...rest } = s.snap.sent;
  patch(ctx, { sent: rest });
}

/** 보낸 신청 취소 */
export async function cancel(ctx: Ctx, uid: string): Promise<void> {
  await ctx.server.sendTo(uid).remove('req');
  untrack(ctx, uid);
}

export async function requestByCode(ctx: Ctx, input: string): Promise<string> {
  const code = friendCodeOf(input);
  if (!code) return `친구 코드 ${FRIEND_CODE_LENGTH}자를 다시 확인해 주세요.`;
  const uid = await ctx.users.byFriendCode(code);
  if (!uid) return '이 코드의 친구를 찾지 못했어요.';
  return request(ctx, uid, await nameOf(ctx, uid));
}

/** 지금 있는 방으로 부른다 (FRD-04). 상대 목록에 내가 없으면 규칙이 막는다 */
export async function invite(ctx: Ctx, uid: string, name: string): Promise<string> {
  const room = ctx.room.current();
  if (!room) return NOT_IN_ROOM;
  try {
    await ctx.server.sendTo(uid).set('inv', { room, name: ctx.self.name(), at: ctx.clock.serverNow() });
    return `${name}님을 ${room} 방으로 초대했어요.`;
  } catch {
    return `${name}님을 초대하지 못했어요. 상대도 나를 친구로 두고 있어야 해요.`;
  }
}

/** 초대에 답한다. 답하면 초대를 지우고 들어가지 못하면 이유를 돌려준다 */
export async function answer(ctx: Ctx, uid: string, join: boolean): Promise<string | null> {
  const inv = snap(ctx).inbox?.[uid]?.inv;
  await apply(ctx, { kind: 'drop', uid, item: 'inv' });
  if (!join || !inv) return null;
  const r = await ctx.room.join(inv.room);
  return r.ok ? null : r.reason;
}
