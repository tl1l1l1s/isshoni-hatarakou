// 효과 창 (10.8.2). 연출이 있는 동안만 연다. 모니터 전체 크기의 투명하고 클릭을 통과하는 창이고
// DOM은 패널처럼 스테이지 렌더러가 같은 JS 힙에서 그린다. 마지막 효과가 끝나면 닫는다.
import type { Bridge, Rect } from '../../preload/api';
import type { EffectSurface } from './types';
import { copyStyles } from './ui/windows';

export interface OpenSurface { surface: EffectSurface; area: Rect; close: () => void }

export class EffectWindow {
  private win: Promise<{ win: Window; area: Rect } | null> | null = null;
  private count = 0;
  private seq = 0;

  constructor(private bridge: Bridge) {}

  /** 효과 하나가 그릴 루트와 canvas. 창을 열지 못하면 null */
  async open(): Promise<OpenSurface | null> {
    this.count++;
    this.win ??= this.create().catch(() => null);
    const w = await this.win;
    if (!w || w.win.closed) {
      this.release();
      return null;
    }
    const doc = w.win.document;
    const { area } = w;
    const { width, height } = area;
    const dpr = w.win.devicePixelRatio || 1;
    const root = doc.body.appendChild(doc.createElement('div'));
    root.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none';
    // 모니터 전체 크기 canvas는 수십 MB라 효과가 canvas를 읽을 때만 만든다. 효과가 더한 DOM보다 아래에 둔다
    let canvas: HTMLCanvasElement | null = null;
    const surface: EffectSurface = {
      root, width, height,
      get canvas() {
        if (canvas) return canvas;
        const c = (canvas = doc.createElement('canvas'));
        c.width = Math.round(width * dpr);
        c.height = Math.round(height * dpr);
        c.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px`;
        c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
        root.prepend(c);
        return c;
      },
    };
    let closed = false;
    return {
      surface,
      area,
      close: () => {
        if (closed) return;
        closed = true;
        root.remove();
        this.release();
      },
    };
  }

  private release() {
    if (--this.count > 0) return;
    const p = this.win;
    this.win = null;
    void p?.then((w) => w?.win.close());
  }

  private async create() {
    const asked = await this.bridge.invoke('effects.prepare', {});
    const name = `effects:${++this.seq}`;
    const win = window.open('', name);
    if (!win) return null;
    win.document.title = '효과';
    copyStyles(document, win.document);
    // OS가 창을 옮겼을 수 있어서(Mac은 메뉴 막대 아래로 내린다) 실제로 열린 영역을 쓴다
    const area = (await this.bridge.invoke('effects.bounds', { name })) ?? asked;
    return { win, area };
  }
}

/** seed로 정하는 0 이상 1 미만의 수열 (mulberry32). 모든 PC에서 같은 순서로 나온다 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
