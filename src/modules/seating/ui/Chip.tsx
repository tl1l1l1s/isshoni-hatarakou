import type { SlotProps } from '@core/types';
import { mineOf } from '../logic';
import css from './seating.module.css';

/** 남의 머리 위에 올라타 있거나 벤치에 앉아 있을 때만 보이는 내려오기와 일어나기 단추 */
export default function Chip({ ctx, seat }: SlotProps) {
  const m = mineOf(seat);
  const run = (id: string) => void ctx.commands.run(id).catch((e: Error) => ctx.ui.toast(e.message));
  return (
    <>
      {m.on && <button className={css.pill} onClick={() => run('seating.down')}>내려오기</button>}
      {m.bench && <button className={css.pill} onClick={() => run('seating.stand')}>일어나기</button>}
    </>
  );
}
