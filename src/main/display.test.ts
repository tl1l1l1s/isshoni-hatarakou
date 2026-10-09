import { describe, expect, it } from 'vitest';
import { pickDisplay, remember } from './display';

const d = (id: number, x: number, width: number, height: number, scaleFactor = 1, rotation = 0) => ({
  id, bounds: { x, y: 0, width, height }, rotation, scaleFactor,
});
const main = d(1, 0, 1920, 1080);
const side = d(2, 1920, 2560, 1440);

describe('pickDisplay', () => {
  it('저장한 것이 없으면 주 모니터', () => {
    expect(pickDisplay([main, side], main, null)).toBe(main);
  });
  it('id가 같으면 그 모니터', () => {
    expect(pickDisplay([main, side], main, remember(side))).toBe(side);
  });
  it('id가 바뀌어도 지문이 같으면 그 모니터', () => {
    const again = d(7, 1920, 2560, 1440);
    expect(pickDisplay([main, again], main, remember(side))).toBe(again);
  });
  it('위치와 배율이 바뀌어도 해상도가 같으면 그 모니터', () => {
    // 2560x1440을 150%로 쓰면 DIP 크기는 1707x960
    const scaled = d(8, -1707, 1706.67, 960, 1.5);
    expect(pickDisplay([main, scaled], main, remember(side))).toBe(scaled);
  });
  it('고른 모니터가 빠지면 주 모니터', () => {
    expect(pickDisplay([main], main, remember(side))).toBe(main);
  });
});
