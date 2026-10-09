import { useState } from 'react';
import type { Ctx } from '@core/types';
import { CUSTOM_MAX, FIXED, type Choice, type Local } from '../logic';
import css from './status.module.css';

/** 상태 고르기 창 (CHR-10). 고르면 바로 적용하고 닫는다 */
export default function PickWindow({ ctx }: { ctx: Ctx }) {
  const now = ctx.local.get<Local>('account');
  const [draft, setDraft] = useState(now.custom);
  const pick = (choice: Choice, custom = now.custom) =>
    ctx.commands.run('status.choose', { choice, custom }).then(
      () => ctx.ui.close('status.pick'),
      (e: Error) => ctx.ui.toast(e.message),
    );

  return (
    <div>
      <div className={css.list}>
        {Object.entries(FIXED).map(([id, c]) => (
          <button key={id} aria-pressed={now.choice === id} onClick={() => void pick(id as Choice)}>
            {c.label}
          </button>
        ))}
      </div>
      <form
        className={css.row}
        onSubmit={(e) => {
          e.preventDefault();
          void pick('custom', draft.trim());
        }}
      >
        <input
          aria-label="직접 적는 상태"
          placeholder="직접 적기"
          maxLength={CUSTOM_MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" aria-pressed={now.choice === 'custom'} disabled={!draft.trim()}>
          적용
        </button>
      </form>
      <p className={css.hint}>{CUSTOM_MAX}자까지 머리 위에 보입니다.</p>
    </div>
  );
}
