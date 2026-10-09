// OS마다 동작이 다른 곳만 adapter로 둔다 (10.8.1). 유휴 시간과 커서 위치는 Electron이 같은 API로 주지만
// 시험에서 바꿀 수 있도록 FakePlatform이 함께 가짜를 준다.
import type { BrowserWindow, BrowserWindowConstructorOptions, Point } from 'electron';
import type { AppKey } from '@shared/appkey';

export interface ActiveWindow {
  /** 앞에 있는 앱. 창 제목은 읽지도 돌려주지도 않는다 */
  foreground(): Promise<{ appKey: AppKey | null; unknownReason: string | null }>;
}

export interface PenApps {
  /** 기본 목록이나 user에 있으면 그림 앱 */
  isPen(appKey: AppKey): boolean;
  /** 사용자가 설정에서 더한 앱 (NFR-25) */
  readonly user: Set<AppKey>;
}

export interface AutoStart {
  get(): boolean;
  set(on: boolean): void;
}

export interface Overlay {
  /** 스테이지 창 옵션. webPreferences와 크기는 창 관리자가 더한다 */
  options: BrowserWindowConstructorOptions;
  afterCreate(win: BrowserWindow): void;
  /** 영상 겹침 우회: 불투명도 252 (NFR-04). 지원하지 않는 OS는 아무것도 하지 않는다 */
  setOpacity252(win: BrowserWindow, on: boolean): void;
}

export interface Platform {
  activeWindow: ActiveWindow;
  penApps: PenApps;
  autoStart: AutoStart;
  overlay: Overlay;
  idleSeconds(): number;
  cursorPoint(): Point;
}
