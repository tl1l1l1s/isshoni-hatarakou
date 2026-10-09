import { describe, expect, it } from 'vitest';
import { anchorsFromBounds, colorFilter, containFit, cssBox, dither, frameDue, opaqueBounds, poseFor } from './logic';

/** w x h 투명 그림에 [x, y, alpha] 픽셀을 찍는다 */
const img = (w: number, h: number, px: Array<[number, number, number]>) => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (const [x, y, alpha] of px) a[(y * w + x) * 4 + 3] = alpha;
  return a;
};

describe('opaqueBounds', () => {
  it('완전히 투명하면 null', () => {
    expect(opaqueBounds(img(4, 3, []), 4, 3, 0)).toBeNull();
  });
  it('픽셀 하나', () => {
    expect(opaqueBounds(img(4, 3, [[2, 1, 255]]), 4, 3, 0)).toEqual({ x: 2, y: 1, width: 1, height: 1 });
  });
  it('여러 픽셀을 감싸고 모서리 픽셀도 들어간다', () => {
    const a = img(5, 4, [[4, 0, 255], [0, 3, 255], [2, 2, 255]]);
    expect(opaqueBounds(a, 5, 4, 0)).toEqual({ x: 0, y: 0, width: 5, height: 4 });
  });
  it('알파가 threshold와 같으면 투명으로 본다', () => {
    expect(opaqueBounds(img(2, 2, [[1, 1, 16]]), 2, 2, 16)).toBeNull();
    expect(opaqueBounds(img(2, 2, [[1, 1, 17]]), 2, 2, 16)).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });
  it('빈 그림', () => {
    expect(opaqueBounds(new Uint8ClampedArray(0), 0, 0, 0)).toBeNull();
  });
});

describe('containFit', () => {
  const view = { width: 160, height: 200 };
  it('넓은 그림은 너비에 맞추고 아래에 붙인다', () => {
    expect(containFit({ width: 200, height: 100 }, view)).toEqual({ scale: 0.8, x: 0, y: 120 });
  });
  it('높은 그림은 높이에 맞추고 가로 가운데', () => {
    expect(containFit({ width: 100, height: 400 }, view)).toEqual({ scale: 0.5, x: 55, y: 0 });
  });
});

describe('anchorsFromBounds', () => {
  // 100x100 그림을 (10, 20)에 놓인 160x200 뷰에 맞추면 1.6배, 세로 40px 아래로 붙는다
  const view = { x: 10, y: 20, width: 160, height: 200 };
  const fit = containFit({ width: 100, height: 100 }, view);
  const b = { x: 25, y: 10, width: 50, height: 80 };

  it('불투명 상자를 컨테이너 CSS 픽셀로 옮긴다', () => {
    expect(cssBox(b, view, fit)).toEqual({ x: 50, y: 76, width: 80, height: 128 });
  });
  it('머리, 말풍선, 이름표, 책상 위, 발', () => {
    const a = anchorsFromBounds(b, view, fit);
    expect(a.head).toEqual({ x: 90, y: 76 });
    expect(a.bubble).toEqual({ x: 90, y: 68 });
    expect(a.feet).toEqual({ x: 90, y: 204 });
    expect(a.nameplate).toEqual({ x: 90, y: 208 });
    expect(a.deskTop.y).toBeCloseTo(76 + 128 * 0.6);
  });
  it('왼쪽을 보면 뷰 가운데를 기준으로 뒤집는다', () => {
    const left = { x: 0, y: 10, width: 50, height: 80 };
    expect(cssBox(left, view, fit).x).toBe(10);
    expect(cssBox(left, view, fit, -1).x).toBe(10 + 160 - 80);
    expect(anchorsFromBounds(left, view, fit, -1).head.x).toBe(130);
  });
  it('불투명 영역이 없으면 뷰 전체를 쓴다', () => {
    const a = anchorsFromBounds(null, view, fit);
    expect(a.head).toEqual({ x: 90, y: 20 });
    expect(a.feet).toEqual({ x: 90, y: 220 });
  });
});

describe('poseFor', () => {
  it('상태 id를 자세로 바꾸고 모르는 id는 idle', () => {
    expect(poseFor('typing')).toBe('typing');
    expect(poseFor('sleep')).toBe('sleep');
    expect(poseFor('away')).toBe('sleep');
    expect(poseFor('online')).toBe('idle');
    expect(poseFor('busy')).toBe('idle');
    expect(poseFor('whatever')).toBe('idle');
  });
});

describe('frameDue', () => {
  it('fps 상한 간격이 지나야 그린다', () => {
    expect(frameDue(0, -Infinity, 30)).toBe(true);
    expect(frameDue(1016.7, 1000, 30)).toBe(false);
    expect(frameDue(1033, 1000, 30)).toBe(true);
    expect(frameDue(1100, 1000, 5)).toBe(false);
    expect(frameDue(1200, 1000, 5)).toBe(true);
  });
  it('0이면 그리지 않는다', () => {
    expect(frameDue(1e9, 0, 0)).toBe(false);
  });
});

describe('colorFilter', () => {
  it('h{도}s{퍼센트}를 색조와 채도 필터로 바꾸고 틀린 형식은 null', () => {
    expect(colorFilter('h120s80')).toBe('hue-rotate(120deg) saturate(80%)');
    expect(colorFilter(undefined)).toBeNull();
    expect(colorFilter('h120')).toBeNull();
    expect(colorFilter('h1s1;x')).toBeNull();
  });
});

describe('dither', () => {
  it('단계 값은 그대로 두고 중간 값은 4x4 칸 안에서 위아래 단계로 나누며 알파는 0이나 255가 된다', () => {
    const a = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < a.length; i += 4) a.set([85, 128, 0, 100], i);
    a[3] = 200;
    dither(a, 4, 4);
    const ch = (c: number) => Array.from({ length: 16 }, (_, p) => a[p * 4 + c]);
    expect(new Set(ch(0))).toEqual(new Set([85]));
    expect(new Set(ch(1))).toEqual(new Set([85, 170]));
    expect(ch(1).filter((v) => v === 170).length).toBe(8);
    expect(new Set(ch(2))).toEqual(new Set([0]));
    expect(ch(3)).toEqual([255, ...Array(15).fill(0)]);
  });
});
