// account 공개 타입. 다른 모듈은 @modules/account/api만 import한다
import type { ComponentType } from 'react';

export interface AccountApi {
  /** uid의 프로필 사진 (SCR-03, SND-05). 사진이 없거나 친구가 아니라서 읽지 못하면 빈 동그라미다 */
  Photo: ComponentType<{ uid: string; size: number }>;
  /** 그림 파일을 골라 내 프로필 사진으로 올린다. 사진을 바꿨으면 true, 고르지 않았으면 false.
   *  연결이 끊겼거나 올리지 못하면 사용자에게 보일 글로 reject한다 (호출한 쪽이 알림으로 띄운다) */
  pickPhoto(): Promise<boolean>;
}

declare module '@core/types' {
  interface ModuleApis { account: AccountApi }
}
