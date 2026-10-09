import { parseColor } from '@shared/schemas';
// canvas2d의 순수 계산. DOM 없이 시험한다.
import type { Anchors, Box, PoseId } from '../port';

export interface Size { width: number; height: number }
/** 그림 픽셀을 뷰 CSS 픽셀로 옮긴다: 뷰 x = fit.x + 그림 x * fit.scale */
export interface Fit { x: number; y: number; scale: number }

export const DEFAULT_SIZE: Size = { width: 160, height: 200 };
const BUBBLE_GAP = 8;
const NAMEPLATE_GAP = 4;
// ponytail: 책상 위는 불투명 높이의 60% 고정값. 카탈로그 그림별 anchor가 생기면 그 값을 쓴다
const DESK_RATIO = 0.6;

/** characterStates id를 자세로 바꾼다. 모르는 id는 idle */
export const poseFor = (stateId: string): PoseId =>
  stateId === 'typing' ? 'typing' : stateId === 'sleep' || stateId === 'away' ? 'sleep' : 'idle';

/** 비율을 지켜 뷰 안에 다 들어가게 맞추고 가로는 가운데, 세로는 아래에 붙인다 */
export function containFit(img: Size, view: Size): Fit {
  const scale = Math.min(view.width / img.width, view.height / img.height);
  return { scale, x: (view.width - img.width * scale) / 2, y: view.height - img.height * scale };
}

/** 알파가 alphaThreshold보다 큰 픽셀을 감싸는 상자(그림 픽셀). 하나도 없으면 null */
export function opaqueBounds(rgba: Uint8ClampedArray, width: number, height: number, alphaThreshold: number): Box | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! > alphaThreshold) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** 그림 픽셀 상자를 컨테이너 CSS 픽셀 상자로 옮긴다. view는 컨테이너 안 뷰 위치와 크기이고 상자가 없으면 뷰 전체 */
export function cssBox(b: Box | null, view: Box, fit: Fit, facing: 1 | -1 = 1): Box {
  if (!b) return { ...view };
  const width = b.width * fit.scale, x = fit.x + b.x * fit.scale;
  // 좌우 반전은 CSS scaleX(-1)이라 뷰 가운데를 기준으로 뒤집는다
  return { x: view.x + (facing === 1 ? x : view.width - x - width), y: view.y + fit.y + b.y * fit.scale, width, height: b.height * fit.scale };
}

/** 머리는 위 가운데, 말풍선은 그 위, 발은 아래 가운데, 이름표는 발 아래, 책상 위는 위에서 60% */
export function anchorsFromBounds(b: Box | null, view: Box, fit: Fit, facing: 1 | -1 = 1): Anchors {
  const { x, y, width, height } = cssBox(b, view, fit, facing);
  const cx = x + width / 2, bottom = y + height;
  return {
    head: { x: cx, y },
    bubble: { x: cx, y: y - BUBBLE_GAP },
    nameplate: { x: cx, y: bottom + NAMEPLATE_GAP },
    deskTop: { x: cx, y: y + height * DESK_RATIO },
    feet: { x: cx, y: bottom },
  };
}

/** Equip.color(h{색조 도}s{채도 퍼센트}, 예: h120s80)를 Canvas filter 문자열로 바꾼다. 없거나 형식이 틀리면 null (AVT-08) */
export function colorFilter(color: string | undefined): string | null {
  const t = parseColor(color);
  return t ? `hue-rotate(${t.h}deg) saturate(${t.s}%)` : null;
}

/** fps 상한 안에서 지금 그려도 되는지. 0이면 그리지 않는다. 1ms 여유는 60Hz rAF에서 30fps가 20fps로 떨어지지 않게 한다 */
export const frameDue = (now: number, last: number, fps: number) => fps > 0 && now - last >= 1000 / fps - 1;

// 4x4 Bayer 행렬 (0..15)
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** 도트 렌더 (SET-13): 색 채널마다 levels단계로 줄이며 4x4 Bayer 디더링을 넣고 알파는 반을 기준으로 비우거나 채운다 */
export function dither(rgba: Uint8ClampedArray, width: number, levels = 8): void {
  const step = 255 / (levels - 1);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const t = (BAYER4[(Math.floor(p / width) % 4) * 4 + ((p % width) % 4)]! + 0.5) / 16 - 0.5;
    for (let c = i; c < i + 3; c++) rgba[c] = Math.round(rgba[c]! / step + t) * step;
    rgba[i + 3] = rgba[i + 3]! < 128 ? 0 : 255;
  }
}
