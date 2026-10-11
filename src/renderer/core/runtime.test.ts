// ctx.notify 클릭 연결과 ctx.seats.refresh
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createMemoryServer, MemoryHub, type MemoryServer } from '@server/memory';
import type { AccountPresence } from '@server/port';
import type { CharacterView, RenderBackend } from '@render/port';
import { emptyAppearance } from '@shared/schemas';
import type { Bridge } from '../../preload/api';
import { coreSettings } from './coreSettings';
import { JsonFile, emptySettings, isSettingsFile, type SettingsFile } from './persist';
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
  const all = [defineModule({ id: 'core', settings: coreSettings, setup: () => undefined }), ...manifests];
  await core.preloadLocal(all);
  await core.start(all);
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
  const doc = { title: '', head: { childNodes: [], appendChild: () => {} }, body: node('body'), createElement: node, open: () => {}, write: () => {}, close: () => {} };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { screenX: 0, screenY: 0, devicePixelRatio: 1, open: () => ({ document: doc, closed: false, devicePixelRatio: 1, close: () => {} }) });
  return { canvases: () => made.filter((t) => t === 'canvas').length };
}

it('효과: 한 좌석에는 마지막 detach 효과 하나만 돌고 끝난 효과와 타이머는 모듈 정리 목록에서 빠지며 canvas는 쓸 때만 만든다', async () => {
  const dom = fakeEffectDom();
  let runs = 0;
  let disposed = 0;
  const demo = defineModule({
    id: 'demo',
    effects: [
      { id: 'demo.fly', detach: true, loop: true, run: () => (runs++, () => void disposed++) },
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
  await vi.waitFor(() => expect(runs).toBe(1));
  expect(core.away.get().has('alice_pc')).toBe(true);
  // 같은 좌석에 detach 효과가 또 오면 앞의 것을 끝내서 같은 캐릭터가 둘로 보이지 않는다
  const two = ctx.render.playEffect('alice_pc', 'demo.fly');
  await vi.waitFor(() => expect(runs).toBe(2));
  expect(disposed).toBe(1);
  expect(core.away.get().has('alice_pc')).toBe(true);
  one();
  expect(core.away.get().has('alice_pc')).toBe(true);
  two();
  expect(disposed).toBe(2);
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

it('패널 ESC: 모듈이 이미 처리한 ESC(defaultPrevented)는 창을 닫지 않고 저장하지 않은 일이 있으면 창 안에 묻는다', async () => {
  const { core } = await boot([]);
  const closed: string[] = [];
  core.windows.close = (id) => void closed.push(id);
  core.windows.live = () => true;
  const w = { id: 'demo.w' } as OpenWindow;
  const esc = () => core['onPanelKey'](w, { key: 'Escape', defaultPrevented: false } as KeyboardEvent);
  core['onPanelKey'](w, { key: 'Escape', defaultPrevented: true } as KeyboardEvent);
  esc();
  await vi.waitFor(() => expect(closed).toEqual(['demo.w']));

  // 물을 글이 있으면 닫지 않고 묻는다. 묻는 중의 ESC는 계속하기이고 닫기를 누르면 닫는다
  let dirty = true;
  const off = core.ctxs.get('core')!.ctx.ui.guard('demo.w', () => (dirty ? '저장하지 않았어요' : null));
  esc();
  expect(core.windows.asking.get()).toMatchObject({ id: 'demo.w', text: '저장하지 않았어요' });
  esc();
  expect(core.windows.asking.get()).toBeNull();
  esc();
  core.windows.asking.get()!.answer(true);
  await vi.waitFor(() => expect(closed).toEqual(['demo.w', 'demo.w']));
  // 저장해서 글이 없어지거나 guard를 풀면 묻지 않는다
  dirty = false;
  expect(await core.windows.confirm('demo.w')).toBe(true);
  dirty = true;
  off();
  expect(await core.windows.confirm('demo.w')).toBe(true);
});

it('ask는 정한 글과 단추로 묻고 창이 보이지 않으면 묻지 않고 false. confirmLeave도 글과 단추를 바꾼다', async () => {
  const { core } = await boot([]);
  const ui = core.ctxs.get('core')!.ctx.ui;
  core.windows.live = () => false;
  expect(await ui.ask('demo.w', { text: '지울까요?', ok: '지우기' })).toBe(false);
  core.windows.live = () => true;
  const asked = ui.ask('demo.w', { text: '지울까요?', ok: '지우기' });
  expect(core.windows.asking.get()).toMatchObject({ id: 'demo.w', text: '지울까요?', ok: '지우기', cancel: '취소' });
  core.windows.asking.get()!.answer(true);
  expect(await asked).toBe(true);
  ui.guard('demo.w', () => '캐릭터를 저장하지 않았어요. 나갈까요?');
  const leave = ui.confirmLeave('demo.w', { text: '캐릭터를 저장하지 않았어요. 바꿀까요?', ok: '바꾸기' });
  expect(core.windows.asking.get()).toMatchObject({ text: '캐릭터를 저장하지 않았어요. 바꿀까요?', ok: '바꾸기', cancel: '계속하기' });
  core.windows.asking.get()!.answer(false);
  expect(await leave).toBe(false);
});

it('회사원 모드에서는 OS 알림을 띄우지 않는다', async () => {
  const { core, invoked } = await boot([]);
  const ctx = core.ctxs.get('core')!.ctx;
  ctx.mode.set('quiet');
  ctx.notify({ title: '가짜 친구', body: '회사 비밀', onClick: () => {} });
  ctx.mode.set('normal');
  ctx.notify({ title: '가짜 친구', body: '보통', onClick: () => {} });
  await Promise.resolve();
  expect(invoked.filter(([ch]) => ch === 'notify.show').map(([, a]) => (a as { body: string }).body)).toEqual(['보통']);
});

it('연결: 끊긴 지 5초가 지나야 offline이 켜지고 다시 연결되면 한 번 알린다. 끊긴 동안 닉네임 저장과 방 이벤트는 바로 실패한다', async () => {
  vi.useFakeTimers();
  const demo = defineModule({ id: 'demo', roomEvents: { wave: { schema: z.object({}) } }, setup: () => undefined });
  const { core } = await boot([demo]);
  const ctx = core.ctxs.get('demo')!.ctx;
  const server = core.deps.server as MemoryServer;
  const seen: boolean[] = [];
  ctx.connection.onChange((on) => seen.push(on));
  await ctx.room.join(await ctx.room.create());
  server.goOffline({ abrupt: true });
  expect(ctx.connection.online()).toBe(false);
  expect(ctx.room.emit('wave', {})).toBe(false);
  await expect(ctx.self.setName('끊긴 이름')).rejects.toThrow('연결이 끊겨서');
  await vi.advanceTimersByTimeAsync(4_000);
  expect(core.offline.get()).toBe(false);
  await vi.advanceTimersByTimeAsync(1_500);
  expect(core.offline.get()).toBe(true);
  server.goOnline();
  expect(core.offline.get()).toBe(false);
  expect(core.toasts.get().map((t) => t.text)).toEqual(['다시 연결됐어요.']);
  expect(seen).toEqual([false, true]);
  // 짧게 끊겼다 이어지면 보이지 않는다
  server.goOffline({ abrupt: true });
  await vi.advanceTimersByTimeAsync(1_000);
  server.goOnline();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(core.offline.get()).toBe(false);
  vi.useRealTimers();
});

it('알림은 방금 쓴 패널에 뜨고 그 패널이 닫히면 런처 화면에서는 런처에, 실행 화면에서는 스테이지에 뜬다. 두 개까지만 남는다', async () => {
  const { core } = await boot([]);
  const live = new Set(['launcher.main', 'demo.w']);
  core.windows.live = (id) => live.has(id);
  core.windows.touch('launcher.main');
  await new Promise((r) => setTimeout(r, 5));
  core.windows.touch('demo.w');
  core.toast('하나');
  const one = core.toasts.get()[0]!;
  expect(core.toastPanel(one)).toBe('demo.w');
  // 띄우자마자 닫힌 창(저장하고 닫는 창)의 알림은 런처나 실행 화면으로 옮기고 오래 보인 뒤에 닫혔으면 그리지 않는다
  live.delete('demo.w');
  core.mode.set('launcher');
  expect(core.toastPanel(one)).toBe('launcher.main');
  core.mode.set('run');
  expect(core.toastPanel(one)).toBeNull();
  expect(core.toastPanel({ ...one, id: one.id - 2000 })).toBeUndefined();
  // 실행 화면을 더 최근에 눌렀으면 실행 화면에 뜬다
  core.windows.touch('');
  core.toast('둘');
  core.toast('셋');
  expect(core.toasts.get().map((t) => [t.text, t.at])).toEqual([['둘', null], ['셋', null]]);
});

it('외형 파일이 JSON이 아니면 외형 없음(null)', async () => {
  const { core } = await boot([]);
  const hash = await core.deps.server.files.put(new TextEncoder().encode('not json'));
  expect(await core.appearanceOf(hash)).toBeNull();
});

it('설정 파일이 JSON이지만 모양이 다르면({}, modules null) .bak으로 옮기고 처음 값으로 켜서 모든 모듈이 켜진다 (RES-5)', async () => {
  const files: Record<string, unknown> = { 'settings.json': {} };
  const invoked: Array<[string, unknown]> = [];
  const bridge = {
    version: 0,
    invoke: async (ch: string, args: { path?: string }) => (invoked.push([ch, args]), ch === 'store.read' ? (files[args.path ?? ''] ?? null) : undefined),
    on: () => () => {},
    invokeModule: async () => null,
  } as unknown as Bridge;
  const server = createMemoryServer(new MemoryHub());
  const uid = await server.identity.signIn('dev-alice');
  files[`accounts/${uid}/settings.json`] = { schemaVersion: 1, modules: null };
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: null },
    await JsonFile.load(bridge, 'settings.json', emptySettings, isSettingsFile),
    await JsonFile.load(bridge, `accounts/${uid}/settings.json`, emptySettings, isSettingsFile),
  );
  const demo = defineModule({ id: 'demo', settings: { version: 1, scope: 'account', schema: z.object({ n: z.number().default(1) }) }, setup: (ctx) => void ctx.settings.get() });
  await core.start([defineModule({ id: 'core', settings: coreSettings, setup: () => undefined }), demo]);
  expect(core.host.status.every((s) => s.on)).toBe(true);
  expect(invoked.filter(([ch]) => ch === 'store.quarantine').map(([, a]) => (a as { path: string }).path)).toEqual(['settings.json', `accounts/${uid}/settings.json`]);
});

it('잠근 채 절전했다 깨어나도 잠금을 풀 때까지 자리비움이고 잠그지 않은 절전은 깨어나면 돌아온다', async () => {
  const { core, listeners } = await boot([]);
  const life = listeners.get('lifecycle')!;
  life({ type: 'lock' });
  life({ type: 'suspend' });
  life({ type: 'resume' });
  expect(core.self.get().state).toBe('away');
  life({ type: 'unlock' });
  expect(core.self.get().state).toBe('online');
  life({ type: 'suspend' });
  expect(core.self.get().state).toBe('away');
  life({ type: 'resume' });
  expect(core.self.get().state).toBe('online');
});

it('로컬 파일: 새 버전 앱이 쓴 파일은 덮지 않고 알리며 검사 오류는 짧게 알리고 자세한 이유는 로그에만 남긴다 (OPS-10, RES-6)', async () => {
  const local = { version: 1, schema: z.object({ n: z.number() }), initial: () => ({ n: 0 }) };
  const demo = defineModule({ id: 'demo', title: '데모', local: { device: local }, setup: () => undefined });
  const newer = await boot([demo], { answers: { 'store.read': { v: 2, data: { n: 5, more: 1 } } } });
  newer.core.ctxs.get('demo')!.ctx.local.update<{ n: number }>('device', () => ({ n: 7 }));
  await newer.core.flush();
  expect(newer.invoked.filter(([ch, a]) => ch === 'store.write' && (a as { path: string }).path.startsWith('device/modules/demo'))).toEqual([]);
  expect(newer.core.toasts.get().map((t) => t.text)).toEqual(['데모 기록은 새 버전 앱이 저장해서 읽지 못했어요. 앱을 업데이트할 때까지 바꾼 내용은 저장하지 않아요.']);

  const broken = await boot([demo], { answers: { 'store.read': { v: 1, data: { n: 'x' } } } });
  expect(broken.core.toasts.get().map((t) => t.text)).toEqual(['데모 기록을 읽지 못해서 처음 상태로 시작해요.']);
  const logs = broken.invoked.filter(([ch]) => ch === 'log.write').map(([, a]) => (a as { message: string }).message);
  expect(logs.some((m) => m.startsWith('local device:') && m.includes('invalid_type'))).toBe(true);
  expect(broken.invoked).toContainEqual(['store.write', { path: 'device/modules/demo.bak.json', data: { v: 1, data: { n: 'x' } } }]);
});

it('서버가 거부한 프로필 쓰기는 로그에만 남고 처리하지 않은 거부(오류 보고)가 되지 않는다 (RES-3)', async () => {
  const { core, invoked } = await boot([defineModule({ id: 'demo', setup: () => undefined })]);
  vi.spyOn(core.deps.server.profile, 'write').mockRejectedValueOnce(new Error('권한이 없어 저장하지 못했어요.'));
  core.ctxs.get('demo')!.ctx.self.setProfile({ level: 2 });
  await vi.waitFor(() => expect(invoked).toContainEqual(['log.write', expect.objectContaining({ scope: 'demo', message: '프로필 쓰기 실패: 권한이 없어 저장하지 못했어요.' })]));
});

it('모듈 이벤트 처리 오류와 모듈을 내릴 때의 정리 오류는 모듈 이름과 함께 메인에 보고한다 (OPS-4)', async () => {
  const demo = defineModule({
    id: 'demo',
    setup: (ctx) =>
      void ctx.bus.on('demo.x' as never, () => {
        throw new Error('처리 실패');
      }),
  });
  const { core, invoked } = await boot([demo]);
  core.bus.emit('demo.x', {});
  core.host.loaded.get('demo')!.scope.add(() => {
    throw new Error('정리 실패');
  });
  core.host.stop('demo');
  const reports = invoked.filter(([ch]) => ch === 'crash.report').map(([, a]) => a as { type: string; message: string });
  expect(reports).toEqual([
    expect.objectContaining({ type: 'renderer.event', message: 'demo.x: 처리 실패' }),
    expect.objectContaining({ type: 'renderer.dispose', message: 'demo: 정리 실패' }),
  ]);
});
