import { useEffect, useReducer, useState } from 'react';
import type { Ctx } from '@core/types';
import { BREAK_MAX, BREAK_MIN, canJoin, FOCUS_MAX, FOCUS_MIN, GOAL_MAX, phaseOf, TITLE_MAX, type Draft, type Phase } from '../logic';
import { begin, canEnd, end, join, joined, leave, open, participants, useView, WIN } from '../state';
import css from './cowork.module.css';

const LABEL: Record<Phase, string> = { wait: '시작 전', lead: '곧 시작해요', focus: '함께 집중', break: '함께 휴식', done: '' };

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** 서버 시각을 이 PC 시계의 시:분으로 */
const clock = (ctx: Ctx, at: number) => new Date(at - ctx.clock.serverNow() + Date.now()).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const clamp = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || min)));

/** 같이 작업하기 창 (ROM-15). 세션이 없으면 만들기, 있으면 단계와 참여자와 참여, 나가기, 시작, 세션 끝내기 */
export default function SessionWindow({ ctx }: { ctx: Ctx }) {
  const v = useView(ctx);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.timers.every(1000, redraw), [ctx]);
  const [draft, setDraft] = useState<Draft>({ title: '', f: 50, b: 10 });
  const [goal, setGoal] = useState(v.goal);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    void fn()
      .catch((e: Error) => ctx.ui.toast(e.message))
      .finally(() => setBusy(false));
  };

  if (!v.code) return <p>방에 들어가면 같이 작업할 수 있어요.</p>;
  const me = ctx.self.uid();
  const now = ctx.clock.serverNow();
  const { phase, end: phaseEnd } = phaseOf(v.cur, now);
  const mine = joined(v, me);

  const goalFields = (
    <>
      <label>
        한 줄 목표 (선택)
        <input value={goal} maxLength={GOAL_MAX} placeholder="예: 러프 끝내기" onChange={(e) => setGoal(e.target.value)} />
      </label>
      <label>
        이 세션에 공유
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
      </label>
      <p className={css.muted}>공유를 켠 목표만 참여자들에게 보여요.</p>
    </>
  );

  if (!v.cur || phase === 'done') {
    const last = v.cur;
    return (
      <div>
        {last && mine && (
          <div className={css.center}>
            <p>같이 작업이 끝났어요.</p>
            <button disabled={busy} onClick={() => run(() => open(ctx, { title: last.title, f: last.f, b: last.b }, goal, share))}>한 번 더</button>
          </div>
        )}
        <label>
          제목 (선택)
          <input value={draft.title} maxLength={TITLE_MAX} placeholder="예: 원고 작업" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label>
          집중 (분)
          <input type="number" min={FOCUS_MIN} max={FOCUS_MAX} value={draft.f} onChange={(e) => setDraft({ ...draft, f: clamp(e.target.value, FOCUS_MIN, FOCUS_MAX) })} />
        </label>
        <label>
          휴식 (분)
          <input type="number" min={BREAK_MIN} max={BREAK_MAX} value={draft.b} onChange={(e) => setDraft({ ...draft, b: clamp(e.target.value, BREAK_MIN, BREAK_MAX) })} />
        </label>
        {goalFields}
        <button type="submit" className={css.wide} disabled={busy} onClick={() => run(() => open(ctx, draft, goal, share))}>
          만들기
        </button>
        <p className={css.muted}>방 사람들과 같은 시각에 집중하고 같이 쉬어요. 포커스 기록과는 따로예요.</p>
      </div>
    );
  }

  const cur = v.cur;
  const people = participants(ctx, v);
  const opener = cur.by === me ? '내가 열었어요.' : `${ctx.room.members().find((x) => x.uid === cur.by)?.name || '방 친구'}님이 열었어요.`;
  const confirmEnd = async () => {
    if (await ctx.ui.ask(WIN, { text: '같이 작업을 모두 끝낼까요?', ok: '끝내기', cancel: '취소' })) await end(ctx);
  };
  return (
    <div>
      <div className={css.center}>
        <strong>{cur.title || '같이 작업'}</strong>
        <span className={css.muted}>
          {opener} 집중 {cur.f}분, 휴식 {cur.b}분
        </span>
        <span>{LABEL[phase]}</span>
        {phase !== 'wait' && <span className={css.big}>{mmss(phaseEnd - now)}</span>}
        {(phase === 'focus' || phase === 'break') && <span className={css.muted}>{clock(ctx, phaseEnd)}에 끝나요</span>}
      </div>
      <p>참여자 {people.length}명</p>
      <ul className={css.people}>
        {people.map((p) => (
          <li key={p.uid}>
            {p.name}
            {(p.goal ?? (p.uid === me ? v.goal : '')) && <span className={css.muted}> {p.goal ?? v.goal}</span>}
          </li>
        ))}
      </ul>
      {mine ? (
        <button disabled={busy} onClick={() => run(() => leave(ctx))}>나가기</button>
      ) : canJoin(phase) ? (
        <>
          {goalFields}
          <button type="submit" className={css.wide} disabled={busy} onClick={() => run(() => join(ctx, goal, share))}>
            참여
          </button>
        </>
      ) : (
        <p className={css.muted}>휴식 중에는 참여할 수 없어요. 다음 세션에 함께해요.</p>
      )}
      <div className={css.row}>
        {phase === 'wait' && cur.by === me && (
          <button type="submit" disabled={busy} onClick={() => run(() => begin(ctx))}>
            시작
          </button>
        )}
        {canEnd(ctx, cur) && (
          <button disabled={busy} onClick={() => run(confirmEnd)}>
            세션 끝내기
          </button>
        )}
      </div>
    </div>
  );
}
