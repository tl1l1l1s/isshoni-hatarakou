import { useState } from 'react';
import type { Ctx, SlotProps } from '@core/types';
import { TAGS, type Item, type Tag } from '../logic';
import { markRead, postsOf, unreadOf, useMail } from '../state';
import css from './notice.module.css';

const date = (at: number) => new Date(at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

/** 우편함 (ACC-09, OPS-01). 전체, 공지, 업데이트, 우편 탭과 전체 읽음. 글을 펼치면 읽음이 된다 */
export default function MailBox({ ctx }: { ctx: Ctx }) {
  const snap = useMail(ctx);
  const [tab, setTab] = useState<Tag | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const all = postsOf(snap);
  const posts = all.filter((p) => tab === 'all' || p.tag === tab);
  const toggle = (p: Item) => {
    setOpen(open === p.id ? null : p.id);
    markRead(ctx, [p.id]);
  };
  return (
    <div>
      <div className={css.bar}>
        <nav>
          <button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>전체</button>
          {(Object.keys(TAGS) as Tag[]).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{TAGS[t]}</button>
          ))}
        </nav>
        <button disabled={!unreadOf(snap)} onClick={() => markRead(ctx, all.map((p) => p.id))}>전체 읽음</button>
      </div>
      {posts.length === 0 ? (
        <p className={css.hint}>받은 글이 없어요.</p>
      ) : (
        <ul className={css.list}>
          {posts.map((p) => {
            const unread = !p.id.startsWith('note:') && !snap.read.includes(p.id);
            return (
              <li key={p.id} className={unread ? css.unread : undefined}>
                <button className={css.head} aria-expanded={open === p.id} onClick={() => toggle(p)}>
                  {unread && <span className={css.dot} aria-label="읽지 않음" />}
                  <span className={css.tag}>{p.pin ? `고정 ${TAGS[p.tag]}` : TAGS[p.tag]}</span>
                  <span className={css.title}>{p.title}</span>
                  <span className={css.when}>{date(p.at)}</span>
                </button>
                {open === p.id && (
                  <div className={css.body}>
                    {p.body}
                    {p.link && (
                      <p>
                        <button onClick={() => void ctx.shell.openExternal(p.link!).catch(() => ctx.ui.toast('링크를 열지 못했어요.'))}>링크 열기</button>
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 상태칩 줄의 ✉. 읽지 않은 글이 있을 때만 보이고 누르면 우편함 창을 연다 */
export function MailChip({ ctx, seat }: SlotProps) {
  const n = unreadOf(useMail(ctx));
  if (!seat?.self || !n) return null;
  return (
    <button className={css.chip} title="우편함" onClick={() => ctx.ui.open('notice.main')}>
      ✉<span className={css.badge}>{n > 9 ? '9+' : n}</span>
    </button>
  );
}
