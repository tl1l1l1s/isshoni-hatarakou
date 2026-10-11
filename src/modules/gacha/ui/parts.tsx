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

/** 아이템 넣기. 방 주인과 넣기를 허락받은 멤버가 쓴다. folded면 제목을 눌러 펼치는 접힌 칸으로 그린다 (방 설정) */
export function AddItem({ ctx, folded = false }: { ctx: Ctx; folded?: boolean }) {
  const [name, setName] = useState('');
  const [w, setW] = useState(10);
  // 기간 한정 (GCH-04). 날짜 칸 값이고 비우면 그쪽 끝이 없다
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // 넣기 단추가 꺼진 까닭. 없으면 빈 글
  const why = !name.trim() ? '이름을 적어 주세요.'
    : !(Number.isInteger(w) && w >= 1 && w <= 100) ? '가중치는 1부터 100까지예요.'
    : from && until && until < from ? '끝 날짜가 시작 날짜보다 빨라요.'
    : '';
  // 다음 아이템을 적기 시작하면 지난 안내를 지운다
  const change = <T,>(set: (v: T) => void, v: T) => {
    set(v);
    setMsg('');
  };
  const add = async () => {
    setBusy(true);
    setMsg('');
    try {
      // 끝 날은 그날 하루를 포함하므로 다음 날 시작까지 뽑힌다
      const period = { ...(from && { from: dayStart(from) }), ...(until && { until: dayStart(until) + 86_400_000 }) };
      if (await addItem(ctx, name.trim(), w, period)) {
        setName('');
        setW(10);
        setFrom('');
        setUntil('');
        setMsg('아이템을 넣었어요.');
      }
    } catch (e) {
      setMsg(message(e));
    } finally {
      setBusy(false);
    }
  };
  const fields = (
    <>
      <label>
        이름
        <input value={name} maxLength={ITEM_NAME_MAX} onChange={(e) => change(setName, e.target.value)} />
      </label>
      <label>
        가중치 (1부터 100)
        <input type="number" min={1} max={100} value={w} onChange={(e) => change(setW, Number(e.target.value))} />
      </label>
      <label>
        기간 시작 (선택)
        <input type="date" value={from} onChange={(e) => change(setFrom, e.target.value)} />
      </label>
      <label>
        기간 끝 (선택)
        <input type="date" value={until} onChange={(e) => change(setUntil, e.target.value)} />
      </label>
      <p className={css.muted}>배경이 투명한 PNG가 좋아요.</p>
      <p className={css.muted}>기간을 정하면 그 기간에만 뽑혀요.</p>
      <button disabled={busy || !!why} onClick={() => void add()}>
        그림 고르고 넣기
      </button>
      {(msg || why) && <p role="status" className={css.muted}>{msg || why}</p>}
    </>
  );
  return folded ? (
    <details className={css.add}>
      <summary>아이템 넣기</summary>
      {fields}
    </details>
  ) : (
    <fieldset className={css.add}>
      <legend>아이템 넣기</legend>
      {fields}
    </fieldset>
  );
}
