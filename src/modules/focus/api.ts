// focus 공개 타입. 다른 모듈은 이 파일만 import한다
import type { Dispose } from '@core/types';

export interface FocusApi {
  /** 오늘(오전 6시 기준) 집중한 초 */
  todaySec(): number;
  /** 모든 기기를 더한 누적 초 */
  totalSec(): number;
  /** 등록 앱 키별 오늘 초. 앱 키는 이 PC 밖으로 보내지 않는다 */
  todayByApp(): Record<string, number>;
  /** 누적 초가 바뀌면 부른다 */
  onTotal(fn: (totalSec: number) => void): Dispose;
  /** PC 밖 출처를 더한다 (focus.sources, FOC-09). 켜져 있는 동안은 PC 입력을 보지 않고 시간을 센다 */
  addSource(src: FocusSource): Dispose;
}

export interface FocusSource { id: string; active(): boolean }

/** appKey는 bus 안에서만 쓴다 (10.5 규칙 8). source는 pc나 출처 id이고 출처 시간의 appKey는 출처 id다 */
export interface FocusTick { sec: number; dayKey: string; appKey: string; source: string }

declare module '@core/types' {
  interface ModuleApis { focus: FocusApi }
  interface EventMap {
    'focus.tick': FocusTick;
    'focus.awakeChanged': { awake: boolean };
  }
}
