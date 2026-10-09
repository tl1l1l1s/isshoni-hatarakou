import { useState } from 'react';
import { isRoomCode, normalizeCode } from '@shared/codes';
import type { Ctx } from '@core/types';
import { CAPS, type Local } from '../logic';
import { createRoom, joinRoom, useRoom } from '../state';
import css from './rooms.module.css';

/** 방 만들기와 참여하기 창 (ROM-05, ROM-06) */
export default function JoinWindow({ ctx }: { ctx: Ctx }) {
  const room = useRoom(ctx);
  const [cap, setCap] = useState(4);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const run = async (job: () => Promise<string | null>) => {
    setBusy(true);
    setMsg(null);
    setMsg(await job());
    setBusy(false);
  };
  const join = (raw: string) => {
    const code = normalizeCode(raw);
    void run(async () => (isRoomCode(code) ? joinRoom(ctx, code) : '방 코드 6자를 다시 확인해 주세요.'));
  };
  const copy = () =>
    ctx.shell.copy(room.code ?? '').then(
      () => setCopied(room.code),
      () => setMsg('복사하지 못했습니다. 코드를 직접 알려 주세요.'),
    );
  const note = msg && <p role="alert" className={css.error}>{msg}</p>;

  if (room.code) {
    return (
      <div>
        <p className={css.muted}>지금 들어가 있는 방</p>
        <p className={css.code}>{room.code}</p>
        <div className={css.row}>
          <button onClick={() => void copy()}>{copied === room.code ? '복사했습니다' : '코드 복사'}</button>
          <span>
            {room.count}명 / 정원 {room.cap}명
          </span>
        </div>
        <div className={css.row}>
          <button onClick={() => void ctx.commands.run('rooms.leave')}>방에서 나가기</button>
          {room.owner && <button onClick={() => ctx.ui.open('rooms.settings')}>방 설정</button>}
        </div>
        {note}
      </div>
    );
  }

  const recent = ctx.local.get<Local>('account').recent;
  return (
    <div>
      <h4>새 방 만들기</h4>
      <div className={css.row}>
        <label>
          정원
          <select value={cap} onChange={(e) => setCap(Number(e.target.value))}>
            {CAPS.map((n) => (
              <option key={n} value={n}>
                {n}명
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={() => void run(() => createRoom(ctx, cap))}>
          만들기
        </button>
      </div>
      <h4>코드로 참여하기</h4>
      <form
        className={css.row}
        onSubmit={(e) => {
          e.preventDefault();
          join(input);
        }}
      >
        <input autoFocus placeholder="예: 7Q2K9M" maxLength={8} value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" disabled={busy}>
          참여
        </button>
      </form>
      {note}
      {recent.length > 0 && (
        <>
          <h4>최근 방</h4>
          <div className={css.row}>
            {recent.map((c) => (
              <button key={c} disabled={busy} onClick={() => join(c)}>
                {c}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
