import type { Ctx } from '@core/types';
import { DAYS, whenText } from '../logic';
import { today, useEntries } from '../state';
import css from './upcoming.module.css';

/** 다가오는 일정 창. 내 일정, 친구가 공개한 일정, 내 D-day를 날짜 순서로 보여 준다 (HOM-22) */
export default function UpcomingWindow({ ctx }: { ctx: Ctx }) {
  const list = useEntries(ctx);
  const day = today(ctx);
  return (
    <>
      <h3>다가오는 일정</h3>
      {list.length ? (
        <ul className={css.list}>
          {list.map((e) => (
            <li key={e.key}>
              <span className={css.when}>{whenText(e.date, day)}</span>
              <div>
                <b>{e.title}</b>
                <small className={css.hint}>{e.kind === 'dday' ? 'D-day' : e.who ? `${e.who}님 일정` : '내 일정'}</small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={css.hint}>앞으로 {DAYS}일 안에 일정이 없어요. 마이홈의 스케줄러에서 일정을 더해 보세요.</p>
      )}
    </>
  );
}
