import { useState } from 'react';
import type { Ctx } from '@core/types';
import { SERVER_TIME } from '@shared/constants';
import css from './report.module.css';

export const TEXT_MAX = 1000;

/** 버그제보 탭. 글은 선물하는 사람에게만 가고 진단 기록은 폴더를 열어 메신저로 보낸다 (OPS-03, NFR-21) */
export default function ReportTab({ ctx }: { ctx: Ctx }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    ctx.server
      .user(['r'])
      .set(String(ctx.clock.serverNow()), { text: body, ver: ctx.app.version, at: SERVER_TIME, v: 1 })
      .then(
        () => {
          setText('');
          setMsg('보냈어요. 답장은 우편함으로 와요.');
        },
        (e: Error) => {
          ctx.log.warn(`버그 제보 보내기 실패: ${e.message}`);
          setMsg('보내지 못했어요. 잠시 뒤에 다시 해 주세요.');
        },
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className={css.form}>
      <p className={css.hint}>이상한 점이나 바라는 점을 적어 보내 주세요. 선물한 사람만 읽어요.</p>
      <textarea
        rows={6}
        maxLength={TEXT_MAX}
        value={text}
        placeholder="언제 무엇을 했는데 어떻게 됐는지 적어 주세요"
        onChange={(e) => (setText(e.target.value), setMsg(null))}
      />
      <div>
        <button type="submit" disabled={busy || !text.trim()} onClick={send}>보내기</button>
      </div>
      {msg && <p role="status">{msg}</p>}
      <p className={css.hint}>진단 기록을 부탁받으면 폴더를 열고 안의 파일을 메신저로 보내 주세요.</p>
      <div>
        <button onClick={() => void ctx.commands.run('core.openLogFolder').catch(() => setMsg('폴더를 열지 못했어요.'))}>진단 기록 폴더 열기</button>
      </div>
    </div>
  );
}
