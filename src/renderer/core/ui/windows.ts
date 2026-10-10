import type { ComponentType } from 'react';
import type { Bridge } from '../../../preload/api';
import type { Ctx, Dispose, WindowDecl } from '../types';
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
  /** 떠나기 전에 묻는 중인 창과 글 (ctx.ui.guard). 패널 portal이 그 창 안에 그린다 */
  readonly asking = createStore<{ id: string; text: string; answer: (leave: boolean) => void } | null>(null);
  private styleObserver: MutationObserver | null = null;
  /** 여는 중인 창 id. 빠르게 두 번 열면 같은 창에 keydown이 두 번 붙는다 */
  private opening = new Set<string>();
  /** 창마다 마지막으로 누르거나 키를 치거나 포커스를 받은 시각. 키 ''는 실행 화면 */
  private used = new Map<string, number>();
  private guards = new Map<string, Set<() => string | null>>();
  /** 묻지 않고 닫는 창. 스크립트로 닫아도 beforeunload가 오므로 여기 있으면 막지 않는다 */
  private leaving = new WeakSet<Window>();

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
      this.touch(decl.id);
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
    standardsMode(win.document);
    win.document.title = decl.title;
    win.document.body.className = this.material ? 'panel material' : 'panel';
    copyStyles(document, win.document);
    this.watchStyles();
    const entry: OpenWindow = { id: decl.id, win, ctx, Component: mod.default, keepAlive };
    const touch = () => this.touch(decl.id);
    win.addEventListener('pointerdown', touch, true);
    win.addEventListener('focus', touch);
    win.addEventListener('keydown', (e) => {
      touch();
      this.onKey(entry, e);
    });
    // 제목 표시줄 ×: 저장하지 않은 일이 있으면 닫기를 멈추고 창 안에 묻는다. Electron은 막힌 닫기를 대화상자 없이 멈춘다
    win.addEventListener('beforeunload', (e) => {
      if (this.leaving.has(win) || !this.question(decl.id)) return;
      e.preventDefault();
      this.requestClose(decl.id);
    });
    win.addEventListener('pagehide', () => this.forget(decl.id));
    this.open.set((ws) => [...ws.filter((w) => w.id !== decl.id), entry]);
    touch();
  }

  /** keepAlive 창은 숨기기만 한다. force면 keepAlive 창도 닫는다 (모듈을 내릴 때) */
  close(id: string, force = false): void {
    const w = this.open.get().find((x) => x.id === id);
    if (w?.keepAlive && !force) return void this.bridge.invoke('win.hide', { name: nameOf(id) });
    if (w) this.leaving.add(w.win);
    w?.win.close();
    this.forget(id);
  }

  closeOwnedBy(ctx: Ctx): void {
    for (const w of this.open.get()) if (w.ctx === ctx) this.close(w.id, true);
  }

  /** ESC와 창의 닫기 단추. 저장하지 않은 일이 있으면 묻고 닫기를 누를 때만 닫는다 */
  requestClose(id: string): void {
    void this.confirm(id).then((leave) => leave && this.close(id));
  }

  /** ctx.ui.guard */
  guard(id: string, check: () => string | null): Dispose {
    let set = this.guards.get(id);
    if (!set) this.guards.set(id, (set = new Set()));
    set.add(check);
    return () => void set.delete(check);
  }

  /** 떠나도 되는지. 물을 글이 있으면 그 창 안에 묻고 닫기를 누르면 true */
  confirm(id: string): Promise<boolean> {
    const text = this.question(id);
    if (!text || !this.live(id)) return Promise.resolve(true);
    this.asking.get()?.answer(false);
    return new Promise((resolve) => {
      const answer = (leave: boolean) => {
        if (this.asking.get()?.answer === answer) this.asking.set(null);
        resolve(leave);
      };
      this.asking.set({ id, text, answer });
    });
  }

  private question(id: string): string | null {
    for (const check of this.guards.get(id) ?? []) {
      try {
        const q = check();
        if (q) return q;
      } catch {
        /* 모듈의 확인 오류로 창을 못 닫게 하지 않는다 */
      }
    }
    return null;
  }

  touch(id: string): void {
    this.used.set(id, Date.now());
  }

  /** 열려 있고 보이는 패널인지 */
  live(id: string): boolean {
    const w = this.open.get().find((x) => x.id === id);
    return !!w && !w.win.closed && w.win.document.visibilityState === 'visible';
  }

  /** within ms 안에 가장 최근에 쓴 보이는 패널. 실행 화면을 더 최근에 썼거나 없으면 null. panelsOnly면 실행 화면은 보지 않는다 */
  recent(within: number, panelsOnly = false): string | null {
    let best = { id: '', at: -1 };
    for (const [id, at] of this.used) {
      if (at > best.at && (id ? this.live(id) : !panelsOnly)) best = { id, at };
    }
    return best.id && Date.now() - best.at <= within ? best.id : null;
  }

  private forget(id: string) {
    this.used.delete(id);
    if (this.asking.get()?.id === id) this.asking.get()!.answer(false);
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

/** window.open('')으로 연 about:blank 문서는 doctype이 없어 quirks 모드다. 표가 글자 크기를 물려받지 않는 것처럼 스테이지와 계산이 달라지므로
 *  창을 연 바로 뒤에 doctype을 넣어 표준 모드로 다시 쓴다. 다시 쓰면 문서의 리스너가 지워지므로 리스너를 붙이기 전에 부른다 */
export function standardsMode(doc: Document): void {
  doc.open();
  doc.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body></body></html>');
  doc.close();
}
