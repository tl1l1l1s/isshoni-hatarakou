// 500ms 활동 샘플 (10.8.1). 창 제목은 읽지 않는다
import { ACTIVITY_SAMPLE_MS } from '@shared/constants';
import type { ActivitySample } from '@shared/schemas';
import type { ActiveWindow, Platform } from './platform/ports';

export async function buildSample(p: Platform, now = Date.now()): Promise<ActivitySample> {
  const { appKey, unknownReason } = await p.activeWindow.foreground();
  return { at: now, appKey, idleSec: p.idleSeconds(), pen: appKey !== null && p.penApps.isPen(appKey), unknownReason };
}

/** 앞에 있는 앱 조회를 줄인다. 입력이 2초 넘게 없으면 앞 앱도 거의 바뀌지 않으므로 5초마다만 다시 묻고 그 사이에는 앞 결과를 쓴다.
 *  minMs는 조회가 비싼 OS의 최소 간격이다 (Mac은 조회마다 보조 프로세스를 띄운다).
 *  ponytail: 입력 없이 앞 창이 바뀌면 5초까지 늦게 안다. 더 빨라야 하면 OS의 앞 창 바뀜 알림을 쓴다 */
export function lessForeground(a: ActiveWindow, idleSeconds: () => number, minMs: number, now = Date.now): ActiveWindow {
  let last: ReturnType<ActiveWindow['foreground']> | null = null;
  let at = 0;
  return {
    foreground() {
      const age = now() - at;
      if (last && (age < minMs || (idleSeconds() >= 2 && age < 5000))) return last;
      at = now();
      return (last = a.foreground());
    },
  };
}

/** 앞 호출이 아직 끝나지 않았으면 그 틱은 건너뛴다 */
export function startActivity(p: Platform, send: (s: ActivitySample) => void): () => void {
  let busy = false;
  const t = setInterval(() => {
    if (busy) return;
    busy = true;
    void buildSample(p)
      .then(send)
      .finally(() => (busy = false));
  }, ACTIVITY_SAMPLE_MS);
  return () => clearInterval(t);
}
