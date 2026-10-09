// 기능 모듈 계약 (10.5). 모듈은 이 파일의 타입과 @shared만 import한다.
// 필수는 id와 setup뿐이고 나머지는 쓰는 모듈만 적는다. scope global 단축키는 아직 동작하지 않는다 (10.5 만드는 시점).
import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { ActivitySample, Appearance, CoreState, MemberRecord, Sha256 } from '@shared/schemas';
import type { Anchors, Box, Point, SceneSpec } from '@render/port';
import type { AccountPresence } from '@server/port';

export type { AccountPresence, Point, SceneSpec };

export type Dispose = () => void;

/** 모듈이 declare module로 넓히는 이벤트와 공개 API 타입 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EventMap {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModuleApis {}

export interface SettingField {
  label: string;
  section?: string;
  widget?: 'toggle' | 'number' | 'text' | 'select';
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface SettingsDecl<S extends z.ZodObject = z.ZodObject> {
  version: number;
  scope: 'device' | 'account';
  schema: S;
  fields?: Partial<Record<keyof z.infer<S> & string, SettingField>>;
}

export interface LocalDecl<S extends z.ZodType = z.ZodType> {
  version: number;
  schema: S;
  initial: () => z.infer<S>;
  /** n에서 n+1로 가는 함수. migrate[0]은 v1→v2 */
  migrate?: Array<(old: unknown) => unknown>;
}

export type RuleTemplate = 'owner' | 'ownerWritePublicRead' | 'roomMember' | 'roomOwner' | 'friendsRead' | 'inbox' | 'appendOnly' | 'dailyQuota' | 'keyedWrite';
export type MergePolicy = 'sumByDevice' | 'perItemMtime' | 'max' | 'transaction' | 'askUser';

export interface CollectionDecl {
  /** user.inbox는 mod/<id>/u/{uid}/in/{senderUid} (ctx.server.inbox, sendTo) */
  scope: 'user' | 'user.pub' | 'user.inbox' | 'room' | 'global';
  schema: z.ZodType;
  template: RuleTemplate;
  merge?: MergePolicy;
  roomRetention?: 'deleteOnEmpty' | 'deleteWithRoom' | 'keep';
  rate?: { perSec: number; burst: number };
}

export interface PresenceFieldDecl {
  schema: z.ZodType;
  /** local은 방으로 보내지 않고 내 좌석에만 쓴다 (예: 타이핑 자세, 10.7.5 내려받기 비용) */
  sync: 'batch' | 'onChange' | 'local';
  minIntervalMs?: number;
}

/** 잠깐 쓰는 방 이벤트 종류 (10.5 roomEvents). 이름은 <moduleId>.<type>이 된다 */
export interface RoomEventDecl {
  schema: z.ZodType;
  /** 이 앱이 1분에 보낼 수 있는 횟수 (기본 30) */
  perMinute?: number;
}

/** 받은 방 이벤트. self는 내 uid가 보낸 것(내 다른 PC 포함) */
export interface RoomEventMsg<T = unknown> { uid: string; at: number; payload: T; self: boolean }

/** characterStates 조건 함수가 받는 좌석 (10.5) */
export interface SeatView {
  key: string;
  uid: string;
  self: boolean;
  name: string;
  state: CoreState;
  look: Sha256 | null;
  /** 방에 들어온 서버 시각. 방에 없으면 0 */
  joinedAt: number;
  m: Record<string, Record<string, unknown> | undefined>;
  /** ctx.seats.addLocal로 더한 내 다른 캐릭터 좌석 (AVT-22). 방 멤버가 아니고 이 PC에만 보인다 */
  local?: boolean;
}

export interface CharacterStateDecl {
  id: string;
  priority: number;
  when: (seat: SeatView) => boolean;
}

/** 말풍선에 넣는 글이나 그림 (image는 ctx.files 해시) */
export type BubbleContent = string | { image: Sha256 };

/** 머리 위 말풍선. 좌석마다 우선순위가 가장 높은 글 하나만 보인다 (CHR-09) */
export interface BubbleDecl {
  id: string;
  priority: number;
  /** ctx는 이 말풍선을 선언한 모듈의 ctx. 모듈 상태를 ctx별로 둘 때 쓴다 */
  text: (seat: SeatView, ctx: Ctx) => BubbleContent | null;
  /** 로컬 좌석(AVT-22)에도 띄운다. 기본은 방 좌석에만 띄운다 */
  local?: boolean;
}

/** 좌석의 캐릭터 몸 대신 세우는 그림 (CHR-07). 좌석마다 우선순위가 가장 높은 하나만 보인다.
 *  책상과 이름표는 그대로 남고 말풍선과 클릭 영역은 그림을 따른다 */
export interface SeatImageDecl {
  id: string;
  priority: number;
  /** 그림 파일과 한 변 길이(배율 1의 CSS 픽셀). 그림 아래 가운데를 몸의 발 위치에 맞춘다. ctx는 선언한 모듈의 ctx */
  image: (seat: SeatView, ctx: Ctx) => { file: Sha256; size: number } | null;
}

export interface WindowDecl {
  id: string;
  title: string;
  component: () => Promise<{ default: ComponentType<{ ctx: Ctx }> }>;
  width?: number;
  height?: number;
  /** 키보드 입력이 필요한 창만 켠다 (기본 끔) */
  focusable?: boolean;
  /** 닫으면 숨기기만 하고 컴포넌트를 남긴다. 다시 열면 같은 창이 보인다 (플레이리스트 재생 유지, SND-04 메모) */
  keepAlive?: boolean;
  resizable?: boolean;
}

/** 슬롯에 넣는 화면 조각이 받는 값. seat는 좌석 슬롯(seat.badge, chip.buttons)에서만 있다 */
export interface SlotProps { ctx: Ctx; seat?: SeatView }

export interface ContributionDecl {
  slot: string;
  id: string;
  label: string;
  order?: number;
  /** 누르면 실행할 명령 (메뉴 같은 목록 슬롯). seat.menu 슬롯에서는 args로 { uid, name }을 받는다.
   *  seat.click은 캐릭터를 짧게 눌렀을 때, seat.shake는 누른 채로 흔들었을 때 순서가 가장 앞선 항목 하나만 실행하고 args로 그 좌석(SeatView)을 받는다 */
  command?: string;
  /** 직접 그리는 화면 조각 (이름표, 상태칩, 설정 탭, 런처 같은 슬롯) */
  component?: ComponentType<SlotProps>;
  /** 표시 모드가 quiet이면 숨긴다 */
  quiet?: 'hide';
  /** gate id. 열리기 전에는 숨긴다 */
  gate?: string;
}

export interface CommandDecl {
  id: string;
  run: (ctx: Ctx, args?: unknown) => unknown;
  /** 실행할 수 없으면 이유 문자열. args는 명령을 부를 때의 인자 (seat.menu에서는 { uid, name }). 이유를 돌려주면 그 자리에서 숨긴다 */
  enabledWhen?: (ctx: Ctx, args?: unknown) => string | null;
  /** 표시 모드가 quiet이면 코어가 이유를 돌려주고 실행하지 않는다 */
  quiet?: 'block';
  /** gate id. 열리기 전에는 코어가 이유를 돌려주고 실행하지 않는다 */
  gate?: string;
}

export interface ShortcutDecl {
  command: string;
  code: string;
  mods?: Array<'ctrl' | 'alt' | 'shift' | 'meta'>;
  scope: 'panel' | 'global';
}

export interface TunableDecl<S extends z.ZodType = z.ZodType> { schema: S; default: z.infer<S> }

/** 효과가 그리는 곳: 효과 창 전체를 덮는 이 효과만의 DOM 루트와 canvas (CSS 픽셀).
 *  canvas는 처음 읽을 때 만든다. 기기 픽셀 배율로 잡혀 있고 2D context에 배율 변환을 걸어 두었으므로 CSS 픽셀로 그린다 */
export interface EffectSurface { root: HTMLElement; canvas: HTMLCanvasElement; width: number; height: number }

export interface EffectArgs {
  /** 대상 좌석 캐릭터 몸의 가운데 (효과 창 CSS 픽셀) */
  from: Point;
  /** playEffect의 toSeatKey 좌석 몸의 가운데 */
  to?: Point;
  seed: number;
  /** seed로 정한 0 이상 1 미만의 수열. 모든 PC에서 같은 순서로 나온다 */
  rand: () => number;
  /** 대상 좌석의 외형. 기본 외형이면 null */
  appearance: Appearance | null;
  /** detach 효과만: 책상과 바닥을 뺀 캐릭터 그림과 그 CSS 크기. from을 가운데로 size 크기로 그리면 좌석과 같은 모습이다 */
  sprite?: { image: ImageBitmap; width: number; height: number };
  /** playEffect에 넘긴 값. 시드로 정할 수 없는 내용(날리는 글 같은 것)을 받는다 */
  data?: unknown;
}

/** 효과 (10.5 effects, 10.8.2). id는 <모듈 id>.<이름> */
export interface EffectDecl {
  id: string;
  /** 반복 효과는 playEffect가 돌려준 함수를 부를 때까지 이어진다. 아니면 durationMs 뒤에 끝난다 */
  loop?: boolean;
  /** 한 번 효과의 길이 (기본 3000) */
  durationMs?: number;
  /** 캐릭터가 자리를 떠나는 효과. 그동안 좌석의 캐릭터를 숨기고 args.sprite를 준다 (책상은 남는다) */
  detach?: boolean;
  run: (surface: EffectSurface, args: EffectArgs) => Dispose;
}

/** 잠금 해제 조건 (10.5 gates). key는 module 공개 API에서 숫자를 돌려주는 함수 이름 (예: growth의 level).
 *  module은 gate를 선언한 모듈의 requires나 optionalRequires에 있어야 한다 */
export interface GateDecl {
  requires: { module: string; key: string; gte: number | { tunable: string } };
  /** 한 번 열리면 users/{uid}/private/gates에 남겨 다른 PC에서도 열려 있다 */
  sticky?: boolean;
  /** 잠겨 있을 때 이유에 쓰는 이름 (예: 폭탄) */
  label?: string;
}

/** ctx.gates.list 항목 */
export interface GateInfo { id: string; label?: string; module: string; key: string; need: number | null; open: boolean }

/** 표시 모드 (10.5 ctx.mode). hidden은 스테이지만 숨기고 타이머와 접속 상태는 그대로 둔다 */
export type DisplayMode = 'normal' | 'quiet' | 'hidden';

export interface ModuleManifest<Api = unknown> {
  id: string;
  title?: string;
  version?: string;
  specIds?: string[];
  requires?: string[];
  optionalRequires?: string[];
  uses?: Array<'platform.activity'>;
  settings?: SettingsDecl;
  local?: { device?: LocalDecl; account?: LocalDecl };
  server?: { version: number; collections: Record<string, CollectionDecl> };
  presence?: Record<string, PresenceFieldDecl>;
  profile?: Record<string, z.ZodType>;
  /** 계정 접속 기록 users/{uid}/presence/m/<id>의 필드 (ctx.self.setPresence). 본인과 친구만 읽는다 */
  accountPresence?: Record<string, z.ZodType>;
  roomEvents?: Record<string, RoomEventDecl>;
  characterStates?: CharacterStateDecl[];
  bubbles?: BubbleDecl[];
  seatImages?: SeatImageDecl[];
  effects?: EffectDecl[];
  /** gate id는 <모듈 id>.<이름> */
  gates?: Record<string, GateDecl>;
  /** 패널에 넣는 외부 출처. 코어가 CSP frame-src에 합친다 (예: https://www.youtube.com) */
  externalOrigins?: string[];
  ui?: { windows?: WindowDecl[]; contributions?: ContributionDecl[] };
  commands?: CommandDecl[];
  shortcuts?: ShortcutDecl[];
  tunables?: Record<string, TunableDecl>;
  diagnose?: () => string[];
  setup(ctx: Ctx): Api | Promise<Api>;
}

export function defineModule<Api>(m: ModuleManifest<Api>): ModuleManifest<Api> {
  return m;
}

// ---- ctx -------------------------------------------------------------------

export interface DocHandle {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  /** 얕은 병합. 값이 { $inc: n }이면 서버 더하기. key가 ''이고 patch 키에 /가 있으면 다중 경로 쓰기 하나가 된다 */
  update(key: string, patch: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  list<T = unknown>(opts: { limit: number }): Promise<Array<{ key: string; value: T }>>;
  watch<T = unknown>(key: string, fn: (value: T | null) => void): Dispose;
  /** key 아래 자식을 키 순서로 limit개만 구독한다. last면 마지막 limit개 (채팅 최근 100개). key가 ''이면 namespace 바로 아래 */
  watchList<T = unknown>(key: string, opts: { limit: number; last?: boolean }, fn: (items: Array<{ key: string; value: T }>) => void): Dispose;
  transaction<T = unknown>(key: string, fn: (current: T | null) => T | undefined): Promise<{ committed: boolean; value: T | null }>;
  /** 연결이 끊기면 서버가 key를 지우도록 예약한다. on이 false면 예약을 거둔다. 끊긴 뒤 다시 연결되면 예약이 없으므로 다시 부른다 */
  removeOnDisconnect(key: string, on?: boolean): Promise<void>;
}

/** kind로 실패 종류를 나누고 reason은 사용자에게 보여 줄 문장이다. cancelled는 기다리는 동안 다른 입장, 나가기, 절전이 와서 멈춘 입장이다 */
export type JoinResult =
  | { ok: true }
  | { ok: false; reason: string; kind: 'blocked' | 'proto' | 'missing' | 'gone' | 'auth' | 'network' | 'cancelled' };

export interface RoomCtx {
  /** 지금 들어가 있는 방 코드 */
  current(): string | null;
  /** reason은 방에서 밀려났을 때의 안내 (예: 주인이 방을 지움) */
  onChange(fn: (code: string | null, reason?: string) => void): Dispose;
  join(code: string): Promise<JoinResult>;
  leave(): Promise<void>;
  /** 방을 만들고 주인이 된다. 코드는 코어가 뽑는다 */
  create(): Promise<string>;
  /** 주인만 부른다 */
  remove(code: string): Promise<void>;
  owner(code?: string): Promise<string | null>;
  /** 이 모듈의 presence 필드를 쓴다 (manifest presence에 선언한 키만) */
  setMine(fields: Record<string, unknown>): void;
  members(): SeatView[];
  onMembers(fn: (members: SeatView[]) => void): Dispose;
  /** 입장 전 확인. 거부 이유 문자열이나 null */
  beforeJoin(fn: (code: string) => Promise<string | null>): Dispose;
  /** 주인이 방을 지우기 직전에 부른다. deleteWithRoom 컬렉션이 아직 남아 있을 때 삭제 표시 같은 것을 쓴다 (OUR-01, OUR-02) */
  beforeRemove(fn: (code: string) => Promise<void>): Dispose;
  /** 이 모듈의 방 이벤트를 보낸다 (roomEvents에 선언한 type만, payload는 schema로 검사).
   *  방 밖이거나 분당 한도를 넘으면 보내지 않고 false. 보낸 앱이 60초 뒤에 지운다 */
  emit(type: string, payload: unknown): boolean;
  /** 이 모듈의 방 이벤트를 받는다. 들어온 뒤에 보낸 60초 안의 것만 한 번씩 오고 내가 보낸 것도 온다.
   *  schema에 맞지 않는 payload는 버린다 */
  onEvent<T = unknown>(type: string, fn: (e: RoomEventMsg<T>) => void): Dispose;
}

export interface Ctx {
  readonly moduleId: string;
  settings: {
    get<T = Record<string, unknown>>(): T;
    set(patch: Record<string, unknown>): void;
    onChange(fn: (value: Record<string, unknown>) => void): Dispose;
  };
  local: {
    get<T = unknown>(scope: 'device' | 'account'): T;
    update<T = unknown>(scope: 'device' | 'account', fn: (draft: T) => T): void;
  };
  server: {
    user(path?: string[]): DocHandle;
    userPub(path?: string[]): DocHandle;
    room(code: string, path?: string[]): DocHandle;
    global(path?: string[]): DocHandle;
    /** 내 받은 기록 mod/<id>/u/{me}/in. 키는 보낸 사람 uid이고 읽고 지우기만 한다 */
    inbox(path?: string[]): DocHandle;
    /** uid의 받은 기록 가운데 내 칸 mod/<id>/u/{uid}/in/{me}에 쓴다 (규칙이 로그인 uid로 확인) */
    sendTo(uid: string, path?: string[]): DocHandle;
    /** 다른 사용자의 mod/<id>/u/{uid} (예: ['pub']). 읽기용이고 보이는 범위는 규칙이 정한다 */
    userOf(uid: string, path?: string[]): DocHandle;
  };
  room: RoomCtx;
  self: {
    uid(): string;
    /** 이 PC의 기기 id. 기기별 기록(sumByDevice)의 키로 쓴다 */
    deviceId(): string;
    name(): string;
    /** 친구에게 알려 주는 짧은 코드. 계정 발급 스크립트가 정한다 (ACC-04). 메모리 서버에서는 null */
    friendCode(): string | null;
    setName(name: string): void;
    /** 서버 프로필을 읽기 전에 보일 이름 (이 PC에 둔 이름). 이미 이름이 있으면 두고 서버에는 쓰지 않는다.
     *  프로필을 읽으면 그 이름으로 바뀌고 프로필에 이름이 없으면 이 이름을 한 번 올린다 */
    fillName(name: string): void;
    setAppearance(a: Appearance): Promise<void>;
    setStatus(sourceId: string, value: CoreState | null, priority: number): void;
    setProfile(fields: Record<string, unknown>): void;
    /** manifest accountPresence 필드를 users/{uid}/presence/m/<id>에 합쳐 쓴다. 선언하지 않은 키나 schema에 맞지 않는 값은 예외 */
    setPresence(fields: Record<string, unknown>): void;
    /** 내 이름이나 외형이 바뀌면 부른다 */
    onChange(fn: (s: { name: string; look: Sha256 | null }) => void): Dispose;
    /** 이 PC가 이 계정을 쓰는 기기인지. 다른 기기가 가져가면 false가 되고 여기서 계속 쓰기를 누르면 true로 돌아온다 (ACC-12) */
    activeDevice(): boolean;
    onActiveDevice(fn: (active: boolean) => void): Dispose;
  };
  shell: {
    copy(text: string): Promise<void>;
    /** http와 https 주소만 기본 브라우저로 연다. 다른 형식은 예외 (NFR-18) */
    openExternal(url: string): Promise<void>;
  };
  /** 다른 사용자 정보 */
  users: {
    /** 공개 프로필 users/{uid}/public. 없으면 null */
    profile(uid: string): Promise<Record<string, unknown> | null>;
    /** 친구 코드의 uid (codes/{code}). 대소문자와 앞뒤 공백은 무시하고 없으면 null */
    byFriendCode(code: string): Promise<string | null>;
    /** 계정 접속 상태. 기록이 없으면 null. 나를 친구로 둔 사람이 아니면 m은 비어 있고, 친구가 된 뒤에는 다시 구독해야 m이 보인다 */
    watchPresence(uid: string, fn: (p: AccountPresence | null) => void): Dispose;
  };
  seats: {
    /** 그려진 좌석. anchors와 hit은 좌석 칸 기준 CSS 픽셀 */
    list(): Array<{ key: string; anchors: Anchors; hit: Box }>;
    /** 방 멤버, 로컬 좌석, 붙이기, 순서, 벤치가 바뀌면 부른다 */
    onChange(fn: () => void): Dispose;
    /** 모듈 상태로 정하는 말풍선이나 자세가 바뀌었을 때 좌석을 다시 그리게 한다 */
    refresh(): void;
    /** 내 다른 캐릭터를 이 PC에만 보이는 좌석으로 더한다 (AVT-22). 같은 key면 바꾸고 4개를 넘으면 예외 */
    addLocal(seat: { key: string; appearance: Appearance; name: string }): void;
    removeLocal(key: string): void;
    /** key 좌석의 캐릭터를 onKey 좌석 머리 위에 올린다 (COM-16, HOM-17). null이면 내린다.
     *  아래 좌석이 없거나 효과로 자리를 떠나 있으면 한 칸 아래 좌석에, 아무도 없으면 제자리에 앉는다.
     *  책상과 이름표는 제자리에 남는다. 이 PC에만 적용하므로 붙임 상태는 모듈이 presence 필드로 나눈다 */
    attach(key: string, onKey: string | null): void;
    /** 좌석 순서 힌트. 적은 key가 이 순서로 앞에 오고 나머지는 뒤에 원래 순서로 온다 */
    setOrder(keys: string[]): void;
    /** 같은 bench id 좌석을 붙여 책상 하나에 앉힌다 (AVT-21). null이면 뺀다 */
    setBench(key: string, bench: string | null): void;
  };
  /** OS 알림. 누르면 onClick (채팅 안 읽음, 친구 초대) */
  notify(opts: { title: string; body: string; onClick?: () => void }): void;
  bus: {
    emit<K extends keyof EventMap & string>(name: K, payload: EventMap[K]): void;
    on<K extends keyof EventMap & string>(name: K, fn: (payload: EventMap[K]) => void): Dispose;
  };
  commands: { run(id: string, args?: unknown): Promise<unknown>; reason(id: string, args?: unknown): string | null };
  /** 표시 모드. PC마다 기억하고 hidden은 이번 실행에만 둔다 (SET-03) */
  mode: { get(): DisplayMode; set(mode: DisplayMode): void; on(fn: (mode: DisplayMode) => void): Dispose };
  /** manifest gates로 선언한 잠금 (어느 모듈의 gate든 id로 확인한다) */
  gates: {
    isOpen(gateId: string): boolean;
    onChange(fn: () => void): Dispose;
    /** 선언된 gate 전부. need는 지금 조건 값이고 tunable을 읽지 못하면 null */
    list(): GateInfo[];
  };
  /**
   * 그리기. 방 사람 모두가 같은 효과를 보려면 효과를 방 이벤트로 보내고 받은 쪽에서 실행한다.
   * onEvent는 내가 보낸 것도 주므로 보낸 PC도 받는 곳에서 실행한다. 좌석 key는 모든 PC에서 같다.
   *   roomEvents: { bomb: { schema: z.object({ from: z.string(), to: z.string(), seed: z.number().int() }) } }
   *   보내기: ctx.room.emit('bomb', { from: me.key, to: target.key, seed: Math.floor(Math.random() * 2 ** 31) })
   *   받기: ctx.room.onEvent<Bomb>('bomb', (e) => ctx.render.playEffect(e.payload.to, 'play.fly', { seed: e.payload.seed }))
   * gate는 보낸 쪽만 확인한다 (10.5 gates).
   */
  render: {
    /** 좌석에서 효과를 실행한다. 표시 모드가 normal이 아니거나 좌석이 그려져 있지 않으면 건너뛴다. 돌려준 함수는 효과를 멈춘다 */
    playEffect(seatKey: string, effectId: string, opts?: { toSeatKey?: string; seed?: number; data?: unknown }): Dispose;
    /** 미리보기와 사진용 장면 (COM-15). 좌석과 같은 backend로 그린다 */
    renderScene(spec: SceneSpec, size: { width: number; height: number }): Promise<ImageBitmap>;
  };
  modules: { get<K extends keyof ModuleApis & string>(id: K): ModuleApis[K] | undefined };
  ui: {
    open(windowId: string): void;
    close(windowId: string): void;
    toast(message: string): void;
    /** 모듈 화면 안에서 다른 모듈이 슬롯에 넣은 조각을 그린다 (예: launcher.cards, rooms.settings) */
    Slot: ComponentType<{ name: string; seat?: SeatView }>;
    /** 캐릭터 미리보기. appearance를 빼면 내 지금 외형을 그린다 (런처, 캐릭터 만들기, 꾸미기) */
    CharacterPreview: ComponentType<{ appearance?: Appearance | null; pose?: 'idle' | 'typing' | 'sleep'; width?: number; height?: number }>;
    /** 다른 사람 좌석을 몇 초 안에 누르게 해서 고른다. ESC, 취소, 시간이 지나면 null. 고를 사람이 없으면 바로 null */
    pickTarget(opts?: { timeoutMs?: number }): Promise<{ uid: string; key: string; name: string } | null>;
  };
  clock: { now(): number; serverNow(): number; dayKey(): string };
  timers: { every(ms: number, fn: () => void): Dispose; at(ms: number, fn: () => void): Dispose };
  tunables: { get<T = unknown>(key: string): T };
  activity: {
    on(fn: (s: ActivitySample) => void): Dispose;
    last(): ActivitySample | null;
    /** 이 앱을 뺀 직전 활성 앱 키 (FOC-01 직전에 쓴 앱 넣기) */
    lastForeignApp(): string | null;
  };
  files: {
    upload(bytes: Uint8Array, opts?: { maxBytes?: number }): Promise<Sha256>;
    get(hash: Sha256): Promise<Uint8Array | null>;
    /** 그림 파일 고르기. 고르지 않으면 null */
    openImage(): Promise<{ name: string; bytes: Uint8Array } | null>;
    /** Web Worker에서 긴 변을 maxSide 이하로 줄이고 64KB(base64) 안에 드는 PNG나 WebP로 바꾼다. 안 되면 예외 */
    prepareImage(bytes: Uint8Array, opts?: { maxSide?: number }): Promise<Uint8Array>;
  };
  app: { version: string; setMode(mode: 'launcher' | 'run'): void; mode(): 'launcher' | 'run' };
  /** ready는 모든 모듈의 setup이 끝난 뒤 한 번 온다 (자동 재입장 같은 일은 이때 한다) */
  lifecycle: { on(fn: (e: { type: 'ready' | 'suspend' | 'resume' | 'lock' | 'unlock' | 'shutdown' | 'online' | 'offline' }) => void): Dispose };
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
}

/** 코어가 모듈 밖 데이터로 다루는 멤버 기록 (seat 계산 입력) */
export type MemberMap = Record<string, MemberRecord>;
