import type { SlotProps } from '@core/types';
import { useEntries } from '../state';

/** 상태칩의 🔔. 앞으로 7일 안에 일정이 있을 때만 보이고 배지는 그 수 (HOM-22). 창은 이 단추와 오늘 일정 알림으로만 연다 */
export default function Bell({ ctx, seat }: SlotProps) {
  const n = useEntries(ctx).length;
  if (!seat?.self || n === 0) return null;
  return (
    <button title="다가오는 일정" aria-label={`다가오는 일정 ${n}개`} onClick={() => ctx.ui.open('upcoming.main')}>
      🔔<span data-unread>{n > 9 ? '9+' : n}</span>
    </button>
  );
}
