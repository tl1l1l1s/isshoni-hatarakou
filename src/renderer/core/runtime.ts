import type { Bridge } from '../../preload/api';
import type { ServerPort } from '@server/port';
import type { Anchors, Box, CharacterView, RenderBackend } from '@render/port';
import type { ActivitySample, Appearance, CoreState, Sha256 } from '@shared/schemas';
import { Appearance as AppearanceSchema, bodyOnly, emptyAppearance, readState } from '@shared/schemas';
import { FILE_MAX_RAW_BYTES, SERVER_TIME } from '@shared/constants';
import { PROTO } from '@shared/proto';
import { dayKey } from '@shared/time';
import type { BubbleContent, Ctx, DisplayMode, Dispose, DocHandle, EffectDecl, GateDecl, GateInfo, JoinResult, ModuleManifest, SeatImageDecl, SeatView } from './types';
import { Bus } from './bus';
import { Registry } from './registry';
import { ModuleHost } from './host';
import type { Scope } from './scope';
import { createStore, type Store } from './store';
import { JsonFile, changedOnly, readLocal, readSettings, type SettingsFile } from './persist';
import { coreSettings } from './coreSettings';
import { EffectWindow, seeded } from './effects';
import type { SeatLayout } from './seats';
import { WindowClient, type OpenWindow } from './ui/windows';
import { RoomSession } from './room/session';
import { activeTunable } from './tunables';
import { prepareImage } from './files/image';

type LifecycleEvent = Parameters<Parameters<Ctx['lifecycle']['on']>[0]>[0];

export interface CoreDeps {
  bridge: Bridge;
  server: ServerPort;
  backend: RenderBackend;
  uid: string;
  deviceId: string;
  appVersion: string;
  /** 이 앱의 활성 앱 키 (직전에 쓴 다른 앱을 고를 때 뺀다) */
  selfAppKey: string | null;
  /** 패널 창에 OS 반투명 재질이 켜져 있는지 (Windows 11 Acrylic, macOS vibrancy) */
  material?: boolean;
  /** 부팅 때 읽은 공개 프로필 users/{uid}/public. undefined는 아직 읽는 중(오프라인 부팅)이고 읽히면 setProfile로 채운다 */
  profile: { name?: string; friendCode?: string } | null | undefined;
  /** 한 계정 한 기기 (ACC-12, SCR-08). boot가 켠다. 시뮬레이터는 같은 계정의 PC 여러 대를 함께 돌리려고 끈다 */
  singleDevice?: boolean;
}

/** 내 좌석의 코어 필드. 방에 들어가지 않아도 혼자 모드 좌석을 그리는 데 쓴다 */
export interface SelfState { name: string; look: Sha256 | null; appearance: Appearance | null; state: CoreState; m: Record<string, Record<string, unknown>> }

/** ctx.seats.addLocal로 더한 좌석 */
export interface LocalSeat { key: string; appearance: Appearance; name: string }
/** 로컬 좌석 수 상한 (AVT-22) */
export const LOCAL_SEATS_MAX = 4;
/** gate를 다시 확인하는 간격. 공개 API 함수 몇 개를 부르는 정도라 가볍다 */
const GATE_CHECK_MS = 5_000;

/** 렌더러 코어 서비스 묶음과 모듈별 ctx 생성 (10.5 코어가 모듈에 주는 것) */
export class CoreRuntime {
  readonly bus = new Bus();
  readonly registry = new Registry();
  readonly host: ModuleHost;
  readonly windows: WindowClient;
  readonly session: RoomSession;
  readonly self = createStore<SelfState>({ name: '', look: null, appearance: null, state: 'online', m: {} });
  readonly seats = createStore<SeatView[]>([]);
  /** ctx.seats.refresh가 올린다. 스테이지만 다시 그리고 seats 구독자(onMembers)는 부르지 않아 되풀이되지 않는다 */
  readonly seatsDrawn = createStore(0);
  /** 좌석 계층이 그린 뒤 알려 주는 anchor와 클릭 영역 (ctx.seats.list) */
  readonly seatGeometry = new Map<string, { anchors: Anchors; hit: Box }>();
  readonly toasts = createStore<Array<{ id: number; text: string }>>([]);
  readonly mode = createStore<'launcher' | 'run'>('run');
  /** 켜진 모듈의 ctx (코어 설정 화면이 모듈 설정을 그릴 때 쓴다) */
  readonly ctxs = new Map<string, { manifest: ModuleManifest; ctx: Ctx }>();
  /** 표시 모드 (ctx.mode). 저장한 값으로 시작하고 hidden은 이번 실행에만 둔다 */
  readonly displayMode: Store<DisplayMode>;
  /** ctx.seats의 로컬 좌석, 붙이기, 순서, 벤치 (10.8.2 좌석 계층) */
  readonly layout = createStore<SeatLayout & { local: LocalSeat[] }>({ local: [], attach: {}, order: [], bench: {} });
  /** 효과로 자리를 떠난 좌석. 한 좌석에 detach 효과가 여럿이면 모두 끝나야 돌아온다 */
  readonly away = createStore<ReadonlySet<string>>(new Set());
  private awayCount = new Map<string, number>();
  /** 좌석 계층이 만든 뷰와 그 칸. 효과 좌표를 여기서 구한다. 올라탄 좌석은 올라탄 자리의 뷰다 */
  readonly seatViews = new Map<string, { view: CharacterView; el: HTMLElement }>();
  /** 대상 고르기(ctx.ui.pickTarget) 중이면 끝내는 함수 */
  readonly picking = createStore<((seat: SeatView | null) => void) | null>(null);
  /** 같은 계정을 다른 기기가 쓰는 중 (ACC-12, SCR-08) */
  readonly elsewhere = createStore(false);
  private elsewhereRoom: string | null = null;
  private effects = new Map<string, EffectDecl>();
  private effectWindow: EffectWindow;
  private gates = new Map<string, { decl: GateDecl; owner: ModuleManifest; ctx: Ctx }>();
  private stickyGates = new Set<string>();
  private gateState = new Map<string, boolean>();
  private gateSubs = new Set<() => void>();
  private statuses = new Map<string, { value: CoreState; priority: number; seq: number }>();
  private statusSeq = 0;
  private activityLast: ActivitySample | null = null;
  private lastForeign: string | null = null;
  private beforeRemove = new Set<(code: string) => Promise<void>>();
  private activitySubs = new Set<(s: ActivitySample) => void>();
  private lifecycleSubs = new Set<(e: LifecycleEvent) => void>();
  private files = new Map<string, Promise<Uint8Array | null>>();
  private manifests: ModuleManifest[] = [];
  private presenceDecls: Record<string, NonNullable<ModuleManifest['presence']>> = {};
  /** 계정 접속 기록의 m. start 전에 모듈이 정한 값은 첫 쓰기에 함께 들어간다 */
  private accountPresence: Record<string, Record<string, unknown>> = {};
  private presenceStarted = false;
  /** ctx.notify의 onClick. ponytail: 최근 50개만 남긴다 */
  private notifyClicks = new Map<string, () => void>();
  private notifySeq = 0;

  constructor(readonly deps: CoreDeps, private deviceSettings: JsonFile<SettingsFile>, private accountSettings: JsonFile<SettingsFile>) {
    this.windows = new WindowClient(deps.bridge, (w, e) => this.onPanelKey(w, e), deps.material ?? false);
    this.displayMode = createStore<DisplayMode>(this.savedMode());
    this.effectWindow = new EffectWindow(deps.bridge);
    this.registry.hidden = (c) => (c.quiet === 'hide' && this.displayMode.get() === 'quiet') || (c.gate !== undefined && !this.gateOpen(c.gate));
    this.registry.blocked = (c) => {
      if (c.quiet === 'block' && this.displayMode.get() === 'quiet') return '회사원 모드에서는 쓸 수 없어요.';
      if (c.gate === undefined || this.gateOpen(c.gate)) return null;
      const label = this.gates.get(c.gate)?.decl.label;
      return label ? `아직 잠겨 있어요 (${label})` : '아직 잠겨 있어요.';
    };
    // 트레이나 단축키로 숨기고 보이면 표시 모드를 맞춘다
    deps.bridge.on('stage.visibility', ({ visible }) => {
      if (!visible) this.setDisplayMode('hidden', false);
      else if (this.displayMode.get() === 'hidden') this.setDisplayMode(this.savedMode(), false);
    });
    this.host = new ModuleHost((m, scope) => this.makeCtx(m, scope), (msg) => this.log('warn', 'host', msg));
    this.session = new RoomSession({
      server: deps.server,
      deviceId: deps.deviceId,
      proto: PROTO,
      mods: () => Object.fromEntries(this.manifests.map((m) => [m.id, m.server?.version ?? 1])),
      core: () => ({ name: this.self.get().name, look: this.self.get().look, state: this.self.get().state }),
      presence: this.presenceDecls,
      clock: { now: () => Date.now() },
      timers: { every: (ms, fn) => this.every(ms, fn), at: (ms, fn) => this.at(ms, fn) },
    });
    this.session.onMembers(() => this.recomputeSeats());
    this.session.onChange((_code, reason) => reason && this.toast(reason));
    this.self.subscribe(() => this.recomputeSeats());
    this.self.set((s) => ({ ...s, name: deps.profile?.name ?? '' }));
    deps.bridge.on('activity', (s) => {
      this.activityLast = s;
      if (s.appKey && s.appKey !== deps.selfAppKey) this.lastForeign = s.appKey;
      this.activitySubs.forEach((fn) => fn(s));
    });
    deps.bridge.on('lifecycle', (e) => this.onLifecycle(e));
    deps.bridge.on('notify.click', ({ id }) => {
      const fn = this.notifyClicks.get(id);
      this.notifyClicks.delete(id);
      try {
        fn?.();
      } catch (e) {
        this.log('warn', id.split(':')[0] ?? 'core', `알림 클릭 처리 실패: ${(e as Error).message}`);
      }
    });
    deps.server.connection.onChange((online) => this.lifecycleSubs.forEach((fn) => fn({ type: online ? 'online' : 'offline' })));
  }

  async start(manifests: ModuleManifest[]): Promise<void> {
    this.manifests = manifests;
    for (const m of manifests) if (m.presence) this.presenceDecls[m.id] = m.presence;
    if (this.deps.singleDevice) this.watchActiveDevice();
    this.deps.server.userPrivate.watch<Record<string, unknown>>(this.deps.uid, 'gates', (v) => {
      for (const k of Object.keys(v ?? {})) this.stickyGates.add(k.replaceAll(':', '.'));
      this.checkGates();
    });
    await this.host.start(manifests);
    if (!this.elsewhere.get()) this.startPresence();
    this.recomputeSeats();
    this.checkGates();
    this.every(GATE_CHECK_MS, () => this.checkGates());
    this.lifecycleSubs.forEach((fn) => fn({ type: 'ready' }));
  }

  // ---- 한 계정 한 기기 (ACC-12, SCR-08) ----------------------------------------

  /** 켤 때 이 기기를 쓰는 기기로 적는다. 다른 기기가 가져가면 방에서 나오고 스테이지가 안내를 띄운다 */
  private watchActiveDevice() {
    const { server, uid, deviceId } = this.deps;
    this.claimDevice();
    this.session.beforeJoin(async () => (this.elsewhere.get() ? '다른 기기에서 쓰는 중이에요. 여기서 계속 쓰기를 누르면 들어갈 수 있어요.' : null));
    server.userPrivate.watch<{ id?: string }>(uid, 'activeDevice', (v) => {
      if (!v?.id || v.id === deviceId || this.elsewhere.get()) return;
      this.elsewhere.set(true);
      // 계정 접속 상태는 쓰는 기기만 쓴다. 이 PC가 잠들거나 끊겨도 offline을 쓰지 않는다
      this.presenceStarted = false;
      void server.presence.stop().catch((e: Error) => this.log('warn', 'core', `접속 상태 멈추기 실패: ${e.message}`));
      this.elsewhereRoom = this.session.current();
      void this.session.leave();
    });
  }

  private startPresence() {
    this.presenceStarted = true;
    void this.deps.server.presence.start(this.deps.uid, this.accountPresence).catch((e: Error) => this.log('warn', 'core', `접속 상태 쓰기 실패: ${e.message}`));
  }

  private claimDevice() {
    const { server, uid, deviceId } = this.deps;
    void server.userPrivate.set(uid, 'activeDevice', { id: deviceId, at: SERVER_TIME }).catch((e: Error) => this.log('warn', 'core', `쓰는 기기 기록 실패: ${e.message}`));
  }

  /** 여기서 계속 쓰기: 이 기기가 다시 가져오고 나왔던 방에 들어간다 */
  takeOver(): void {
    if (!this.elsewhere.get()) return;
    this.elsewhere.set(false);
    this.claimDevice();
    this.startPresence();
    const code = this.elsewhereRoom;
    this.elsewhereRoom = null;
    if (code) void this.session.join(code).then((r) => this.toastFailed(r));
  }

  /** 입장 실패 안내. 다른 입장이나 나가기로 취소된 입장은 알리지 않는다 */
  private toastFailed(r: JoinResult | null) {
    if (r && !r.ok && r.kind !== 'cancelled') this.toast(r.reason);
  }

  /** 이번 실행에서 사용자가 이름을 정했는지. 늦게 읽은 서버 프로필이 그 이름을 덮지 않는다 */
  private nameEdited = false;

  /** 부팅 때 오프라인이라 읽지 못한 공개 프로필을 연결된 뒤에 채운다. 이번 실행에서 사용자가 정한 이름은 둔다.
   *  서버에 이름이 없으면 그동안 보이던 이름(fillName)을 한 번 올린다 */
  setProfile(p: CoreDeps['profile']): void {
    this.deps.profile = p;
    if (this.nameEdited) return;
    const cur = this.self.get().name;
    if (p?.name) {
      if (p.name !== cur) this.setSelfName(p.name);
    } else if (cur) this.writeName(cur, 'core');
  }

  /** ctx.self.fillName. 프로필을 이미 읽었는데 이름이 비어 있으면 올린다 */
  fillName(name: string, owner = 'core'): void {
    if (!name || this.self.get().name) return;
    this.setSelfName(name);
    if (this.deps.profile !== undefined) this.writeName(name, owner);
  }

  private setSelfName(name: string) {
    this.self.set((s) => ({ ...s, name }));
    this.session.setCore({ name });
  }

  private writeName(name: string, owner: string) {
    void this.deps.server.profile.write(this.deps.uid, { name }).catch((e: Error) => this.log('warn', owner, `이름 저장 실패: ${e.message}`));
  }

  // ---- 표시 모드와 gate ---------------------------------------------------------

  private savedMode(): DisplayMode {
    return readSettings(coreSettings, this.deviceSettings.value.modules.core?.values).mode as DisplayMode;
  }

  /** toMain이 false면 메인이 이미 스테이지를 숨기거나 보인 뒤다 */
  setDisplayMode(mode: DisplayMode, toMain = true): void {
    const prev = this.displayMode.get();
    if (mode === prev) return;
    if (mode !== 'hidden') this.ctxs.get('core')?.ctx.settings.set({ mode });
    if (toMain && (mode === 'hidden' || prev === 'hidden')) void this.deps.bridge.invoke('stage.setVisible', { visible: mode !== 'hidden' });
    this.displayMode.set(mode);
    this.registry.refresh();
  }

  /** gate가 열렸는지 (10.5 gates). sticky gate는 처음 열릴 때 계정에 남긴다 */
  gateOpen(id: string): boolean {
    const g = this.gates.get(id);
    if (!g) return false;
    if (this.stickyGates.has(id)) return true;
    const { module, key } = g.decl.requires;
    let open = false;
    try {
      const api = this.host.api(module) as Record<string, unknown> | undefined;
      const fn = api?.[key];
      const value: unknown = typeof fn === 'function' ? (fn as () => unknown).call(api) : undefined;
      const need = this.gateNeed(g);
      open = typeof value === 'number' && need !== null && value >= need;
    } catch {
      /* 공개 API 오류는 잠김으로 본다 */
    }
    if (open && g.decl.sticky) {
      this.stickyGates.add(id);
      void this.deps.server.userPrivate.set(this.deps.uid, `gates/${id.replaceAll('.', ':')}`, SERVER_TIME).catch((e: Error) => this.log('warn', g.owner.id, `gate 기록 실패: ${e.message}`));
    }
    return open;
  }

  /** gate 조건 값. tunable을 읽지 못하면 null */
  private gateNeed(g: { decl: GateDecl; ctx: Ctx }): number | null {
    const { gte } = g.decl.requires;
    try {
      const need: unknown = typeof gte === 'number' ? gte : g.ctx.tunables.get(gte.tunable);
      return typeof need === 'number' ? need : null;
    } catch {
      return null;
    }
  }

  /** ctx.gates.list. 보상 표처럼 gate를 모아 보여 주는 화면이 쓴다 */
  gateList(): GateInfo[] {
    return [...this.gates].map(([id, g]) => {
      const { module, key } = g.decl.requires;
      return { id, ...(g.decl.label && { label: g.decl.label }), module, key, need: this.gateNeed(g), open: this.gateOpen(id) };
    });
  }

  private checkGates() {
    let changed = false;
    for (const id of this.gates.keys()) {
      const open = this.gateOpen(id);
      if (this.gateState.get(id) === open) continue;
      this.gateState.set(id, open);
      changed = true;
    }
    if (!changed) return;
    this.registry.refresh();
    this.gateSubs.forEach((fn) => fn());
  }

  // ---- 효과와 대상 고르기 (10.8.2) -------------------------------------------------

  /** 이미지 해시를 그림으로 바꾼다 (좌석, 미리보기, renderScene) */
  readonly images = async (hash: string): Promise<ImageBitmap | null> => {
    const bytes = await this.getFile(hash);
    return bytes ? createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>])) : null;
  };

  /** 좌석 캐릭터 몸의 화면 좌표(DIP) 가운데와 CSS 크기. 그려져 있지 않으면 null */
  private seatBody(key: string): { x: number; y: number; width: number; height: number } | null {
    const v = this.seatViews.get(key);
    if (!v) return null;
    const r = v.el.getBoundingClientRect();
    const h = v.view.hitRegion();
    return { x: window.screenX + r.x + h.x + h.width / 2, y: window.screenY + r.y + h.y + h.height / 2, width: h.width, height: h.height };
  }

  /** 효과를 실행한다. onEnd는 효과가 스스로 끝났을 때 한 번 부른다 */
  playEffect(owner: string, seatKey: string, effectId: string, opts: { toSeatKey?: string; seed?: number; data?: unknown } = {}, onEnd: () => void = () => {}): Dispose {
    const decl = this.effects.get(effectId);
    if (!decl) {
      this.log('warn', owner, `없는 효과입니다: ${effectId}`);
      onEnd();
      return () => {};
    }
    const from = this.seatBody(seatKey);
    if (this.displayMode.get() !== 'normal' || !from) {
      onEnd();
      return () => {};
    }
    const to = opts.toSeatKey ? this.seatBody(opts.toSeatKey) : null;
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    let stopped = false;
    let stop: (() => void) | null = null;
    const end = () => {
      if (stopped) return;
      stopped = true;
      stop?.();
    };
    const finish = () => {
      end();
      onEnd();
    };
    const fail = (e: unknown) => {
      this.log('warn', owner, `효과 ${effectId} 실패: ${e instanceof Error ? e.message : String(e)}`);
      finish();
    };
    void (async () => {
      const seat = this.allSeats().find((s) => s.key === seatKey);
      const appearance = seat ? await this.seatAppearance(seat) : null;
      const sprite = decl.detach ? await this.sprite(appearance, from) : undefined;
      const s = stopped ? null : await this.effectWindow.open();
      if (!s) return finish();
      // 창을 여는 동안 멈췄다
      if (stopped) return s.close();
      let dispose: Dispose = () => {};
      let timer: Dispose = () => {};
      if (decl.detach) this.setAway(seatKey, 1);
      stop = () => {
        timer();
        try {
          dispose();
        } catch (e) {
          this.log('warn', owner, `효과 ${effectId} 정리 실패: ${(e as Error).message}`);
        }
        s.close();
        if (decl.detach) this.setAway(seatKey, -1);
      };
      const local = (p: { x: number; y: number }) => ({ x: p.x - s.area.x, y: p.y - s.area.y });
      dispose = decl.run(s.surface, { from: local(from), ...(to && { to: local(to) }), seed, rand: seeded(seed), appearance, ...(sprite && { sprite }), ...(opts.data !== undefined && { data: opts.data }) });
      if (!decl.loop) timer = this.at(decl.durationMs ?? 3000, finish);
    })().catch(fail);
    return end;
  }

  private setAway(key: string, delta: number) {
    const n = (this.awayCount.get(key) ?? 0) + delta;
    if (n > 0) this.awayCount.set(key, n);
    else this.awayCount.delete(key);
    this.away.set(new Set(this.awayCount.keys()));
  }

  /** 책상과 바닥을 뺀 캐릭터 그림. 좌석 몸과 같은 크기로 그린다 */
  private async sprite(a: Appearance | null, box: { width: number; height: number }) {
    const dpr = window.devicePixelRatio || 1;
    const size = { width: Math.max(1, Math.round(box.width * dpr)), height: Math.max(1, Math.round(box.height * dpr)) };
    const image = await this.deps.backend.renderScene({ appearance: bodyOnly(a ?? emptyAppearance()), pose: 'idle', framing: 'full' }, size, { mode: 'preview', images: this.images });
    return { image, width: box.width, height: box.height };
  }

  /** ctx.ui.pickTarget. 스테이지가 다른 사람 좌석을 강조하고 누르면 picking 함수를 부른다 */
  pickTarget(timeoutMs = 5000): Promise<{ uid: string; key: string; name: string } | null> {
    this.picking.get()?.(null);
    const ready = this.mode.get() === 'run' && this.displayMode.get() !== 'hidden' && !this.elsewhere.get();
    if (!ready || !this.seats.get().some((s) => !s.self)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const finish = (seat: SeatView | null) => {
        if (this.picking.get() !== finish) return;
        stopTimer();
        stopEsc();
        void this.deps.bridge.invoke('pick.escape', { on: false });
        this.picking.set(null);
        resolve(seat && { uid: seat.uid, key: seat.key, name: seat.name });
      };
      const stopTimer = this.at(timeoutMs, () => finish(null));
      const stopEsc = this.deps.bridge.on('pick.cancel', () => finish(null));
      void this.deps.bridge.invoke('pick.escape', { on: true });
      this.picking.set(() => finish);
    });
  }

  // ---- 좌석 -----------------------------------------------------------------

  /** 방 멤버 좌석과 로컬 좌석 */
  allSeats(): SeatView[] {
    const { state } = this.self.get();
    const local = this.layout.get().local.map<SeatView>((l) => ({
      key: l.key, uid: this.deps.uid, self: true, local: true, name: l.name, state, look: null, joinedAt: 0, m: {},
    }));
    return [...this.seats.get(), ...local];
  }

  seatAppearance(seat: SeatView): Promise<Appearance | null> {
    if (!seat.local) return this.appearanceOf(seat.look);
    return Promise.resolve(this.layout.get().local.find((l) => l.key === seat.key)?.appearance ?? null);
  }

  /** 방 멤버 기록과 내 상태로 좌석 목록을 만든다. 같은 uid는 가장 최근 기록 하나만 그린다 (10.7.2) */
  private recomputeSeats() {
    const me = this.deps.uid;
    const self = this.self.get();
    const members = this.session.members();
    const myKey = `${me}_${this.deps.deviceId}`;
    const joinedAt = members.find((r) => r.key === myKey)?.joinedAt ?? 0;
    const mine: SeatView = { key: myKey, uid: me, self: true, name: self.name, state: self.state, look: self.look, joinedAt, m: self.m };
    const others = members
      .filter((r) => r.uid !== me)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map<SeatView>((r) => ({ key: r.key, uid: r.uid, self: false, name: r.name, state: readState(r.state), look: r.look, joinedAt: r.joinedAt, m: r.m }));
    this.seats.set([mine, ...others]);
  }

  /** 좌석의 말풍선: 우선순위가 가장 높은 글 하나 (CHR-09) */
  bubbleOf(seat: SeatView): BubbleContent | null {
    for (const b of this.registry.bubbles) {
      if (seat.local && !b.decl.local) continue;
      try {
        const t = b.decl.text(seat, b.ctx);
        if (t) return t;
      } catch {
        /* 한 모듈의 오류가 좌석 그리기를 멈추지 않게 한다 */
      }
    }
    return null;
  }

  /** 모듈이 선언한 좌석 그림. 우선순위가 높은 것부터 */
  private readonly seatImages: Array<{ ctx: Ctx; decl: SeatImageDecl }> = [];

  /** 좌석의 캐릭터 몸 대신 세울 그림: 우선순위가 가장 높은 하나 (CHR-07) */
  imageOf(seat: SeatView): { file: Sha256; size: number } | null {
    if (seat.local) return null;
    for (const s of this.seatImages) {
      try {
        const r = s.decl.image(seat, s.ctx);
        if (r) return r;
      } catch {
        /* 한 모듈의 오류가 좌석 그리기를 멈추지 않게 한다 */
      }
    }
    return null;
  }

  /** 좌석의 자세 id: characterStates를 우선순위 순서로 평가하고 없으면 코어 상태 (10.5) */
  poseOf(seat: SeatView): string {
    for (const s of this.registry.characterStates) {
      try {
        if (s.decl.when(seat)) return s.decl.id;
      } catch {
        /* 한 모듈의 조건 오류가 좌석 그리기를 멈추지 않게 한다 */
      }
    }
    return seat.state === 'away' ? 'away' : 'idle';
  }

  async appearanceOf(look: Sha256 | null): Promise<Appearance | null> {
    if (!look) return null;
    if (look === this.self.get().look) return this.self.get().appearance;
    const bytes = await this.getFile(look);
    if (!bytes) return null;
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
    const r = AppearanceSchema.safeParse(json);
    return r.success ? r.data : null;
  }

  getFile(hash: string): Promise<Uint8Array | null> {
    let p = this.files.get(hash);
    if (!p) this.files.set(hash, (p = this.deps.server.files.get(hash)));
    return p;
  }

  // ---- 상태 -----------------------------------------------------------------

  setStatus(sourceId: string, value: CoreState | null, priority: number) {
    if (value === null) this.statuses.delete(sourceId);
    else this.statuses.set(sourceId, { value, priority, seq: ++this.statusSeq });
    // 우선순위가 같으면 나중에 낸 값 (10.7.2 state)
    const top = [...this.statuses.values()].sort((a, b) => b.priority - a.priority || b.seq - a.seq)[0];
    const state = top?.value ?? 'online';
    if (state === this.self.get().state) return;
    this.self.set((s) => ({ ...s, state }));
    this.session.setCore({ state });
  }

  /** 모듈에 먼저 알려 모듈이 고친 값까지 함께 저장되게 한다 */
  private onLifecycle(e: LifecycleEvent) {
    if (e.type === 'shutdown') return void this.quit();
    this.lifecycleSubs.forEach((fn) => fn(e));
    if (e.type === 'suspend' || e.type === 'lock') {
      this.setStatus('core.sleep', 'away', 100);
      if (e.type === 'suspend') this.session.pause();
      void this.flush();
    } else if (e.type === 'resume' || e.type === 'unlock') {
      this.setStatus('core.sleep', null, 100);
      if (e.type === 'resume') void this.session.resume().then((r) => this.toastFailed(r));
    }
  }

  private quitting = false;
  /** 모듈에 shutdown을 알리고 저장한 뒤 끝낸다. 메뉴와 트레이 종료가 모두 여기를 지난다.
   *  signOut이면 앱을 끝내지 않고 로그인만 지운 뒤 신원 단계부터 다시 시작한다. 이 PC의 파일은 남는다 (ACC-05 연결 해제) */
  async quit(opts: { signOut?: boolean } = {}): Promise<void> {
    if (this.quitting) return;
    this.quitting = true;
    this.lifecycleSubs.forEach((fn) => fn({ type: 'shutdown' }));
    await this.flush().catch(() => undefined);
    await this.session.leave().catch(() => undefined);
    if (!opts.signOut) return void (await this.deps.bridge.invoke('app.quit', {}));
    await this.deps.server.identity.signOut().catch(() => undefined);
    await this.deps.bridge.invoke('stage.reload', {});
  }

  async flush() {
    await Promise.all([this.deviceSettings.flush(), this.accountSettings.flush(), ...this.localFiles.map((f) => f.flush())]);
  }

  // ---- 타이머, 알림, 로그 -------------------------------------------------------

  every(ms: number, fn: () => void) {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }

  at(ms: number, fn: () => void) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  }

  toast(text: string) {
    const id = Date.now() + Math.random();
    this.toasts.set((ts) => [...ts, { id, text }]);
    this.at(4000, () => this.toasts.set((ts) => ts.filter((t) => t.id !== id)));
  }

  log(level: 'info' | 'warn' | 'error', scope: string, message: string) {
    void this.deps.bridge.invoke('log.write', { level, scope, message });
  }

  private onPanelKey(w: OpenWindow, e: KeyboardEvent) {
    // 한글 조합 중 Enter와 키 입력은 단축키로 보지 않는다 (10.5 shortcuts)
    // 모듈이 이미 처리한 키(예: 그리기 도구를 내려놓는 ESC)는 창을 닫거나 단축키로 쓰지 않는다
    if (e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
    if (e.key === 'Escape') {
      // 대상을 고르는 중이면 ESC는 고르기만 끝낸다
      const pick = this.picking.get();
      if (pick) return pick(null);
      this.windows.close(w.id);
      return;
    }
    const mods = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    for (const s of this.registry.shortcuts) {
      if (s.decl.scope !== 'panel' || s.decl.code !== e.code) continue;
      const want = new Set(s.decl.mods ?? []);
      if ((Object.keys(mods) as Array<keyof typeof mods>).every((k) => mods[k] === want.has(k))) {
        e.preventDefault();
        void this.registry.run(s.decl.command).catch((err: Error) => this.toast(err.message));
        return;
      }
    }
  }

  // ---- 모듈 ctx -------------------------------------------------------------

  private localFiles: Array<JsonFile<unknown>> = [];

  /** ctx.ui.Slot. Stage.tsx의 SlotItems를 순환 import 없이 넘겨받는다 */
  Slot: Ctx['ui']['Slot'] = () => null;
  CharacterPreview: Ctx['ui']['CharacterPreview'] = () => null;

  private makeCtx(m: ModuleManifest, scope: Scope): Ctx {
    const { server, uid } = this.deps;
    const id = m.id;
    const settingsFile = m.settings?.scope === 'account' ? this.accountSettings : this.deviceSettings;
    let settingsValue = m.settings ? readSettings(m.settings, settingsFile.value.modules[id]?.values) : {};
    const settingsSubs = new Set<(v: Record<string, unknown>) => void>();

    const local: Partial<Record<'device' | 'account', JsonFile<{ v: number; data: unknown }>>> = {};
    // 모듈이 연 서버 구독은 모듈을 내릴 때 함께 끊는다
    const scoped = (h: DocHandle): DocHandle => ({
      ...h,
      watch: (k, fn) => scope.add(h.watch(k, fn)),
      watchList: (k, opts, fn) => scope.add(h.watchList(k, opts, fn)),
    });
    const localPath = (s: 'device' | 'account') => (s === 'device' ? `device/modules/${id}.json` : `accounts/${uid}/modules/${id}.json`);

    const ctx: Ctx = {
      moduleId: id,
      settings: {
        get: <T,>() => settingsValue as T,
        set: (patch) => {
          if (!m.settings) throw new Error(`${id}: settings를 선언하지 않았습니다`);
          settingsValue = readSettings(m.settings, { ...settingsValue, ...patch });
          const defaults = m.settings.schema.parse({}) as Record<string, unknown>;
          const file = settingsFile.value;
          settingsFile.set({ ...file, modules: { ...file.modules, [id]: { v: m.settings.version, values: changedOnly(settingsValue, defaults) } } });
          settingsSubs.forEach((fn) => fn(settingsValue));
        },
        onChange: (fn) => {
          settingsSubs.add(fn);
          return scope.add(() => settingsSubs.delete(fn));
        },
      },
      local: {
        get: <T,>(s: 'device' | 'account') => {
          const f = local[s];
          if (!f) throw new Error(`${id}: local.${s}를 선언하지 않았습니다`);
          return f.value.data as T;
        },
        update: <T,>(s: 'device' | 'account', fn: (d: T) => T) => {
          const f = local[s];
          if (!f) throw new Error(`${id}: local.${s}를 선언하지 않았습니다`);
          f.set({ v: m.local![s]!.version, data: fn(f.value.data as T) });
        },
      },
      server: {
        user: (path) => scoped(server.docs({ scope: 'user', module: id, uid, path })),
        userPub: (path) => scoped(server.docs({ scope: 'user.pub', module: id, uid, path })),
        room: (room, path) => scoped(server.docs({ scope: 'room', module: id, room, path })),
        global: (path) => scoped(server.docs({ scope: 'global', module: id, path })),
        inbox: (path) => scoped(server.docs({ scope: 'user.inbox', module: id, uid, path })),
        sendTo: (to, path) => scoped(server.docs({ scope: 'user.inbox', module: id, uid: to, sender: uid, path })),
        userOf: (other, path) => scoped(server.docs({ scope: 'user', module: id, uid: other, path })),
      },
      room: {
        current: () => this.session.current(),
        onChange: (fn) => scope.add(this.session.onChange(fn)),
        join: (code) => this.session.join(code),
        leave: () => this.session.leave(),
        create: () => this.session.create(),
        beforeRemove: (fn) => {
          this.beforeRemove.add(fn);
          return scope.add(() => this.beforeRemove.delete(fn));
        },
        remove: async (code) => {
          for (const fn of this.beforeRemove) await fn(code);
          // 주인 앱이 deleteWithRoom 컬렉션을 먼저 지우고 deletedAt을 쓴다 (10.7.2 방 주인과 방 보존)
          for (const mm of this.manifests) {
            for (const [name, c] of Object.entries(mm.server?.collections ?? {})) {
              if (c.scope === 'room' && c.roomRetention === 'deleteWithRoom') await server.docs({ scope: 'room', module: mm.id, room: code }).remove(name);
            }
          }
          await this.session.remove(code);
        },
        owner: (code) => this.session.owner(code ?? this.session.current() ?? ''),
        setMine: (fields) => {
          // local 필드는 내 좌석에만 쓰고 나머지는 세션이 schema와 크기를 검사해 방으로 보낸다
          const decls = m.presence ?? {};
          const remote: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(fields)) {
            const decl = decls[k];
            if (decl?.sync !== 'local') remote[k] = v;
            else if (!decl.schema.safeParse(v).success) throw new Error(`${id}.${k}: schema에 맞지 않는 값입니다`);
          }
          if (Object.keys(remote).length) this.session.setMine(id, remote);
          this.self.set((s) => ({ ...s, m: { ...s.m, [id]: { ...s.m[id], ...fields } } }));
        },
        members: () => this.seats.get(),
        onMembers: (fn) => scope.add(this.seats.subscribe(() => fn(this.seats.get()))),
        beforeJoin: (fn) => scope.add(this.session.beforeJoin(fn)),
        emit: (type, payload) => {
          const decl = roomEvent(type);
          const r = decl.schema.safeParse(payload);
          if (!r.success) throw new Error(`${id}.${type}: schema에 맞지 않는 payload입니다`);
          return this.session.emit(`${id}.${type}`, r.data, decl.perMinute ?? 30);
        },
        onEvent: (type, fn) => {
          const decl = roomEvent(type);
          return scope.add(
            this.session.onEvent(`${id}.${type}`, (e) => {
              // 새 앱이 보낸 형식이 맞지 않으면 버린다
              const r = decl.schema.safeParse(e.payload);
              if (!r.success) return;
              try {
                fn({ ...e, payload: r.data as never });
              } catch (err) {
                this.log('warn', id, `방 이벤트 ${type} 처리 실패: ${(err as Error).message}`);
              }
            }),
          );
        },
      },
      self: {
        uid: () => uid,
        deviceId: () => this.deps.deviceId,
        name: () => this.self.get().name,
        friendCode: () => this.deps.profile?.friendCode ?? null,
        setName: (name) => {
          this.nameEdited = true;
          this.setSelfName(name);
          this.writeName(name, id);
        },
        fillName: (name) => this.fillName(name, id),
        setAppearance: async (a) => {
          const parsed = AppearanceSchema.parse(a);
          const look = await server.files.put(new TextEncoder().encode(JSON.stringify(parsed)));
          this.self.set((s) => ({ ...s, look, appearance: parsed }));
          this.session.setCore({ look });
        },
        setStatus: (sourceId, value, priority) => this.setStatus(`${id}.${sourceId}`, value, priority),
        setProfile: (fields) => void server.profile.write(uid, { [`m/${id}`]: fields }),
        setPresence: (fields) => {
          for (const [k, v] of Object.entries(fields)) {
            const schema = m.accountPresence?.[k];
            if (!schema) throw new Error(`${id}.${k}: 선언하지 않은 accountPresence 필드입니다`);
            if (!schema.safeParse(v).success) throw new Error(`${id}.${k}: schema에 맞지 않는 값입니다`);
          }
          const next = { ...this.accountPresence[id], ...fields };
          this.accountPresence[id] = next;
          if (this.presenceStarted) void server.presence.set(uid, id, next).catch((e: Error) => this.log('warn', id, `접속 상태 쓰기 실패: ${e.message}`));
        },
        activeDevice: () => !this.elsewhere.get(),
        onActiveDevice: (fn) => {
          let last = !this.elsewhere.get();
          return scope.add(
            this.elsewhere.subscribe(() => {
              const active = !this.elsewhere.get();
              if (active !== last) fn((last = active));
            }),
          );
        },
        onChange: (fn) => {
          let last = { name: this.self.get().name, look: this.self.get().look };
          return scope.add(
            this.self.subscribe(() => {
              const { name, look } = this.self.get();
              if (name !== last.name || look !== last.look) fn((last = { name, look }));
            }),
          );
        },
      },
      shell: {
        copy: (text) => this.deps.bridge.invoke('clipboard.write', { text }),
        openExternal: async (url) => {
          if (!/^https?:\/\//i.test(url)) throw new Error('http나 https 주소만 열 수 있습니다');
          await this.deps.bridge.invoke('shell.openExternal', { url });
        },
      },
      users: {
        profile: (other) => server.profile.read(other),
        byFriendCode: async (code) => {
          const c = code.trim().toUpperCase();
          // 경로에 쓸 수 없는 글자가 들어오면 찾지 않는다
          return /^[A-Z0-9]+$/.test(c) ? server.codes.lookup(c) : null;
        },
        watchPresence: (other, fn) => scope.add(server.presence.watch(other, fn)),
      },
      seats: {
        list: () => this.allSeats().flatMap((s) => {
          const g = this.seatGeometry.get(s.key);
          return g ? [{ key: s.key, ...g }] : [];
        }),
        onChange: (fn) => {
          const offs = [this.seats.subscribe(fn), this.layout.subscribe(fn)];
          return scope.add(() => offs.forEach((off) => off()));
        },
        refresh: () => this.seatsDrawn.set((n) => n + 1),
        addLocal: ({ key, appearance, name }) =>
          this.layout.set((l) => {
            const next = { key, appearance: AppearanceSchema.parse(appearance), name };
            const has = l.local.some((x) => x.key === key);
            if (!has && l.local.length >= LOCAL_SEATS_MAX) throw new Error(`로컬 좌석은 ${LOCAL_SEATS_MAX}개까지입니다`);
            return { ...l, local: has ? l.local.map((x) => (x.key === key ? next : x)) : [...l.local, next] };
          }),
        removeLocal: (key) => this.layout.set((l) => ({ ...l, local: l.local.filter((x) => x.key !== key) })),
        attach: (key, onKey) => this.layout.set((l) => ({ ...l, attach: withKey(l.attach, key, onKey) })),
        setOrder: (keys) => this.layout.set((l) => ({ ...l, order: [...keys] })),
        setBench: (key, bench) => this.layout.set((l) => ({ ...l, bench: withKey(l.bench, key, bench) })),
      },
      notify: ({ title, body, onClick }) => {
        const nid = `${id}:${++this.notifySeq}`;
        if (onClick) {
          this.notifyClicks.set(nid, onClick);
          if (this.notifyClicks.size > 50) this.notifyClicks.delete(this.notifyClicks.keys().next().value!);
        }
        void this.deps.bridge
          .invoke('notify.show', { id: nid, title: title.slice(0, 200), body: body.slice(0, 1000) })
          .catch((e: Error) => this.log('warn', id, `알림 실패: ${e.message}`));
      },
      bus: {
        emit: (name, payload) => this.bus.emit(name, payload),
        on: (name, fn) => scope.add(this.bus.on(name, fn as (p: unknown) => void)),
      },
      commands: { run: (cid, args) => this.registry.run(cid, args), reason: (cid, args) => this.registry.reason(cid, args) },
      mode: {
        get: () => this.displayMode.get(),
        set: (mode) => this.setDisplayMode(mode),
        on: (fn) => {
          let last = this.displayMode.get();
          return scope.add(
            this.displayMode.subscribe(() => {
              const mode = this.displayMode.get();
              if (mode !== last) fn((last = mode));
            }),
          );
        },
      },
      gates: {
        isOpen: (gid) => this.gateOpen(gid),
        list: () => this.gateList(),
        onChange: (fn) => {
          this.gateSubs.add(fn);
          return scope.add(() => this.gateSubs.delete(fn));
        },
      },
      render: {
        playEffect: (key, eid, opts) => {
          // 바로 끝난 효과(회사원 모드, 그려지지 않은 좌석)는 정리 목록에 넣지 않는다
          let remove: Dispose | null = null;
          let ended = false;
          const stop = this.playEffect(id, key, eid, opts, () => {
            if (remove) remove();
            else ended = true;
          });
          return ended ? stop : (remove = scope.add(stop));
        },
        renderScene: (spec, size) => this.deps.backend.renderScene(spec, size, { mode: 'preview', images: this.images }),
      },
      modules: {
        get: (dep) => {
          if (![...(m.requires ?? []), ...(m.optionalRequires ?? [])].includes(dep)) throw new Error(`${id}: requires에 없는 모듈 ${dep}`);
          return this.host.api(dep) as never;
        },
      },
      ui: {
        open: (wid) => {
          const w = this.registry.windows.get(wid);
          if (!w) return this.toast(`없는 창입니다: ${wid}`);
          void this.windows.show(w.decl, w.ctx);
        },
        close: (wid) => this.windows.close(wid),
        toast: (text) => this.toast(text),
        Slot: this.Slot,
        CharacterPreview: this.CharacterPreview,
        pickTarget: (opts) => this.pickTarget(opts?.timeoutMs),
      },
      clock: { now: () => Date.now(), serverNow: () => server.time.serverNow(), dayKey: () => dayKey(server.time.serverNow()) },
      timers: {
        every: (ms, fn) => scope.add(this.every(ms, fn)),
        // 울린 타이머는 정리 목록에서 뺀다. 오래 켜 두면 목록이 계속 늘어난다
        at: (ms, fn) => {
          const remove = scope.add(
            this.at(ms, () => {
              remove();
              fn();
            }),
          );
          return remove;
        },
      },
      tunables: {
        get: <T,>(key: string) => {
          const decl = m.tunables?.[key];
          if (!decl) throw new Error(`${id}: 선언하지 않은 tunable ${key}`);
          // 기간이 시작하거나 끝나도 바로 바뀌도록 읽을 때마다 지금 적용할 값을 고른다 (OPS-12)
          const pick = activeTunable(tunableValues.get(key), server.time.serverNow());
          const r = decl.schema.safeParse(pick);
          return (pick !== undefined && r.success ? r.data : decl.default) as T;
        },
      },
      activity: {
        on: (fn) => {
          if (!m.uses?.includes('platform.activity')) throw new Error(`${id}: uses에 platform.activity가 없습니다`);
          this.activitySubs.add(fn);
          return scope.add(() => this.activitySubs.delete(fn));
        },
        last: () => this.activityLast,
        lastForeignApp: () => this.lastForeign,
      },
      files: {
        upload: async (bytes, opts) => {
          const max = Math.min(opts?.maxBytes ?? FILE_MAX_RAW_BYTES, FILE_MAX_RAW_BYTES);
          if (bytes.byteLength > max) throw new Error(`파일이 너무 큽니다 (${Math.ceil(bytes.byteLength / 1024)}KB, 최대 ${Math.floor(max / 1024)}KB)`);
          return server.files.put(bytes);
        },
        get: (hash) => this.getFile(hash),
        openImage: () => this.deps.bridge.invoke('dialog.openImage', {}),
        prepareImage: (bytes, opts) => prepareImage(bytes, opts?.maxSide),
      },
      app: { version: this.deps.appVersion, setMode: (mode) => this.mode.set(mode), mode: () => this.mode.get() },
      lifecycle: {
        on: (fn) => {
          this.lifecycleSubs.add(fn);
          return scope.add(() => this.lifecycleSubs.delete(fn));
        },
      },
      log: {
        info: (msg) => this.log('info', id, msg),
        warn: (msg) => this.log('warn', id, msg),
        error: (msg) => this.log('error', id, msg),
      },
    };

    function roomEvent(type: string) {
      const decl = m.roomEvents?.[type];
      if (!decl) throw new Error(`${id}.${type}: 선언하지 않은 방 이벤트입니다`);
      return decl;
    }

    // 서버 조정값: mod/<id>/g/tunables를 구독한다. 값은 { value, from, until } 목록이나 값 하나 (10.5 tunables)
    const tunableValues = new Map<string, unknown>();
    if (m.tunables) {
      scope.add(
        ctx.server.global().watch<Record<string, unknown>>('tunables', (v) => {
          tunableValues.clear();
          for (const [k, raw] of Object.entries(v ?? {})) if (m.tunables?.[k]) tunableValues.set(k, raw);
        }),
      );
    }

    // 선언과 로컬 데이터를 등록하고 내릴 때 함께 정리한다
    this.ctxs.set(id, { manifest: m, ctx });
    scope.add(() => this.ctxs.delete(id));
    scope.add(this.registry.add(id, ctx, { commands: m.commands, windows: m.ui?.windows, contributions: m.ui?.contributions, shortcuts: m.shortcuts, characterStates: m.characterStates, bubbles: m.bubbles }));
    scope.add(() => this.windows.closeOwnedBy(ctx));
    for (const e of m.effects ?? []) {
      this.effects.set(e.id, e);
      scope.add(() => this.effects.delete(e.id));
    }
    for (const decl of m.seatImages ?? []) {
      const entry = { ctx, decl };
      this.seatImages.push(entry);
      this.seatImages.sort((a, b) => b.decl.priority - a.decl.priority);
      scope.add(() => void this.seatImages.splice(this.seatImages.indexOf(entry), 1));
    }
    for (const [gid, decl] of Object.entries(m.gates ?? {})) {
      // 코어는 gate를 선언한 모듈이 requires에 적은 모듈의 공개 API만 읽는다 (10.5 gates)
      if (![...(m.requires ?? []), ...(m.optionalRequires ?? [])].includes(decl.requires.module)) {
        this.log('warn', id, `gate ${gid}: requires에 없는 모듈 ${decl.requires.module}`);
        continue;
      }
      this.gates.set(gid, { decl, owner: m, ctx });
      scope.add(() => {
        this.gates.delete(gid);
        this.gateState.delete(gid);
      });
    }
    for (const s of ['device', 'account'] as const) {
      const decl = m.local?.[s];
      if (!decl) continue;
      // setup 전에 읽어 둔 값이 있어야 해서 preload에서 채운다
      const pre = this.preloaded.get(`${id}:${s}`);
      const { data, error } = readLocal(decl, pre);
      if (error) this.toast(`${m.title ?? id} 데이터를 읽지 못해 처음 상태로 시작합니다. ${error}`);
      const file = new JsonFile<{ v: number; data: unknown }>(this.deps.bridge, localPath(s), { v: decl.version, data });
      if (error && pre != null) void this.deps.bridge.invoke('store.write', { path: localPath(s).replace(/\.json$/, '.bak.json'), data: pre });
      local[s] = file;
      this.localFiles.push(file as JsonFile<unknown>);
    }
    return ctx;
  }

  /** setup 전에 로컬 파일을 읽어 둔다 (makeCtx는 동기라서) */
  private preloaded = new Map<string, unknown>();
  async preloadLocal(manifests: ModuleManifest[]): Promise<void> {
    await Promise.all(
      manifests.flatMap((m) =>
        (['device', 'account'] as const)
          .filter((s) => m.local?.[s])
          .map(async (s) => {
            const path = s === 'device' ? `device/modules/${m.id}.json` : `accounts/${this.deps.uid}/modules/${m.id}.json`;
            this.preloaded.set(`${m.id}:${s}`, await this.deps.bridge.invoke('store.read', { path }));
          }),
      ),
    );
  }
}

function withKey(map: Record<string, string>, key: string, value: string | null): Record<string, string> {
  const next = { ...map };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
}
