import { useState } from 'react';
import type { Ctx } from '@core/types';
import { duration, inPeriod, odds, percent, periodText, pool, secToNext, tickets } from '../logic';
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
  if (!v.code) return <p>방에 들어가 있을 때만 가챠를 쓸 수 있습니다.</p>;

  const sec = v.rec.sec + Math.floor(v.pendingSec);
  const { secPerTicket: spt } = v.cfg;
  const left = tickets(sec, spt, v.rec.bonus, v.rec.spent);
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
      <p className={css.muted}>다음 1회까지 작업 {duration(secToNext(sec, spt, v.rec.bonus, v.rec.spent))} 남았습니다.</p>
      <p className={css.muted}>뽑기 1회에 작업 {duration(spt)}이 필요합니다.</p>
      <div className={css.stage}>
        {!spinning && result ? (
          <div className={css.result}>
            <Pic ctx={ctx} file={result.file} />
            <b>{result.name}</b>
            {result.n === 1 ? <span className={css.new}>NEW!</span> : <span className={css.muted}>{result.n}개째</span>}
          </div>
        ) : (
          <div className={css.capsule} data-spin={spinning} onAnimationEnd={() => setSpinning(false)} />
        )}
      </div>
      <div className={css.row}>
        <button disabled={spinning || waiting || !!reason} onClick={go}>
          1회 뽑기
        </button>
        <button onClick={() => ctx.ui.open('gacha.inventory')}>보관함으로</button>
      </div>
      {(msg || reason) && <p role="status" className={css.muted}>{msg || reason}</p>}
      <h4>아이템과 확률</h4>
      {items.length ? (
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
      ) : (
        <p className={css.muted}>지금 뽑을 수 있는 아이템이 없습니다.</p>
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
      <p className={css.muted}>아직 뽑지 않은 아이템은 그림을 가려 둡니다.</p>
      {canAdd(v) && <AddItem ctx={ctx} />}
    </div>
  );
}
