// debug backend: 좌석마다 색 사각형을 그리고 anchor와 클릭 영역은 뷰 크기로만 계산한다 (10.8.2).
import type { RenderBackend } from '../port';
import { DEFAULT_SIZE, anchorsFromBounds } from '../canvas2d/logic';

let count = 0;

export const debugBackend: RenderBackend = {
  id: 'debug',
  createView(container, opts) {
    const size = opts.size ?? DEFAULT_SIZE;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;width:${size.width}px;height:${size.height}px;background:hsl(${(count++ * 67) % 360} 70% 75%)`;
    container.prepend(el);
    let pos = { x: 0, y: 0 };
    const box = () => ({ ...pos, ...size });
    queueMicrotask(() => opts.onGeometry?.());
    return {
      setAppearance: () => {},
      setState: (s) => {
        el.textContent = s;
      },
      setPosition: (p) => {
        pos = { ...p };
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
      },
      setFacing: () => {},
      playEffect: (id, seed) => console.debug('[render:debug] playEffect', id, seed),
      anchors: () => anchorsFromBounds(null, box(), { x: 0, y: 0, scale: 1 }),
      hitRegion: box,
      detach: () => {
        el.style.visibility = 'hidden';
      },
      reattach: () => {
        el.style.visibility = '';
      },
      setFrameBudget: () => {},
      dispose: () => el.remove(),
    };
  },
  async renderScene(_spec, size) {
    const c = new OffscreenCanvas(size.width, size.height);
    const g = c.getContext('2d')!;
    g.fillStyle = '#c8b6ff';
    g.fillRect(0, 0, size.width, size.height);
    return c.transferToImageBitmap();
  },
};
