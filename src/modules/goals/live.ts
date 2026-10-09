// setup이 채우고 달성표 창이 구독하는 상태
import type { FocusApi } from '@modules/focus/api';
import { NO_GOAL, type Cfg, type Day } from './logic';

const subs = new Set<() => void>();

export const live = {
  focus: null as FocusApi | null,
  cfg: NO_GOAL as Cfg,
  /** 최근 날짜 키별 기록 */
  days: {} as Record<string, Day>,
  version: 0,
  set(p: Partial<{ cfg: Cfg; days: Record<string, Day> }>) {
    Object.assign(live, p);
    live.version++;
    subs.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => void subs.delete(fn);
  },
};
