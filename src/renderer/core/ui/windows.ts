import type { ComponentType } from 'react';
import type { Bridge } from '../../../preload/api';
import type { Ctx, WindowDecl } from '../types';
import { createStore } from '../store';

export interface OpenWindow {
  id: string;
  win: Window;
  ctx: Ctx;
  Component: ComponentType<{ ctx: Ctx }>;
  /** 닫으면 숨기기만 하고 portal은 남긴다 */
  keepAlive: boolean;
}

const nameOf = (id: string) => `panel:${id}`;

/** 패널 창: window.open으로 연 창에 같은 JS 힙의 React portal로 그린다 (10.4).
 *  모듈은 ctx.ui.open만 부르므로 창마다 렌더러를 따로 두는 방식으로 바꿔도 모듈 코드는 그대로다. */
export class WindowClient {
  readonly open = createStore<OpenWindow[]>([]);
  private styleObserver: MutationObserver | null = null;
  /** 여는 중인 창 id. 빠르게 두 번 열면 같은 창에 keydown이 두 번 붙는다 */
  private opening = new Set<string>();

  constructor(private bridge: Bridge, private onKey: (w: OpenWindow, e: KeyboardEvent) => void, private material = false) {
    bridge.on('win.visibility', ({ name, visible }) => {
      const w = this.open.get().find((x) => nameOf(x.id) === name);
      if (w && !w.win.closed) setVisibility(w.win.document, visible);
    });
  }

  async show(decl: WindowDecl, ctx: Ctx): Promise<void> {
    if (this.opening.has(decl.id)) return;
    this.opening.add(decl.id);
    return this.showNow(decl, ctx).finally(() => this.opening.delete(decl.id));
  }

  private async showNow(decl: WindowDecl, ctx: Ctx): Promise<void> {
    const existing = this.open.get().find((w) => w.id === decl.id);
    if (existing && !existing.win.closed) {
      // 포커스를 받지 않는 창은 렌더러의 focus()로 앞에 오지 않으므로 메인이 맨 위로 올린다
      await this.bridge.invoke('win.show', { name: nameOf(decl.id) });
      return;
    }
    const name = nameOf(decl.id);
    const keepAlive = decl.keepAlive ?? false;
    await this.bridge.invoke('win.prepare', {
      name,
      title: decl.title,
      width: decl.width ?? 360,
      height: decl.height ?? 420,
      focusable: decl.focusable ?? false,
      resizable: decl.resizable ?? false,
      keepAlive,
    });
    const [win, mod] = [window.open('', name), await decl.component()];
    if (!win) return;
    win.document.title = decl.title;
    win.document.body.className = this.material ? 'panel material' : 'panel';
    copyStyles(document, win.document);
    this.watchStyles();
    const entry: OpenWindow = { id: decl.id, win, ctx, Component: mod.default, keepAlive };
    win.addEventListener('keydown', (e) => this.onKey(entry, e));
    win.addEventListener('pagehide', () => this.forget(decl.id));
    this.open.set((ws) => [...ws.filter((w) => w.id !== decl.id), entry]);
  }

  /** keepAlive 창은 숨기기만 한다. force면 keepAlive 창도 닫는다 (모듈을 내릴 때) */
  close(id: string, force = false): void {
    const w = this.open.get().find((x) => x.id === id);
    if (w?.keepAlive && !force) return void this.bridge.invoke('win.hide', { name: nameOf(id) });
    w?.win.close();
    this.forget(id);
  }

  closeOwnedBy(ctx: Ctx): void {
    for (const w of this.open.get()) if (w.ctx === ctx) this.close(w.id, true);
  }

  private forget(id: string) {
    this.open.set((ws) => ws.filter((w) => w.id !== id));
  }

  /** 개발판 CSS Modules는 나중에 <style>을 더하므로 열린 창에도 옮겨 준다 */
  private watchStyles() {
    if (this.styleObserver) return;
    this.styleObserver = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!isStyle(n)) continue;
          for (const w of this.open.get()) w.win.document.head.appendChild(n.cloneNode(true));
        }
      }
    });
    this.styleObserver.observe(document.head, { childList: true });
  }
}

/** 닫아 숨긴 keepAlive 패널의 문서에 Page Visibility를 반영한다. about:blank 패널은 스테이지의 backgroundThrottling: false를 물려받아
 *  Chromium이 창을 숨겨도 문서를 visible로 두므로 값을 덮고 visibilitychange를 낸다. 모듈은 표준 API 그대로 듣는다 (플레이어 멈춤) */
function setVisibility(doc: Document, visible: boolean): void {
  const state: DocumentVisibilityState = visible ? 'visible' : 'hidden';
  if (doc.visibilityState === state) return;
  Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => state });
  Object.defineProperty(doc, 'hidden', { configurable: true, get: () => !visible });
  doc.dispatchEvent(new Event('visibilitychange'));
}

const isStyle = (n: Node): n is HTMLElement =>
  n instanceof HTMLStyleElement || (n instanceof HTMLLinkElement && n.rel === 'stylesheet');

export function copyStyles(from: Document, to: Document) {
  for (const n of from.head.childNodes) if (isStyle(n)) to.head.appendChild(n.cloneNode(true));
}
