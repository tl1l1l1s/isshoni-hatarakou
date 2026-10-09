import { useEffect, useReducer } from 'react';
import type { Ctx } from '@core/types';
import { leftOf, minutes, mmss, next, pause, resume, roundText, start, type Local, type Phase, type Run } from '../logic';
import css from './pomodoro.module.css';

const PRESET_LABEL: Array<[Local['preset'], string]> = [['25', '25 / 5'], ['50', '50 / 10'], ['custom', '직접']];
const FIELDS: Array<[Phase, string, number]> = [['focus', '집중', 180], ['short', '짧은 휴식', 60], ['long', '긴 휴식', 60]];

/** 뽀모도로 창 (FOC-07). 프리셋과 시간, 시작과 일시정지와 건너뛰기와 끝 */
export default function TimerWindow({ ctx }: { ctx: Ctx }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.timers.every(1000, redraw), [ctx]);
  const l = ctx.local.get<Local>('device');
  const set = (fn: (x: Local) => Local) => {
    ctx.local.update<Local>('device', fn);
    redraw();
  };
  // 그린 뒤 단계가 넘어갔을 수 있어서 저장된 지금 타이머로 바꾼다
  const setRun = (fn: (r: Run) => Run) => set((x) => (x.run ? { ...x, run: fn(x.run) } : x));
  // 숫자 칸은 schema 범위 안으로 맞춰 저장한다
  const num = (v: string, max: number) => Math.min(max, Math.max(1, Math.round(Number(v) || 1)));
  const now = ctx.clock.now();
  const r = l.run;

  if (r) {
    return (
      <div className={css.run}>
        <div>{roundText(l, r)}</div>
        <div className={css.big}>{mmss(leftOf(r, now))}</div>
        <div className={css.row}>
          {r.endsAt === null ? (
            <button type="submit" onClick={() => setRun((x) => resume(x, ctx.clock.now()))}>다시 시작</button>
          ) : (
            <button onClick={() => setRun((x) => pause(x, ctx.clock.now()))}>일시정지</button>
          )}
          <button onClick={() => set((x) => (x.run ? { ...x, run: next(x, x.run, ctx.clock.now()) } : x))}>건너뛰기</button>
          <button onClick={() => set((x) => ({ ...x, run: null }))}>끝</button>
        </div>
        <p className={css.muted}>포커스 기록은 지금처럼 따로 쌓여요. 뽀모도로는 시간을 재고 알려 주기만 해요.</p>
      </div>
    );
  }

  return (
    <div>
      <nav>
        {PRESET_LABEL.map(([p, label]) => (
          <button key={p} aria-pressed={l.preset === p} onClick={() => set((x) => ({ ...x, preset: p }))}>
            {label}
          </button>
        ))}
      </nav>
      {FIELDS.map(([phase, label, max]) => (
        <label key={phase}>
          {label} (분)
          <input
            type="number" min={1} max={max} value={minutes(l, phase)} disabled={l.preset !== 'custom'}
            onChange={(e) => set((x) => ({ ...x, [phase]: num(e.target.value, max) }))}
          />
        </label>
      ))}
      <label>
        긴 휴식은 집중 몇 바퀴마다
        <input type="number" min={2} max={10} value={l.every} onChange={(e) => set((x) => ({ ...x, every: Math.max(2, num(e.target.value, 10)) }))} />
      </label>
      <label>
        휴식 끝나면 다음 집중 자동 시작
        <input type="checkbox" checked={l.auto} onChange={(e) => set((x) => ({ ...x, auto: e.target.checked }))} />
      </label>
      <label>
        끝날 때 소리
        <input type="checkbox" checked={l.sound} onChange={(e) => set((x) => ({ ...x, sound: e.target.checked }))} />
      </label>
      <button type="submit" className={css.start} onClick={() => set((x) => ({ ...x, run: start(x, ctx.clock.now()) }))}>
        시작
      </button>
      <p className={css.muted}>포커스 기록은 지금처럼 따로 쌓여요. 뽀모도로는 시간을 재고 알려 주기만 해요. 돌고 있는 동안 머리 위에 남은 시간이 보여요.</p>
    </div>
  );
}
