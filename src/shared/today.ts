// 서버 시각으로 잰 오늘 날짜를 주는 React 훅. 창을 자정 너머로 열어 두어도 날짜가 바뀌면 다시 그린다
import { useEffect, useState } from 'react';

interface Clocked { clock: { serverNow(): number }; timers: { every(ms: number, fn: () => void): () => void } }

/** dayOf로 잰 오늘. 1분마다 다시 재고 값이 바뀔 때만 다시 그린다 */
export function useToday(ctx: Clocked, dayOf: (ms: number) => string): string {
  const [day, setDay] = useState(() => dayOf(ctx.clock.serverNow()));
  useEffect(() => ctx.timers.every(60_000, () => setDay(dayOf(ctx.clock.serverNow()))), [ctx, dayOf]);
  return day;
}
