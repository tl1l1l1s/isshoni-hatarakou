// pomodoro 공개 타입. 다른 모듈은 @modules/pomodoro/api만 import한다
import type { Dispose } from '@core/types';

export interface PomodoroApi {
  /** 개인 타이머가 도는 중인지 (일시정지한 타이머도 돈다고 본다) */
  running(): boolean;
  /** 개인 타이머를 끝낸다. 창의 끝 단추와 같다 */
  stop(): void;
  /** 개인 타이머가 돌기 시작하거나 끝나면 부른다 */
  onChange(fn: (running: boolean) => void): Dispose;
  /** 끝날 때 소리를 켰으면 짧은 두 음을 낸다 */
  chime(): void;
}

declare module '@core/types' {
  interface ModuleApis { pomodoro: PomodoroApi }
}
