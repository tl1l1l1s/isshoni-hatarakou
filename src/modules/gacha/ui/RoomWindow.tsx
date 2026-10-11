import { useState, useSyncExternalStore } from 'react';
import { NOT_IN_ROOM, type Ctx } from '@core/types';
import { duration, earnedOf, inPeriod, odds, percent, periodText, pool, secToNext, tickets } from '../logic';
import { canAdd, useGacha, type Drawn } from '../state';
import { AddItem, message, Pic } from './parts';
import css from './gacha.module.css';

/** 지금 방의 가챠 창 (GCH-03, GCH-08) */
export default function RoomWindow({ ctx }: { ctx: Ctx }) {
  const v = useGacha(ctx);
  const [spinning, setSpinning] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [result, setResult] = useState<Drawn | null>(null);
  const [msg, setMsg] = useState('');
  // 끊기면 뽑기 단추를 끄고 까닭을 보이도록 다시 그린다
  const online = useSyncExternalStore((f) => ctx.connection.onChange(f), () => ctx.connection.online());
  if (!v.code) return <p>{NOT_IN_ROOM}</p>;

  const earned = earnedOf(v.rec, v.cfg) + v.pendingEarned;
  const { secPerTicket: spt } = v.cfg;
  const left = tickets(earned, v.rec.bonus, v.rec.spent);
  const now = ctx.clock.serverNow();
  const items = pool(v.items, now);
  const p = odds(items);
  // 켜 두었지만 기간 밖이라 지금은 뽑히지 않는 아이템 (GCH-04)
  const later = v.items.filter((e) => e.st === 'on' && !inPeriod(e, now));
  const mine = new Set(v.inventory.filter((i) => i.room === v.code).map((i) => i.itemId));
  const reason = ctx.commands.reason('gacha.draw');

  const go = () => {
    setMsg('');
    setResult(null);
    setSpinning(true);
    setWaiting(true);
    ctx.commands
      .run('gacha.draw')
      .then(
        (r) => setResult(r as Drawn),
        (e) => {
          setMsg(message(e));
          setSpinning(false);
        },
      )
      .finally(() => setWaiting(false));
  };

  return (
    <div>
      <p>
        <b>남은 뽑기 {left}회</b>
      </p>
      <p className={css.muted}>다음 1회까지 {duration(secToNext(earned, spt))} 남았어요.</p>
      <p className={css.muted}>이 방에서 {duration(spt)} 집중할 때마다 1회 뽑아요.</p>
      <div className={css.stage}>
        {!spinning && result ? (
          <div className={css.result}>
            <Pic ctx={ctx} file={result.file} />
            <b>{result.name}</b>
            {result.n === 1 ? <span className={css.new}>NEW</span> : <span className={css.muted}>{result.n}개째</span>}
          </div>
        ) : (
          // 결과가 연출보다 늦으면 열린 캡슐을 그대로 두고 아래에 기다리는 중임을 보인다
          <div className={css.capsule} data-spin={spinning || waiting} onAnimationEnd={() => setSpinning(false)} />
        )}
      </div>
      <div className={css.row}>
        <button disabled={spinning || waiting || !!reason} onClick={go}>
          1회 뽑기
        </button>
        <button onClick={() => ctx.ui.open('gacha.inventory')}>보관함으로</button>
      </div>
      {waiting && !spinning ? (
        <p role="status" className={css.muted}>{online ? '결과를 받는 중이에요.' : '연결되면 결과가 나와요.'}</p>
      ) : (
        (msg || reason) && <p role="status" className={css.muted}>{msg || reason}</p>
      )}
      {/* 뽑을 아이템이 없으면 단추 아래 까닭 한 줄만 보인다 */}
      {items.length > 0 && (
        <>
          <h4>아이템과 확률</h4>
          <ul className={css.list}>
            {items.map((e, i) => (
              <li key={e.id}>
                <Pic ctx={ctx} file={e.file} hidden={!mine.has(e.id)} />
                <span>
                  {e.name}
                  {periodText(e) && <span className={css.muted}> {periodText(e)}</span>}
                </span>
                <span>{percent(p[i]!)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {later.length > 0 && (
        <>
          <h4>기간 밖 아이템</h4>
          <ul className={css.list}>
            {later.map((e) => (
              <li key={e.id} className={css.off}>
                <Pic ctx={ctx} file={e.file} hidden={!mine.has(e.id)} />
                <span>{e.name}</span>
                <span className={css.muted}>{periodText(e)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {(items.length > 0 || later.length > 0) && <p className={css.muted}>아직 뽑지 않은 아이템은 그림을 가려 둬요.</p>}
      {canAdd(v) && <AddItem ctx={ctx} />}
    </div>
  );
}
