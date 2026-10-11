// sandbox preload. electron과 번들되는 @shared 상수만 쓴다
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { BRIDGE_VERSION } from '@shared/proto';
import type { Bridge } from './api';

// 메인이 던진 오류에는 Electron이 영어 머리말을 붙인다. 화면에 그대로 띄우는 모듈이 많아서 메인이 쓴 글만 남긴다
const REMOTE = /^Error invoking remote method '[^']*': (?:\w*Error: )?/;

const bridge: Bridge = {
  version: BRIDGE_VERSION,
  invoke: (channel, args) =>
    ipcRenderer.invoke(`core:${channel}`, args).catch((e: unknown) => {
      throw e instanceof Error ? new Error(e.message.replace(REMOTE, '')) : e;
    }),
  on(event, fn) {
    const h = (_e: IpcRendererEvent, payload: Parameters<typeof fn>[0]) => fn(payload);
    ipcRenderer.on(`core:${event}`, h);
    return () => void ipcRenderer.removeListener(`core:${event}`, h);
  },
  invokeModule: (moduleId, method, args) => ipcRenderer.invoke(`mod:${moduleId}:${method}`, args),
};

contextBridge.exposeInMainWorld('bridge', bridge);
