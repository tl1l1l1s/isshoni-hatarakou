import { useState } from 'react';
import type { Ctx } from '@core/types';
import { CAPS } from '../logic';
import { useRoom } from '../state';
import css from './rooms.module.css';

/** 방 주인만 여는 방 설정 창 (OUR-01). 다른 모듈은 rooms.settings 슬롯에 구역을 넣는다 */
export default function SettingsWindow({ ctx }: { ctx: Ctx }) {
  const room = useRoom(ctx);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const code = room.code;
  if (!code || !room.owner) return <p>방 주인만 방 설정을 바꿀 수 있습니다.</p>;

  const setCap = (cap: number) => ctx.server.room(code).set('cfg', { cap, v: 1 }).catch((e: Error) => setMsg(e.message));
  const remove = () =>
    ctx.commands.run('rooms.remove').then(
      () => ctx.ui.close('rooms.settings'),
      (e: Error) => setMsg(e.message),
    );

  return (
    <div>
      <p className={css.muted}>{code} 방</p>
      <label>
        정원
        <select value={room.cap} onChange={(e) => void setCap(Number(e.target.value))}>
          {/* 지금 있는 사람 수보다 작게는 줄이지 않는다 */}
          {CAPS.filter((n) => n >= Math.min(room.count, room.cap)).map((n) => (
            <option key={n} value={n}>
              {n}명
            </option>
          ))}
        </select>
      </label>
      <ctx.ui.Slot name="rooms.settings" />
      <hr />
      {confirm ? (
        <>
          <p>방을 지우면 되돌릴 수 없고 모두 방에서 나갑니다. 지울까요?</p>
          <div className={css.row}>
            <button onClick={() => void remove()}>지우기</button>
            <button onClick={() => setConfirm(false)}>취소</button>
          </div>
        </>
      ) : (
        <button onClick={() => setConfirm(true)}>방 지우기</button>
      )}
      {msg && <p role="alert" className={css.error}>{msg}</p>}
    </div>
  );
}
