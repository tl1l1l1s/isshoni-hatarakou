// 스테이지 창과 패널 창 (10.4). 스테이지는 투명하고 좌석 영역 크기이며 포커스를 받지 않는다
import { app, BrowserWindow, globalShortcut, screen } from 'electron';
import log from 'electron-log/main';
import { join } from 'node:path';
import type { CoreEventMap, CoreInvokeMap, Rect } from '../../preload/api';
import type { Store } from '../store';
import { pickDisplay, remember, type SavedDisplay } from '../display';
import { platform, panelMaterial } from '../platform';
import { pageUrl } from '../protocol';

type Prepared = CoreInvokeMap['win.prepare']['args'];

let stage: BrowserWindow | null = null;
let size = { width: 400, height: 200 };
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
let effectsArea: Rect | null = null;
/** 캐릭터가 있는 모니터 전체. 효과 좌표는 이 영역 기준이다 */
export function prepareEffects(): Rect {
  const { x, y, width, height } = currentDisplay().bounds;
  return (effectsArea = { x, y, width, height });
}
export function effectsBounds(name: string): Rect | null {
  const w = panels.get(name);
  return isEffects(name) && w && !w.isDestroyed() ? w.getBounds() : null;
}

// 캐릭터를 띄울 모니터 (SET-06, NFR-08). undefined는 아직 읽지 않음
const DISPLAY_FILE = 'device/display.json';
let chosen: SavedDisplay | null | undefined;
const savedDisplay = () => (chosen === undefined ? (chosen = (store?.read(DISPLAY_FILE) as SavedDisplay | null) ?? null) : chosen);
export const currentDisplay = () => pickDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay(), savedDisplay());

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
        `모니터 ${i + 1}${d.id === primary ? ' (주)' : ''}${d.id === cur ? ' (캐릭터)' : ''}: ${d.size.width}x${d.size.height} 배율 ${d.scaleFactor} 위치 ${d.bounds.x},${d.bounds.y} 회전 ${d.rotation}`,
    ),
    `스테이지 ${JSON.stringify(stage?.getBounds() ?? null)}, 영상 겹침 우회 ${opacity252 || OPACITY_252_ENV ? '켜짐' : '꺼짐'}`,
  ];
}

/** 저장한 위치가 지금 모니터 작업 영역 안에 보일 때만 쓴다 */
function visible(b: Bounds | undefined): b is Bounds {
  if (!b) return false;
  const wa = screen.getDisplayMatching(b).workArea;
  return b.x >= wa.x - b.width / 2 && b.y >= wa.y && b.x + b.width / 2 <= wa.x + wa.width && b.y + 40 <= wa.y + wa.height;
}

app.on('before-quit', () => (quitting = true));

export const getStage = () => stage;
export const getRects = () => rects;
export const setRects = (r: Rect[]) => void (rects = r);
export const prepare = (p: Prepared) => void prepared.set(p.name, p);

/** 패널을 다시 보이거나(이미 열린 패널을 다시 열 때도) 숨긴다 */
export function setPanelVisible(name: string, show: boolean): void {
  const w = panels.get(name);
  if (!w || w.isDestroyed()) return;
  if (show) {
    // 숨긴 사이 모니터가 빠졌으면 화면 밖에 뜨지 않게 가운데로 옮긴다
    if (!visible(w.getBounds())) w.center();
    raise(w);
    if (w.isFocusable()) w.focus();
    return;
  }
  saveBounds(name, w);
  w.hide();
}

/** Windows에서 포커스를 받지 않는 창은 눌러도 위로 오지 않고 focus()도 듣지 않아 다른 앱 뒤에 남는다. 다시 보일 때마다 맨 위로 올린다 */
function raise(w: BrowserWindow): void {
  w.showInactive();
  w.moveTop();
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

/** 고른 모니터(없으면 주 모니터) 작업 영역 아래 가운데. 크기와 위치가 같으면 다시 적용하지 않는다.
 *  작업 영역 크기가 마지막으로 알린 것과 다르면 렌더러에 알린다 */
let toldArea = '';
export function place(): void {
  if (!stage) return;
  const wa = currentDisplay().workArea;
  const b = { x: Math.round(wa.x + (wa.width - size.width) / 2), y: wa.y + wa.height - size.height, ...size };
  applyBounds(stage, b);
  const key = `${wa.width}x${wa.height}`;
  if (key === toldArea) return;
  toldArea = key;
  send('stage.workArea', { width: wa.width, height: wa.height });
}

const same = (a: Bounds, b: Bounds) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
/** 배율이 다른 모니터로 옮기면 Windows의 DPI 변경 처리가 위치와 크기를 다시 바꿀 수 있어 다르면 한 번 더 놓는다 */
function applyBounds(w: BrowserWindow, b: Bounds): void {
  if (same(w.getBounds(), b)) return;
  w.setBounds(b);
  if (!same(w.getBounds(), b)) w.setBounds(b);
}

export function setSize(width: number, height: number): void {
  size = { width: Math.ceil(width), height: Math.ceil(height) };
  place();
}

/** 화면 숨김 때 함께 숨긴 패널. 다시 보일 때 이 패널만 띄운다 (SET-03) */
let hiddenPanels: BrowserWindow[] = [];

export function setVisible(visible: boolean): void {
  const changed = hidden === visible;
  hidden = !visible;
  if (stage) {
    if (visible) stage.showInactive();
    else stage.hide();
  }
  if (changed && !visible) {
    hiddenPanels = [...panels.values()].filter((w) => !w.isDestroyed() && w.isVisible());
    for (const w of hiddenPanels) w.hide();
  } else if (changed) {
    for (const w of hiddenPanels) if (!w.isDestroyed()) raise(w);
    hiddenPanels = [];
  }
  send('stage.visibility', { visible });
}

export const toggle = () => setVisible(hidden);

/** 위치 초기화 (SET-16): 스테이지를 다시 놓고 기억한 패널 위치를 지우고 열린 패널을 가운데로 옮긴다 */
export function resetPositions(): void {
  store?.write(WINDOWS_FILE, {});
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
    },
  });
  stage = win;
  rects = [];
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
    if (!hidden) win.showInactive();
  });
  win.on('unresponsive', () => recreate(win, 'unresponsive'));
  win.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit') recreate(win, d.reason);
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('did-start-navigation', (d) => {
    if (d.isMainFrame && !d.isSameDocument) closePanels();
  });
  // 패널은 win.prepare로 알린 이름의 about:blank만 연다. 같은 렌더러 프로세스에서 React portal로 그린다
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (isEffects(frameName) && url === 'about:blank' && effectsArea) {
      return { action: 'allow', overrideBrowserWindowOptions: { ...platform.overlay.options, ...effectsArea, focusable: false, resizable: false, show: false } };
    }
    const p = prepared.get(frameName);
    if (url !== 'about:blank' || !p) return { action: 'deny' };
    const { title, width, height, focusable, resizable } = p;
    const saved = savedBounds()[frameName];
    const at = visible(saved) ? { x: saved.x, y: saved.y } : { center: true };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: { title, width, height, focusable, resizable, useContentSize: true, show: true, ...at, ...panelMaterial },
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
      if (effectsArea) applyBounds(child, effectsArea);
      child.showInactive();
      child.on('closed', () => panels.get(frameName) === child && panels.delete(frameName));
      return;
    }
    const keepAlive = prepared.get(frameName)?.keepAlive === true;
    prepared.delete(frameName);
    panels.set(frameName, child);
    child.removeMenu();
    // keepAlive 패널은 사용자가 닫아도 숨기기만 해서 렌더러의 portal(재생 중인 플레이어)을 남긴다.
    // 렌더러의 window.close()는 이 이벤트 없이 닫히므로 모듈을 내릴 때는 실제로 닫힌다
    child.on('close', (e) => {
      saveBounds(frameName, child);
      if (!keepAlive || quitting) return;
      e.preventDefault();
      child.hide();
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
