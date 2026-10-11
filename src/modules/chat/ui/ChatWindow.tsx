import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NOT_IN_ROOM, OFFLINE, type Ctx } from '@core/types';
import type {} from '@modules/account/api';
import { FONT_PX, FONT_SIZES, isSendKey, MSG_MAX, timeText, type FontSize } from '../logic';
import { addFailed, dropFailed, nameOf, offText, send, setOpen, useChat, view } from '../state';
import { EmojiPicker } from './slots';
import css from './chat.module.css';

/** 대화하기 창 (COM-01). 메시지는 글자로만 그린다 */
export default function ChatWindow({ ctx }: { ctx: Ctx }) {
  const v = useChat(ctx);
  // 창을 열 때 읽은 자리. 여기에 구분선을 긋는다 (COM-02)
  const [marker] = useState(() => view(ctx).lastRead);
  const [draft, setDraft] = useState('');
  // 보내지 못한 글(v.failed)은 그사이 새로 쓰는 글을 덮지 않도록 입력칸과 따로 두고 쓸 때 들어가 있던 방에서만 다시 보낸다
  const me = ctx.self.uid();
  // 이모티콘 고르기는 대화 목록 자리를 많이 차지해서 누를 때만 펼친다
  const [emoji, setEmoji] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const size = useSyncExternalStore(ctx.settings.onChange, () => ctx.settings.get<{ fontSize: FontSize }>().fontSize);

  useEffect(() => {
    setOpen(ctx, true);
    return () => setOpen(ctx, false);
  }, [ctx]);
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
  }, [v.items]);

  if (!v.code) return <p>{NOT_IN_ROOM}</p>;

  const trySend = (text: string) => {
    // 보내기 전에 방을 잡아 두어 늦게 실패해도 다른 방으로 다시 보내지 않는다
    const code = v.code!;
    void send(ctx, text, code).catch((e: Error) => addFailed(ctx, { text, error: e.message, code }));
  };
  const drop = (n: number) => dropFailed(ctx, n);
  const submit = () => {
    if (!draft.trim()) return;
    trySend(draft);
    setDraft('');
  };
  const sep = marker ? v.items.findIndex((i) => i.key > marker) : -1;
  const Photo = ctx.modules.get('account')?.Photo;

  return (
    <div className={css.window}>
      <label className={css.size}>
        채팅 글자 크기
        <select value={size} onChange={(e) => ctx.settings.set({ fontSize: e.target.value })}>
          {FONT_SIZES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </label>
      {v.on ? (
        <div ref={list} className={css.list} style={{ fontSize: FONT_PX[size] }}>
          {v.items.length === 0 && <p className={css.empty}>아직 대화가 없어요.</p>}
          {v.items.map((i, n) => {
            // 서버가 받기 전의 내 글은 흐리게 두고 시각 자리에 보내는 중을 쓴다
            const sending = v.sending.includes(i.key);
            return (
              <Fragment key={i.key}>
                {n === sep && <div className={css.sep}>여기까지 읽었어요</div>}
                <div className={css.msg} data-mine={i.value.uid === me || undefined} data-sending={sending || undefined}>
                  {/* 같은 사람이 이어 보낸 글에는 사진을 한 번만 두고 그 자리를 비워 줄을 맞춘다 */}
                  {Photo && (v.items[n - 1]?.value.uid !== i.value.uid ? <Photo uid={i.value.uid} size={18} /> : <span className={css.indent} />)}
                  {/* 둘째 줄부터 이름 아래에서 시작한다 */}
                  <span className={css.body}>
                    <strong>{nameOf(ctx, i.value)}</strong> <span className={css.text}>{i.value.text}</span> <time className={css.time}>{sending ? '보내는 중' : timeText(i.value.at)}</time>
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <p className={css.list}>{offText(ctx)}</p>
      )}
      <ctx.ui.Slot name="chat.toolbar" />
      {/* 채팅이 꺼져 있어도 이모티콘은 보낸다 (COM-08) */}
      {(emoji || !v.on) && <EmojiPicker ctx={ctx} />}
      {v.failed.map((f, n) => (
        <div key={n} role="alert" className={css.failed}>
          <span className={css.error}>{f.code !== v.code ? `${f.code} 방에서 보내지 못한 글이에요. 그 방에 다시 들어가면 보낼 수 있어요.` : f.error === OFFLINE ? f.error : `보내지 못했어요. ${f.error}`}</span>
          <span className={css.text}>{f.text}</span>
          <span className={css.row}>
            {f.code === v.code && (
              <button
                onClick={() => {
                  drop(n);
                  trySend(f.text);
                }}
              >
                다시 보내기
              </button>
            )}
            <button onClick={() => drop(n)}>버리기</button>
          </span>
        </div>
      ))}
      {v.on && (
        <div className={css.row}>
          <button className={css.toggle} aria-label="이모티콘" aria-expanded={emoji} onClick={() => setEmoji(!emoji)}>
            😊
          </button>
          <textarea
            className={css.input}
            rows={2}
            maxLength={MSG_MAX}
            placeholder="Enter로 보내기"
            aria-label="메시지"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (!isSendKey(e.nativeEvent)) return;
              e.preventDefault();
              submit();
            }}
          />
          <button type="submit" disabled={!draft.trim()} onClick={submit}>보내기</button>
        </div>
      )}
    </div>
  );
}
