import type { SlotProps } from '@core/types';
import css from './sound.module.css';

/** 상태칩의 플레이리스트 단추 (SND-01) */
export default function Chip({ ctx, seat }: SlotProps) {
  if (!seat?.self) return null;
  return (
    <button className={css.chip} title="플레이리스트" onClick={() => ctx.ui.open('sound.player')}>
      ♫
    </button>
  );
}
