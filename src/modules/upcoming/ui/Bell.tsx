import type { SlotProps } from '@core/types';
import { useEntries } from '../state';
import css from './upcoming.module.css';

/** 상태칩의 🔔. 배지는 앞으로 7일 안의 일정 수 (HOM-22) */
export default function Bell({ ctx, seat }: SlotProps) {
  const n = useEntries(ctx).length;
  if (!seat?.self) return null;
  return (
    <button className={css.chip} title="다가오는 일정" onClick={() => ctx.ui.open('upcoming.main')}>
      🔔{n > 0 && <span className={css.badge}>{n > 9 ? '9+' : n}</span>}
    </button>
  );
}
