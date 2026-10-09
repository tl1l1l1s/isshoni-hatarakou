// setup이 채우는 상태. manifest의 자세 조건과 기록 창은 setup 밖에 있어서 여기서 읽는다
import type { FocusApi } from './api';
import type { Reason } from './logic';

export const live: {
  api: FocusApi | null;
  /** 좌석에 보이는 깨어 있음 (피규어 모드면 늘 true) */
  shown: boolean;
  typing: boolean;
  /** 지금 이어서 작업한 초. 잠들면 0 */
  streakSec: number;
  reason: Reason | null;
} = { api: null, shown: false, typing: false, streakSec: 0, reason: null };
