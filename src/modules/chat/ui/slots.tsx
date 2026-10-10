import { useState } from 'react';
import type { Ctx, SlotProps } from '@core/types';
import { useBlobUrl } from '@shared/blobUrl';
import { badge, EMOJIS, MINE_MAX } from '../logic';
import { addMine, removeMine, sendEmoji, sendMine, setChatOn, useChat, WINDOW } from '../state';
import css from './chat.module.css';

/** 상태칩의 💬와 안 읽은 수 (COM-02). 방에 있고 채팅이 켜져 있을 때만 보인다 */
export function ChatChip({ ctx, seat }: SlotProps) {
  const v = useChat(ctx);
  // 안 읽은 글이 있을 때만 보인다. 창 열기는 ▼ 메뉴에 있다
  if (!seat?.self || !v.code || !v.on || v.unread === 0) return null;
  return (
    <button className={css.pill} title="대화하기" onClick={() => ctx.ui.open(WINDOW)}>
      💬{v.unread > 0 && <span className={css.count}>{badge(v.unread)}</span>}
    </button>
  );
}

/** 방 설정 창의 채팅 켜기 (ROM-02). 방 설정 창은 주인에게만 이 슬롯을 그리고 규칙도 주인만 받는다 */
export function ChatSetting({ ctx }: SlotProps) {
  const { code, on } = useChat(ctx);
  if (!code) return null;
  return (
    <label>
      채팅 켜기
      <input type="checkbox" checked={on} onChange={(e) => void setChatOn(ctx, code, e.target.checked).catch((err: Error) => ctx.ui.toast(err.message))} />
    </label>
  );
}

/** 이모티콘 고르기 (COM-08). 대화하기 창과 이모티콘 창이 함께 쓴다. 아래 줄은 내가 등록한 그림 (COM-18) */
export function EmojiPicker({ ctx }: { ctx: Ctx }) {
  const { mine } = useChat(ctx);
  const [removing, setRemoving] = useState(false);
  const add = () => void addMine(ctx).catch((e: Error) => ctx.ui.toast(e.message));
  return (
    <>
      <div className={css.emojis}>
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => sendEmoji(ctx, e)}>
            {e}
          </button>
        ))}
      </div>
      <div className={css.emojis}>
        {mine.map((h) => (
          <button key={h} title={removing ? '이모티콘 빼기' : '내 이모티콘'} className={removing ? css.removing : undefined} onClick={() => (removing ? removeMine(ctx, h) : sendMine(ctx, h))}>
            <Pic ctx={ctx} hash={h} />
          </button>
        ))}
        {!removing && mine.length < MINE_MAX && <button title="이모티콘 추가" onClick={add}>＋</button>}
        {mine.length > 0 && <button className={css.wide} onClick={() => setRemoving(!removing)}>{removing ? '완료' : '빼기'}</button>}
      </div>
    </>
  );
}

function Pic({ ctx, hash }: { ctx: Ctx; hash: string }) {
  const url = useBlobUrl(hash, ctx.files.get);
  return url ? <img src={url} alt="" /> : null;
}
