// 메모리 ServerPort. 시험, 오프라인 개발, 가짜 친구가 있는 개발 방에 쓴다 (10.7.4).
// Firebase 구현과 같은 경로 배치(firebase/layout.ts)에 JSON 트리 하나를 두고 여러 클라이언트가 함께 쓴다.
import { PRESENCE_STALE_MS } from '@shared/constants';
import type { MemberRecord, RoomMeta } from '@shared/schemas';
import { decodeFile, encodeFile, isInc, nsPath, pushKeyTime, toPresence } from '../firebase/layout';
import {
  ROOM_EVENT_MAX_CHARS, ROOM_EVENT_TTL_MS, ROOM_EVENT_TYPE_MAX, ROOM_EVENT_WINDOW, SERVER_TIME,
  type DocHandle, type Namespace, type RoomEvent, type RoomTransport, type ServerPort,
} from '../port';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const keysOf = (path: string) => path.split('/').filter(Boolean);

/** Firebase처럼 null과 빈 객체를 지우고 서버 시각을 채운다 */
function normalize(v: unknown, now: number): unknown {
  if (v === undefined || v === null) return null;
  if (isObj(v) && v['.sv'] === 'timestamp') return now;
  // ponytail: 배열은 그대로 둔다. Firebase는 숫자 키 객체로 바꾸므로 서버 기록에 배열을 쓰지 않는다
  if (!isObj(v)) return v;
  const out: Obj = {};
  for (const [k, x] of Object.entries(v)) {
    const n = normalize(x, now);
    if (n !== null) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

/** Firebase orderByKey 순서: 32비트 정수 키가 먼저(숫자 순), 나머지는 문자열 순 */
const INT_KEY = /^-?(0|[1-9]\d{0,9})$/;
const asInt = (k: string) => (INT_KEY.test(k) && Math.abs(Number(k)) <= 2 ** 31 - 1 ? Number(k) : null);
export function keyOrder(a: string, b: string): number {
  const x = asInt(a);
  const y = asInt(b);
  if (x !== null && y !== null) return x - y;
  if (x !== null || y !== null) return x !== null ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

interface Watcher { path: string; fn: (v: unknown) => void; live: () => boolean; last?: string }

export class MemoryHub {
  private root: Obj = {};
  private skew = 0;
  private seq = 0;
  private readonly watchers = new Set<Watcher>();

  /** 서버 시각. Date.now를 따르고 advance만큼 앞선다 (vitest 가짜 시계와 함께 쓴다) */
  now(): number {
    return Date.now() + this.skew;
  }

  advance(ms: number): void {
    this.skew += ms;
  }

  /** Firebase push 키처럼 시각 순서인 키. 뒤 12글자는 허브 전체에서 늘어나는 번호 */
  pushKey(): string {
    return pushKeyTime(this.now()) + String(++this.seq).padStart(12, '0');
  }

  read(path: string): unknown {
    let node: unknown = this.root;
    for (const k of keysOf(path)) node = isObj(node) ? node[k] : undefined;
    return node === undefined ? null : structuredClone(node);
  }

  /** 규칙 확인 없이 쓴다. 시험 준비(config/minProtocol 등)와 개발 방에도 쓴다. null은 지우기 */
  write(path: string, value: unknown): void {
    this.writeMany({ [path]: value });
  }

  /** 다중 경로 쓰기. 모두 쓴 뒤에 한 번 알린다 */
  writeMany(updates: Obj): void {
    const now = this.now();
    for (const [path, value] of Object.entries(updates)) this.put(keysOf(path), normalize(value, now));
    this.notify();
  }

  /** 얕은 병합. { $inc: n }은 지금 값에 더한다 */
  update(path: string, patch: Obj): void {
    const updates: Obj = {};
    for (const [k, v] of Object.entries(patch)) {
      const cur = this.read(`${path}/${k}`);
      updates[`${path}/${k}`] = isInc(v) ? (typeof cur === 'number' ? cur : 0) + v.$inc : v;
    }
    this.writeMany(updates);
  }

  /** 처음 한 번과 값이 바뀔 때마다 부른다. live가 false인 동안(오프라인)은 미뤘다가 notify 때 부른다 */
  watch(path: string, fn: (v: unknown) => void, live: () => boolean = () => true): () => void {
    const w: Watcher = { path, fn, live };
    this.watchers.add(w);
    this.check(w);
    return () => {
      this.watchers.delete(w);
    };
  }

  // ponytail: 쓰기마다 모든 구독 경로를 다시 읽는다. 시험과 개발용 규모라 충분하다
  notify(): void {
    for (const w of [...this.watchers]) if (this.watchers.has(w)) this.check(w);
  }

  private check(w: Watcher): void {
    if (!w.live()) return;
    const v = this.read(w.path);
    const s = JSON.stringify(v);
    if (s === w.last) return;
    w.last = s;
    w.fn(v);
  }

  private put(keys: string[], value: unknown): void {
    const last = keys.pop();
    if (last === undefined) {
      this.root = isObj(value) ? value : {};
      return;
    }
    const stack: Obj[] = [this.root];
    for (const k of keys) {
      const parent = stack[stack.length - 1] as Obj;
      if (!isObj(parent[k])) {
        if (value === null) return;
        parent[k] = {};
      }
      stack.push(parent[k] as Obj);
    }
    const node = stack[stack.length - 1] as Obj;
    if (value === null) delete node[last];
    else node[last] = value;
    // 비게 된 부모를 위로 올라가며 지운다
    for (let i = keys.length; i > 0 && Object.keys(stack[i] as Obj).length === 0; i--) delete (stack[i - 1] as Obj)[keys[i - 1] as string];
  }
}

export type MemoryServer = ServerPort & {
  /** abrupt면 연결이 끊길 때의 삭제를 실행하지 않는다 (서버가 끊김을 아직 모르는 네트워크 끊김) */
  goOffline(opts?: { abrupt?: boolean }): void;
  goOnline(): void;
};

export function createMemoryServer(hub: MemoryHub): MemoryServer {
  let uid: string | null = null;
  let online = true;
  const waiting: Array<() => void> = [];
  const listeners = new Set<(online: boolean) => void>();
  // 연결이 끊길 때 지울 내 멤버 기록. 다시 연결되면 다시 쓴다
  const joined = new Map<string, { code: string; key: string; rec: Obj }>();
  // 연결이 끊길 때 지울 내 방 이벤트와 offline을 쓸 계정 접속 상태
  const sentEvents = new Set<string>();
  // 모듈이 docs.removeOnDisconnect로 예약한 경로
  const dropOnDisconnect = new Set<string>();
  let presenceUid: string | null = null;

  const live = () => online;
  const me = (): string => {
    if (!uid) throw new Error('로그인이 필요합니다');
    return uid;
  };
  const deny = (path: string): never => {
    throw new Error(`PERMISSION_DENIED: ${path}`);
  };
  const read = (path: string) => {
    me();
    return hub.read(path);
  };
  // 오프라인이면 다시 연결될 때까지 쓰기를 미룬다 (Firebase처럼)
  const run = async <T>(op: () => T): Promise<T> => {
    if (!online) await new Promise<void>((res) => waiting.push(res));
    return op();
  };
  const emit = () => {
    for (const fn of listeners) fn(online);
  };

  // 아래 확인은 rules/core.ts의 규칙 가운데 싼 것만 따라 해서 메모리 위 시험이 잘못된 쓰기를 잡게 한다
  const metaOf = (code: string) => hub.read(`rooms/${code}/meta`) as RoomMeta | null;
  const inRoster = (code: string, u: string) => hub.read(`rooms/${code}/roster/${u}`) !== null;
  const member = (code: string, key: string) => `rooms/${code}/members/${key}`;
  const checkMember = (code: string, key: string, rec: Obj) => {
    const u = me();
    const meta = metaOf(code);
    const min = hub.read('config/minProtocol');
    const proto = typeof rec.proto === 'number' ? rec.proto : -1;
    if (!key.startsWith(`${u}_`) || rec.uid !== u || !inRoster(code, u) || !meta || meta.deletedAt !== undefined || (typeof min === 'number' && proto < min)) {
      deny(member(code, key));
    }
  };

  const docs = (ns: Namespace): DocHandle => {
    const base = nsPath(ns);
    const p = (key: string) => `${base}/${key}`;
    const writable = (path: string, removing = false) => {
      const u = me();
      // 받은 기록: 보낸 사람은 자기 칸에 쓰고 받는 사람은 지운다 (rules/core.ts inbox)
      if (ns.scope === 'user.inbox') {
        const sender = keysOf(path)[5];
        if (sender !== u && !(ns.uid === u && removing)) deny(path);
        return;
      }
      if ((ns.scope === 'user' || ns.scope === 'user.pub') && ns.uid !== u) deny(path);
      if (ns.scope === 'room' && !inRoster(ns.room, u) && metaOf(ns.room)?.owner !== u) deny(path);
    };
    const mutate = (path: string, op: () => void, removing = false) =>
      run(() => {
        writable(path, removing);
        op();
      });
    return {
      get: async <T>(key: string) => read(p(key)) as T | null,
      set: (key, value) => mutate(p(key), () => hub.write(p(key), value)),
      update: (key, patch) => mutate(p(key), () => hub.update(p(key), patch)),
      remove: (key) => mutate(p(key), () => hub.write(p(key), null), true),
      list: async <T>({ limit }: { limit: number }) => {
        const node = read(base);
        if (!isObj(node)) return [];
        return Object.keys(node).sort(keyOrder).slice(0, limit).map((key) => ({ key, value: node[key] as T }));
      },
      watch: <T>(key: string, fn: (value: T | null) => void) => hub.watch(p(key), (v) => fn(v as T | null), live),
      watchList: <T>(key: string, { limit, last }: { limit: number; last?: boolean }, fn: (items: Array<{ key: string; value: T }>) => void) =>
        hub.watch(
          p(key),
          (v) => {
            const node = isObj(v) ? v : {};
            const keys = Object.keys(node).sort(keyOrder);
            fn((last ? keys.slice(-limit) : keys.slice(0, limit)).map((k) => ({ key: k, value: node[k] as T })));
          },
          live,
        ),
      transaction: <T>(key: string, fn: (current: T | null) => T | undefined) =>
        run(() => {
          writable(p(key));
          const next = fn(hub.read(p(key)) as T | null);
          if (next !== undefined) hub.write(p(key), next);
          return { committed: next !== undefined, value: hub.read(p(key)) as T | null };
        }),
      removeOnDisconnect: (key, on = true) =>
        run(() => {
          writable(p(key), true);
          if (on) dropOnDisconnect.add(p(key));
          else dropOnDisconnect.delete(p(key));
        }),
    };
  };

  const room: RoomTransport = {
    getMeta: async (code) => read(`rooms/${code}/meta`) as RoomMeta | null,
    createMeta: (code, meta) =>
      run(() => {
        if (meta.owner !== me()) deny(`rooms/${code}/meta`);
        if (metaOf(code)) return false;
        hub.write(`rooms/${code}/meta`, meta);
        return true;
      }),
    markDeleted: (code, at) =>
      run(() => {
        const meta = metaOf(code);
        if (!meta || meta.owner !== me() || meta.deletedAt !== undefined) deny(`rooms/${code}/meta/deletedAt`);
        hub.writeMany({ [`rooms/${code}/meta/deletedAt`]: at, [`rooms/${code}/members`]: null, [`rooms/${code}/ev`]: null });
      }),
    ensureRoster: (code, u, at) =>
      run(() => {
        const path = `rooms/${code}/roster/${u}`;
        if (hub.read(path) !== null) return;
        const meta = metaOf(code);
        if (u !== me() || !meta || meta.deletedAt !== undefined) deny(path);
        hub.write(path, at);
      }),
    join: (code, key, record) =>
      run(() => {
        checkMember(code, key, record);
        const path = member(code, key);
        hub.write(path, { ...record, seenAt: SERVER_TIME });
        joined.set(path, { code, key, rec: hub.read(path) as Obj });
      }),
    writeMine: (code, key, patch) =>
      run(() => {
        const path = member(code, key);
        const cur = hub.read(path);
        if (!isObj(cur)) return deny(path);
        checkMember(code, key, { ...cur, ...patch });
        hub.update(path, patch);
        const j = joined.get(path);
        if (j) j.rec = hub.read(path) as Obj;
      }),
    leave: (code, key) => {
      const path = member(code, key);
      joined.delete(path);
      return run(() => {
        if (!key.startsWith(`${me()}_`)) deny(path);
        hub.write(path, null);
      });
    },
    removeStale: (code, key) =>
      run(() => {
        const path = member(code, key);
        const u = me();
        const cur = hub.read(path) as MemberRecord | null;
        if (!cur || key.startsWith(`${u}_`)) return hub.write(path, null);
        if (!inRoster(code, u) || hub.now() - cur.seenAt <= PRESENCE_STALE_MS) deny(path);
        hub.write(path, null);
      }),
    watchMembers: (code, fn) => {
      me();
      return hub.watch(member(code, ''), (v) => fn((v ?? {}) as Record<string, MemberRecord>), live);
    },
    emit: (code, ev) =>
      run(() => {
        const key = hub.pushKey();
        const path = `rooms/${code}/ev/${key}`;
        const u = me();
        const meta = metaOf(code);
        if (ev.uid !== u || !inRoster(code, u) || !meta || meta.deletedAt !== undefined) deny(path);
        if (!ev.t || ev.t.length > ROOM_EVENT_TYPE_MAX || ev.p.length > ROOM_EVENT_MAX_CHARS) deny(path);
        hub.write(path, { ...ev, at: SERVER_TIME });
        sentEvents.add(path);
        return key;
      }),
    removeEvent: (code, key) =>
      run(() => {
        const path = `rooms/${code}/ev/${key}`;
        const u = me();
        sentEvents.delete(path);
        const cur = hub.read(path) as RoomEvent | null;
        if (cur && cur.uid !== u && (!inRoster(code, u) || hub.now() - cur.at <= ROOM_EVENT_TTL_MS)) deny(path);
        hub.write(path, null);
      }),
    watchEvents: (code, fn, since = 0) => {
      me();
      const from = pushKeyTime(since);
      return hub.watch(
        `rooms/${code}/ev`,
        (v) => {
          const evs = Object.entries((v ?? {}) as Record<string, Omit<RoomEvent, 'key'>>)
            .filter(([k]) => k >= from)
            .sort(([a], [b]) => keyOrder(a, b))
            .slice(-ROOM_EVENT_WINDOW);
          fn(evs.map(([key, e]) => ({ ...e, key })));
        },
        live,
      );
    },
  };

  return {
    kind: 'memory',
    identity: {
      restore: async () => null,
      // 개발 코드 'dev-alice'는 uid 'alice'가 된다. 같은 코드는 늘 같은 uid
      signIn: async (code) => {
        const id = code.trim().replace(/^dev-/, '').replace(/[^A-Za-z0-9]/g, '');
        if (!id) throw new Error('설정 코드가 올바르지 않습니다.');
        uid = id;
        return id;
      },
      current: () => uid,
      signOut: async () => {
        uid = null;
      },
    },
    docs,
    room,
    files: {
      put: async (bytes) => {
        const { hash, b64 } = await encodeFile(bytes);
        await run(() => {
          me();
          // 규칙처럼 이미 있는 파일은 같은 값으로만 다시 쓴다
          const cur = hub.read(`files/${hash}`);
          if (cur !== null && cur !== b64) deny(`files/${hash}`);
          hub.write(`files/${hash}`, b64);
        });
        return hash;
      },
      get: (hash) => decodeFile(hash, read(`files/${hash}`)),
    },
    profile: {
      write: (u, patch) =>
        run(() => {
          if (u !== me()) deny(`users/${u}/public`);
          hub.update(`users/${u}/public`, patch);
        }),
      read: async (u) => read(`users/${u}/public`) as Record<string, unknown> | null,
    },
    presence: {
      start: (u, m) =>
        run(() => {
          if (u !== me()) deny(`users/${u}/presence`);
          presenceUid = u;
          hub.write(`users/${u}/presence`, { online: true, lastSeen: SERVER_TIME, m });
        }),
      stop: async () => {
        presenceUid = null;
      },
      set: (u, path, value) =>
        run(() => {
          if (u !== me()) deny(`users/${u}/presence`);
          hub.write(`users/${u}/presence/m/${path}`, value);
        }),
      watch: (u, fn) => {
        const viewer = me();
        return hub.watch(
          `users/${u}/presence`,
          (v) => {
            const p = toPresence(v);
            // 규칙처럼 친구 목록(mod/friends/u/{u}/list/{viewer})에 없으면 m을 보이지 않는다
            fn(p && u !== viewer && hub.read(`mod/friends/u/${u}/list/${viewer}`) === null ? { ...p, m: {} } : p);
          },
          live,
        );
      },
    },
    userPrivate: {
      set: (u, path, value) =>
        run(() => {
          if (u !== me()) deny(`users/${u}/private`);
          hub.write(`users/${u}/private/${path}`, value);
        }),
      watch: <T>(u: string, path: string, fn: (value: T | null) => void) => {
        if (u !== me()) deny(`users/${u}/private`);
        return hub.watch(`users/${u}/private/${path}`, (v) => fn(v as T | null), live);
      },
    },
    codes: {
      lookup: async (code) => {
        const v = read(`codes/${code}`);
        return typeof v === 'string' ? v : null;
      },
    },
    config: { minProtocol: async () => (read('config/minProtocol') as number | null) ?? 1 },
    time: { serverNow: () => hub.now(), offset: () => hub.now() - Date.now() },
    connection: {
      online: () => online,
      onChange: (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
    },
    goOffline: ({ abrupt = false } = {}) => {
      if (!online) return;
      online = false;
      if (!abrupt) {
        const updates: Obj = Object.fromEntries([...joined.keys(), ...sentEvents, ...dropOnDisconnect].map((path) => [path, null]));
        if (presenceUid) Object.assign(updates, { [`users/${presenceUid}/presence/online`]: false, [`users/${presenceUid}/presence/lastSeen`]: SERVER_TIME });
        hub.writeMany(updates);
        sentEvents.clear();
        dropOnDisconnect.clear();
      }
      emit();
    },
    goOnline: () => {
      if (online) return;
      online = true;
      for (const res of waiting.splice(0)) res();
      for (const [path, j] of joined) {
        try {
          checkMember(j.code, j.key, j.rec);
          hub.write(path, { ...j.rec, seenAt: SERVER_TIME });
        } catch {
          // 지운 방이면 RoomSession이 자기 기록이 없는 것을 보고 처리한다
        }
      }
      if (presenceUid) hub.writeMany({ [`users/${presenceUid}/presence/online`]: true, [`users/${presenceUid}/presence/lastSeen`]: SERVER_TIME });
      emit();
      hub.notify();
    },
  };
}
