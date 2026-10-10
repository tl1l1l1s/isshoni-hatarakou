// IPC 라우터. 스테이지 창이 보낸 core:<channel>만 받는다
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, Notification, shell } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import log from 'electron-log/main';
import { z } from 'zod';
import type { AppKey } from '@shared/appkey';
import type { CoreInvokeMap } from '../preload/api';
import { logDir, writeDiagnose } from './log';
import { postJson } from './net';
import { osName, platform, selfAppKey, panelMaterial } from './platform';
import { getFrameOrigins, setFrameOrigins } from './protocol';
import type { Store } from './store';
import { installUpdate, updateState } from './updater';
import {
  chooseDisplay, displayLines, effectsBounds, getStage, listDisplays, pickEscape, prepare, prepareEffects, reloadStage, resetPositions, send, setOpacity252, setPanelVisible, setRects,
  setSize, setVisible, workArea,
} from './windows/manager';

type Routes = {
  [K in keyof CoreInvokeMap]: [
    z.ZodType<CoreInvokeMap[K]['args']>,
    (a: CoreInvokeMap[K]['args']) => CoreInvokeMap[K]['result'] | Promise<CoreInvokeMap[K]['result']>,
  ];
};

const none = z.object({});
const size = z.number().min(1).max(10_000);
const rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const on = z.object({ on: z.boolean() });
const APP_KEY = /^(win|mac):[^/\\]{1,200}$/;
const panel = z.object({ name: z.string().min(1).max(64) });

// 사용자가 더한 그림 앱 (NFR-25). 메인이 들고 있어야 렌더러가 다시 만들어지는 동안에도 보호한다
const PEN_FILE = 'device/pen-apps.json';
function setPenApps(store: Store, apps: unknown[], save: boolean): void {
  const user = platform.penApps.user;
  user.clear();
  for (const k of apps) if (typeof k === 'string' && APP_KEY.test(k)) user.add(k as AppKey);
  if (save) store.write(PEN_FILE, [...user]);
}

export function registerIpc(store: Store): void {
  const pens = store.read(PEN_FILE);
  setPenApps(store, Array.isArray(pens) ? pens : [], false);
  const routes: Routes = {
    'store.read': [z.object({ path: z.string() }), ({ path }) => store.read(path)],
    'store.write': [z.object({ path: z.string(), data: z.unknown() }), ({ path, data }) => store.write(path, data)],
    'stage.setSize': [z.object({ width: size, height: size }), ({ width, height }) => setSize(width, height)],
    'stage.setInteractive': [z.object({ rects: z.array(rect).max(256) }), ({ rects }) => setRects(rects)],
    'win.prepare': [
      z.object({
        name: z.string().min(1).max(64),
        title: z.string().max(200),
        width: size,
        height: size,
        focusable: z.boolean(),
        resizable: z.boolean(),
        keepAlive: z.boolean().optional(),
      }),
      prepare,
    ],
    'win.show': [panel, ({ name }) => setPanelVisible(name, true)],
    'win.hide': [panel, ({ name }) => setPanelVisible(name, false)],
    'csp.frameOrigins.get': [none, getFrameOrigins],
    // 검사에 맞지 않는 출처는 setFrameOrigins가 버린다
    'csp.frameOrigins.set': [
      z.object({ origins: z.array(z.string().max(200)).max(50) }),
      ({ origins }) => setFrameOrigins(store, origins) && (reloadStage(), true),
    ],
    'notify.show': [z.object({ id: z.string().max(64), title: z.string().max(200), body: z.string().max(1000) }), showNotification],
    'app.info': [none, () => ({ version: app.getVersion(), platform: osName, dev: !app.isPackaged, selfAppKey, material: panelMaterial !== null })],
    'dialog.openImage': [none, openImage],
    'clipboard.write': [z.object({ text: z.string().max(10_000) }), ({ text }) => clipboard.writeText(text)],
    'shell.openExternal': [z.object({ url: z.string().max(2000).regex(/^https?:\/\//i) }), ({ url }) => void shell.openExternal(url)],
    'net.post': [z.object({ url: z.string().max(2000), json: z.string().max(4000) }), ({ url, json }) => postJson(url, json)],
    'log.write': [
      z.object({ level: z.enum(['info', 'warn', 'error']), scope: z.string().max(64), message: z.string() }),
      ({ level, scope, message }) => log[level](`[${scope}] ${message.slice(0, 4000)}`),
    ],
    'shell.openLogFolder': [none, () => void shell.openPath(logDir())],
    'app.quit': [none, () => app.quit()],
    'autostart.get': [none, () => platform.autoStart.get()],
    'autostart.set': [on, ({ on }) => platform.autoStart.set(on)],
    'display.list': [none, listDisplays],
    'display.choose': [z.object({ id: z.number() }), ({ id }) => chooseDisplay(id)],
    'penApps.get': [none, () => [...platform.penApps.user]],
    'penApps.set': [z.object({ apps: z.array(z.string().regex(APP_KEY)).max(50) }), ({ apps }) => setPenApps(store, apps, true)],
    'stage.setOpacity252': [on, ({ on }) => setOpacity252(on)],
    'win.resetPositions': [none, resetPositions],
    'diag.write': [
      z.object({ lines: z.array(z.string().max(2000)).max(500) }),
      ({ lines }) =>
        writeDiagnose([
          ...displayLines(),
          `자동 실행 ${platform.autoStart.get() ? '켜짐' : '꺼짐'}, 더한 그림 앱 ${platform.penApps.user.size}개`,
          ...lines,
        ]),
    ],
    'update.state': [none, updateState],
    'update.install': [none, () => void installUpdate()],
    'stage.setVisible': [z.object({ visible: z.boolean() }), ({ visible }) => setVisible(visible)],
    'stage.reload': [none, reloadStage],
    'effects.prepare': [none, prepareEffects],
    'effects.bounds': [panel, ({ name }) => effectsBounds(name)],
    // 고르는 몇 초 동안만 ESC를 가져온다. 등록에 실패하면 취소 버튼과 시간 제한으로 끝난다
    'pick.escape': [on, ({ on }) => pickEscape(on)],
    'theme.set': [z.object({ source: z.enum(['system', 'light', 'dark']) }), ({ source }) => void (nativeTheme.themeSource = source)],
    'stage.workArea': [none, workArea],
  };
  for (const [ch, [schema, fn]] of Object.entries(routes)) {
    ipcMain.handle(`core:${ch}`, (e, args: unknown) => {
      if (e.sender !== getStage()?.webContents) throw new Error(`스테이지 밖에서 부른 ${ch}`);
      return (fn as (a: unknown) => unknown)(schema.parse(args));
    });
  }
}

// 알림 객체를 잡아 두지 않으면 누르기 전에 GC되어 click이 오지 않을 수 있다. ponytail: 최근 20개만 잡아 둔다
const notes: Notification[] = [];
function showNotification({ id, title, body }: CoreInvokeMap['notify.show']['args']): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  n.on('click', () => send('notify.click', { id }));
  notes.push(n);
  if (notes.length > 20) notes.shift();
  n.show();
}

/** 그림 파일 하나를 고른다. 줄이기는 렌더러 Web Worker가 하므로 줄이기 전 파일은 넉넉히 20MB까지 받는다 */
async function openImage(): Promise<{ name: string; bytes: Uint8Array } | null> {
  const parent = BrowserWindow.getFocusedWindow();
  const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: '그림', extensions: ['png', 'webp', 'gif', 'jpg', 'jpeg'] }] };
  const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  const path = r.filePaths[0];
  if (r.canceled || !path) return null;
  if ((await stat(path)).size > 20 * 1024 * 1024) throw new Error('20MB보다 큰 그림은 열 수 없습니다');
  return { name: basename(path), bytes: new Uint8Array(await readFile(path)) };
}
