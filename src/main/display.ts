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

/** 스테이지 자리: 사용자가 끌어 옮긴 창의 아래 가운데 점을 작업 영역 안의 비율로 둔다. 배율이나 해상도가 바뀌어도 같은 쪽에 남는다 */
export interface Anchor { x: number; y: number }

/** 창이 작업 영역 밖으로 나가지 않게 옮긴다. 작업 영역보다 높으면 아래를 맞춘다 */
export function clampIn(area: Rect, b: Rect): Rect {
  const x = Math.min(Math.max(b.x, area.x), area.x + area.width - b.width);
  const y = Math.min(Math.max(b.y, area.y), area.y + area.height - b.height);
  return { ...b, x, y };
}

/** anchor 자리에 size 크기 창을 놓는다. anchor가 없으면 아래 가운데 */
export function placeAt(area: Rect, size: { width: number; height: number }, a: Anchor = { x: 0.5, y: 1 }): Rect {
  return clampIn(area, { x: Math.round(area.x + a.x * area.width - size.width / 2), y: Math.round(area.y + a.y * area.height - size.height), ...size });
}

export function anchorOf(area: Rect, b: Rect): Anchor {
  return { x: (b.x + b.width / 2 - area.x) / area.width, y: (b.y + b.height - area.y) / area.height };
}

/** 저장한 모니터를 id, 해상도와 위치와 회전과 배율 지문, 같은 해상도 순서로 찾는다 */
function findSaved<T extends DisplayLike>(all: T[], saved: SavedDisplay | null): T | undefined {
  if (!saved) return undefined;
  const info = all.map((d) => [d, remember(d)] as const);
  return (
    info.find(([, r]) => r.id === saved.id)?.[0] ??
    info.find(([, r]) => r.fp === saved.fp)?.[0] ??
    info.find(([, r]) => r.w === saved.w && r.h === saved.h)?.[0]
  );
}

/** 저장한 모니터, 없으면 주 모니터 */
export function pickDisplay<T extends DisplayLike>(all: T[], primary: T, saved: SavedDisplay | null): T {
  return findSaved(all, saved) ?? primary;
}

/** 끌어 둔 자리를 기억하는 키. 고른 모니터는 OS가 id를 바꿔도(다시 꽂기, 포트 바꾸기) 고를 때의 id로 찾는다 */
export function placeKey(d: DisplayLike, saved: SavedDisplay | null): string {
  return String(saved && findSaved([d], saved) ? saved.id : d.id);
}
