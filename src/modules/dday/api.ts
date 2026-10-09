// dday 공개 타입. 다른 모듈은 @modules/dday/api만 import한다
export interface DdayCard { id: string; name: string; date: string; notify: boolean }

export interface DdayApi {
  /** 내 D-day 카드 */
  cards(): DdayCard[];
}

declare module '@core/types' {
  interface ModuleApis { dday: DdayApi }
  interface EventMap { 'dday.changed': null }
}
