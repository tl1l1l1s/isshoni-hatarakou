// account 공개 타입. 다른 모듈은 @modules/account/api만 import한다
import type { ComponentType } from 'react';

export interface AccountApi {
  /** uid의 프로필 사진 (SCR-03, SND-05). 사진이 없거나 친구가 아니라서 읽지 못하면 빈 동그라미다 */
  Photo: ComponentType<{ uid: string; size: number }>;
}

declare module '@core/types' {
  interface ModuleApis { account: AccountApi }
}
