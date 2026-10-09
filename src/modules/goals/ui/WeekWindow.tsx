import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import { live } from '../live';
import { clock, GOAL_HOURS, markOf, shortDate, weekOf, WEEKDAYS, type Day, type Mark } from '../logic';
import css from './goals.module.css';

const SYMBOL: Record<Mark, string> = { done: '✓', miss: '✗', today: '•', none: '' };
const SAY: Record<Mark, string> = { done: '달성', miss: '못 채움', today: '오늘', none: '' };

/** 달성표 창 (GRW-06). 이번 주 요일별 표시와 하루 목표 카드 */
export default function WeekWindow({ ctx }: { ctx: Ctx }) {
  useSyncExternalStore(live.subscribe, () => live.version);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.timers.every(1000, redraw), [ctx]);
  const [pick, setPick] = useState(3);
  const [msg, setMsg] = useState('');
  const focus = live.focus;
  if (!focus) return null;

  const { cfg, days } = live;
  const today = ctx.clock.dayKey();
  const todayRec: Day = { sec: Math.max(Math.floor(focus.todaySec()), days[today]?.sec ?? 0), goal: cfg.goal, v: 1 };
  const week = weekOf(today);
  const marks = week.map((d) => markOf(d, today, cfg.since, d === today ? todayRec : days[d]));
  const save = (goal: number) => {
    setMsg('');
    ctx.server
      .user()
      .set('cfg', { goal, since: goal ? cfg.since || today : '', v: 1 })
      .catch((e: Error) => setMsg(e.message));
  };

  return (
    <div>
      <div className={css.top}>
        <b>{shortDate(week[0]!)}부터 {shortDate(week[6]!)}까지</b>
        <span>{marks.filter((m) => m === 'done').length}일 달성</span>
      </div>
      <ol className={css.week}>
        {week.map((d, i) => (
          <li key={d} data-mark={marks[i]} aria-label={`${WEEKDAYS[i]}요일 ${SAY[marks[i]!]}`.trim()}>
            <span>{WEEKDAYS[i]}</span>
            <span className={css.cell}>{SYMBOL[marks[i]!]}</span>
            <small>{shortDate(d)}</small>
          </li>
        ))}
      </ol>
      {cfg.goal ? (
        <fieldset>
          <legend>하루 목표 {cfg.goal / 3600}시간</legend>
          <div className={css.num}>
            오늘 {clock(todayRec.sec)} / {clock(cfg.goal)}
          </div>
          <progress className={css.progress} max={cfg.goal} value={Math.min(todayRec.sec, cfg.goal)} />
          <label>
            목표 바꾸기
            <select value={cfg.goal / 3600} onChange={(e) => save(Number(e.target.value) * 3600)}>
              {GOAL_HOURS.map((h) => <option key={h} value={h}>{h}시간</option>)}
            </select>
          </label>
          <button onClick={() => save(0)}>목표 끄기</button>
        </fieldset>
      ) : (
        <fieldset>
          <legend>하루 집중 목표</legend>
          <p>목표를 정하면 날마다 채웠는지 이번 주 표에 표시해요.</p>
          <label>
            하루
            <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>
              {GOAL_HOURS.map((h) => <option key={h} value={h}>{h}시간</option>)}
            </select>
          </label>
          <button type="submit" onClick={() => save(pick * 3600)}>목표 정하기</button>
        </fieldset>
      )}
      {msg && <p role="alert">{msg}</p>}
    </div>
  );
}
