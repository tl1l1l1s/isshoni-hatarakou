import { useState } from 'react';
import type { SlotProps } from '@core/types';
import { duration, odds, percent, periodText, pool } from '../logic';
import { removeItem, setCfg, setItemOn, useGacha } from '../state';
import { AddItem, message, Pic } from './parts';
import css from './gacha.module.css';

const MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

/** 방 설정 창(rooms.settings)의 가챠 구역. 방 주인에게만 보인다 (9.3 OUR-02) */
export function OwnerSection({ ctx }: SlotProps) {
  const v = useGacha(ctx);
  const [asking, setAsking] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  if (!v.code || !v.owner) return null;

  const run = (p: Promise<void>) => {
    setMsg('');
    p.catch((e) => setMsg(message(e)));
  };
  const on = pool(v.items, ctx.clock.serverNow());
  const p = odds(on);
  const min = v.cfg.secPerTicket / 60;
  const mins = MINUTES.includes(min) ? MINUTES : [...MINUTES, min].sort((a, b) => a - b);

  return (
    <section>
      <hr />
      <h4>가챠</h4>
      <label>
        아이템 넣기
        <select value={v.cfg.adders} onChange={(e) => run(setCfg(ctx, { adders: e.target.value as 'owner' | 'members' }))}>
          <option value="owner">방 주인만</option>
          <option value="members">멤버 모두</option>
        </select>
      </label>
      <label>
        뽑기 1회에 필요한 작업 시간
        <select value={min} onChange={(e) => run(setCfg(ctx, { secPerTicket: Number(e.target.value) * 60 }))}>
          {mins.map((m) => (
            <option key={m} value={m}>
              {duration(m * 60)}
            </option>
          ))}
        </select>
      </label>
      <p className={css.muted}>바꾸면 이미 쌓인 시간에도 새 기준을 적용합니다.</p>
      <label>
        방을 지울 때 뽑은 아이템
        <select value={v.cfg.onRemove} onChange={(e) => run(setCfg(ctx, { onRemove: e.target.value as 'keep' | 'revoke' }))}>
          <option value="keep">보관함에 남기기</option>
          <option value="revoke">함께 지우기</option>
        </select>
      </label>
      <ul className={css.list}>
        {v.items.map((e) => (
          <li key={e.id}>
            <Pic ctx={ctx} file={e.file} />
            <span>
              {e.name}
              <span className={css.muted}> 가중치 {e.w}{on.includes(e) ? `, ${percent(p[on.indexOf(e)]!)}` : ''}{periodText(e) ? `, ${periodText(e)}` : ''}</span>
            </span>
            {asking === e.id ? (
              <>
                <button onClick={() => run(removeItem(ctx, e.id, 'keep'))}>남기고 지우기</button>
                <button onClick={() => run(removeItem(ctx, e.id, 'revoke'))}>함께 지우기</button>
                <button onClick={() => setAsking(null)}>취소</button>
              </>
            ) : (
              <>
                <label title="뽑기 대상">
                  <input type="checkbox" checked={e.st === 'on'} onChange={(x) => run(setItemOn(ctx, e.id, x.target.checked))} />
                </label>
                <button onClick={() => setAsking(e.id)}>지우기</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {asking && <p className={css.muted}>남기기를 고르면 이미 뽑은 사람의 보관함에 그대로 남고 함께 지우기를 고르면 다음 동기화 때 빠집니다.</p>}
      {msg && <p role="alert" className={css.error}>{msg}</p>}
      <AddItem ctx={ctx} />
    </section>
  );
}
