import { useState, useSyncExternalStore } from 'react';
import type { SlotProps } from '@core/types';
import { SLOT_COUNT } from '../logic';
import { fullRow, setSoloRow, type Solo } from '../solo';
import { wardrobeOf } from '../state';
import css from './wardrobe.module.css';

/** 설정 창의 자리 추가 탭 (AVT-22). 혼자 모드에서 내 다른 캐릭터를 옆자리에 앉히고 순서를 바꾼다 */
export default function SoloTab({ ctx }: SlotProps) {
  const w = wardrobeOf(ctx);
  const l = useSyncExternalStore(w.subscribe, w.local);
  const room = useSyncExternalStore((fn) => ctx.room.onChange(fn), () => ctx.room.current());
  const [row, setRow] = useState(() => ctx.local.get<Solo>('device').row);
  const full = fullRow(row, l.active);
  const save = (next: number[]) => {
    setSoloRow(ctx, next);
    setRow(next);
  };
  const swap = (k: number, d: number) => {
    const next = [...full];
    [next[k], next[k + d]] = [next[k + d]!, next[k]!];
    save(next);
  };
  const rest = Array.from({ length: SLOT_COUNT }, (_, i) => i).filter((i) => !full.includes(i));
  return (
    <div>
      <p>방에 들어가지 않았을 때 내 다른 캐릭터를 옆자리에 함께 앉혀요. 방에 들어가면 숨었다가 방에서 나오면 다시 앉아요.</p>
      {room && <p className={css.hint}>지금은 방에 있어서 숨겨 두었어요.</p>}
      <h4>앉은 순서</h4>
      <ol className={css.trash}>
        {full.map((i, k) => (
          <li key={i}>
            <span>캐릭터 {i + 1}{i === l.active ? ' (지금 캐릭터)' : ''}</span>
            <span>
              <button disabled={k === 0} aria-label={`캐릭터 ${i + 1} 왼쪽으로`} onClick={() => swap(k, -1)}>◀</button>
              <button disabled={k === full.length - 1} aria-label={`캐릭터 ${i + 1} 오른쪽으로`} onClick={() => swap(k, 1)}>▶</button>
              {i !== l.active && <button onClick={() => save(full.filter((x) => x !== i))}>빼기</button>}
            </span>
          </li>
        ))}
      </ol>
      {rest.length > 0 && <h4>더 앉힐 캐릭터</h4>}
      {rest.map((i) => (
        <button key={i} disabled={l.chars[i]!.mtime === 0} onClick={() => save([...full, i])}>캐릭터 {i + 1} 앉히기</button>
      ))}
      {rest.some((i) => l.chars[i]!.mtime === 0) && <p className={css.hint}>빈 캐릭터는 캐릭터 만들기에서 저장한 뒤에 앉힐 수 있어요.</p>}
    </div>
  );
}
