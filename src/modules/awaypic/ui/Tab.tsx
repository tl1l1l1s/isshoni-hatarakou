import { useState } from 'react';
import type { Ctx, SlotProps } from '@core/types';
import { useBlobUrl } from '@shared/blobUrl';
import { MAX_SIDE, SIZES, type Local } from '../logic';
import css from './awaypic.module.css';

const SIZE_WORD: Record<Local['size'], string> = { 60: '작게', 80: '보통', 100: '크게' };

/** 설정 창의 자리비움 그림 탭 (CHR-07) */
export default function Tab({ ctx }: SlotProps) {
  const [pic, setPic] = useState(() => ctx.local.get<Local>('account'));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = (next: Local) => ctx.commands.run('awaypic.set', next).then(() => setPic(next));
  const pick = async () => {
    setBusy(true);
    setMsg('');
    try {
      const f = await ctx.files.openImage();
      if (!f) return;
      const file = await ctx.files.upload(await ctx.files.prepareImage(f.bytes, { maxSide: MAX_SIDE }));
      await save({ ...pic, file });
      setMsg('그림을 등록했어요.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p>자리비움이면 캐릭터 대신 이 그림이 서요.</p>
      <div className={css.preview}>{pic.file ? <Preview ctx={ctx} file={pic.file} size={pic.size} /> : <span className={css.hint}>그림 없음</span>}</div>
      <div className={css.row}>
        <button disabled={busy} onClick={() => void pick()}>그림 등록</button>
        <button disabled={busy || !pic.file} onClick={() => void save({ ...pic, file: null }).then(() => setMsg('그림을 뺐어요. 자리비움이어도 캐릭터가 그대로 서요.'))}>그림 빼기</button>
      </div>
      <label>
        크기
        <select value={pic.size} onChange={(e) => void save({ ...pic, size: Number(e.target.value) as Local['size'] })}>
          {SIZES.map((s) => (
            <option key={s} value={s}>{SIZE_WORD[s]} ({s}px)</option>
          ))}
        </select>
      </label>
      <p className={css.hint}>배경이 투명한 PNG를 권장해요. 큰 그림은 앱이 줄여서 저장해요.</p>
      {msg && <p role="status" className={css.hint}>{msg}</p>}
    </div>
  );
}

/** 고른 크기로 그려 크기마다 달라 보이게 한다. 상자(120px)는 가장 큰 크기보다 크다 */
function Preview({ ctx, file, size }: { ctx: Ctx; file: string; size: number }) {
  const url = useBlobUrl(file, ctx.files.get);
  return url ? <img src={url} alt="등록한 자리비움 그림" style={{ width: size, height: size }} /> : null;
}
