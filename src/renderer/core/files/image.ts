import { FILE_MAX_RAW_BYTES } from '@shared/constants';

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();
/** 일이 없으면 이만큼 지난 뒤 워커를 내린다. 그림 하나를 줄이고 나면 워커 힙과 캔버스가 렌더러에 20MB쯤 남아 있다 */
const WORKER_IDLE_MS = 10_000;
let idle: ReturnType<typeof setTimeout> | undefined;

/** 자세 그림과 아이템 그림을 64KB 안으로 줄인다 (10.7.2, OUR-03). 기본 긴 변은 320px(좌석 160x200의 2배 배율) */
export function prepareImage(bytes: Uint8Array, maxSide = 320): Promise<Uint8Array> {
  clearTimeout(idle);
  if (!worker) {
    worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
      const w = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (!waiting.size) {
        idle = setTimeout(() => {
          worker?.terminate();
          worker = null;
        }, WORKER_IDLE_MS);
      }
      if (e.data.bytes) w?.resolve(e.data.bytes);
      else w?.reject(new Error(e.data.error));
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, bytes, maxSide, maxBytes: FILE_MAX_RAW_BYTES });
  });
}
