// 스케줄러 상태. 내 일정과 친구 공개 일정을 setup에서 구독해 탭과 다가오는 일정 창이 함께 쓴다
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Ctx, Dispose } from '@core/types';
import type {} from '@modules/friends/api';
import type { PlanItem } from './api';
import { LIST_MAX, parsePlans, type Row } from './logic';

interface Store { mine: Row[]; friends: Map<string, PlanItem[]>; subs: Set<() => void> }
const stores = new WeakMap<Ctx, Store>();

function store(ctx: Ctx): Store {
  let s = stores.get(ctx);
  if (!s) stores.set(ctx, (s = { mine: [], friends: new Map(), subs: new Set() }));
  return s;
}

function changed(ctx: Ctx, s: Store) {
  s.subs.forEach((fn) => fn());
  ctx.bus.emit('scheduler.changed', null);
}

export function items(ctx: Ctx): PlanItem[] {
  const s = store(ctx);
  const me = ctx.self.uid();
  return [...s.mine.map(({ id, date, title }) => ({ id, owner: me, who: '', date, title })), ...[...s.friends.values()].flat()];
}

/** 친구의 공개 일정. 규칙이 막으면(아직 나를 친구로 등록하지 않음) 구독하지 않는다.
 *  권한은 첫 항목 하나만 읽어 확인한다. 공개 일정 전체를 미리 받지 않는다 */
function watchFriend(ctx: Ctx, s: Store, uid: string): Dispose {
  let stop: Dispose | null = null;
  let alive = true;
  void Promise.all([ctx.server.userOf(uid, ['pub']).list({ limit: 1 }), ctx.users.profile(uid)])
    .then(([, p]) => {
      if (!alive) return;
      const who = String(p?.name ?? '친구');
      stop = ctx.server.userOf(uid).watchList('pub', { limit: LIST_MAX, last: true }, (rows) => {
        s.friends.set(uid, parsePlans(rows).map(({ id, date, title }) => ({ id, owner: uid, who, date, title })));
        changed(ctx, s);
      });
    })
    .catch(() => undefined);
  return () => {
    alive = false;
    stop?.();
    s.friends.delete(uid);
  };
}

export function watchPlans(ctx: Ctx): void {
  const s = store(ctx);
  ctx.server.user().watchList('ev', { limit: LIST_MAX, last: true }, (rows) => {
    s.mine = parsePlans(rows);
    changed(ctx, s);
  });
  const friends = ctx.modules.get('friends');
  if (!friends) return;
  const on = new Map<string, Dispose>();
  const sync = (list: Array<{ uid: string }>) => {
    for (const [uid, off] of on) {
      if (list.some((f) => f.uid === uid)) continue;
      off();
      on.delete(uid);
    }
    for (const { uid } of list) if (!on.has(uid)) on.set(uid, watchFriend(ctx, s, uid));
    changed(ctx, s);
  };
  sync(friends.list());
  friends.onChange(sync);
}

/** 탭에 보여 줄 일정. 내 것이면 setup이 구독한 전체, 친구 방문이면 그 친구가 공개한 것만 */
export function usePlans(ctx: Ctx, owner: string, mine: boolean): Row[] {
  const s = store(ctx);
  const sub = useCallback((fn: () => void) => {
    s.subs.add(fn);
    return () => void s.subs.delete(fn);
  }, [s]);
  const own = useSyncExternalStore(sub, () => s.mine);
  const [other, setOther] = useState<Row[]>([]);
  useEffect(
    () => (mine ? undefined : ctx.server.userOf(owner).watchList('pub', { limit: LIST_MAX, last: true }, (rows) => setOther(parsePlans(rows)))),
    [ctx, owner, mine],
  );
  return mine ? own : other;
}
