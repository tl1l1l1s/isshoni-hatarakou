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
  /** 읽어 보니 모양이 맞지 않는 파일을 <경로>.bak으로 옮긴다. 다음 읽기는 null이다 */
  'store.quarantine': { args: { path: string }; result: void };
  /** 좌석 영역 크기로 스테이지 창 크기를 맞춘다. 창은 작업 영역 아래 가운데에 붙는다. 폭만 바뀌면 왼쪽 끝을 그대로 둔다.
   *  spare(기본 0)는 창 위쪽이 작업 영역 위로 나가도 되는 높이다. 실제로 나간 높이는 stage.cut 이벤트로 온다 */
  'stage.setSize': { args: { width: number; height: number; spare?: number }; result: void };
  /** 클릭을 받을 영역(창 안 CSS 픽셀). 바뀔 때만 보낸다 (10.8.1 클릭 통과) */
  'stage.setInteractive': { args: { rects: Rect[] }; result: void };
  /** window.open 직전에 패널 창 옵션을 알린다. name은 window.open의 두 번째 인자.
   *  keepAlive 창은 사용자가 닫으면 메인이 숨기기만 한다 (SND-04 메모). 창은 작업 영역보다 크면 줄여서 열고
   *  user는 사용자가 누르거나 키를 쳐서 연 창이다. 메인은 모든 패널을 앞 앱을 바꾸지 않고 띄우고 user인 창에만 키보드 포커스를 준다 */
  'win.prepare': { args: { name: string; title: string; width: number; height: number; resizable: boolean; keepAlive?: boolean; user?: boolean }; result: void };
  /** 숨긴 keepAlive 패널을 다시 보이거나 숨긴다. 이미 열린 패널을 다시 열 때도 win.show로 맨 위로 올린다. user면 포커스도 준다 */
  'win.show': { args: { name: string; user?: boolean }; result: void };
  'win.hide': { args: { name: string }; result: void };
  /** 열린 패널을 다른 일반 창 위에 고정하거나 해제한다 */
  'win.setAlwaysOnTop': { args: { name: string; on: boolean }; result: void };
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
  /** 메인이 허락한 호스트(디스코드 웹훅)에만 JSON을 POST한다. 모듈은 ctx.net.post로 쓴다 */
  'net.post': { args: { url: string; json: string }; result: { ok: boolean; status: number } };
  /** 메인이 허락한 주소(유튜브 oEmbed)에서만 JSON을 읽는다. ok가 아니면 json은 null. 모듈은 ctx.net.get으로 쓴다 */
  'net.get': { args: { url: string }; result: { ok: boolean; status: number; json: unknown } };
  /** 그림 파일 고르기 대화상자. 고르지 않으면 null (OUR-03) */
  'dialog.openImage': { args: Record<string, never>; result: { name: string; bytes: Uint8Array } | null };
  'log.write': { args: { level: 'info' | 'warn' | 'error'; scope: string; message: string }; result: void };
  'shell.openLogFolder': { args: Record<string, never>; result: void };
  /** 렌더러가 묻고 저장을 마쳤다. 메인이 바로 끝낸다 */
  'app.quit': { args: Record<string, never>; result: void };
  /** 렌더러가 저장하지 않은 편집을 묻는 중이다. 메인은 1.5초가 지나도 끝내지 않고 기다린다 */
  'app.quitWait': { args: Record<string, never>; result: void };
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
  /** 받아 둔 업데이트 버전. 없으면 null (NFR-19). status는 진단 요약의 업데이트 줄(꺼짐, 확인 전, 오류와 이유) */
  'update.state': { args: Record<string, never>; result: { version: string | null; status?: string } };
  /** 받아 둔 업데이트를 설치하고 다시 시작한다 */
  'update.install': { args: Record<string, never>; result: void };
  /** 스테이지를 보이거나 숨긴다 (표시 모드 hidden). 바뀌면 stage.visibility가 온다 */
  'stage.setVisible': { args: { visible: boolean }; result: void };
  /** 전체 화면 앱 위에서 숨기기 (NFR-04). 켜 두면 그림 앱이 아닌 앱이 캐릭터 모니터를 꽉 채우는 동안 메인이 스테이지를 숨기고
   *  stage.visibility로 알린다. 사용자가 숨긴 것과 따로 둔다 */
  'stage.coverHide': { args: { on: boolean }; result: void };
  /** 스테이지를 다시 읽는다. 연결 해제(ACC-05) 뒤 신원 단계부터 다시 시작한다 */
  'stage.reload': { args: Record<string, never>; result: void };
  /** 효과 창을 열기 직전에 부른다. 캐릭터가 있는 모니터 전체 영역(DIP)을 돌려주고 이어서 window.open('', 'effects:<번호>')로 연다.
   *  효과 창은 투명하고 클릭을 통과하며 포커스를 받지 않는 항상 위 창이다 (10.8.2) */
  'effects.prepare': { args: Record<string, never>; result: Rect };
  /** 연 효과 창의 실제 영역(DIP). OS가 창을 옮겼을 수 있다. 창이 없으면 null */
  'effects.bounds': { args: { name: string }; result: Rect | null };
  /** 대상 고르기(pickTarget) 동안 ESC를 전역 단축키로 받는다. 누르면 pick.cancel이 온다 */
  'pick.escape': { args: { on: boolean }; result: void };
  /** 창 밝기 (SET-05). 모든 창의 prefers-color-scheme을 바꾼다. system은 OS 설정을 따른다 */
  'theme.set': { args: { source: 'system' | 'light' | 'dark' }; result: void };
  /** 캐릭터가 있는 모니터의 작업 영역 크기(DIP). 스테이지가 좌석 배율과 메뉴 높이를 이 안에 맞춘다. 바뀌면 stage.workArea 이벤트가 온다 */
  'stage.workArea': { args: Record<string, never>; result: { width: number; height: number } };
  /** 이름표를 끌어 스테이지를 옮긴다. dx, dy는 pointerdown 자리에서 움직인 거리(DIP)다. 메인은 끄는 동안 클릭 통과를 멈추고
   *  고른 모니터의 작업 영역 안에서만 옮기며(위쪽은 stage.setSize의 spare만큼 나가도 된다) 자리를 모니터마다 기억한다 */
  'stage.drag': { args: { phase: 'start' | 'move' | 'end'; dx: number; dy: number }; result: void };
  /** 렌더러의 처리하지 않은 오류. 메인이 로그에 적고 자동 오류 보고로 모은다 (NFR-21) */
  'crash.report': { args: { type: string; message: string; stack: string }; result: void };
  /** 자동 오류 보고를 보낼 디스코드 웹훅 주소와 켜짐. 메인이 PC에 남겨 렌더러가 없을 때도 보낸다. 끄면 들고 있던 보고도 버린다 */
  'crash.config': { args: { hook: string; enabled: boolean }; result: void };
  /** 아직 서버 기록으로 남기지 않은 자동 오류 보고. 새 보고가 생기면 crash.added 이벤트가 온다 */
  'crash.pending': { args: Record<string, never>; result: Array<{ id: string; text: string }> };
  /** 서버에 남긴 보고를 목록에서 뺀다 */
  'crash.ack': { args: { ids: string[] }; result: void };
}

/** 메인 → 렌더러 이벤트 */
export interface CoreEventMap {
  activity: ActivitySample;
  lifecycle: { type: 'suspend' | 'resume' | 'lock' | 'unlock' | 'shutdown' };
  /** 스테이지가 지금 보이는지. 사용자가 숨겼거나 전체 화면 앱 위라서 숨었으면 false */
  'stage.visibility': { visible: boolean };
  /** 업데이트를 다 받았다 (Windows만) */
  'update.ready': { version: string };
  /** 업데이트 상태 줄이 바뀌었다 (받음, 오류와 이유). 처음 값은 update.state의 status다 */
  'update.status': { status: string };
  'notify.click': { id: string };
  'pick.cancel': Record<string, never>;
  /** 캐릭터가 있는 모니터의 작업 영역 크기가 바뀌었다 (모니터 바꾸기, 배율과 해상도 변경) */
  'stage.workArea': { width: number; height: number };
  /** 메인이 스테이지 창 크기를 바꿨다. 렌더러는 창의 resize 이벤트가 오지 않아도 이 크기에 맞춰 클릭 영역을 다시 보낸다 */
  'stage.resized': { width: number; height: number };
  /** 스테이지 창 위쪽이 작업 영역 위로 나간 높이(DIP)가 바뀌었다. 렌더러는 알림과 말풍선을 그만큼 아래에 띄운다 */
  'stage.cut': { top: number };
  /** keepAlive 패널을 닫아 숨겼거나(visible false) 다시 띄웠다. name은 window.open의 창 이름.
   *  about:blank 패널은 스테이지의 backgroundThrottling: false를 물려받아 숨겨도 문서가 visible로 남으므로 코어가 이 이벤트로 문서에 반영한다 */
  'win.visibility': { name: string; visible: boolean };
  /** 트레이 종료나 Mac Cmd+Q(ask), 로그오프나 업데이트 설치로 끝낸다. 렌더러는 ask면 저장하지 않은 편집을 묻고 모듈에 shutdown을 알려 저장한 뒤 app.quit을 부른다 */
  'quit.request': { ask: boolean };
  /** 메인이 새 자동 오류 보고를 만들었다. 렌더러는 crash.pending으로 받아 서버 기록으로 남긴다 */
  'crash.added': Record<string, never>;
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
