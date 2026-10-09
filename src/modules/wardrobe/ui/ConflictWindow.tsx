import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import { wardrobeOf } from '../state';
import css from './conflict.module.css';

/** 같은 캐릭터를 이 PC와 다른 PC에서 다르게 바꿨을 때 어느 쪽으로 맞출지 고르는 창 (ACC-13) */
export default function ConflictWindow({ ctx }: { ctx: Ctx }) {
  const w = wardrobeOf(ctx);
  const list = useSyncExternalStore(w.subscribe, w.conflicts);
  const { chars } = useSyncExternalStore(w.subscribe, w.local);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!list.length) ctx.ui.close('wardrobe.conflict');
  }, [ctx, list.length]);
  const pick = (slot: number, keepLocal: boolean) => {
    setBusy(true);
    w.resolve(slot, keepLocal)
      .catch((e: Error) => ctx.ui.toast(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div>
      <p>같은 캐릭터를 이 PC와 다른 PC에서 다르게 바꿨어요. 어느 쪽으로 맞출지 골라 주세요.</p>
      <p className={css.hint}>고르지 않은 쪽은 캐릭터 만들기의 이전 모습에 10일 동안 남아요.</p>
      {list.map((c) => (
        <fieldset key={c.slot}>
          <legend>캐릭터 {c.slot + 1}</legend>
          <div className={css.pair}>
            <figure>
              <ctx.ui.CharacterPreview appearance={chars[c.slot]!.appearance} width={120} height={150} />
              <figcaption>이 PC</figcaption>
            </figure>
            <figure>
              <ctx.ui.CharacterPreview appearance={c.remote.appearance} width={120} height={150} />
              <figcaption>다른 PC</figcaption>
            </figure>
          </div>
          <div className={css.pair}>
            <button disabled={busy} onClick={() => pick(c.slot, true)}>현재 PC로 맞추기</button>
            <button disabled={busy} onClick={() => pick(c.slot, false)}>다른 PC로 맞추기</button>
          </div>
        </fieldset>
      ))}
    </div>
  );
}
