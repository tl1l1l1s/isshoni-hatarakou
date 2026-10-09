import { useEffect, useState } from 'react';
import type { Ctx } from '@core/types';
import { newNotes } from '../logic';
import { NOTES } from '../notes';
import css from './notice.module.css';

export interface Device { seenVersion: string }

/** 업데이트한 뒤 처음 켤 때 뜨는 바뀐 점 창 (OPS-17). 열면 지금 버전을 본 것으로 적어서 한 번만 뜬다 */
export default function UpdatesWindow({ ctx }: { ctx: Ctx }) {
  const [notes] = useState(() => newNotes(NOTES, ctx.local.get<Device>('device').seenVersion, ctx.app.version));
  useEffect(() => ctx.local.update<Device>('device', () => ({ seenVersion: ctx.app.version })), [ctx]);
  return (
    <div>
      <h3>{ctx.app.version} 버전으로 업데이트했어요</h3>
      {notes.map((n) => (
        <section key={n.version}>
          <h4>{n.title}</h4>
          <p className={css.body}>{n.body}</p>
        </section>
      ))}
      <p className={css.hint}>지난 소식은 마이홈 우편함의 업데이트 탭에서 다시 볼 수 있어요.</p>
      <button type="submit" onClick={() => ctx.ui.close('notice.updates')}>확인</button>
    </div>
  );
}
