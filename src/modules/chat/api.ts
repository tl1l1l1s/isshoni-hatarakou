// chat 공개 타입. 다른 모듈은 이 파일만 import한다
import type { Dispose } from '@core/types';

export interface ChatApi {
  /** 보낼 글을 채팅보다 먼저 받는다. true를 돌려주면 채팅으로 보내지 않는다 (춤 명령, 날리기) */
  intercept(fn: (text: string) => boolean): Dispose;
}

declare module '@core/types' {
  interface ModuleApis { chat: ChatApi }
  interface EventMap {
    /** 대화하기 창이 닫혀 있을 때 다른 사람의 새 메시지를 받았다 (COM-03 알림음) */
    'chat.heard': { uid: string };
  }
}
