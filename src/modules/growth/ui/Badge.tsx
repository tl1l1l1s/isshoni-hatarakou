import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SlotProps } from '@core/types';
import { leftText, levelText, MAX_LEVEL, SECONDS_PER_LEVEL, tierOf } from '../logic';
import css from './badge.module.css';

/** 광택이 다시 지나가는 간격. 광택은 한 번 지나가고 멈춘다 (perf-1) */
const SWEEP_MS = 5 * 60_000;

/** 이름표 안의 레벨과 경험치 바 (CHR-02). 내 좌석의 m은 setMine이 바로 채운 로컬 값이다.
 *  2회차부터는 별을 붙이고(GRW-04) 평생 레벨로 티어를 정한다(GRW-07) */
export default function Badge({ ctx, seat }: SlotProps) {
  const hidden = useSyncExternalStore(ctx.mode.on, () => ctx.mode.get() === 'hidden');
  const [sweep, setSweep] = useState(0);
  const lv = seat?.m.growth?.lv;
  const xp = seat?.m.growth?.xp;
  const rd = seat?.m.growth?.rd;
  const round = typeof rd === 'number' ? rd : 1;
  const tier = typeof lv === 'number' ? tierOf(round >= 2 ? MAX_LEVEL : lv, ctx.tunables.get<number[]>('tierLevels')) : 0;
  // 잠들었거나 자리를 비웠거나 화면을 숨기면 광택을 멈춰 그리기를 쉰다
  const still = hidden || seat?.state === 'away' || seat?.m.focus?.awake === false;
  // 도는 애니메이션은 투명 실행 화면을 매 프레임 다시 그리게 한다. 광택은 한 번만 지나가고 깨어 있는 동안 5분마다 다시 붙여 지나가게 한다
  useEffect(() => (tier >= 5 && !still ? ctx.timers.every(SWEEP_MS, () => setSweep((n) => n + 1)) : undefined), [ctx, tier, still]);
  if (typeof lv !== 'number') return null;
  const pct = typeof xp === 'number' ? xp : 0;
  const next = `다음 레벨까지 집중 ${leftText(((100 - pct) * SECONDS_PER_LEVEL) / 100)} 남음`;
  return (
    <span className={css.badge} data-tier={tier} data-still={still} title={round >= 2 ? `${round}회차, ${next}` : next}>
      <span key={sweep} className={css.num}>{levelText(round, lv)}</span>
      <span className={css.bar}>
        <span className={css.fill} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
