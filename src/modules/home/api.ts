// home 공개 타입. 다른 모듈은 @modules/home/api만 import한다
import type { ComponentType } from 'react';
import type { Dispose } from '@core/types';

/** 마이홈 탭 화면이 받는 값. owner는 지금 보는 마이홈 주인이고 mine이 false면 친구 방문이라 읽기 전용이다 */
export interface HomeTabProps { owner: string; name: string; mine: boolean }

/** 마이홈 창에 더하는 탭 (home.tabs). order가 작을수록 앞이고 [마이홈] [친구] 뒤에 놓인다 */
export interface HomeTab { id: string; label: string; order?: number; component: ComponentType<HomeTabProps> }

export interface HomeApi {
  addTab(tab: HomeTab): Dispose;
}

declare module '@core/types' {
  interface ModuleApis { home: HomeApi }
}
