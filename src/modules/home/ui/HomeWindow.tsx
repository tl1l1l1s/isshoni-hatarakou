import { Suspense, useEffect, useState } from 'react';
import type { Ctx } from '@core/types';
import { GIFT_MSG_MAX } from '../logic';
import { openHome, patch, run, sendGift, useFiles, useFriends, useHomeDoc, useHomeState, type Visit } from '../state';
import HomeView from './HomeView';
import css from './home.module.css';

/** 마이홈 창. [마이홈]은 내 마이홈이나 방문한 친구 마이홈, [친구]는 놀러 갈 친구 목록이고
 *  다른 모듈이 더한 탭(home.tabs)도 같은 주인의 것을 보여 준다 (HOM-01, HOM-10, HOM-16) */
export default function HomeWindow({ ctx }: { ctx: Ctx }) {
  const { visit, tabs } = useHomeState(ctx);
  const [tab, setTab] = useState('home');
  useEffect(() => setTab('home'), [visit]);
  const owner = visit?.uid ?? ctx.self.uid();
  const name = visit ? visit.name : ctx.self.name();
  const Extra = tabs.find((t) => t.id === tab)?.component;
  return (
    <div className={css.window}>
      <div className={css.row}>
        <nav className={css.tabs}>
          <button aria-pressed={tab === 'home'} onClick={() => setTab('home')}>마이홈</button>
          <button aria-pressed={tab === 'friends'} onClick={() => setTab('friends')}>친구</button>
          {tabs.map((t) => (
            <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {visit && (
          <>
            <span className={css.count}>{visit.name || '친구'}님의 마이홈에 놀러 왔어요.</span>
            <button onClick={() => patch(ctx, { visit: null })}>내 마이홈으로</button>
          </>
        )}
      </div>
      {tab === 'friends' ? (
        <FriendsTab ctx={ctx} />
      ) : Extra ? (
        // 다른 모듈의 탭은 처음 열 때 불러올 수 있다
        <Suspense fallback={<p className={css.hint}>불러오는 중이에요.</p>}>
          <Extra key={owner} owner={owner} name={name} mine={!visit} />
        </Suspense>
      ) : (
        <HomeView key={owner} ctx={ctx} uid={owner} name={name} />
      )}
    </div>
  );
}

/** 친구 마이홈 방문과 말랑이 선물 (HOM-10, HOM-14) */
function FriendsTab({ ctx }: { ctx: Ctx }) {
  const friends = useFriends(ctx);
  const { home } = useHomeDoc(ctx, ctx.self.uid());
  const mallangi = home?.mallangi ?? [];
  const files = useFiles(ctx, mallangi);
  const [to, setTo] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  if (!ctx.modules.get('friends')) return <p className={css.hint}>친구 기능이 꺼져 있어요.</p>;
  if (!friends.length) return <p className={css.hint}>아직 친구가 없어요. 친구를 등록하면 여기에서 친구 마이홈에 놀러 갈 수 있어요.</p>;

  const open = (f: Visit) => {
    setTo(to === f.uid ? null : f.uid);
    setPick(null);
    setMsg('');
  };
  const send = (f: Visit, file: string) =>
    run(ctx, async () => {
      await sendGift(ctx, f.uid, file, msg.trim());
      ctx.ui.toast(`${f.name}님에게 말랑이를 보냈어요.`);
      setTo(null);
    });

  return (
    <ul className={css.friends}>
      {friends.map((f) => (
        <li key={f.uid}>
          <div className={css.row}>
            <b>{f.name}</b>
            <span className={css.grow} />
            <button onClick={() => openHome(ctx, f)}>마이홈 보기</button>
            <button aria-pressed={to === f.uid} onClick={() => open(f)}>말랑이 선물</button>
          </div>
          {to === f.uid &&
            (mallangi.length ? (
              <div className={css.giftForm}>
                <div className={css.cells}>
                  {mallangi.map((h, i) => (
                    <button key={i} className={css.thumb} aria-pressed={pick === i} onClick={() => setPick(i)}>
                      {files[h] && <img src={files[h]} alt="" />}
                    </button>
                  ))}
                </div>
                <div className={css.row}>
                  <input maxLength={GIFT_MSG_MAX} value={msg} aria-label="함께 보낼 말" placeholder={`함께 보낼 말 (${GIFT_MSG_MAX}자)`} onChange={(e) => setMsg(e.target.value)} />
                  <button disabled={pick === null} onClick={() => send(f, mallangi[pick!]!)}>보내기</button>
                </div>
              </div>
            ) : (
              <p className={css.hint}>먼저 마이홈의 말랑이 관리에서 말랑이를 만들어 주세요.</p>
            ))}
        </li>
      ))}
    </ul>
  );
}
