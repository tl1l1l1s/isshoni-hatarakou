import { describe, expect, it } from 'vitest';
import { CURSOR_POLL_MS, CURSOR_POLL_NEAR_MS } from '@shared/constants';
import { pollDelay, shouldIgnore } from './clickthrough';

const win = { x: 100, y: 500, width: 300, height: 200 };
const rects = [{ x: 50, y: 50, width: 100, height: 100 }];

describe('shouldIgnore', () => {
  it('창에서 멀면 영역과 상관없이 통과', () => {
    expect(shouldIgnore({ x: 0, y: 0 }, win, [{ x: -1000, y: -1000, width: 5000, height: 5000 }], 40)).toBe(true);
  });
  it('가깝지만 클릭 영역 밖이면 통과', () => {
    expect(shouldIgnore({ x: 90, y: 520 }, win, rects, 40)).toBe(true);
    expect(shouldIgnore({ x: 120, y: 520 }, win, rects, 40)).toBe(true);
  });
  it('클릭 영역 안이면 받는다', () => {
    expect(shouldIgnore({ x: 150, y: 550 }, win, rects, 40)).toBe(false);
    expect(shouldIgnore({ x: 249, y: 649 }, win, rects, 40)).toBe(false);
    expect(shouldIgnore({ x: 250, y: 600 }, win, rects, 40)).toBe(true);
  });
  it('그림 앱이 앞에 있어도 캐릭터 위에서는 클릭을 받는다 (NFR-25)', () => {
    expect(shouldIgnore({ x: 150, y: 550 }, win, rects, 40)).toBe(false);
  });
  it('영역이 없으면 통과', () => {
    expect(shouldIgnore({ x: 150, y: 550 }, win, [], 40)).toBe(true);
  });
});

describe('pollDelay', () => {
  it('클릭 영역 안이나 40px 안이면 자주 보고 멀면 창 안이어도 드물게 본다', () => {
    // 영역은 화면 좌표로 x 150~250, y 550~650
    expect(pollDelay({ x: 200, y: 600 }, win, rects)).toBe(CURSOR_POLL_NEAR_MS);
    expect(pollDelay({ x: 111, y: 511 }, win, rects)).toBe(CURSOR_POLL_NEAR_MS);
    expect(pollDelay({ x: 290, y: 690 }, win, rects)).toBe(CURSOR_POLL_NEAR_MS);
    expect(pollDelay({ x: 350, y: 600 }, win, rects)).toBe(CURSOR_POLL_MS);
    expect(pollDelay({ x: 200, y: 690 }, win, rects)).toBe(CURSOR_POLL_NEAR_MS);
    expect(pollDelay({ x: 200, y: 695 }, win, rects)).toBe(CURSOR_POLL_MS);
    expect(pollDelay({ x: 0, y: 0 }, win, rects)).toBe(CURSOR_POLL_MS);
    expect(pollDelay({ x: 200, y: 600 }, win, [])).toBe(CURSOR_POLL_MS);
  });
});
