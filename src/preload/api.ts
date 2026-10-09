// preload 브리지 계약. 기능별 메서드 없이 namespace와 채널 이름으로만 부른다 (10.4).
// 렌더러와 메인이 이 파일의 타입을 함께 쓴다. 채널을 더하면 BRIDGE_VERSION을 올릴 필요는 없고
// 기존 채널의 인자나 결과 모양을 바꿀 때만 올린다.
import type { ActivitySample } from '@shared/schemas';

export interface Rect { x: number; y: number; width: number; height: number }

/** CSP frame-src에 넣을 수 있는 외부 출처: https://host[:port] (manifest externalOrigins). 렌더러와 메인이 같은 검사를 쓴다 */
export const FRAME_ORIGIN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/;

/** 렌더러 → 메인 요청과 결과 */
export interface CoreInvokeMap {
  /** userData 아래 상대 경로의 JSON을 읽는다. 없으면 null */
  'store.read': { args: { path: string }; result: unknown };
  /** userData 아래 상대 경로에 쓸 값. 메인이 파일마다 마지막 값을 들고 있다가 모아서 원자적으로 쓴다 (임시 파일 뒤 이름 바꾸기).
   *  종료와 로그오프 때는 들고 있는 값을 동기로 쓴다 */
  'store.write': { args: { path: string; data: unknown }; result: void };
  /** 좌석 영역 크기로 스테이지 창 크기를 맞춘다. 창은 작업 영역 아래 가운데에 붙는다 */
  'stage.setSize': { args: { width: number; height: number }; result: void };
  /** 클릭을 받을 영역(창 안 CSS 픽셀). 바뀔 때만 보낸다 (10.8.1 클릭 통과) */
  'stage.setInteractive': { args: { rects: Rect[] }; result: void };
  /** window.open 직전에 패널 창 옵션을 알린다. name은 window.open의 두 번째 인자.
   *  keepAlive 창은 사용자가 닫으면 메인이 숨기기만 한다 (SND-04 메모) */
  'win.prepare': { args: { name: string; title: string; width: number; height: number; focusable: boolean; resizable: boolean; keepAlive?: boolean }; result: void };
  /** 숨긴 keepAlive 패널을 다시 보이거나 숨긴다. 이미 열린 패널을 다시 열 때도 win.show로 맨 위로 올린다 */
  'win.show': { args: { name: string }; result: void };
  'win.hide': { args: { name: string }; result: void };
  /** 메인이 CSP frame-src에 쓰는 외부 출처 (device/csp.json) */
  'csp.frameOrigins.get': { args: Record<string, never>; result: string[] };
  /** 출처를 저장한다. 지금 정책과 다르면 스테이지를 다시 읽고 true (앱을 켠 뒤 한 번만) */
  'csp.frameOrigins.set': { args: { origins: string[] }; result: boolean };
  /** OS 알림. 누르면 notify.click 이벤트가 같은 id로 온다 */
  'notify.show': { args: { id: string; title: string; body: string }; result: void };
  /** selfAppKey는 이 앱의 활성 앱 키. 직전에 쓴 다른 앱을 고를 때 뺀다 (FOC-01) */
  'app.info': { args: Record<string, never>; result: { version: string; platform: 'win' | 'mac' | 'other'; dev: boolean; selfAppKey: string | null; material?: boolean } };
  /** 포커스를 받지 않는 스테이지에서도 되도록 메인 프로세스가 클립보드에 쓴다 */
  'clipboard.write': { args: { text: string }; result: void };
  /** http와 https 주소만 기본 브라우저로 연다 (NFR-18) */
  'shell.openExternal': { args: { url: string }; result: void };
  /** 그림 파일 고르기 대화상자. 고르지 않으면 null (OUR-03) */
  'dialog.openImage': { args: Record<string, never>; result: { name: string; bytes: Uint8Array } | null };
  'log.write': { args: { level: 'info' | 'warn' | 'error'; scope: string; message: string }; result: void };
  'shell.openLogFolder': { args: Record<string, never>; result: void };
  'app.quit': { args: Record<string, never>; result: void };
  /** 컴퓨터 켤 때 자동 실행. OS 로그인 항목을 읽고 쓴다 (SET-01) */
  'autostart.get': { args: Record<string, never>; result: boolean };
  'autostart.set': { args: { on: boolean }; result: void };
  /** 연결된 모니터. chosen은 지금 캐릭터가 있는 모니터 (SET-06, NFR-08) */
  'display.list': { args: Record<string, never>; result: Array<{ id: number; primary: boolean; chosen: boolean }> };
  'display.choose': { args: { id: number }; result: void };
  /** 사용자가 더한 그림 앱의 활성 앱 키. 기본 목록은 메인에 있다 (NFR-25, CHR-12) */
  'penApps.get': { args: Record<string, never>; result: string[] };
  'penApps.set': { args: { apps: string[] }; result: void };
  /** 영상 겹침 우회: 스테이지 불투명도 252 (NFR-04). Windows에서만 바뀐다 */
  'stage.setOpacity252': { args: { on: boolean }; result: void };
  /** 스테이지를 다시 놓고 기억한 패널 위치를 지운다 (SET-16) */
  'win.resetPositions': { args: Record<string, never>; result: void };
  /** 로그 폴더의 진단 요약을 새로 쓴다. 메인이 버전, OS, 모니터 줄을 앞에 붙인다 (NFR-21) */
  'diag.write': { args: { lines: string[] }; result: void };
  /** 받아 둔 업데이트 버전. 없으면 null (NFR-19) */
  'update.state': { args: Record<string, never>; result: { version: string | null } };
  /** 받아 둔 업데이트를 설치하고 다시 시작한다 */
  'update.install': { args: Record<string, never>; result: void };
  /** 스테이지를 보이거나 숨긴다 (표시 모드 hidden). 바뀌면 stage.visibility가 온다 */
  'stage.setVisible': { args: { visible: boolean }; result: void };
  /** 스테이지를 다시 읽는다. 연결 해제(ACC-05) 뒤 신원 단계부터 다시 시작한다 */
  'stage.reload': { args: Record<string, never>; result: void };
  /** 효과 창을 열기 직전에 부른다. 캐릭터가 있는 모니터 전체 영역(DIP)을 돌려주고 이어서 window.open('', 'effects:<번호>')로 연다.
   *  효과 창은 투명하고 클릭을 통과하며 포커스를 받지 않는 항상 위 창이다 (10.8.2) */
  'effects.prepare': { args: Record<string, never>; result: Rect };
  /** 연 효과 창의 실제 영역(DIP). OS가 창을 옮겼을 수 있다 (Mac은 메뉴 막대 아래로 내린다). 창이 없으면 null */
  'effects.bounds': { args: { name: string }; result: Rect | null };
  /** 대상 고르기(pickTarget) 동안 ESC를 전역 단축키로 받는다. 누르면 pick.cancel이 온다 */
  'pick.escape': { args: { on: boolean }; result: void };
  /** 창 밝기 (SET-05). 모든 창의 prefers-color-scheme을 바꾼다. system은 OS 설정을 따른다 */
  'theme.set': { args: { source: 'system' | 'light' | 'dark' }; result: void };
  /** 캐릭터가 있는 모니터의 작업 영역 크기(DIP). 스테이지가 좌석 배율과 메뉴 높이를 이 안에 맞춘다. 바뀌면 stage.workArea 이벤트가 온다 */
  'stage.workArea': { args: Record<string, never>; result: { width: number; height: number } };
}

/** 메인 → 렌더러 이벤트 */
export interface CoreEventMap {
  activity: ActivitySample;
  lifecycle: { type: 'suspend' | 'resume' | 'lock' | 'unlock' | 'shutdown' };
  'stage.visibility': { visible: boolean };
  /** 업데이트를 다 받았다 (Windows만) */
  'update.ready': { version: string };
  'notify.click': { id: string };
  'pick.cancel': Record<string, never>;
  /** 캐릭터가 있는 모니터의 작업 영역 크기가 바뀌었다 (모니터 바꾸기, 배율과 해상도 변경) */
  'stage.workArea': { width: number; height: number };
}

export type Dispose = () => void;

export interface Bridge {
  readonly version: number;
  invoke<K extends keyof CoreInvokeMap>(channel: K, args: CoreInvokeMap[K]['args']): Promise<CoreInvokeMap[K]['result']>;
  on<K extends keyof CoreEventMap>(event: K, fn: (payload: CoreEventMap[K]) => void): Dispose;
  /** 모듈의 선택 부분 main.ts용 범용 호출 (mod:<id>:<method>). P0, P1은 쓰지 않는다 */
  invokeModule(moduleId: string, method: string, args: unknown): Promise<unknown>;
}

declare global {
  interface Window { bridge?: Bridge }
}
