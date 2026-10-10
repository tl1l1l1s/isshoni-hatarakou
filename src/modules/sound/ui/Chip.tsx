import type { SlotProps } from '@core/types';
import { usePlayer } from '../state';
import css from './sound.module.css';

/** 상태칩의 플레이리스트 단추 (SND-01). 재생 중일 때만 보이고 창 열기는 ▼ 메뉴에 있다 */
export default function Chip({ ctx, seat }: SlotProps) {
  const { playing } = usePlayer(ctx);
  if (!seat?.self || !playing) return null;
  return (
    <button className={css.chip} title="플레이리스트" onClick={() => ctx.ui.open('sound.player')}>
      ♫
    </button>
  );
}
