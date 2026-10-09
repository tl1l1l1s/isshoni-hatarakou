// userData 아래 JSON 파일 저장 (10.7.1). Electron 없이 시험할 수 있게 fs만 쓴다.
// ponytail: 메인 스레드 동기 fs. 작은 JSON이라 짧고 로그오프 때도 끝까지 쓴다. 큰 캐시가 커서 확인을 막으면 비동기로 바꾼다
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ALLOWED = /^(settings\.json|(accounts|device|cache)\/.+\.json)$/;
const SEGMENT = /^[\w.-]+$/;

/** 렌더러가 준 상대 경로를 검사하고 / 구분자로 바꾼다 */
export function safeRel(rel: string): string {
  const p = rel.replace(/\\/g, '/');
  const ok = ALLOWED.test(p) && p.split('/').every((s) => SEGMENT.test(s) && s !== '.' && s !== '..');
  if (!ok) throw new Error(`허용하지 않는 저장 경로: ${rel}`);
  return p;
}

/** 없으면 null. JSON이 깨졌으면 .bak으로 옮기고 null */
export function readJson(root: string, rel: string): unknown {
  const file = join(root, safeRel(rel));
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  try {
    return JSON.parse(text);
  } catch {
    renameSync(file, `${file}.bak`);
    return null;
  }
}

/** 임시 파일에 쓰고 디스크에 내린 뒤 이름을 바꾼다 */
export function writeJsonAtomic(root: string, rel: string, data: unknown): void {
  const file = join(root, safeRel(rel));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(data ?? null), { flush: true });
  renameSync(`${file}.tmp`, file);
}

export type Store = ReturnType<typeof createStore>;

/** 파일마다 마지막 값만 남겨 두었다가 delayMs 뒤나 flush 때 쓴다. 실패한 파일은 다음 flush에서 다시 쓴다 */
export function createStore(root: string, onError: (e: unknown) => void, delayMs = 1000) {
  const pending = new Map<string, unknown>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    for (const [rel, data] of pending) {
      try {
        writeJsonAtomic(root, rel, data);
        pending.delete(rel);
      } catch (e) {
        onError(e);
      }
    }
  };
  return {
    read(rel: string): unknown {
      const r = safeRel(rel);
      return pending.has(r) ? pending.get(r) : readJson(root, r);
    },
    write(rel: string, data: unknown): void {
      pending.set(safeRel(rel), data);
      timer ??= setTimeout(flush, delayMs);
    },
    flush,
  };
}
