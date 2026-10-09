import { useEffect, useReducer } from 'react';
import type { SlotProps } from '@core/types';
import { leftOf, mmss, type Local } from '../logic';

/** 포커스 기록 창 서랍(focus.drawer)의 뽀모도로 단추. 돌고 있으면 남은 시간을 함께 보인다 */
export default function DrawerButton({ ctx }: SlotProps) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.timers.every(1000, redraw), [ctx]);
  const r = ctx.local.get<Local>('device').run;
  return <button onClick={() => ctx.ui.open('pomodoro.timer')}>뽀모도로{r ? ` ${mmss(leftOf(r, ctx.clock.now()))}` : ''}</button>;
}
