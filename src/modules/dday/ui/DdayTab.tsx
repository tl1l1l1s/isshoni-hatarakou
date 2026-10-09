import { useState } from 'react';
import { useToday } from '@shared/today';
import type { Ctx } from '@core/types';
import type { HomeTabProps } from '@modules/home/api';
import { calendarDay } from '@modules/scheduler/api';
import { Card, CARD_MAX, cardWrites, COLORS, ddayLabel, inkOn, NAME_MAX, type Row } from '../logic';
import { useCards } from '../state';
import css from './dday.module.css';

/** 마이홈 [D-day] 탭. 카드마다 남은 날이나 지난 날을 센다. 친구 방문이면 그 친구가 공개한 카드만 보인다 (HOM-21) */
export default function DdayTab({ ctx, owner, mine }: HomeTabProps & { ctx: Ctx }) {
  const cards = useCards(ctx, owner, mine);
  // 오늘은 포커스 기록과 달성표처럼 서버 시각으로 정하고 자정을 넘기면 다시 그린다
  const today = useToday(ctx, calendarDay);
  const [form, setForm] = useState<{ id: string | null; card: Card } | null>(null);
  const put = (id: string, card: Card | null) =>
    void ctx.server
      .user()
      .update('', cardWrites(id, card))
      .then(() => setForm(null))
      .catch((e: Error) => ctx.ui.toast(e.message));
  const submit = () => {
    const r = Card.safeParse({ ...form!.card, name: form!.card.name.trim() });
    if (!r.success) return ctx.ui.toast('이름과 날짜를 넣어 주세요.');
    put(form!.id ?? ctx.clock.now().toString(36), r.data);
  };
  const edit = (c: Row) => setForm({ id: c.id, card: { name: c.name, date: c.date, fromOne: c.fromOne, color: c.color, notify: c.notify, pub: c.pub, v: 1 } });

  return (
    <div className={css.wrap}>
      <div className={css.cards}>
        {cards.map((c) => {
          // 친구 카드는 누를 수 없는 판이다
          const Tag = mine ? 'button' : 'div';
          return (
            <Tag key={c.id} className={css.card} style={{ background: c.color, color: inkOn(c.color) }} title={mine ? '눌러서 고치기' : undefined} onClick={mine ? () => edit(c) : undefined}>
              <span className={css.name}>{c.name}</span>
              <b className={css.label}>{ddayLabel(c.date, today, c.fromOne)}</b>
              <small>{c.date.replaceAll('-', '. ')}{mine && c.pub ? ', 공개' : ''}</small>
            </Tag>
          );
        })}
        {mine && !form && cards.length < CARD_MAX && (
          <button className={css.add} onClick={() => setForm({ id: null, card: { name: '', date: today, fromOne: false, color: COLORS[cards.length % COLORS.length]![0], notify: true, pub: false, v: 1 } })}>
            + D-day 추가
          </button>
        )}
      </div>
      {!cards.length && !mine && <p className={css.hint}>친구가 공개한 D-day가 없어요.</p>}
      {form && (
        <fieldset className={css.form}>
          <legend>{form.id ? 'D-day 고치기' : '새 D-day'}</legend>
          <label>
            이름
            <input maxLength={NAME_MAX} value={form.card.name} placeholder={`이름 (${NAME_MAX}자)`} onChange={(e) => setForm({ ...form, card: { ...form.card, name: e.target.value } })} />
          </label>
          <label>
            날짜
            <input type="date" value={form.card.date} onChange={(e) => setForm({ ...form, card: { ...form.card, date: e.target.value } })} />
          </label>
          <label>
            고른 날을 1일째로 세기
            <input type="checkbox" checked={form.card.fromOne} onChange={(e) => setForm({ ...form, card: { ...form.card, fromOne: e.target.checked } })} />
          </label>
          <div className={css.colors}>
            {COLORS.map(([c, label]) => (
              <button key={c} className={css.swatch} style={{ background: c }} aria-label={`${label} 카드`} aria-pressed={form.card.color === c} onClick={() => setForm({ ...form, card: { ...form.card, color: c } })} />
            ))}
          </div>
          <label>
            그날 알림 받기
            <input type="checkbox" checked={form.card.notify} onChange={(e) => setForm({ ...form, card: { ...form.card, notify: e.target.checked } })} />
          </label>
          <label>
            친구에게 공개
            <input type="checkbox" checked={form.card.pub} onChange={(e) => setForm({ ...form, card: { ...form.card, pub: e.target.checked } })} />
          </label>
          <p className={css.row}>
            {form.id && <button onClick={() => put(form.id!, null)}>지우기</button>}
            <span className={css.grow} />
            <button onClick={() => setForm(null)}>취소</button>
            <button type="submit" onClick={submit}>{form.id ? '저장' : '추가'}</button>
          </p>
        </fieldset>
      )}
    </div>
  );
}
