import type { Dispose } from './types';

/** 모듈 하나가 ctx로 만든 구독, 타이머, 창을 모아 두었다가 한 번에 정리한다 (10.5 setup과 해제) */
export class Scope {
  private items: Dispose[] = [];
  add(d: Dispose): Dispose {
    this.items.push(d);
    return () => {
      this.items = this.items.filter((x) => x !== d);
      d();
    };
  }
  dispose(): void {
    const items = this.items.reverse();
    this.items = [];
    for (const d of items) {
      try {
        d();
      } catch (e) {
        console.error('[scope] dispose failed', e);
      }
    }
  }
}
