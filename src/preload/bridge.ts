// sandbox preload. electron과 번들되는 @shared 상수만 쓴다
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { BRIDGE_VERSION } from '@shared/proto';
import type { Bridge } from './api';

const bridge: Bridge = {
  version: BRIDGE_VERSION,
  invoke: (channel, args) => ipcRenderer.invoke(`core:${channel}`, args),
  on(event, fn) {
    const h = (_e: IpcRendererEvent, payload: Parameters<typeof fn>[0]) => fn(payload);
    ipcRenderer.on(`core:${event}`, h);
    return () => void ipcRenderer.removeListener(`core:${event}`, h);
  },
  invokeModule: (moduleId, method, args) => ipcRenderer.invoke(`mod:${moduleId}:${method}`, args),
};

contextBridge.exposeInMainWorld('bridge', bridge);
