import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import type {} from '@modules/account/api';
import { FONT_PX, FONT_SIZES, isSendKey, MSG_MAX, timeText, type FontSize } from '../logic';
import { CHAT_OFF, NOT_IN_ROOM, send, setOpen, useChat, view } from '../state';
import { EmojiPicker } from './slots';
import css from './chat.module.css';

/** 대화하기 창 (COM-01). 메시지는 글자로만 그린다 */
export default function ChatWindow({ ctx }: { ctx: Ctx }) {
  const v = useChat(ctx);
  // 창을 열 때 읽은 자리. 여기에 구분선을 긋는다 (COM-02)
  const [marker] = useState(() => view(ctx).lastRead);
  const [draft, setDraft] = useState('');
  // 보내지 못한 글과 쓸 때 들어가 있던 방. 그사이 새로 쓰는 글을 덮지 않도록 입력칸과 따로 두고 그 방에서만 다시 보낸다
  const [failed, setFailed] = useState<Array<{ text: string; error: string; code: string }>>([]);
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
    void send(ctx, text, code).catch((e: Error) => setFailed((f) => [...f, { text, error: e.message, code }]));
  };
  const drop = (n: number) => setFailed((f) => f.filter((_, i) => i !== n));
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
          {v.items.map((i, n) => (
            <Fragment key={i.key}>
              {n === sep && <div className={css.sep}>여기까지 읽었습니다</div>}
              <div className={css.msg}>
                {/* 같은 사람이 이어 보낸 글에는 사진을 한 번만 두고 그 자리를 비워 줄을 맞춘다 */}
                {Photo && (v.items[n - 1]?.value.uid !== i.value.uid ? <Photo uid={i.value.uid} size={18} /> : <span className={css.indent} />)}{' '}
                <strong>{i.value.name || '이름 없음'}</strong> <span className={css.text}>{i.value.text}</span> <time className={css.time}>{timeText(i.value.at)}</time>
              </div>
            </Fragment>
          ))}
        </div>
      ) : (
        <p className={css.list}>{CHAT_OFF}</p>
      )}
      <ctx.ui.Slot name="chat.toolbar" />
      <EmojiPicker ctx={ctx} />
      {failed.map((f, n) => (
        <div key={n} role="alert" className={css.failed}>
          <span className={css.error}>{f.code === v.code ? `보내지 못했어요. ${f.error}` : `${f.code} 방에서 보내지 못한 글이에요. 그 방에 다시 들어가면 보낼 수 있어요.`}</span>
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
          <textarea
            className={css.input}
            rows={2}
            maxLength={MSG_MAX}
            placeholder="메시지 입력 후 Enter"
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
