// scheduler 공개 타입과 달력 날짜 계산. 다른 모듈은 @modules/scheduler/api만 import한다
import { KST_OFFSET_MS } from '@shared/constants';

const DAY_MS = 86_400_000;

/** 한국 시간 자정에 바뀌는 달력 날짜 'YYYY-MM-DD'. 포커스 기록의 오전 6시 기준과 다르다 (HOM-16, HOM-21) */
export const calendarDay = (ms: number): string => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
export const addDays = (date: string, n: number): string => new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
/** a에서 b까지의 날 수. b가 앞이면 음수 */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

/** 내 일정과 친구가 공개한 일정 하나. who는 친구 이름이고 내 일정이면 빈 문자열 */
export interface PlanItem { id: string; owner: string; who: string; date: string; title: string }

export interface SchedulerApi {
  /** 지금까지 받은 내 일정과 친구 공개 일정 */
  items(): PlanItem[];
}

declare module '@core/types' {
  interface ModuleApis { scheduler: SchedulerApi }
  interface EventMap { 'scheduler.changed': null }
}
