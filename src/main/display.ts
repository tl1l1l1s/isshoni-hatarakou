// 고른 모니터 찾기 (SET-06, NFR-08, 10.8.1). Electron 없이 시험할 수 있게 순수 함수만 둔다
import type { Rect } from '../preload/api';

export interface DisplayLike { id: number; bounds: Rect; rotation: number; scaleFactor: number }

/** 저장하는 모니터 정보. w, h는 물리 픽셀 해상도라 배율이 바뀌어도 같다 */
export interface SavedDisplay { id: number; fp: string; w: number; h: number }

export function remember(d: DisplayLike): SavedDisplay {
  const w = Math.round(d.bounds.width * d.scaleFactor);
  const h = Math.round(d.bounds.height * d.scaleFactor);
  return { id: d.id, fp: `${w}x${h}@${d.bounds.x},${d.bounds.y}r${d.rotation}s${d.scaleFactor}`, w, h };
}

/** 저장한 id, 해상도와 위치와 회전과 배율 지문, 같은 해상도, 주 모니터 순서로 찾는다 */
export function pickDisplay<T extends DisplayLike>(all: T[], primary: T, saved: SavedDisplay | null): T {
  if (!saved) return primary;
  const info = all.map((d) => [d, remember(d)] as const);
  return (
    info.find(([, r]) => r.id === saved.id)?.[0] ??
    info.find(([, r]) => r.fp === saved.fp)?.[0] ??
    info.find(([, r]) => r.w === saved.w && r.h === saved.h)?.[0] ??
    primary
  );
}
