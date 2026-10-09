import { useState } from 'react';
import type { SlotProps } from '@core/types';
import { labelOf, type App } from '../logic';

/** 설정 창의 집중 앱 탭 (FOC-01). 빈 칸에는 직전에 쓴 앱을 넣는다 */
export default function AppsTab({ ctx }: SlotProps) {
  const [apps, setApps] = useState(() => ctx.local.get<App[]>('device'));
  const save = (i: number, app: App) => {
    ctx.local.update<App[]>('device', (xs) => xs.map((x, j) => (j === i ? app : x)));
    setApps(ctx.local.get<App[]>('device'));
  };
  const fill = (i: number) => {
    const key = ctx.activity.lastForeignApp();
    if (!key) return ctx.ui.toast('등록할 앱을 먼저 잠깐 쓰고 이 창으로 돌아와 다시 눌러 주세요');
    if (apps.some((a) => a?.key === key)) return ctx.ui.toast('이미 등록한 앱이에요');
    save(i, { key, label: labelOf(key).slice(0, 20) });
  };
  return (
    <div>
      <p>등록한 앱이 앞에 있을 때만 집중 시간이 쌓여요.</p>
      <ol>
        {apps.map((a, i) => (
          <li key={i}>
            {a ? (
              <>
                <input value={a.label} maxLength={20} title={a.key} aria-label={`${i + 1}번 앱 이름`} onChange={(e) => save(i, { ...a, label: e.target.value })} />{' '}
                <button onClick={() => save(i, null)}>빼기</button>
              </>
            ) : (
              <button onClick={() => fill(i)}>직전에 쓴 앱 넣기</button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
