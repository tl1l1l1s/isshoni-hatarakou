import { useEffect, useReducer } from 'react';
import type { Ctx } from '@core/types';
import { live } from '../live';
import { hms } from '../logic';
import css from './focus.module.css';

/** 기록 미니 창 (FOC-04). 지금 이어서 작업한 시간과 오늘 합계만 보이고 크게 보기로 포커스 기록 창에 돌아간다 */
export default function MiniWindow({ ctx }: { ctx: Ctx }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.timers.every(1000, redraw), [ctx]);
  const api = live.api;
  if (!api) return null;
  const grow = () => {
    ctx.ui.open('focus.record');
    ctx.ui.close('focus.mini');
  };
  return (
    <div className={css.mini}>
      <table className={css.table}>
        <tbody>
          <tr><th align="left">현재</th><td align="right">{hms(live.streakSec)}</td></tr>
          <tr><th align="left">오늘</th><td align="right">{hms(api.todaySec())}</td></tr>
        </tbody>
      </table>
      <button onClick={grow}>크게 보기</button>
    </div>
  );
}
