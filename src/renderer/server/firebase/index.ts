// Firebase Realtime Database와 Authentication 구현 (10.7.4).
// 연결이 끊길 때의 삭제 예약, 다중 경로 쓰기, 서버 더하기 연산 같은 Firebase 고유 동작은 이 폴더 밖으로 나가지 않는다.
import { deleteApp, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  connectDatabaseEmulator,
  forceWebSockets,
  get,
  getDatabase,
  goOffline,
  goOnline,
  increment,
  limitToFirst,
  limitToLast,
  onDisconnect,
  onValue,
  orderByKey,
  push,
  query,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  startAt,
  update,
} from 'firebase/database';
import type { MemberRecord, RoomMeta } from '@shared/schemas';
import { ROOM_EVENT_WINDOW, type AccountPresence, type Dispose, type DocHandle, type Namespace, type RoomEvent, type RoomTransport, type ServerPort } from '../port';
import { decodeFile, encodeFile, isInc, nsPath, pushKeyTime, toPresence } from './layout';
import { decodeSetupCode } from './setup-code';

export interface FirebaseConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  databaseURL: string;
  appId?: string;
  /** 'host:port'. 에뮬레이터에 붙일 때만 */
  databaseEmulator?: string;
  authEmulator?: string;
}

export type FirebaseServer = ServerPort & { goOffline(): void; goOnline(): void; close(): Promise<void> };

const withInc = (patch: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, isInc(v) ? increment(v.$inc) : v]));

/** 'm/focus/awake' 같은 다중 경로 키를 기록 사본에 넣는다 */
function setIn(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('/');
  const last = keys.pop() as string;
  let node = obj;
  for (const k of keys) {
    const next = node[k];
    node = (typeof next === 'object' && next !== null ? next : (node[k] = {})) as Record<string, unknown>;
  }
  node[last] = value;
}

export function createFirebaseServer(cfg: FirebaseConfig, appName?: string): FirebaseServer {
  const { apiKey, authDomain, projectId, databaseURL, appId } = cfg;
  const app = initializeApp({ apiKey, authDomain, projectId, databaseURL, appId }, appName);
  // 로그인은 렌더러의 IndexedDB에 남겨 재시작과 재설치 뒤에도 유지한다. IndexedDB가 없는 Node 시험은 메모리에 둔다
  const auth = initializeAuth(app, {
    persistence: typeof indexedDB === 'undefined' ? inMemoryPersistence : [indexedDBLocalPersistence, browserLocalPersistence],
  });
  // 웹소켓만 쓴다. 웹소켓이 한 번 실패하면 SDK가 다음부터 long polling으로 시작하는데 long polling은 <script> 태그를 넣고
  // 앱 CSP(script-src 'self')가 그 태그를 막아 연결이 영영 오프라인에 머문다. 이 기록은 재시작 뒤에도 남는다
  forceWebSockets();
  const db = getDatabase(app);
  if (cfg.authEmulator) connectAuthEmulator(auth, `http://${cfg.authEmulator}`, { disableWarnings: true });
  if (cfg.databaseEmulator) {
    const [host = '127.0.0.1', port = '9000'] = cfg.databaseEmulator.split(':');
    connectDatabaseEmulator(db, host, Number(port));
  }
  let online = false;
  let offset = 0;
  const listeners = new Set<(online: boolean) => void>();
  // 데이터베이스 연결은 로그인이 끝난 뒤에 연다. 로그인 전에 연결을 열면 SDK가 연결할 때 받은 빈 토큰이
  // 로그인 토큰보다 늦게 도착해 덮어쓰고 그 연결이 계속 로그인하지 않은 상태로 남는다 (에뮬레이터에서 절반쯤 재현)
  let started = false;
  const r = (path: string) => {
    if (!started) start();
    return ref(db, path);
  };
  function start() {
    started = true;
    onValue(r('.info/serverTimeOffset'), (s) => {
      offset = (s.val() as number | null) ?? 0;
    });
    onValue(r('.info/connected'), (s) => {
      online = s.val() === true;
      // 실패하면(지운 방 등) RoomSession이 자기 기록이 없는 것을 보고 처리한다
      if (online) for (const [path, rec] of joined) register(path, rec).catch(() => {});
      if (online && presence) registerPresence(presence.uid, presence.m).catch(() => {});
      for (const fn of listeners) fn(online);
    });
  }

  // 들어가 있는 멤버 기록의 사본. 다시 연결될 때마다 지우기 예약과 기록을 다시 쓴다
  const joined = new Map<string, Record<string, unknown>>();
  const register = async (path: string, rec: Record<string, unknown>) => {
    await onDisconnect(r(path)).remove();
    await set(r(path), { ...rec, seenAt: serverTimestamp() });
  };

  // 계정 접속 상태의 사본. 다시 연결될 때마다 online과 m을 다시 쓰고 끊길 때의 offline 쓰기를 다시 예약한다.
  // 다른 기기가 쓰는 중이면 코어가 stop으로 멈춰 쓰지 않는 PC가 offline을 쓰지 않는다 (ACC-12)
  let presence: { uid: string; m: AccountPresence['m'] } | null = null;
  const registerPresence = async (uid: string, m: AccountPresence['m']) => {
    const p = r(`users/${uid}/presence`);
    await onDisconnect(p).update({ online: false, lastSeen: serverTimestamp() });
    await set(p, { online: true, lastSeen: serverTimestamp(), m });
  };

  const docs = (ns: Namespace): DocHandle => {
    const base = nsPath(ns);
    const at = (key: string) => r(`${base}/${key}`);
    return {
      get: async <T>(key: string) => (await get(at(key))).val() as T | null,
      set: (key, value) => set(at(key), value),
      update: (key, patch) => update(at(key), withInc(patch)),
      remove: (key) => remove(at(key)),
      list: async <T>({ limit }: { limit: number }) => {
        const out: Array<{ key: string; value: T }> = [];
        (await get(query(r(base), orderByKey(), limitToFirst(limit)))).forEach((c) => {
          out.push({ key: c.key as string, value: c.val() as T });
        });
        return out;
      },
      watch: <T>(key: string, fn: (value: T | null) => void) => onValue(at(key), (s) => fn(s.val() as T | null)),
      watchList: <T>(key: string, { limit, last }: { limit: number; last?: boolean }, fn: (items: Array<{ key: string; value: T }>) => void) =>
        onValue(query(at(key), orderByKey(), last ? limitToLast(limit) : limitToFirst(limit)), (s) => {
          const out: Array<{ key: string; value: T }> = [];
          s.forEach((c) => {
            out.push({ key: c.key as string, value: c.val() as T });
          });
          fn(out);
        }),
      transaction: async <T>(key: string, fn: (current: T | null) => T | undefined) => {
        const res = await runTransaction(at(key), (cur: T | null) => fn(cur ?? null));
        return { committed: res.committed, value: res.snapshot.val() as T | null };
      },
      removeOnDisconnect: (key, on = true) => (on ? onDisconnect(at(key)).remove() : onDisconnect(at(key)).cancel()),
    };
  };

  const member = (code: string, key: string) => `rooms/${code}/members/${key}`;
  const room: RoomTransport = {
    getMeta: async (code) => (await get(r(`rooms/${code}/meta`))).val() as RoomMeta | null,
    createMeta: async (code, meta) =>
      (await runTransaction(r(`rooms/${code}/meta`), (cur) => (cur === null ? meta : undefined), { applyLocally: false })).committed,
    // 삭제 표시와 멤버 기록, 방 이벤트 지우기를 한 번에 쓴다. meta와 roster는 남긴다 (10.7.2)
    markDeleted: (code, at) => update(r(`rooms/${code}`), { 'meta/deletedAt': at, members: null, ev: null }),
    ensureRoster: async (code, uid, at) => {
      const p = r(`rooms/${code}/roster/${uid}`);
      if (!(await get(p)).exists()) await set(p, at);
    },
    join: async (code, key, record) => {
      const path = member(code, key);
      joined.set(path, { ...record });
      try {
        await register(path, record);
      } catch (e) {
        joined.delete(path);
        throw e;
      }
    },
    writeMine: async (code, key, patch) => {
      const path = member(code, key);
      const rec = joined.get(path);
      if (rec) for (const [k, v] of Object.entries(patch)) setIn(rec, k, v);
      await update(r(path), patch);
    },
    leave: async (code, key) => {
      const path = member(code, key);
      joined.delete(path);
      await onDisconnect(r(path)).cancel();
      await remove(r(path));
    },
    removeStale: (code, key) => remove(r(member(code, key))),
    watchMembers: (code, fn) =>
      onValue(r(`rooms/${code}/members`), (s) => fn((s.val() as Record<string, MemberRecord> | null) ?? {})),
    // 규칙이 이미 있는 기록에만 지우기 예약을 받으므로 먼저 쓴다
    emit: async (code, ev) => {
      const p = push(r(`rooms/${code}/ev`));
      await set(p, { ...ev, at: serverTimestamp() });
      await onDisconnect(p).remove();
      return p.key as string;
    },
    removeEvent: async (code, key) => {
      const p = r(`rooms/${code}/ev/${key}`);
      await onDisconnect(p).cancel();
      await remove(p);
    },
    watchEvents: (code, fn, since = 0) =>
      onValue(query(r(`rooms/${code}/ev`), orderByKey(), startAt(pushKeyTime(since)), limitToLast(ROOM_EVENT_WINDOW)), (s) => {
        const out: RoomEvent[] = [];
        s.forEach((c) => {
          out.push({ ...(c.val() as Omit<RoomEvent, 'key'>), key: c.key as string });
        });
        fn(out);
      }),
  };

  return {
    kind: 'firebase',
    identity: {
      restore: async () => {
        await auth.authStateReady();
        if (auth.currentUser && !started) start();
        return auth.currentUser?.uid ?? null;
      },
      signIn: async (setupCode) => {
        const c = decodeSetupCode(setupCode);
        if (!c) throw new Error('설정 코드 형식이 맞지 않습니다. 받은 코드를 그대로 붙여 넣어 주세요.');
        try {
          const { user } = await signInWithEmailAndPassword(auth, c.email, c.password);
          if (!started) start();
          return user.uid;
        } catch (e) {
          if ((e as { code?: string }).code === 'auth/network-request-failed') throw new Error('인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
          throw new Error('설정 코드로 로그인하지 못했습니다. 코드를 새로 받았다면 새 코드를 넣어 주세요.');
        }
      },
      current: () => auth.currentUser?.uid ?? null,
      signOut: () => signOut(auth),
    },
    docs,
    room,
    files: {
      put: async (bytes) => {
        const { hash, b64 } = await encodeFile(bytes);
        await set(r(`files/${hash}`), b64).catch(async (e: unknown) => {
          // 규칙은 있는 파일을 같은 값으로만 다시 쓰게 한다. 다른 값이 먼저 있으면 그 해시로는 올리지 못한다
          if ((await get(r(`files/${hash}`))).val() !== b64) throw e;
        });
        return hash;
      },
      get: async (hash) => decodeFile(hash, (await get(r(`files/${hash}`))).val()),
    },
    profile: {
      write: (uid, patch) => update(r(`users/${uid}/public`), withInc(patch)),
      read: async (uid) => (await get(r(`users/${uid}/public`))).val() as Record<string, unknown> | null,
    },
    presence: {
      start: async (uid, m) => {
        presence = { uid, m: structuredClone(m) };
        // 연결 전이면 .info/connected 처리가 쓴다
        if (online) await registerPresence(uid, presence.m);
      },
      stop: async () => {
        const p = presence;
        presence = null;
        if (p) await onDisconnect(r(`users/${p.uid}/presence`)).cancel();
      },
      set: async (uid, path, value) => {
        if (presence?.uid === uid) setIn(presence.m, path, value);
        await set(r(`users/${uid}/presence/m/${path}`), value);
      },
      watch: (uid, fn) => {
        const base = `users/${uid}/presence`;
        // 친구가 아니면 전체 읽기가 거부되므로 online과 lastSeen만 따로 구독한다
        const fallback = (): Dispose[] => {
          const v: Record<string, unknown> = {};
          return ['online', 'lastSeen'].map((k) =>
            onValue(r(`${base}/${k}`), (s) => {
              v[k] = s.val();
              if ('online' in v && 'lastSeen' in v) fn(v.online === null && v.lastSeen === null ? null : toPresence(v));
            }),
          );
        };
        let stops: Dispose[] = [];
        stops = [onValue(r(base), (s) => fn(toPresence(s.val())), () => {
          stops = fallback();
        })];
        return () => stops.forEach((stop) => stop());
      },
    },
    userPrivate: {
      set: (uid, path, value) => set(r(`users/${uid}/private/${path}`), value),
      watch: <T>(uid: string, path: string, fn: (value: T | null) => void) => onValue(r(`users/${uid}/private/${path}`), (s) => fn(s.val() as T | null)),
    },
    codes: {
      lookup: async (code) => {
        const v: unknown = (await get(r(`codes/${code}`))).val();
        return typeof v === 'string' ? v : null;
      },
    },
    config: { minProtocol: async () => ((await get(r('config/minProtocol'))).val() as number | null) ?? 1 },
    time: { serverNow: () => Date.now() + offset, offset: () => offset },
    connection: {
      online: () => online,
      onChange: (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
    },
    goOffline: () => goOffline(db),
    goOnline: () => goOnline(db),
    close: () => deleteApp(app),
  };
}
