// 커서 확인 클릭 통과 (10.8.1). forward는 쓰지 않는다 (펜 선이 직선이 되는 문제)
import type { BrowserWindow, Point } from 'electron';
import { CURSOR_NEAR_PX, CURSOR_POLL_MS } from '@shared/constants';
import type { Rect } from '../preload/api';

/** rects는 창 안 CSS 픽셀. 창에서 nearPx보다 멀면 영역 비교 없이 통과.
 *  그림 앱이 앞에 있어도 따로 다루지 않는다. 커서가 캐릭터 위에 있을 때만 클릭을 받으므로 그림 앱을 쓰는 중에도 캐릭터를 누를 수 있다 (NFR-25) */
export function shouldIgnore(c: Point, b: Rect, rects: Rect[], nearPx: number): boolean {
  if (c.x < b.x - nearPx || c.y < b.y - nearPx || c.x > b.x + b.width + nearPx || c.y > b.y + b.height + nearPx) {
    return true;
  }
  const x = c.x - b.x;
  const y = c.y - b.y;
  return !rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
}

export function startClickThrough(
  getWin: () => BrowserWindow | null,
  getRects: () => Rect[],
  cursorPoint: () => Point,
): () => void {
  let lastWin: BrowserWindow | null = null;
  let last: boolean | null = null;
  const t = setInterval(() => {
    const win = getWin();
    // 숨긴 스테이지는 클릭을 받을 일이 없으니 커서를 읽지 않는다
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    if (win !== lastWin) [lastWin, last] = [win, null];
    const ignore = shouldIgnore(cursorPoint(), win.getBounds(), getRects(), CURSOR_NEAR_PX);
    if (ignore !== last) {
      win.setIgnoreMouseEvents(ignore);
      last = ignore;
    }
  }, CURSOR_POLL_MS);
  return () => clearInterval(t);
}
