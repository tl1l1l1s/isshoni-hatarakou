// 커서 확인 클릭 통과 (10.8.1). forward는 쓰지 않는다 (펜 선이 직선이 되는 문제)
import type { BrowserWindow, Point } from 'electron';
import { CURSOR_NEAR_PX, CURSOR_POLL_MS, CURSOR_POLL_NEAR_MS } from '@shared/constants';
import type { Rect } from '../preload/api';

const near = (c: Point, b: Rect, px: number) => c.x >= b.x - px && c.y >= b.y - px && c.x <= b.x + b.width + px && c.y <= b.y + b.height + px;

/** rects는 창 안 CSS 픽셀. 창에서 nearPx보다 멀면 영역 비교 없이 통과.
 *  그림 앱이 앞에 있어도 따로 다루지 않는다. 커서가 캐릭터 위에 있을 때만 클릭을 받으므로 그림 앱을 쓰는 중에도 캐릭터를 누를 수 있다 (NFR-25) */
export function shouldIgnore(c: Point, b: Rect, rects: Rect[], nearPx: number): boolean {
  if (!near(c, b, nearPx)) return true;
  const x = c.x - b.x;
  const y = c.y - b.y;
  return !rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
}

/** 다음 확인까지 기다릴 시간. 커서가 스테이지 가까이 있으면 자주 본다. 캐릭터 위에 머물던 펜을 들어 옆 캔버스에 바로 내려도
 *  스테이지가 그 클릭을 받지 않게 한다. 멀리 있으면 드물게 본다 */
export const pollDelay = (c: Point, b: Rect) => (near(c, b, CURSOR_NEAR_PX) ? CURSOR_POLL_NEAR_MS : CURSOR_POLL_MS);

/** held가 true인 동안(스테이지를 끄는 중)은 클릭을 계속 받는다 */
export function startClickThrough(
  getWin: () => BrowserWindow | null,
  getRects: () => Rect[],
  cursorPoint: () => Point,
  held: () => boolean = () => false,
): () => void {
  let lastWin: BrowserWindow | null = null;
  let last: boolean | null = null;
  let t: ReturnType<typeof setTimeout>;
  const tick = () => {
    let delay = CURSOR_POLL_MS;
    const win = getWin();
    // 숨긴 스테이지는 클릭을 받을 일이 없으니 커서를 읽지 않는다
    if (win && !win.isDestroyed() && win.isVisible()) {
      if (win !== lastWin) [lastWin, last] = [win, null];
      const c = cursorPoint();
      const b = win.getBounds();
      const ignore = !held() && shouldIgnore(c, b, getRects(), CURSOR_NEAR_PX);
      if (ignore !== last) {
        win.setIgnoreMouseEvents(ignore);
        last = ignore;
      }
      delay = pollDelay(c, b);
    }
    t = setTimeout(tick, delay);
  };
  t = setTimeout(tick, CURSOR_POLL_MS);
  return () => clearTimeout(t);
}
