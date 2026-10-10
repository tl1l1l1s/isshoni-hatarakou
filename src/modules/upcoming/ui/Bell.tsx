import type { SlotProps } from '@core/types';
import { useEntries } from '../state';
import css from './upcoming.module.css';

/** 상태칩의 🔔. 앞으로 7일 안에 일정이 있을 때만 보이고 배지는 그 수 (HOM-22). 창 열기는 ▼ 메뉴에도 있다 */
export default function Bell({ ctx, seat }: SlotProps) {
  const n = useEntries(ctx).length;
  if (!seat?.self || n === 0) return null;
  return (
    <button className={css.chip} title="다가오는 일정" onClick={() => ctx.ui.open('upcoming.main')}>
      🔔{n > 0 && <span className={css.badge}>{n > 9 ? '9+' : n}</span>}
    </button>
  );
}
