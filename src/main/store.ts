// userData 아래 JSON 파일 저장 (10.7.1). Electron 없이 시험할 수 있게 fs만 쓴다.
// ponytail: 메인 스레드 동기 fs. 작은 JSON이라 짧고 로그오프 때도 끝까지 쓴다. 큰 캐시가 커서 확인을 막으면 비동기로 바꾼다
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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

/** 파일을 쓰기 전에 모으는 시간. 집중 시간 파일은 1초마다 바뀌므로 길게 모은다. 끝낼 때와 절전, 로그오프 때는 flush가 바로 쓰고
 *  갑자기 꺼지면 그동안의 집중 시간만 잃는다. 나머지는 작은 파일이라 짧게 모아 바꾼 설정을 거의 바로 남긴다 (ADR 0032) */
export function storeDelay(rel: string): number {
  return /^accounts\/[^/]+\/modules\/focus\.json$/.test(rel) ? 15_000 : 200;
}

/** 파일마다 마지막 값만 남겨 두었다가 처음 쓴 뒤 delayOf(경로)가 지나거나 flush 때 쓴다. 실패한 파일은 다음 쓰기나 flush에서 다시 쓴다 */
export function createStore(root: string, onError: (e: unknown) => void, delayOf: (rel: string) => number = storeDelay) {
  const pending = new Map<string, { data: unknown; timer?: ReturnType<typeof setTimeout> }>();
  const writeOne = (rel: string) => {
    const p = pending.get(rel);
    if (!p) return;
    clearTimeout(p.timer);
    p.timer = undefined;
    try {
      writeJsonAtomic(root, rel, p.data);
      pending.delete(rel);
    } catch (e) {
      onError(e);
    }
  };
  return {
    read(rel: string): unknown {
      const r = safeRel(rel);
      const p = pending.get(r);
      return p ? p.data : readJson(root, r);
    },
    write(rel: string, data: unknown): void {
      const r = safeRel(rel);
      const p = pending.get(r) ?? { data };
      p.data = data;
      p.timer ??= setTimeout(() => writeOne(r), delayOf(r));
      pending.set(r, p);
    },
    /** JSON은 맞지만 모양이 맞지 않는 파일(다른 버전이 쓴 것, 손으로 고친 것)을 깨진 JSON처럼 .bak으로 옮긴다. 렌더러가 읽고 검사한 뒤 부른다 */
    quarantine(rel: string): void {
      const r = safeRel(rel);
      clearTimeout(pending.get(r)?.timer);
      pending.delete(r);
      const file = join(root, r);
      if (existsSync(file)) renameSync(file, `${file}.bak`);
    },
    flush: () => [...pending.keys()].forEach(writeOne),
  };
}
