// 레벨 계산 (GRW-01, CHR-02, GRW-04, GRW-07)
export const MAX_LEVEL = 999;
export const SECONDS_PER_LEVEL = 3600;
/** 회차 상한. 누적은 99,900레벨분에서 멈춘다 (GRW-04) */
export const MAX_ROUNDS = 100;

/** 1에서 시작해 누적 1시간마다 1씩 오르고 999에서 멈춘다. 회차와 상관없는 평생 레벨이라 보상(gate)은 이 값을 본다 */
export const levelOf = (totalSec: number): number =>
  Math.min(MAX_LEVEL, 1 + Math.floor(totalSec / SECONDS_PER_LEVEL));

/** 이번 레벨에서 채운 비율 0..1 (경험치 바) */
export const xpOf = (totalSec: number): number => (totalSec % SECONDS_PER_LEVEL) / SECONDS_PER_LEVEL;

/** 회차와 화면에 보이는 레벨. 999레벨분을 채울 때마다 회차가 넘어가고 레벨은 1부터 다시 보인다 (GRW-04) */
export function roundOf(totalSec: number): { round: number; level: number } {
  const per = MAX_LEVEL * SECONDS_PER_LEVEL;
  const t = Math.min(Math.max(0, totalSec), MAX_ROUNDS * per - 1);
  return { round: 1 + Math.floor(t / per), level: 1 + Math.floor((t % per) / SECONDS_PER_LEVEL) };
}

/** 다음 레벨까지 남은 집중 시간 글. 45분, 1시간 */
export function leftText(sec: number): string {
  const m = Math.ceil(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`;
}

/** 2회차부터는 Lv. 대신 별을 붙인다 */
export const levelText = (round: number, level: number): string => `${round >= 2 ? '☆' : 'Lv.'}${level}`;

/** 레벨 티어 (GRW-07). steps는 티어가 하나씩 오르는 레벨 목록이고 0이 가장 낮다 */
export const tierOf = (level: number, steps: readonly number[]): number => steps.filter((s) => level >= s).length;

/** 레벨로 여는 보상은 다른 모듈이 growth의 level에 gate로 선언한다 (GRW-02) */
export const isReward = (g: { module: string; key: string }): boolean => g.module === 'growth' && g.key === 'level';
