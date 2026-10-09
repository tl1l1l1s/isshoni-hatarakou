import type { Dispose } from './types';

type Handler = (payload: unknown) => void;

/** 같은 프로세스 안의 이벤트. 처리 함수마다 오류를 따로 잡는다 (10.5 emits, on) */
export class Bus {
  private handlers = new Map<string, Set<Handler>>();
  constructor(private onError: (name: string, e: unknown) => void = (n, e) => console.error(`[bus] ${n}`, e)) {}

  on(name: string, fn: Handler): Dispose {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(name: string, payload: unknown): void {
    for (const fn of [...(this.handlers.get(name) ?? [])]) {
      try {
        fn(payload);
      } catch (e) {
        this.onError(name, e);
      }
    }
  }
}
