// growth 공개 타입. 다른 모듈은 이 파일만 import한다
export interface GrowthApi {
  level(): number;
  /** 화면에 보이는 레벨 글자. 2회차부터는 ☆N */
  levelText(): string;
  /** 이번 레벨에서 채운 비율 0..1 */
  xp(): number;
}

declare module '@core/types' {
  interface ModuleApis { growth: GrowthApi }
}
