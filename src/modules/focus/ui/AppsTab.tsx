import { useState } from 'react';
import type { SlotProps } from '@core/types';
import { labelOf, type App } from '../logic';
import css from './focus.module.css';

/** 설정 창의 집중 앱 탭 (FOC-01). 첫 빈 칸에 직전에 쓴 앱을 넣는다. 알림은 코어가 이 설정 창에 띄운다 */
export default function AppsTab({ ctx }: SlotProps) {
  const [apps, setApps] = useState(() => ctx.local.get<App[]>('device'));
  const save = (i: number, app: App) => {
    ctx.local.update<App[]>('device', (xs) => xs.map((x, j) => (j === i ? app : x)));
    setApps(ctx.local.get<App[]>('device'));
  };
  const fill = (i: number) => {
    const key = ctx.activity.lastForeignApp();
    if (!key) return ctx.ui.toast('넣을 앱을 먼저 잠깐 쓰고 이 창으로 돌아와 다시 눌러 주세요.');
    if (apps.some((a) => a?.key === key)) return ctx.ui.toast('이미 등록한 앱이에요.');
    save(i, { key, label: labelOf(key).slice(0, 20) });
  };
  const firstEmpty = apps.findIndex((a) => !a);
  return (
    <div>
      <p>등록한 앱이 앞에 있을 때만 집중 시간이 쌓여요.</p>
      <ol>
        {apps.map((a, i) => (
          <li key={i}>
            {a ? (
              <>
                <input value={a.label} maxLength={20} style={{ width: '22em' }} title={a.key} aria-label={`${i + 1}번 앱 이름`} onChange={(e) => save(i, { ...a, label: e.target.value })} />{' '}
                <button onClick={() => save(i, null)}>빼기</button>
              </>
            ) : i === firstEmpty ? (
              <button onClick={() => fill(i)}>직전에 쓴 앱 넣기</button>
            ) : (
              <span className={css.empty}>비어 있음</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
