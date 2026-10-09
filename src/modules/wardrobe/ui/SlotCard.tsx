import { useSyncExternalStore } from 'react';
import type { SlotProps } from '@core/types';
import { SLOT_COUNT } from '../logic';
import { wardrobeOf } from '../state';
import css from './wardrobe.module.css';

/** 런처 캐릭터 슬롯 카드. ◀ ▶로 쓸 캐릭터를 바꾼다 (AVT-15) */
export default function SlotCard({ ctx }: SlotProps) {
  const w = wardrobeOf(ctx);
  const { active } = useSyncExternalStore(w.subscribe, w.local);
  const go = (d: number) => void w.setActive((active + d + SLOT_COUNT) % SLOT_COUNT).catch((e: Error) => ctx.ui.toast(e.message));
  return (
    <div className={css.slotCard}>
      <button aria-label="이전 캐릭터" onClick={() => go(-1)}>◀</button>
      <span>캐릭터 ({active + 1}/{SLOT_COUNT})</span>
      <button aria-label="다음 캐릭터" onClick={() => go(1)}>▶</button>
    </div>
  );
}
