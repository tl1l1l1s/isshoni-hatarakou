import { useState } from 'react';
import type { Ctx } from '@core/types';
import { useBlobUrl } from '@shared/blobUrl';
import { dayStart, ITEM_NAME_MAX } from '../logic';
import { addItem } from '../state';
import css from './gacha.module.css';

export const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 그림 해시를 blob URL로 보여 준다. hidden이면 물음표만 */
export function Pic({ ctx, file, hidden = false }: { ctx: Ctx; file: string; hidden?: boolean }) {
  const url = useBlobUrl(hidden ? null : file, ctx.files.get);
  return <span className={css.pic}>{url ? <img src={url} alt="" /> : '?'}</span>;
}

/** 아이템 넣기. 방 주인과 넣기를 허락받은 멤버가 쓴다 */
export function AddItem({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState('');
  const [w, setW] = useState(10);
  // 기간 한정 (GCH-04). 날짜 칸 값이고 비우면 그쪽 끝이 없다
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const ok = name.trim().length > 0 && Number.isInteger(w) && w >= 1 && w <= 100 && !(from && until && until < from);
  const add = async () => {
    setBusy(true);
    setMsg('');
    try {
      // 끝 날은 그날 하루를 포함하므로 다음 날 시작까지 뽑힌다
      const period = { ...(from && { from: dayStart(from) }), ...(until && { until: dayStart(until) + 86_400_000 }) };
      if (await addItem(ctx, name.trim(), w, period)) {
        setName('');
        setMsg('아이템을 넣었습니다.');
      }
    } catch (e) {
      setMsg(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className={css.add}>
      <legend>아이템 넣기</legend>
      <label>
        이름
        <input value={name} maxLength={ITEM_NAME_MAX} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        가중치 (1부터 100)
        <input type="number" min={1} max={100} value={w} onChange={(e) => setW(Number(e.target.value))} />
      </label>
      <label>
        기간 한정 시작 (선택)
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        기간 한정 끝 (선택)
        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
      </label>
      <p className={css.muted}>배경이 투명한 PNG를 권장합니다. 큰 그림은 앱이 줄여서 저장합니다. 기간을 정하면 그 기간에만 뽑힙니다.</p>
      <button disabled={busy || !ok} onClick={() => void add()}>
        그림 고르고 넣기
      </button>
      {msg && <p role="status" className={css.muted}>{msg}</p>}
    </fieldset>
  );
}
