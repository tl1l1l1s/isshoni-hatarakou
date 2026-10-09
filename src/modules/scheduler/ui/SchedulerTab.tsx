import { useState } from 'react';
import { useToday } from '@shared/today';
import type { Ctx } from '@core/types';
import type { HomeTabProps } from '@modules/home/api';
import { calendarDay } from '../api';
import { dayTitle, MEMO_MAX, monthGrid, Plan, planId, planWrites, shiftMonth, TITLE_MAX, weekdays, type Row, type Settings } from '../logic';
import { usePlans } from '../state';
import css from './scheduler.module.css';

const blank = (date: string): Plan => ({ date, title: '', memo: '', pub: false, v: 1 });

/** 마이홈 [스케줄러] 탭. 달력에서 날짜를 고르고 그날 일정을 더한다. 친구 방문이면 그 친구가 공개한 일정만 읽기로 보인다 (HOM-16) */
export default function SchedulerTab({ ctx, owner, mine }: HomeTabProps & { ctx: Ctx }) {
  const plans = usePlans(ctx, owner, mine);
  // 오늘은 포커스 기록과 달성표처럼 서버 시각으로 정하고 자정을 넘기면 다시 그린다
  const today = useToday(ctx, calendarDay);
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [form, setForm] = useState<{ id: string | null; plan: Plan } | null>(null);
  const { weekStart } = ctx.settings.get<Settings>();

  const byDay = new Map<string, Row[]>();
  for (const p of plans) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
  const list = byDay.get(day) ?? [];

  const pick = (d: string) => {
    setDay(d);
    setMonth(d.slice(0, 7));
    setForm(null);
  };
  // 날짜를 바꾸지 않으면 키를 그대로 두고 바꾸면 새 날짜로 시작하는 키를 쓴다
  const write = (oldId: string | null, plan: Plan | null) => {
    const id = oldId && (!plan || plan.date === oldId.slice(0, 10)) ? oldId : planId(plan!.date, ctx.clock.now().toString(36));
    return ctx.server.user().update('', planWrites(oldId, id, plan));
  };
  const submit = () => {
    const r = Plan.safeParse({ ...form!.plan, title: form!.plan.title.trim(), memo: form!.plan.memo.trim() });
    if (!r.success) return ctx.ui.toast('날짜와 제목을 넣어 주세요.');
    void write(form!.id, r.data)
      .then(() => {
        setForm(null);
        pick(r.data.date);
      })
      .catch((e: Error) => ctx.ui.toast(e.message));
  };
  const remove = (p: Row) => void write(p.id, null).catch((e: Error) => ctx.ui.toast(e.message));

  return (
    <div className={css.wrap}>
      <section className={css.cal}>
        <div className={css.head}>
          <button aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}>◀</button>
          <b>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</b>
          <button aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}>▶</button>
          <span className={css.grow} />
          <button onClick={() => pick(today)}>오늘</button>
        </div>
        <div className={css.grid}>
          {weekdays(weekStart).map((w) => (
            <span key={w} className={css.wd}>{w}</span>
          ))}
          {monthGrid(month, weekStart).map((d) => {
            const n = byDay.get(d)?.length ?? 0;
            return (
              <button
                key={d}
                className={css.cell}
                aria-pressed={d === day}
                aria-label={`${dayTitle(d)}${n ? `, 일정 ${n}개` : ''}`}
                data-out={d.slice(0, 7) !== month}
                data-today={d === today}
                onClick={() => pick(d)}
              >
                {Number(d.slice(8))}
                {n > 0 && <i className={css.dot} />}
              </button>
            );
          })}
        </div>
        {!mine && <p className={css.hint}>친구가 공개한 일정만 보여요.</p>}
      </section>

      <section className={css.day}>
        <h4>{dayTitle(day)}</h4>
        {list.length ? (
          <ul className={css.list}>
            {list.map((p) => (
              <li key={p.id}>
                <div>
                  <b>{p.title}</b> {mine && p.pub && <small className={css.hint}>공개</small>}
                  {p.memo && <p className={css.pre}>{p.memo}</p>}
                </div>
                {mine && (
                  <span className={css.row}>
                    <button onClick={() => setForm({ id: p.id, plan: { date: p.date, title: p.title, memo: p.memo, pub: p.pub, v: 1 } })}>수정</button>
                    <button onClick={() => remove(p)}>지우기</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={css.hint}>이날은 일정이 없어요.</p>
        )}
        {mine &&
          (form ? (
            <div className={css.form}>
              <label className={css.field}>
                날짜
                <input type="date" value={form.plan.date} onChange={(e) => setForm({ ...form, plan: { ...form.plan, date: e.target.value } })} />
              </label>
              <label className={css.field}>
                제목
                <input maxLength={TITLE_MAX} value={form.plan.title} placeholder={`일정 제목 (${TITLE_MAX}자)`} onChange={(e) => setForm({ ...form, plan: { ...form.plan, title: e.target.value } })} />
              </label>
              <label className={css.field}>
                메모
                <textarea maxLength={MEMO_MAX} value={form.plan.memo} placeholder={`메모 (${MEMO_MAX}자)`} onChange={(e) => setForm({ ...form, plan: { ...form.plan, memo: e.target.value } })} />
              </label>
              <label>
                친구에게 공개
                <input type="checkbox" checked={form.plan.pub} onChange={(e) => setForm({ ...form, plan: { ...form.plan, pub: e.target.checked } })} />
              </label>
              <p className={css.row}>
                <button onClick={() => setForm(null)}>취소</button>
                <button type="submit" onClick={submit}>{form.id ? '저장' : '추가'}</button>
              </p>
            </div>
          ) : (
            <p>
              <button onClick={() => setForm({ id: null, plan: blank(day) })}>+ 일정 추가</button>
            </p>
          ))}
      </section>
    </div>
  );
}
