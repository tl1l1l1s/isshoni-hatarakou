// ServerPort: Realtime Database 경로가 아니라 이 앱의 말로 정의한다 (10.7.4).
// 연결이 끊길 때의 삭제 예약, 다중 경로 쓰기 같은 Firebase 고유 기능은 firebase/ 안에서만 다룬다.
import type { MemberRecord, RoomMeta, Sha256 } from '@shared/schemas';

export type Uid = string;
export type Dispose = () => void;

/** 모듈 namespace 안의 컬렉션 위치 (10.7.2). 경로 문자열은 adapter만 만든다 */
export type Namespace =
  | { scope: 'user'; module: string; uid: Uid; path?: string[] }
  | { scope: 'user.pub'; module: string; uid: Uid; path?: string[] }
  /** sender가 없으면 uid의 받은 기록 전체 in, 있으면 그 사람 칸 in/{sender} */
  | { scope: 'user.inbox'; module: string; uid: Uid; sender?: Uid; path?: string[] }
  | { scope: 'room'; module: string; room: string; path?: string[] }
  | { scope: 'global'; module: string; path?: string[] };

export interface DocHandle {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  /** 얕은 병합. 값이 { $inc: n }이면 서버 더하기 연산으로 쓴다.
   *  key가 ''이고 patch 키에 /가 있으면 namespace 안의 다중 경로 쓰기 하나가 된다 (예: 아이템 지우기와 삭제 표시) */
  update(key: string, patch: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  /** 키 순서 목록. limit은 꼭 필요하다 (10.3의 8번) */
  list<T = unknown>(opts: { limit: number }): Promise<Array<{ key: string; value: T }>>;
  watch<T = unknown>(key: string, fn: (value: T | null) => void): Dispose;
  /** key 아래 자식을 키 순서로 limit개만 구독한다. last면 마지막 limit개 (채팅 최근 100개) */
  watchList<T = unknown>(key: string, opts: { limit: number; last?: boolean }, fn: (items: Array<{ key: string; value: T }>) => void): Dispose;
  /** fn은 null(아직 모름)을 받을 수 있고 다시 불릴 수 있다. undefined를 돌려주면 취소 */
  transaction<T = unknown>(key: string, fn: (current: T | null) => T | undefined): Promise<{ committed: boolean; value: T | null }>;
  /** 연결이 끊기면 서버가 key를 지우도록 예약한다. on이 false면 예약을 거둔다. 끊긴 뒤 다시 연결되면 예약이 없으므로 다시 부른다 */
  removeOnDisconnect(key: string, on?: boolean): Promise<void>;
}

/** rooms/{code}/ev/{key}의 잠깐 쓰는 방 이벤트. p는 payload JSON 문자열이라 규칙이 길이를 잰다 */
export interface RoomEvent { key: string; t: string; uid: Uid; at: number; p: string }
/** 보낸 앱이 이 시간 뒤에 지우고 받는 쪽은 이보다 오래된 이벤트를 버린다. rules/core.ts도 이 값을 쓴다 */
export { ROOM_EVENT_MAX_CHARS, ROOM_EVENT_TTL_MS, ROOM_EVENT_TYPE_MAX, ROOM_EVENT_WINDOW } from '@shared/constants';

/** users/{uid}/presence. m은 모듈 id → accountPresence 필드 */
export interface AccountPresence { online: boolean; lastSeen: number; m: Record<string, Record<string, unknown>> }

export interface RoomTransport {
  getMeta(code: string): Promise<RoomMeta | null>;
  /** meta가 없을 때만 만든다. 이미 있으면 false */
  createMeta(code: string, meta: RoomMeta): Promise<boolean>;
  markDeleted(code: string, at: number): Promise<void>;
  /** roster/{uid}가 없으면 만든다 */
  ensureRoster(code: string, uid: Uid, at: number): Promise<void>;
  /** members/{uid}_{deviceId}에 쓰고 연결이 끊기면 지우도록 예약한다. 다시 연결되면 다시 예약한다 */
  join(code: string, key: string, record: MemberRecord): Promise<void>;
  /** 바뀐 필드만 쓴다. seenAt에 SERVER_TIME을 넣으면 서버 시각으로 쓴다 */
  writeMine(code: string, key: string, patch: Partial<MemberRecord> | Record<string, unknown>): Promise<void>;
  leave(code: string, key: string): Promise<void>;
  /** 오래된 남의 기록을 지운다 (규칙이 150초 넘은 기록만 허용) */
  removeStale(code: string, key: string): Promise<void>;
  watchMembers(code: string, fn: (members: Record<string, MemberRecord>) => void): Dispose;
  /** ev에 서버 시각 at과 함께 붙이고 push 키를 돌려준다. 연결이 끊기면 지우도록 예약한다 */
  emit(code: string, ev: Omit<RoomEvent, 'key' | 'at'>): Promise<string>;
  /** 연결이 끊길 때의 삭제 예약을 거두고 지운다. 남의 이벤트는 60초가 지난 것만 지운다 */
  removeEvent(code: string, key: string): Promise<void>;
  /** 서버 시각 since 뒤의 push 키부터 마지막 50개를 키 순서로 준다 */
  watchEvents(code: string, fn: (evs: RoomEvent[]) => void, since?: number): Dispose;
}

/** writeMine에 넣으면 서버가 시각을 채운다 */
export { SERVER_TIME } from '@shared/constants';

export interface ServerPort {
  readonly kind: 'firebase' | 'memory';
  identity: {
    /** 설정 코드로 로그인한다 (10.7.2 신원). 저장된 로그인이 있으면 restore가 돌려준다 */
    restore(): Promise<Uid | null>;
    signIn(setupCode: string): Promise<Uid>;
    current(): Uid | null;
    signOut(): Promise<void>;
  };
  docs(ns: Namespace): DocHandle;
  room: RoomTransport;
  /** files/{sha256}, base64로 바꾼 뒤 64KB 이하 */
  files: { put(bytes: Uint8Array): Promise<Sha256>; get(hash: Sha256): Promise<Uint8Array | null> };
  /** users/{uid}/public 코어 필드와 m.<moduleId> */
  profile: {
    write(uid: Uid, patch: Record<string, unknown>): Promise<void>;
    read(uid: Uid): Promise<Record<string, unknown> | null>;
  };
  /** users/{uid}/presence 계정 접속 상태 (10.7.2) */
  presence: {
    /** online true, lastSeen, m을 쓰고 연결이 끊기면 online false와 lastSeen을 쓰도록 예약한다 (m은 남김). 다시 연결될 때마다 다시 쓴다 */
    start(uid: Uid, m: AccountPresence['m']): Promise<void>;
    /** start를 멈춘다. 끊길 때의 offline 쓰기 예약을 거두고 다시 연결돼도 쓰지 않는다 (다른 기기가 쓰는 중일 때, ACC-12) */
    stop(): Promise<void>;
    /** m 아래 경로 하나를 쓴다 (예: 'rooms'). null은 지우기 */
    set(uid: Uid, path: string, value: unknown): Promise<void>;
    /** 친구가 아니면 규칙이 m을 막아 online과 lastSeen만 주고 m은 비어 있다 */
    watch(uid: Uid, fn: (p: AccountPresence | null) => void): Dispose;
  };
  /** users/{uid}/private. 본인만 읽고 쓴다 (잠금 해제 기록 gates, 지금 쓰는 기기 activeDevice) */
  userPrivate: {
    set(uid: Uid, path: string, value: unknown): Promise<void>;
    watch<T = unknown>(uid: Uid, path: string, fn: (value: T | null) => void): Dispose;
  };
  /** codes/{friendCode} → uid */
  codes: { lookup(code: string): Promise<Uid | null> };
  config: { minProtocol(): Promise<number> };
  time: { serverNow(): number; offset(): number };
  connection: { online(): boolean; onChange(fn: (online: boolean) => void): Dispose };
}
