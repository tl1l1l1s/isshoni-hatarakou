// 스테이지 창과 패널 창 (10.4). 스테이지는 투명하고 좌석 영역 크기이며 포커스를 받지 않는다
import { BrowserWindow, globalShortcut, screen } from 'electron';
import log from 'electron-log/main';
import { join } from 'node:path';
import type { CoreEventMap, CoreInvokeMap, Rect } from '../../preload/api';
import type { Store } from '../store';
import { report } from '../crash';
import { anchorOf, clampIn, pickDisplay, placeAt, placeKey, remember, type Anchor, type SavedDisplay } from '../display';
import { platform, panelMaterial, selfAppKey } from '../platform';
import type { Foreground } from '../platform/ports';
import { pageUrl } from '../protocol';

type Prepared = CoreInvokeMap['win.prepare']['args'];
/** 패널 제목 표시줄 높이(DIP). 두 OS 모두 32보다 작다 */
const TITLE_BAR_H = 32;

let stage: BrowserWindow | null = null;
let size = { width: 400, height: 200 };
/** 창 위쪽이 작업 영역 위로 나가도 되는 높이 (stage.setSize). 렌더러가 메뉴를 닫은 동안 캐릭터 클릭 영역 위 빈 곳만큼 보낸다 */
let spare = 0;
let rects: Rect[] = [];
let hidden = false;
let quitting = false;
let crashes = 0;
let lastCrash = 0;
const prepared = new Map<string, Prepared>();
/** 열린 패널 창과 효과 창. 키는 window.open의 창 이름 */
const panels = new Map<string, BrowserWindow>();

// 패널 위치 기억 (SCR-07). 다시 열 때 같은 자리에 띄우고 위치 초기화 때 지운다
const WINDOWS_FILE = 'device/windows.json';
type Bounds = { x: number; y: number; width: number; height: number };
let store: Store | null = null;
export const useStore = (s: Store) => void (store = s);
const savedBounds = () => (store?.read(WINDOWS_FILE) ?? {}) as Record<string, Bounds>;
const saveBounds = (name: string, w: BrowserWindow) => !isEffects(name) && store?.write(WINDOWS_FILE, { ...savedBounds(), [name]: w.getBounds() });

// 효과 창 (10.8.2). 연출 동안만 렌더러가 effects:<번호> 이름으로 열고 마지막 연출이 끝나면 닫는다.
// 이름마다 새 창이라 닫히는 중인 창을 window.open이 다시 돌려주지 않는다
const isEffects = (name: string) => name.startsWith('effects:');
/** 효과 창 이름마다 연 영역. 효과 좌표는 이 영역 기준이다 */
const effectsAreas = new Map<string, Rect>();
/** 실행 화면 둘레 효과 창의 여백. 폭탄 포물선(160px)과 춤의 뛰기가 실행 화면 위로 나가는 만큼 위쪽을 넉넉히 둔다 */
const NEAR = { top: 240, side: 120, bottom: 40 };
/** wide면 캐릭터가 있는 모니터 전체(날리기, 채팅 날리기), 아니면 실행 화면 둘레만 덮는다.
 *  창 버퍼가 창 크기에 비례하므로 춤처럼 캐릭터 둘레에서 끝나는 효과는 작은 창에 그린다 (ADR 0025) */
export function prepareEffects(name: string, wide: boolean): Rect {
  const d = currentDisplay().bounds;
  const s = stage?.getBounds();
  let area: Rect = { x: d.x, y: d.y, width: d.width, height: d.height };
  if (!wide && s) {
    const x = Math.max(d.x, s.x - NEAR.side);
    const y = Math.max(d.y, s.y - NEAR.top);
    area = { x, y, width: Math.min(d.x + d.width, s.x + s.width + NEAR.side) - x, height: Math.min(d.y + d.height, s.y + s.height + NEAR.bottom) - y };
  }
  effectsAreas.set(name, area);
  return area;
}
export function effectsBounds(name: string): Rect | null {
  const w = panels.get(name);
  return isEffects(name) && w && !w.isDestroyed() ? w.getBounds() : null;
}

// 사용자가 이름표를 끌어 옮긴 스테이지 자리 (모니터마다, placeKey). 위치 초기화 때 지운다
const PLACE_FILE = 'device/stage-place.json';
const savedPlaces = () => (store?.read(PLACE_FILE) ?? {}) as Record<string, Anchor>;

// 캐릭터를 띄울 모니터 (SET-06, NFR-08). undefined는 아직 읽지 않음
const DISPLAY_FILE = 'device/display.json';
let chosen: SavedDisplay | null | undefined;
const savedDisplay = () => (chosen === undefined ? (chosen = (store?.read(DISPLAY_FILE) as SavedDisplay | null) ?? null) : chosen);
export const currentDisplay = () => pickDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay(), savedDisplay());
const keyOf = (d: Electron.Display) => placeKey(d, savedDisplay());

export function listDisplays() {
  const cur = currentDisplay().id;
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d) => ({ id: d.id, primary: d.id === primary, chosen: d.id === cur }));
}

export function chooseDisplay(id: number): void {
  const d = screen.getAllDisplays().find((x) => x.id === id);
  if (!d) throw new Error('연결되지 않은 모니터입니다');
  chosen = remember(d);
  store?.write(DISPLAY_FILE, chosen);
  kept = null;
  place();
}

// 영상 겹침 우회 (NFR-04). 환경 변수는 Windows 점검표에서 켠다
const OPACITY_252_ENV = process.env.ISSHONI_OPACITY_252 === '1';
let opacity252 = false;
const applyOpacity = () => stage && platform.overlay.setOpacity252(stage, opacity252 || OPACITY_252_ENV);
export function setOpacity252(on: boolean): void {
  opacity252 = on;
  applyOpacity();
}

/** 진단 요약에 넣을 모니터와 스테이지 줄 (NFR-21) */
export function displayLines(): string[] {
  const cur = currentDisplay().id;
  const primary = screen.getPrimaryDisplay().id;
  return [
    ...screen.getAllDisplays().map(
      (d, i) =>
        `모니터 ${i + 1}${d.id === primary ? ' (기본)' : ''}${d.id === cur ? ' (캐릭터)' : ''}: ${d.size.width}x${d.size.height} 배율 ${d.scaleFactor} 위치 ${d.bounds.x},${d.bounds.y} 회전 ${d.rotation}`,
    ),
    `스테이지 ${JSON.stringify(stage?.getBounds() ?? null)}, 화면 공유 깜빡임 줄이기 ${opacity252 || OPACITY_252_ENV ? '켜짐' : '꺼짐'}`,
  ];
}

/** 저장한 위치가 지금 모니터 작업 영역 안에 보일 때만 쓴다 */
function visible(b: Bounds | undefined): b is Bounds {
  if (!b) return false;
  const wa = screen.getDisplayMatching(b).workArea;
  return b.x >= wa.x - b.width / 2 && b.y >= wa.y && b.x + b.width / 2 <= wa.x + wa.width && b.y + 40 <= wa.y + wa.height;
}

/** 종료가 정해졌다 (quit.ts). 이 뒤로는 패널 닫기를 막지 않고 keepAlive 패널도 닫고 스테이지를 다시 만들지 않는다 */
export const setQuitting = () => void (quitting = true);

export const getStage = () => stage;
export const getRects = () => rects;
export const setRects = (r: Rect[]) => void (rects = r);
export const prepare = (p: Prepared) => void prepared.set(p.name, p);

export function setPanelAlwaysOnTop(name: string, on: boolean): void {
  const w = panels.get(name);
  if (!w || w.isDestroyed()) throw new Error('창이 닫혀 있어요.');
  w.setAlwaysOnTop(on, 'floating');
}

/** 패널을 다시 보이거나(이미 열린 패널을 다시 열 때도) 숨긴다. 키보드 포커스는 사용자가 연 창(user)에만 준다 */
export function setPanelVisible(name: string, show: boolean, user = false): void {
  const w = panels.get(name);
  if (!w || w.isDestroyed()) return;
  if (show) {
    // 숨긴 사이 모니터가 빠졌으면 화면 밖에 뜨지 않게 가운데로 옮긴다
    if (!visible(w.getBounds())) w.center();
    raise(w);
    if (user) w.focus();
    send('win.visibility', { name, visible: true });
    return;
  }
  hidePanel(name, w);
}

/** 포커스를 주지 않고 보이는 창(모듈이 저절로 연 창)도 다른 앱 뒤에 남지 않게 다시 보일 때마다 맨 위로 올린다 */
function raise(w: BrowserWindow): void {
  w.showInactive();
  w.moveTop();
}

/** 닫아서 숨기는 keepAlive 패널. about:blank 패널은 스테이지의 backgroundThrottling: false를 그대로 물려받아 창을 숨겨도 문서가
 *  visible로 남으므로(webContents.setBackgroundThrottling(true)로도 바뀌지 않는다) 렌더러에 알려 문서에 숨김을 반영하게 한다.
 *  화면 숨기기로 함께 숨는 패널도 같은 이벤트를 받아 재생을 멈춘다 */
function hidePanel(name: string, w: BrowserWindow): void {
  saveBounds(name, w);
  w.hide();
  send('win.visibility', { name, visible: false });
}

/** 대상 고르기 동안만 ESC를 전역으로 받는다. 렌더러가 풀지 못해도 10초 뒤나 스테이지가 다시 읽히거나 다시 만들어질 때 푼다 */
let escTimer: ReturnType<typeof setTimeout> | undefined;
export function pickEscape(on: boolean): void {
  clearTimeout(escTimer);
  globalShortcut.unregister('Escape');
  if (!on) return;
  globalShortcut.register('Escape', () => send('pick.cancel', {}));
  escTimer = setTimeout(() => pickEscape(false), 10_000);
}

/** 스테이지가 다시 읽히거나 다시 만들어지면 portal이 사라지므로 패널도 닫는다.
 *  남겨 두면 같은 이름의 window.open이 숨은 옛 창을 그대로 돌려준다 */
function closePanels(): void {
  pickEscape(false);
  for (const [name, w] of panels) {
    if (w.isDestroyed()) continue;
    saveBounds(name, w);
    w.destroy();
  }
  panels.clear();
}

export const reloadStage = () => void stage?.webContents.reload();

export function send<K extends keyof CoreEventMap>(event: K, payload: CoreEventMap[K]): void {
  if (stage && !stage.isDestroyed()) stage.webContents.send(`core:${event}`, payload);
}

/** 렌더러가 좌석 배율과 메뉴 높이를 맞출 작업 영역 크기 */
export function workArea(): { width: number; height: number } {
  const { width, height } = currentDisplay().workArea;
  return { width, height };
}

/** 고른 모니터(없으면 주 모니터) 작업 영역의 끌어 둔 자리, 없으면 아래 가운데. 작업 영역 밖으로 나가지 않게 맞추고(위쪽은 spare만큼 나가도 된다) 크기와 위치가 같으면 다시 적용하지 않는다.
 *  작업 영역 크기가 마지막으로 알린 것과 다르면 렌더러에 알린다.
 *  ponytail: 위쪽에 끌어 둔 캐릭터의 메뉴를 열면 창이 작업 영역 안에 남도록 아래로 밀려 캐릭터가 메뉴를 닫을 때까지 내려간다. 거슬리면 메뉴를 아래로 연다 */
let toldArea = '';
/** 이번 실행에서 좌석 수가 바뀌어 왼쪽 끝을 둔 자리 (setSize). 끌어 둔 자리 파일에는 남기지 않고 끌기, 위치 초기화, 모니터 고르기가 지운다 */
let kept: Anchor | null = null;
export function place(): void {
  if (!stage) return;
  const d = currentDisplay();
  const wa = d.workArea;
  applyBounds(stage, placeAt(wa, size, kept ?? savedPlaces()[keyOf(d)], spare));
  tellCut(wa, stage.getBounds());
  const key = `${wa.width}x${wa.height}`;
  if (key === toldArea) return;
  toldArea = key;
  send('stage.workArea', { width: wa.width, height: wa.height });
}

/** 창 위쪽이 작업 영역 위로 나간 높이. 바뀔 때만 알리고 렌더러는 알림과 말풍선을 그만큼 내린다.
 *  스테이지를 다시 읽어도 첫 크기는 spare 0으로 오므로 여기도 0으로 돌아가 렌더러의 처음 값과 맞는다 */
let toldCut = 0;
function tellCut(area: Rect, b: Bounds): void {
  const top = Math.max(0, area.y - b.y);
  if (top === toldCut) return;
  toldCut = top;
  send('stage.cut', { top });
}

/** 이름표를 끄는 동안 시작할 때의 창 아래 가운데 점. 렌더러가 보낸 포인터 이동만큼 옮긴다 */
let dragFrom: { x: number; y: number } | null = null;
let holdUntil = 0;
/** 끄는 동안 커서가 클릭 영역을 잠깐 벗어나도 클릭 통과로 바꾸지 않는다. 렌더러가 끝을 알리지 못해도 2초 뒤에 풀린다 */
export const dragging = () => Date.now() < holdUntil;

/** 고른 모니터의 작업 영역 안에서만 옮기고(위쪽은 spare만큼 나가도 된다) 모니터마다 자리를 기억한다 */
export function dragStage(phase: 'start' | 'move' | 'end', dx: number, dy: number): void {
  if (!stage) return;
  if (phase === 'start') {
    const b = stage.getBounds();
    dragFrom = { x: b.x + b.width / 2, y: b.y + b.height };
    kept = null;
  }
  if (!dragFrom) return;
  if (phase === 'end') {
    dragFrom = null;
    holdUntil = 0;
    return place();
  }
  holdUntil = Date.now() + 2000;
  const d = currentDisplay();
  const b = clampIn(d.workArea, { x: Math.round(dragFrom.x + dx - size.width / 2), y: Math.round(dragFrom.y + dy - size.height), ...size }, spare);
  store?.write(PLACE_FILE, { ...savedPlaces(), [keyOf(d)]: anchorOf(d.workArea, b) });
  applyBounds(stage, b);
  tellCut(d.workArea, stage.getBounds());
}

const same = (a: Bounds, b: Bounds) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
/** 배율이 다른 모니터로 옮기면 Windows의 DPI 변경 처리가 위치와 크기를 다시 바꿀 수 있어 다르면 한 번 더 놓는다 */
function applyBounds(w: BrowserWindow, b: Bounds): void {
  if (same(w.getBounds(), b)) return;
  w.setBounds(b);
  if (!same(w.getBounds(), b)) w.setBounds(b);
}

/** 좌석이 늘거나 줄어 폭만 바뀌면 왼쪽 끝을 그대로 두고 이번 실행 동안 그 자리를 쓴다(kept). 아래 가운데 점에 맞추면 맨 왼쪽의 내 캐릭터가
 *  누가 들어오고 나갈 때마다 옆으로 뛴다. 높이가 바뀌면(메뉴, 런처 화면) 그 자리에 다시 놓는다. spare만 바뀌어도 다시 놓는다 */
export function setSize(width: number, height: number, nextSpare = 0): void {
  const next = { width: Math.ceil(width), height: Math.ceil(height) };
  const widthOnly = next.height === size.height && next.width !== size.width;
  size = next;
  spare = Math.floor(nextSpare);
  if (stage && widthOnly && !dragFrom) {
    const d = currentDisplay();
    const wa = d.workArea;
    const { x } = anchorOf(wa, clampIn(wa, { ...stage.getBounds(), ...size }, spare));
    // 아래 끝은 지금 창이 아니라 놓으려던 자리를 따른다. 메뉴를 열었거나 키 큰 좌석이 들어와 spare가 줄면 지금 창은 아래로 밀려 있다
    kept = { x, y: (kept ?? savedPlaces()[keyOf(d)])?.y ?? 1 };
  }
  place();
}

/** 화면 숨김 때 함께 숨긴 패널. 다시 보일 때 이 패널만 띄운다 (SET-03) */
let hiddenPanels: BrowserWindow[] = [];

// 전체 화면 앱 위에서 숨기기 (NFR-04). 그림 앱이 아닌 다른 앱의 창이 캐릭터 모니터를 꽉 채우면 스테이지만 숨기고 끝나면 다시 띄운다.
// 사용자가 숨긴 것(hidden)과 따로 두고 그동안 사용자가 보이기를 누르면 그 전체 화면이 끝날 때까지 보인다(revealed)
let covered = false;
let coverHide = true;
let revealed = false;
const shown = () => !hidden && !(covered && coverHide && !revealed);

function applyStage(): void {
  const v = shown();
  if (stage) {
    if (v) stage.showInactive();
    else stage.hide();
  }
  send('stage.visibility', { visible: v });
}

/** 설정 화면 탭의 전체 화면 앱 위에서 숨기기 */
export function setCoverHide(on: boolean): void {
  if (on === coverHide) return;
  coverHide = on;
  applyStage();
}

/** 활동 샘플마다 앞 창으로 부른다. 앞 창이 캐릭터 모니터 전체와 1px 안에서 같아야 전체 화면으로 본다.
 *  최대화한 창은 테두리만큼 모니터보다 크거나 작업 표시줄만큼 작아서 숨기지 않는다 */
export function checkCover(fg: Foreground): void {
  const d = currentDisplay().bounds;
  const b = fg.bounds;
  const full = !!b && Math.abs(b.x - d.x) <= 1 && Math.abs(b.y - d.y) <= 1 && Math.abs(b.width - d.width) <= 1 && Math.abs(b.height - d.height) <= 1;
  const next = full && fg.appKey !== selfAppKey && !(fg.appKey && platform.penApps.isPen(fg.appKey));
  if (next === covered) return;
  covered = next;
  revealed = false;
  applyStage();
}

/** 사용자가 보이거나 숨긴다 (트레이, 단축키, 회사원 모드 숨기기, 다시 실행). 보이기는 전체 화면 앱 위에서도 보인다 */
export function setVisible(visible: boolean): void {
  const changed = hidden === visible;
  hidden = !visible;
  if (visible) revealed = covered;
  if (changed && !visible) {
    hiddenPanels = [...panels.values()].filter((w) => !w.isDestroyed() && w.isVisible());
    for (const [name, w] of panels) if (hiddenPanels.includes(w)) hidePanel(name, w);
  } else if (changed) {
    for (const [name, w] of panels) if (hiddenPanels.includes(w) && !w.isDestroyed()) {
      raise(w);
      send('win.visibility', { name, visible: true });
    }
    hiddenPanels = [];
  }
  applyStage();
}

export const toggle = () => setVisible(!shown());

/** 위치 초기화 (SET-16): 끌어 둔 스테이지 자리와 기억한 패널 위치를 지우고 스테이지를 아래 가운데에, 열린 패널을 가운데로 옮긴다 */
export function resetPositions(): void {
  store?.write(WINDOWS_FILE, {});
  store?.write(PLACE_FILE, {});
  kept = null;
  for (const w of BrowserWindow.getAllWindows()) if (w !== stage) w.center();
  place();
  setVisible(true);
}

export function createStage(): void {
  const win = new BrowserWindow({
    ...platform.overlay.options,
    ...size,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/bridge.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      // 맞춤법 검사는 쓰지 않는다. Windows에서는 켜 두면 Hunspell 사전을 내려받아 올린다. about:blank 패널과 효과 창도 이 값을 물려받는다
      spellcheck: false,
    },
  });
  stage = win;
  rects = [];
  dragFrom = null;
  holdUntil = 0;
  // 창이 줄어들 때 렌더러에 resize 이벤트가 오지 않는 경우가 있어 메인이 바뀐 크기를 알린다. 렌더러는 이 크기로 클릭 영역을 다시 보낸다
  win.on('resize', () => {
    const { width, height } = win.getContentBounds();
    send('stage.resized', { width, height });
  });
  platform.overlay.afterCreate(win);
  applyOpacity();
  win.setIgnoreMouseEvents(true);
  place();
  win.once('ready-to-show', () => {
    if (shown()) win.showInactive();
  });
  win.on('unresponsive', () => {
    report('unresponsive', '스테이지가 응답하지 않아 다시 만듭니다');
    recreate(win, 'unresponsive');
  });
  win.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit') recreate(win, d.reason);
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('did-start-navigation', (d) => {
    if (d.isMainFrame && !d.isSameDocument) closePanels();
  });
  // 패널은 win.prepare로 알린 이름의 about:blank만 연다. 같은 렌더러 프로세스에서 React portal로 그린다
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    const area = isEffects(frameName) ? effectsAreas.get(frameName) : undefined;
    if (area && url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { ...platform.overlay.options, ...area, focusable: false, resizable: false, show: false } };
    }
    const p = prepared.get(frameName);
    if (url !== 'about:blank' || !p) return { action: 'deny' };
    const { title, resizable } = p;
    // 작업 영역보다 큰 창은 작업 영역에 맞춰 줄이고 내용은 창 안에서 스크롤한다 (body.panel). 기억한 자리도 작업 영역 안으로 맞추고
    // 기억한 자리가 없으면 캐릭터 모니터 가운데에 둔다. useContentSize라 제목 표시줄 높이를 따로 뺀다
    const saved = savedBounds()[frameName];
    const wa = (visible(saved) ? screen.getDisplayMatching(saved) : currentDisplay()).workArea;
    const width = Math.min(p.width, wa.width);
    const height = Math.min(p.height, wa.height - TITLE_BAR_H);
    const outer = { width, height: height + TITLE_BAR_H };
    const at = visible(saved) ? saved : { x: Math.round(wa.x + (wa.width - outer.width) / 2), y: Math.round(wa.y + (wa.height - outer.height) / 2) };
    const { x, y } = clampIn(wa, { x: at.x, y: at.y, ...outer });
    return {
      // show: true는 앱을 앞으로 가져와(Mac) 작업 앱이 키보드를 잃는다. 숨긴 채 만들고 did-create-window에서 띄운다.
      // 패널은 모두 포커스를 받는다. Windows는 포커스를 받지 않는 창의 제목 표시줄 ×와 끌기를 받지 않는다 (ADR 0041)
      action: 'allow',
      overrideBrowserWindowOptions: { title, width, height, x, y, resizable, useContentSize: true, show: false, ...panelMaterial },
    };
  });
  // Windows 기본 메뉴 막대와 그 단축키(Ctrl+R, Ctrl+W)를 패널에서 빼고 패널 안의 링크로 창을 열거나 이동하지 못하게 한다
  win.webContents.on('did-create-window', (child, { frameName }) => {
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.webContents.on('will-navigate', (e) => e.preventDefault());
    if (isEffects(frameName)) {
      // 클릭은 언제나 아래로 넘긴다. 대상 고르기는 스테이지가 받는다
      panels.set(frameName, child);
      child.setIgnoreMouseEvents(true);
      platform.overlay.afterCreate(child);
      const area = effectsAreas.get(frameName);
      if (area) applyBounds(child, area);
      child.showInactive();
      child.on('closed', () => {
        effectsAreas.delete(frameName);
        if (panels.get(frameName) === child) panels.delete(frameName);
      });
      return;
    }
    const p = prepared.get(frameName);
    const keepAlive = p?.keepAlive === true;
    prepared.delete(frameName);
    panels.set(frameName, child);
    child.removeMenu();
    // 맨 위에 보이기만 하고 키보드 포커스는 사용자가 누르거나 키를 쳐서 연 창에만 준다. 모듈이 저절로 연 창(친구 신청, 자리 안내)은
    // 그림을 그리는 중인 앱의 키보드를 가져가지 않는다
    raise(child);
    if (p?.user) child.focus();
    log.info(`[win] ${frameName}`);
    // 저장하지 않은 일이 있는 패널은 beforeunload로 닫기를 막고 창 안에 묻는다 (ctx.ui.guard). 앱을 끝낼 때는 막지 않는다
    child.webContents.on('will-prevent-unload', (e) => {
      if (quitting) e.preventDefault();
    });
    // keepAlive 패널은 사용자가 닫아도 숨기기만 해서 렌더러의 portal(재생 중인 플레이어)을 남긴다.
    // 렌더러의 window.close()는 이 이벤트 없이 닫히므로 모듈을 내릴 때는 실제로 닫힌다
    child.on('close', (e) => {
      if (!keepAlive || quitting) return void saveBounds(frameName, child);
      e.preventDefault();
      hidePanel(frameName, child);
    });
    child.on('closed', () => panels.get(frameName) === child && panels.delete(frameName));
  });
  void win.loadURL(pageUrl);
}

/** 렌더러 충돌이나 응답 없음 뒤 다시 만든다. 1분 안에 되풀이되면 30초까지 늘려 기다린다 */
function recreate(win: BrowserWindow, why: string): void {
  if (win !== stage || quitting) return;
  log.warn(`stage recreate: ${why}`);
  stage = null;
  closePanels();
  win.destroy();
  const now = Date.now();
  crashes = now - lastCrash > 60_000 ? 0 : crashes + 1;
  lastCrash = now;
  setTimeout(createStage, Math.min(1000 * 2 ** crashes, 30_000));
}
