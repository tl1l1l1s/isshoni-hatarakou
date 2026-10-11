import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { AccountPresence, Ctx } from '@core/types';
import { plan, profileView, type Local } from '../logic';
import { accept, answer, cancel, decline, invite, rememberName, requestByCode, unfriend, useFriends } from '../state';
import css from './friends.module.css';

type Run = (job: () => Promise<string | null>) => void;

function useMyRoom(ctx: Ctx): string | null {
  const sub = useCallback((fn: () => void) => ctx.room.onChange(() => fn()), [ctx]);
  return useSyncExternalStore(sub, () => ctx.room.current());
}

/** 친구창 (FRD-01 내 코드와 코드로 신청, FRD-02 받은 신청, FRD-03 목록, FRD-04 받은 초대) */
export default function FriendsWindow({ ctx }: { ctx: Ctx }) {
  const { list, inbox, sent } = useFriends(ctx);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const code = ctx.self.friendCode();
  const [hidden, setHidden] = useState(() => ctx.settings.get<{ appearOffline: boolean }>().appearOffline);
  useEffect(() => ctx.settings.onChange((v) => setHidden(v.appearOffline === true)), [ctx]);

  const run: Run = (job) => {
    setBusy(true);
    setMsg(null);
    job()
      .then(setMsg, (e: Error) => {
        ctx.log.warn(`친구창 동작 실패: ${e.message}`);
        setMsg('요청을 보내지 못했어요. 잠시 뒤에 다시 눌러 주세요.');
      })
      .finally(() => setBusy(false));
  };

  const friends = Object.keys(list ?? {});
  const now = ctx.clock.serverNow();
  const slots = Object.entries(inbox ?? {}).map(([uid, slot]) => ({ uid, ...plan(uid, slot, { friend: friends.includes(uid), requested: false, now }) }));

  return (
    <div>
      <h4>내 친구 코드</h4>
      {/* 프로필을 아직 받지 못했으면(오프라인으로 시작) 코드가 없다 */}
      {code ? (
        <div className={css.row}>
          <span className={css.code}>{code}</span>
          <button
            onClick={() =>
              void ctx.shell.copy(code).then(
                () => ctx.ui.toast('친구 코드를 복사했어요.'),
                () => ctx.ui.toast('복사하지 못했어요. 코드를 직접 알려 주세요.'),
              )
            }
          >
            코드 복사
          </button>
        </div>
      ) : (
        <p className={css.muted}>연결되면 친구 코드가 보여요.</p>
      )}
      <form
        className={css.row}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => requestByCode(ctx, input));
        }}
      >
        <input placeholder="친구 코드 8자" maxLength={16} value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" disabled={busy || !input.trim()}>
          친구 신청
        </button>
      </form>
      {msg && <p role="status" className={css.muted}>{msg}</p>}

      {slots.map(({ uid, invite: inv }) =>
        inv && (
          <div key={`inv:${uid}`} className={css.card}>
            <span>{inv.name}님이 {inv.room} 방으로 초대했어요.</span>
            <div className={css.row}>
              <button disabled={busy} onClick={() => run(() => answer(ctx, uid, true))}>들어가기</button>
              <button disabled={busy} onClick={() => run(() => answer(ctx, uid, false))}>무시</button>
            </div>
          </div>
        ),
      )}
      {slots.map(({ uid, request: req }) =>
        req && (
          <div key={`req:${uid}`} className={css.card}>
            <span>{req.name}님이 친구 신청을 보냈어요.</span>
            <div className={css.row}>
              <button disabled={busy} onClick={() => run(() => accept(ctx, uid).then(() => `${req.name}님과 친구가 됐어요.`))}>수락</button>
              <button disabled={busy} onClick={() => run(() => decline(ctx, uid).then(() => null))}>거절</button>
            </div>
          </div>
        ),
      )}

      {Object.entries(sent).map(([uid, s]) => (
        <div key={`sent:${uid}`} className={css.card}>
          <span>{s.name}님의 수락을 기다리는 중이에요.</span>
          <div className={css.row}>
            <button disabled={busy} onClick={() => run(() => cancel(ctx, uid).then(() => null))}>신청 취소</button>
          </div>
        </div>
      ))}

      {/* 목록을 받기 전에는 친구가 없는 것처럼 보이지 않게 한다 */}
      {list === null ? (
        <p className={css.muted}>친구 목록을 불러오는 중이에요.</p>
      ) : (
        <>
          <h4>친구 {friends.length}명</h4>
          {friends.length === 0 ? (
            <p className={css.muted}>아직 친구가 없어요.</p>
          ) : (
            <ul className={css.list}>
              {friends.map((uid) => (
                <Friend key={uid} ctx={ctx} uid={uid} pending={uid in (inbox ?? {})} busy={busy} run={run} />
              ))}
            </ul>
          )}
        </>
      )}
      <label>
        친구에게 오프라인으로 보이기
        <input type="checkbox" checked={hidden} onChange={(e) => ctx.settings.set({ appearOffline: e.target.checked })} />
      </label>
    </div>
  );
}

function Friend({ ctx, uid, pending, busy, run }: { ctx: Ctx; uid: string; pending: boolean; busy: boolean; run: Run }) {
  // undefined는 접속 기록을 아직 받지 못한 것, null은 기록이 없는 것
  const [p, setP] = useState<AccountPresence | null | undefined>(undefined);
  // undefined는 프로필을 아직 읽지 못한 것. 끊긴 동안은 연결될 때까지 기다린다
  const [who, setWho] = useState<ReturnType<typeof profileView>>();
  const [asking, setAsking] = useState(false);
  const mine = useMyRoom(ctx);

  // 상대가 나를 목록에 넣어야 m이 보이므로 다시 구독한다. 상대가 수락을 확인하면 내 받은 기록의 그 사람 칸이 비므로 pending으로 알 수 있다
  useEffect(() => ctx.users.watchPresence(uid, setP), [ctx, uid, pending]);
  useEffect(() => {
    let live = true;
    ctx.users.profile(uid).then((v) => {
      if (!live) return;
      const view = profileView(v);
      setWho(view);
      rememberName(ctx, uid, view.name);
    }, () => {});
    return () => void (live = false);
  }, [ctx, uid]);

  // 프로필을 읽기 전에는 이 PC가 마지막으로 본 이름을 보이고 본 적이 없으면 친구라고 보여 이름이 바뀐 것처럼 보이지 않게 한다
  const name = who ? (who.name ?? '이름 없음') : (ctx.local.get<Local>('account').names[uid] ?? '친구');
  // 오프라인으로 보이기를 켠 친구는 접속 중이어도 오프라인으로 그리고 있는 방도 보이지 않는다 (FRD-06)
  const online = p?.online === true && p.m.friends?.hidden !== true;
  const code = p?.m.rooms?.code;
  const room = online && typeof code === 'string' ? code : null;
  const where = p === undefined ? '확인하는 중' : !online ? '오프라인' : !room ? '접속 중' : room === mine ? '같은 방' : `${room} 방`;

  return (
    <li className={css.friend}>
      <div className={css.row}>
        <span className={css.dot} data-online={p === undefined ? undefined : online} />
        <strong>{name}</strong>
        {who && who.level !== null && <span className={css.lv}>Lv.{who.level}</span>}
        <span className={css.muted}>{where}</span>
      </div>
      {asking ? (
        <div className={css.row}>
          <span>{name}님과 친구를 끊을까요?</span>
          <button disabled={busy} onClick={() => run(() => unfriend(ctx, uid).then(() => `${name}님과 친구를 끊었어요.`))}>끊기</button>
          <button onClick={() => setAsking(false)}>취소</button>
        </div>
      ) : (
        <div className={css.row}>
          <button
            disabled={busy || !room || room === mine}
            onClick={() => run(async () => {
              const r = await ctx.room.join(room!);
              return r.ok ? null : r.reason;
            })}
          >
            같이 들어가기
          </button>
          <button disabled={busy || !mine || room === mine} onClick={() => run(() => invite(ctx, uid, name))}>초대하기</button>
          <button onClick={() => setAsking(true)}>끊기</button>
        </div>
      )}
    </li>
  );
}
