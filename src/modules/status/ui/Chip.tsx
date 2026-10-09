import type { SlotProps } from '@core/types';
import { statusText } from '../logic';
import css from './status.module.css';

/** 상태칩의 지금 상태. 고른 글이 없으면 상태 고르기 단추만 보인다. 상태 색은 이름표의 네모가 보여 준다 (CHR-10) */
export default function Chip({ ctx, seat }: SlotProps) {
  if (!seat?.self) return null;
  const text = statusText(seat.m.status?.text);
  return (
    <button className={css.pill} title="상태 고르기" onClick={() => ctx.ui.open('status.pick')}>
      {text ?? '상태'}
    </button>
  );
}
