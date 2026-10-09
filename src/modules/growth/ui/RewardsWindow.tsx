import { useEffect, useReducer } from 'react';
import type { Ctx } from '@core/types';
import { isReward, levelOf, levelText, roundOf, xpOf } from '../logic';
import css from './rewards.module.css';

const per = (sec: number) => (sec % 3600 === 0 ? `${sec / 3600}시간` : `${Math.round(sec / 60)}분`);

/** 레벨 보상 표 (GRW-02). 보상은 다른 모듈이 growth의 level에 선언한 gate이고 열렸는지와 남은 레벨을 보여 준다 */
export default function RewardsWindow({ ctx }: { ctx: Ctx }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.gates.onChange(redraw), [ctx]);
  useEffect(() => ctx.timers.every(5000, redraw), [ctx]);
  const spl = ctx.tunables.get<number>('secondsPerLevel');
  const total = ctx.modules.get('focus')!.totalSec();
  const life = levelOf(total, spl);
  const { round, level } = roundOf(total, spl);
  const rows = ctx.gates
    .list()
    .filter(isReward)
    .sort((a, b) => (a.need ?? Infinity) - (b.need ?? Infinity));
  return (
    <div>
      <h3>
        {levelText(round, level)}
        {round >= 2 && <span className={css.muted}> {round}회차</span>}
      </h3>
      <p className={css.muted}>
        다음 레벨까지 {100 - Math.floor(xpOf(total, spl) * 100)}% 남았어요. 집중 {per(spl)}마다 1레벨씩 올라요.
      </p>
      {rows.length ? (
        <table className={css.table}>
          <thead>
            <tr><th align="left">레벨</th><th align="left">보상</th><th align="right">상태</th></tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} data-open={g.open}>
                <td>Lv.{g.need ?? '?'}</td>
                <td>{g.label ?? g.id}</td>
                <td align="right">{g.open ? '열림' : g.need ? `${g.need - life}레벨 남음` : '잠김'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>아직 레벨로 여는 보상이 없어요.</p>
      )}
      <p className={css.muted}>Lv.999 다음에는 회차가 넘어가 별이 붙고 레벨이 1부터 다시 올라요. 열린 보상은 그대로 남아요.</p>
    </div>
  );
}
