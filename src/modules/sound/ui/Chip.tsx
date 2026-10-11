import type { SlotProps } from '@core/types';
import { usePlayer } from '../state';

/** 상태칩의 플레이리스트 단추 (SND-01). 재생 중일 때만 보이고 창 열기는 ▼ 메뉴에 있다.
 *  이름은 ▼ 메뉴의 플레이리스트 항목과 겹치지 않게 지금 상태로 짓는다 */
export default function Chip({ ctx, seat }: SlotProps) {
  const { playing } = usePlayer(ctx);
  if (!seat?.self || !playing) return null;
  return (
    <button title="플레이리스트" aria-label="음악 재생 중" onClick={() => ctx.ui.open('sound.player')}>
      ♫
    </button>
  );
}
