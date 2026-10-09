import type { SlotProps } from '@core/types';

/** 포커스 기록 창 서랍(focus.drawer)의 달성표 단추 */
export default function DrawerButton({ ctx }: SlotProps) {
  return <button onClick={() => ctx.ui.open('goals.week')}>달성표</button>;
}
