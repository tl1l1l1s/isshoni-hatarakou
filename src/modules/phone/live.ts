// setup이 채우고 폰 연결 탭이 구독하는 상태
import type { Sig } from './logic';

const subs = new Set<() => void>();

export const live = {
  key: null as string | null,
  sig: null as Sig | null,
  /** 마지막으로 새 신호를 받은 이 PC 시각 (신호 받음 표시) */
  gotAt: 0,
  version: 0,
  set(p: Partial<{ key: string | null; sig: Sig | null; gotAt: number }>) {
    Object.assign(live, p);
    live.version++;
    subs.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => void subs.delete(fn);
  },
};
