// D-day 상태. 내 카드는 setup에서 구독해 탭과 다가오는 일정 창이 함께 쓴다
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import { CARD_MAX, parseCards, type Row } from './logic';

interface Store { mine: Row[]; subs: Set<() => void> }
const stores = new WeakMap<Ctx, Store>();

function store(ctx: Ctx): Store {
  let s = stores.get(ctx);
  if (!s) stores.set(ctx, (s = { mine: [], subs: new Set() }));
  return s;
}

export function watchCards(ctx: Ctx): void {
  const s = store(ctx);
  ctx.server.user().watchList('cards', { limit: CARD_MAX }, (rows) => {
    s.mine = parseCards(rows);
    s.subs.forEach((fn) => fn());
    ctx.bus.emit('dday.changed', null);
  });
}

export const myCards = (ctx: Ctx): Row[] => store(ctx).mine;

/** 탭에 보여 줄 카드. 내 것이면 전체, 친구 방문이면 그 친구가 공개한 것만 */
export function useCards(ctx: Ctx, owner: string, mine: boolean): Row[] {
  const s = store(ctx);
  const sub = useCallback((fn: () => void) => {
    s.subs.add(fn);
    return () => void s.subs.delete(fn);
  }, [s]);
  const own = useSyncExternalStore(sub, () => s.mine);
  const [other, setOther] = useState<Row[]>([]);
  useEffect(() => (mine ? undefined : ctx.server.userOf(owner).watchList('pub', { limit: CARD_MAX }, (rows) => setOther(parseCards(rows)))), [ctx, owner, mine]);
  return mine ? own : other;
}
