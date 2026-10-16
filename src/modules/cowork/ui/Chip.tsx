import { useEffect, useReducer } from 'react';
import type { SlotProps } from '@core/types';
import { minutesLeft, phaseOf } from '../logic';
import { joined, useView, WIN } from '../state';

/** 상태칩의 같이 작업 칩. 방에 진행 중인 세션이 있을 때만 보이고 참여 중이면 남은 분이 붙는다 (ROM-15) */
export default function Chip({ ctx, seat }: SlotProps) {
  const v = useView(ctx);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.timers.every(1000, redraw), [ctx]);
  if (!seat?.self || !v.cur) return null;
  const now = ctx.clock.serverNow();
  const { phase, end } = phaseOf(v.cur, now);
  if (phase === 'done') return null;
  const text = joined(v, ctx.self.uid()) && (phase === 'focus' || phase === 'break') ? `같이 ${minutesLeft(end, now)}분` : '같이 작업';
  return (
    <button title="같이 작업하기" onClick={() => ctx.ui.open(WIN)}>
      {text}
    </button>
  );
}
