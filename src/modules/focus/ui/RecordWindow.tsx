import { useEffect, useReducer } from 'react';
import type { Ctx } from '@core/types';
import { live } from '../live';
import { hms, labelOf, type App } from '../logic';
import css from './focus.module.css';

/** 포커스 기록 창 (FOC-03). 1초마다 다시 그린다. 아래 서랍(focus.drawer)에 뽀모도로와 달성표 같은 단추가 붙는다 */
export default function RecordWindow({ ctx }: { ctx: Ctx }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.timers.every(1000, redraw), [ctx]);
  const api = live.api;
  if (!api) return null;
  const byApp = api.todayByApp();
  const apps = ctx.local.get<App[]>('device').filter((a) => a !== null);
  const shrink = () => {
    ctx.ui.open('focus.mini');
    ctx.ui.close('focus.record');
  };
  return (
    <div>
      <div className={css.head}>
        <span>지금 이어서 작업한 시간</span>
        <button onClick={shrink}>작게 보기</button>
      </div>
      <div className={css.big}>{hms(live.streakSec)}</div>
      <table className={css.table}>
        <tbody>
          <tr><th align="left">오늘</th><td align="right">{hms(api.todaySec())}</td></tr>
          <tr><th align="left">누적</th><td align="right">{hms(api.totalSec())}</td></tr>
          {apps.map((a) => (
            <tr key={a.key}>
              <td>{a.label || labelOf(a.key)}</td>
              <td align="right">{hms(byApp[a.key] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {apps.length === 0 && <p>설정의 집중 앱 탭에서 앱을 등록해 주세요.</p>}
      <div className={css.drawer}>
        <ctx.ui.Slot name="focus.drawer" />
      </div>
    </div>
  );
}
