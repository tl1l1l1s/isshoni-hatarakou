// 그림 파일 디스크 캐시 (IndexedDB). 파일 이름이 내용 해시라 한 번 받은 파일은 바뀌지 않으므로 앱을 다시 켜도 서버에서 다시 받지 않는다.
// 메인 프로세스 저장소는 메인 스레드에서 동기로 쓰므로 쓰지 않는다. 읽은 내용은 해시를 다시 계산해 맞을 때만 쓴다
import { sha256 } from '@shared/sha256';

const STORE = 'files';
/** 파일 하나는 64KB 이하라 많아야 64MB쯤이다. 넘치면 오래전에 넣은 것부터 지운다 */
const MAX = 1000;

export interface FileCache {
  get(hash: string): Promise<Uint8Array | null>;
  put(hash: string, bytes: Uint8Array): void;
}

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

/** 넣은 지 오래된 것부터 MAX개만 남긴다 */
async function trim(db: IDBDatabase): Promise<void> {
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  let extra = (await done(store.count())) - MAX;
  if (extra <= 0) return;
  const req = store.index('at').openCursor();
  req.onsuccess = () => {
    const c = req.result;
    if (!c || extra-- <= 0) return;
    c.delete();
    c.continue();
  };
}

/** 계정마다 따로 둔다. IndexedDB가 없으면(단위 시험) null이고 캐시가 고장 나도 서버에서 받는 길은 그대로다 */
export function openFileCache(uid: string): FileCache | null {
  if (typeof indexedDB === 'undefined') return null;
  const open = indexedDB.open(`files-${uid}`, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE).createIndex('at', 'at');
  const db = done(open);
  db.then(trim).catch(() => undefined);
  return {
    async get(hash) {
      const v = (await done((await db).transaction(STORE).objectStore(STORE).get(hash))) as { bytes: Uint8Array } | undefined;
      return v && (await sha256(v.bytes)) === hash ? v.bytes : null;
    },
    put(hash, bytes) {
      void db.then((d) => done(d.transaction(STORE, 'readwrite').objectStore(STORE).put({ bytes, at: Date.now() }, hash))).catch(() => undefined);
    },
  };
}
