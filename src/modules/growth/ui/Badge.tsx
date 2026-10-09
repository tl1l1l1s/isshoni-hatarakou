import { useSyncExternalStore } from 'react';
import type { SlotProps } from '@core/types';
import { levelText, MAX_LEVEL, tierOf } from '../logic';
import css from './badge.module.css';

/** 이름표 안의 레벨과 경험치 바 (CHR-02). 내 좌석의 m은 setMine이 바로 채운 로컬 값이다.
 *  2회차부터는 별을 붙이고(GRW-04) 평생 레벨로 티어를 정한다(GRW-07) */
export default function Badge({ ctx, seat }: SlotProps) {
  const hidden = useSyncExternalStore(ctx.mode.on, () => ctx.mode.get() === 'hidden');
  const lv = seat?.m.growth?.lv;
  const xp = seat?.m.growth?.xp;
  const rd = seat?.m.growth?.rd;
  if (typeof lv !== 'number') return null;
  const pct = typeof xp === 'number' ? xp : 0;
  const round = typeof rd === 'number' ? rd : 1;
  const tier = tierOf(round >= 2 ? MAX_LEVEL : lv, ctx.tunables.get<number[]>('tierLevels'));
  const next = `다음 레벨까지 ${100 - pct}%`;
  // 잠들었거나 자리를 비웠거나 화면을 숨기면 광택을 멈춰 그리기를 쉰다
  const still = hidden || seat?.state === 'away' || seat?.m.focus?.awake === false;
  return (
    <span className={css.badge} data-tier={tier} data-still={still} title={round >= 2 ? `${round}회차, ${next}` : next}>
      <span className={css.num}>{levelText(round, lv)}</span>
      <span className={css.bar}>
        <span className={css.fill} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
