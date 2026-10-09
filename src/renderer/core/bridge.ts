import type { Bridge, CoreEventMap, CoreInvokeMap } from '../../preload/api';
import { BRIDGE_VERSION } from '@shared/proto';

/** 브라우저나 시험에서 쓰는 가짜 브리지. 저장은 메모리에만 한다 */
export function memoryBridge(): Bridge {
  const files = new Map<string, unknown>();
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  let autoStart = false;
  let penApps: string[] = [];
  let frameOrigins: string[] = [];
  const handlers: { [K in keyof CoreInvokeMap]: (a: CoreInvokeMap[K]['args']) => CoreInvokeMap[K]['result'] } = {
    'store.read': ({ path }) => structuredClone(files.get(path) ?? null),
    'store.write': ({ path, data }) => void files.set(path, structuredClone(data)),
    'stage.setSize': () => undefined,
    'stage.setInteractive': () => undefined,
    'win.prepare': () => undefined,
    'win.show': () => undefined,
    'win.hide': () => undefined,
    'csp.frameOrigins.get': () => [...frameOrigins],
    // 브라우저에서는 다시 읽지 않는다
    'csp.frameOrigins.set': ({ origins }) => {
      frameOrigins = [...origins];
      return false;
    },
    'notify.show': () => undefined,
    'app.info': () => ({ version: '0.0.0-web', platform: 'other', dev: true, selfAppKey: null }),
    'dialog.openImage': () => null,
    'clipboard.write': ({ text }) => void navigator.clipboard?.writeText(text).catch(() => undefined),
    'shell.openExternal': ({ url }) => void window.open(url, '_blank', 'noopener'),
    'log.write': ({ level, scope, message }) => console[level](`[${scope}] ${message}`),
    'shell.openLogFolder': () => undefined,
    'app.quit': () => undefined,
    'autostart.get': () => autoStart,
    'autostart.set': ({ on }) => void (autoStart = on),
    'display.list': () => [{ id: 1, primary: true, chosen: true }],
    'display.choose': () => undefined,
    'penApps.get': () => [...penApps],
    'penApps.set': ({ apps }) => void (penApps = [...apps]),
    'stage.setOpacity252': () => undefined,
    'win.resetPositions': () => undefined,
    'diag.write': ({ lines }) => console.info(lines.join('\n')),
    'update.state': () => ({ version: null }),
    'update.install': () => undefined,
    'stage.setVisible': () => undefined,
    'stage.reload': () => location.reload(),
    'effects.prepare': () => ({ x: 0, y: 0, width: screen.width, height: screen.height }),
    'effects.bounds': () => ({ x: 0, y: 0, width: screen.width, height: screen.height }),
    'pick.escape': () => undefined,
    'theme.set': () => undefined,
    'stage.workArea': () => ({ width: screen.availWidth, height: screen.availHeight }),
  };
  return {
    version: BRIDGE_VERSION,
    invoke: async (channel, args) => handlers[channel](args as never) as never,
    on<K extends keyof CoreEventMap>(event: K, fn: (p: CoreEventMap[K]) => void) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(fn as (p: unknown) => void);
      return () => set.delete(fn as (p: unknown) => void);
    },
    invokeModule: async () => {
      throw new Error('main.ts 모듈 호출은 Electron에서만 됩니다');
    },
  };
}

export function getBridge(): Bridge {
  return window.bridge ?? memoryBridge();
}
