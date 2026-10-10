import { describe, expect, it } from 'vitest';
import { anchorOf, pickDisplay, placeAt, placeKey, remember } from './display';

describe('placeAt', () => {
  const area = { x: 100, y: 0, width: 1000, height: 800 };
  const size = { width: 200, height: 300 };
  it('자리가 없으면 아래 가운데', () => {
    expect(placeAt(area, size)).toEqual({ x: 500, y: 500, ...size });
  });
  it('끌어 둔 자리로 돌아오고 크기가 바뀌어도 아래 가운데 점이 그대로다', () => {
    const a = anchorOf(area, { x: 150, y: 200, ...size });
    expect(placeAt(area, size, a)).toEqual({ x: 150, y: 200, ...size });
    expect(placeAt(area, { width: 100, height: 400 }, a)).toEqual({ x: 200, y: 100, width: 100, height: 400 });
  });
  it('작업 영역이 줄거나 창이 커져도 작업 영역 안에 남는다', () => {
    const corner = anchorOf(area, { x: 900, y: 500, ...size });
    expect(placeAt({ x: 100, y: 0, width: 600, height: 400 }, size, corner)).toEqual({ x: 500, y: 100, ...size });
    expect(placeAt(area, { width: 200, height: 900 }, { x: 0.5, y: 0.5 })).toMatchObject({ y: -100 });
  });
});

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

describe('placeKey', () => {
  it('고른 모니터를 다른 id로 다시 꽂아도 끌어 둔 자리를 고를 때의 id로 찾는다', () => {
    const chosen = remember(side);
    expect(placeKey(side, chosen)).toBe('2');
    const again = d(22, 1920, 2560, 1440);
    const now = pickDisplay([main, again], main, chosen);
    expect(now).toBe(again);
    expect(placeKey(now, chosen)).toBe('2');
  });
  it('고른 모니터가 없거나 다른 모니터면 그 모니터 id', () => {
    expect(placeKey(main, null)).toBe('1');
    expect(placeKey(main, remember(side))).toBe('1');
  });
});
