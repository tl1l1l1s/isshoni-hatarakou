// friends 공개 타입. 다른 모듈은 @modules/friends/api만 import한다
import type { Dispose } from '@core/types';

export interface FriendsApi {
  /** 내 친구 목록 mod/friends/u/{me}/list. 처음 받기 전에는 빈 목록 */
  list(): Array<{ uid: string }>;
  onChange(fn: (list: Array<{ uid: string }>) => void): Dispose;
  isFriend(uid: string): boolean;
}

declare module '@core/types' {
  interface ModuleApis { friends: FriendsApi }
}
