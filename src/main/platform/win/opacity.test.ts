import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

const gpu = { gpu_compositing: 'enabled' };
vi.mock('electron', () => ({ app: { getGPUFeatureStatus: () => gpu }, screen: {} }));
const { win } = await import('./index');

function stage() {
  const setOpacity = vi.fn();
  return { setOpacity, w: { setOpacity } as unknown as BrowserWindow };
}

describe('win.overlay.setOpacity252', () => {
  it('GPU 합성이 켜져 있으면 켜고 끄는 대로 불투명도를 바꾼다', () => {
    gpu.gpu_compositing = 'enabled';
    const { w, setOpacity } = stage();
    win.overlay.setOpacity252(w, false);
    win.overlay.setOpacity252(w, true);
    win.overlay.setOpacity252(w, false);
    expect(setOpacity.mock.calls).toEqual([[1], [252 / 255], [1]]);
  });

  it('하드웨어 가속이 꺼져 있으면 켜고 꺼도 창을 건드리지 않는다', () => {
    gpu.gpu_compositing = 'disabled_software';
    const { w, setOpacity } = stage();
    win.overlay.setOpacity252(w, false);
    win.overlay.setOpacity252(w, true);
    win.overlay.setOpacity252(w, false);
    expect(setOpacity).not.toHaveBeenCalled();
  });
});
