// ctx.notify 클릭 연결과 ctx.seats.refresh
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createMemoryServer, MemoryHub, type MemoryServer } from '@server/memory';
import type { AccountPresence } from '@server/port';
import type { CharacterView, RenderBackend } from '@render/port';
import { emptyAppearance } from '@shared/schemas';
import type { Bridge } from '../../preload/api';
import { coreSettings } from './coreSettings';
import { JsonFile, emptySettings, type SettingsFile } from './persist';
import { CoreRuntime } from './runtime';
import { defineModule, type ModuleManifest } from './types';
import type { OpenWindow } from './ui/windows';

it('notify는 id로 메인에 보내고 누르면 그 onClick을 한 번 부른다. refresh는 onMembers를 부르지 않는다', async () => {
  const shown: Array<{ id: string; title: string }> = [];
  const listeners = new Map<string, (p: unknown) => void>();
  const bridge = {
    version: 0,
    invoke: async (ch: string, args: { id: string; title: string }) => void (ch === 'notify.show' && shown.push(args)),
    on: (ev: string, fn: (p: unknown) => void) => (listeners.set(ev, fn), () => {}),
    invokeModule: async () => null,
  } as unknown as Bridge;
  const server = createMemoryServer(new MemoryHub());
  const uid = await server.identity.signIn('dev-alice');
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: null },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  await core.start([defineModule({ id: 'demo', setup: () => undefined })]);
  const ctx = core.ctxs.get('demo')!.ctx;

  let clicks = 0;
  ctx.notify({ title: '새 채팅', body: '안녕', onClick: () => clicks++ });
  ctx.notify({ title: '누를 것 없음', body: '' });
  await Promise.resolve();
  expect(shown.map((n) => n.title)).toEqual(['새 채팅', '누를 것 없음']);
  const click = listeners.get('notify.click')!;
  click({ id: shown[0]!.id });
  click({ id: shown[0]!.id });
  click({ id: shown[1]!.id });
  expect(clicks).toBe(1);

  let members = 0;
  ctx.room.onMembers(() => members++);
  const drawn = core.seatsDrawn.get();
  ctx.seats.refresh();
  expect(core.seatsDrawn.get()).toBe(drawn + 1);
  expect(members).toBe(0);
});

// ---- 코어 계약:표시 모드, gate, 로컬 좌석, 효과, 한 계정 한 기기 ----

async function boot(manifests: ModuleManifest[], opts: { hub?: MemoryHub; deviceId?: string; settings?: SettingsFile; answers?: Record<string, unknown> } = {}) {
  const invoked: Array<[string, unknown]> = [];
  const listeners = new Map<string, (p: unknown) => void>();
  const bridge = {
    version: 0,
    invoke: async (ch: string, args: unknown) => (invoked.push([ch, args]), opts.answers?.[ch]),
    on: (ev: string, fn: (p: unknown) => void) => (listeners.set(ev, fn), () => {}),
    invokeModule: async () => null,
  } as unknown as Bridge;
  const hub = opts.hub ?? new MemoryHub();
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn('dev-alice');
  const settings = new JsonFile(bridge, 'settings.json', opts.settings ?? emptySettings());
  const core = new CoreRuntime(
    { bridge, server, backend: { renderScene: async () => ({}) } as unknown as RenderBackend, uid, deviceId: opts.deviceId ?? 'pc', appVersion: 'test', selfAppKey: null, profile: null, singleDevice: true },
    settings,
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  await core.start([defineModule({ id: 'core', settings: coreSettings, setup: () => undefined }), ...manifests]);
  return { core, invoked, listeners, hub, settings };
}

it('표시 모드: quiet은 항목을 숨기고 명령을 막고 PC에 기억하며 hidden은 스테이지만 숨기고 기억하지 않는다', async () => {
  const demo = defineModule({
    id: 'demo',
    ui: { contributions: [{ slot: 'menu.main', id: 'demo.a', label: 'a', quiet: 'hide' }, { slot: 'menu.main', id: 'demo.b', label: 'b' }] },
    commands: [{ id: 'demo.prank', run: () => 1, quiet: 'block' }],
    setup: () => undefined,
  });
  const { core, invoked, listeners, settings } = await boot([demo]);
  const ctx = core.ctxs.get('demo')!.ctx;
  const seen: string[] = [];
  ctx.mode.on((m) => seen.push(m));
  const menu = () => core.registry.slot('menu.main').map((c) => c.decl.id);
  expect(menu()).toEqual(['demo.a', 'demo.b']);

  ctx.mode.set('quiet');
  expect(menu()).toEqual(['demo.b']);
  expect(ctx.commands.reason('demo.prank')).toContain('회사원 모드');
  await expect(ctx.commands.run('demo.prank')).rejects.toThrow();
  expect(settings.value.modules.core?.values).toEqual({ mode: 'quiet' });

  ctx.mode.set('hidden');
  expect(invoked).toContainEqual(['stage.setVisible', { visible: false }]);
  expect(settings.value.modules.core?.values).toEqual({ mode: 'quiet' });
  // 트레이로 다시 보이면 기억한 모드로 돌아간다
  listeners.get('stage.visibility')!({ visible: true });
  expect(ctx.mode.get()).toBe('quiet');
  expect(seen).toEqual(['quiet', 'hidden', 'quiet']);

  const again = await boot([], { settings: settings.value });
  expect(again.core.displayMode.get()).toBe('quiet');
});

it('gate: requires 모듈의 공개 API 숫자로 열고 sticky는 계정에 남겨 다른 PC에서도 열려 있다', async () => {
  vi.useFakeTimers({ toFake: ['setInterval'] });
  let level = 1;
  const growth = defineModule({ id: 'growth', setup: () => ({ level: () => level }) });
  const play = defineModule({
    id: 'play',
    requires: ['growth'],
    tunables: { need: { schema: z.number(), default: 3 } },
    gates: {
      'play.bomb': { requires: { module: 'growth', key: 'level', gte: { tunable: 'need' } }, sticky: true, label: '폭탄' },
      'play.dance': { requires: { module: 'growth', key: 'level', gte: 2 } },
      'play.bad': { requires: { module: 'other', key: 'level', gte: 0 } },
    },
    commands: [{ id: 'play.bomb', run: () => 1, gate: 'play.bomb' }],
    ui: { contributions: [{ slot: 'menu.main', id: 'play.bomb', label: '폭탄', command: 'play.bomb', gate: 'play.bomb' }] },
    setup: () => undefined,
  });
  const { core, hub } = await boot([growth, play]);
  const ctx = core.ctxs.get('play')!.ctx;
  let changes = 0;
  ctx.gates.onChange(() => changes++);
  expect(ctx.gates.isOpen('play.bomb')).toBe(false);
  expect(ctx.commands.reason('play.bomb')).toBe('아직 잠겨 있어요 (폭탄)');
  expect(core.registry.slot('menu.main')).toEqual([]);

  level = 3;
  vi.advanceTimersByTime(5_000);
  expect(changes).toBe(1);
  expect(ctx.gates.isOpen('play.bomb')).toBe(true);
  expect(ctx.gates.isOpen('play.dance')).toBe(true);
  expect(ctx.gates.isOpen('play.bad')).toBe(false);
  expect(ctx.commands.reason('play.bomb')).toBeNull();
  expect(core.registry.slot('menu.main').map((c) => c.decl.id)).toEqual(['play.bomb']);
  expect(typeof hub.read('users/alice/private/gates/play:bomb')).toBe('number');

  level = 1;
  vi.advanceTimersByTime(5_000);
  expect(ctx.gates.isOpen('play.bomb')).toBe(true);
  expect(ctx.gates.isOpen('play.dance')).toBe(false);
  vi.useRealTimers();

  // 다른 PC: 레벨 1이어도 sticky gate는 열려 있다
  const other = await boot([growth, play], { hub, deviceId: 'pc2' });
  expect(other.core.ctxs.get('play')!.ctx.gates.isOpen('play.bomb')).toBe(true);
});

it('좌석: 로컬 좌석은 4개까지이고 붙이기, 순서, 벤치는 좌석 배치에 들어가며 onChange를 부른다', async () => {
  const { core } = await boot([defineModule({ id: 'demo', setup: () => undefined })]);
  const ctx = core.ctxs.get('demo')!.ctx;
  let changes = 0;
  ctx.seats.onChange(() => changes++);
  for (let i = 0; i < 4; i++) ctx.seats.addLocal({ key: `demo:${i}`, appearance: emptyAppearance(), name: `${i}` });
  expect(() => ctx.seats.addLocal({ key: 'demo:9', appearance: emptyAppearance(), name: '9' })).toThrow('4개');
  ctx.seats.addLocal({ key: 'demo:0', appearance: emptyAppearance(), name: '바꿈' });
  ctx.seats.removeLocal('demo:3');
  const local = core.allSeats().filter((s) => s.local);
  expect(local.map((s) => s.name)).toEqual(['바꿈', '1', '2']);
  expect(local.every((s) => s.self && s.uid === 'alice')).toBe(true);
  expect(ctx.room.members().some((s) => s.local)).toBe(false);

  ctx.seats.attach('demo:1', 'alice_pc');
  ctx.seats.setOrder(['demo:2']);
  ctx.seats.setBench('demo:2', 'x');
  ctx.seats.attach('demo:1', null);
  expect(core.layout.get()).toMatchObject({ attach: {}, order: ['demo:2'], bench: { 'demo:2': 'x' } });
  expect(changes).toBe(10);
});

it('효과: 없는 효과, quiet 모드, 그려지지 않은 좌석은 효과 창을 열지 않는다. 고를 사람이 없으면 pickTarget은 바로 null', async () => {
  const demo = defineModule({ id: 'demo', effects: [{ id: 'demo.boom', run: () => () => {} }], setup: () => undefined });
  const { core, invoked } = await boot([demo]);
  const ctx = core.ctxs.get('demo')!.ctx;
  ctx.render.playEffect('alice_pc', 'demo.none')();
  ctx.render.playEffect('alice_pc', 'demo.boom')();
  ctx.mode.set('quiet');
  ctx.render.playEffect('alice_pc', 'demo.boom')();
  expect(invoked.some(([ch]) => ch === 'effects.prepare')).toBe(false);
  expect(await ctx.ui.pickTarget({ timeoutMs: 10 })).toBeNull();
});

it('한 계정 한 기기: 나중에 켠 PC가 가져가면 먼저 쓰던 PC는 방에서 나오고 여기서 계속 쓰기로 되찾는다', async () => {
  const a = await boot([], { deviceId: 'pc1' });
  const code = await a.core.session.create();
  expect((await a.core.session.join(code)).ok).toBe(true);
  expect(a.core.elsewhere.get()).toBe(false);

  const b = await boot([], { hub: a.hub, deviceId: 'pc2' });
  expect(a.core.elsewhere.get()).toBe(true);
  expect(a.core.session.current()).toBeNull();
  expect(await a.core.session.join(code)).toMatchObject({ ok: false, kind: 'blocked' });
  expect(b.core.elsewhere.get()).toBe(false);

  a.core.takeOver();
  await vi.waitFor(() => expect(a.core.session.current()).toBe(code));
  expect(a.core.elsewhere.get()).toBe(false);
  expect(b.core.elsewhere.get()).toBe(true);
});

it('한 계정 한 기기: 쓰지 않는 PC는 계정 접속 상태를 쓰지 않고 끊겨도 offline을 쓰지 않으며 되찾으면 다시 쓴다', async () => {
  const demo = defineModule({ id: 'demo', accountPresence: { code: z.string().nullable() }, setup: () => undefined });
  const a = await boot([demo], { deviceId: 'pc1' });
  const b = await boot([demo], { hub: a.hub, deviceId: 'pc2' });
  expect(a.core.elsewhere.get()).toBe(true);
  const presence = () => a.hub.read('users/alice/presence') as AccountPresence;
  const set = (x: typeof a, code: string | null) => x.core.ctxs.get('demo')!.ctx.self.setPresence({ code });
  set(b, 'B');
  set(a, 'A');
  await vi.waitFor(() => expect(presence().m).toEqual({ demo: { code: 'B' } }));
  const serverOf = (x: typeof a) => x.core.deps.server as MemoryServer;
  serverOf(a).goOffline();
  expect(presence().online).toBe(true);
  serverOf(a).goOnline();

  a.core.takeOver();
  await vi.waitFor(() => expect(presence()).toMatchObject({ online: true, m: { demo: { code: 'A' } } }));
  expect(b.core.elsewhere.get()).toBe(true);
  serverOf(b).goOffline();
  expect(presence().online).toBe(true);
  serverOf(b).goOnline();
});

/** 효과 창과 좌석 DOM 흉내. vitest는 DOM 없이 돈다 */
function fakeEffectDom() {
  const made: string[] = [];
  const node = (tag = 'div') => (made.push(tag), { style: {}, appendChild: <T,>(c: T) => c, prepend: () => {}, remove: () => {}, getContext: () => ({ setTransform: () => {} }) });
  const doc = { title: '', head: { childNodes: [], appendChild: () => {} }, body: node('body'), createElement: node };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { screenX: 0, screenY: 0, devicePixelRatio: 1, open: () => ({ document: doc, closed: false, devicePixelRatio: 1, close: () => {} }) });
  return { canvases: () => made.filter((t) => t === 'canvas').length };
}

it('효과: detach 두 개가 모두 끝나야 좌석에 돌아오고 끝난 효과와 타이머는 모듈 정리 목록에서 빠지며 canvas는 쓸 때만 만든다', async () => {
  const dom = fakeEffectDom();
  let runs = 0;
  const demo = defineModule({
    id: 'demo',
    effects: [
      { id: 'demo.fly', detach: true, loop: true, run: () => (runs++, () => {}) },
      { id: 'demo.pop', durationMs: 20, run: () => (runs++, () => {}) },
      { id: 'demo.draw', durationMs: 20, run: (s) => (runs++, s.canvas.getContext('2d'), () => {}) },
    ],
    setup: () => undefined,
  });
  const { core } = await boot([demo], { answers: { 'effects.prepare': { x: 0, y: 0, width: 100, height: 100 }, 'effects.bounds': null } });
  core.seatViews.set('alice_pc', {
    view: { hitRegion: () => ({ x: 0, y: 0, width: 10, height: 10 }) } as unknown as CharacterView,
    el: { getBoundingClientRect: () => ({ x: 0, y: 0 }) } as HTMLElement,
  });
  const ctx = core.ctxs.get('demo')!.ctx;
  const scoped = () => (core.host.loaded.get('demo')!.scope as unknown as { items: unknown[] }).items.length;
  const base = scoped();

  const one = ctx.render.playEffect('alice_pc', 'demo.fly');
  const two = ctx.render.playEffect('alice_pc', 'demo.fly');
  await vi.waitFor(() => expect(runs).toBe(2));
  expect(core.away.get().has('alice_pc')).toBe(true);
  one();
  expect(core.away.get().has('alice_pc')).toBe(true);
  two();
  expect(core.away.get().has('alice_pc')).toBe(false);
  expect(dom.canvases()).toBe(0);

  ctx.render.playEffect('alice_pc', 'demo.pop');
  ctx.render.playEffect('alice_pc', 'demo.draw');
  for (let i = 0; i < 5; i++) ctx.timers.at(1, () => {});
  await vi.waitFor(() => expect(runs).toBe(4));
  await vi.waitFor(() => expect(scoped()).toBe(base));
  expect(dom.canvases()).toBe(1);
  // 그리지 않고 끝나는 효과(회사원 모드, 없는 효과, 그려지지 않은 좌석)도 정리 목록에 남지 않는다
  ctx.render.playEffect('nobody', 'demo.pop');
  ctx.render.playEffect('alice_pc', 'demo.none');
  ctx.mode.set('quiet');
  ctx.render.playEffect('alice_pc', 'demo.pop');
  expect(scoped()).toBe(base);
  vi.unstubAllGlobals();
});

it('패널 ESC: 모듈이 이미 처리한 ESC(defaultPrevented)는 창을 닫지 않는다', async () => {
  const { core } = await boot([]);
  const closed: string[] = [];
  core.windows.close = (id) => void closed.push(id);
  const w = { id: 'demo.w' } as OpenWindow;
  core['onPanelKey'](w, { key: 'Escape', defaultPrevented: true } as KeyboardEvent);
  core['onPanelKey'](w, { key: 'Escape', defaultPrevented: false } as KeyboardEvent);
  expect(closed).toEqual(['demo.w']);
});

it('외형 파일이 JSON이 아니면 외형 없음(null)', async () => {
  const { core } = await boot([]);
  const hash = await core.deps.server.files.put(new TextEncoder().encode('not json'));
  expect(await core.appearanceOf(hash)).toBeNull();
});
