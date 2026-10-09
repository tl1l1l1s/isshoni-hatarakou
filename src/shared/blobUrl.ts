// 파일 바이트를 <img>에 쓰는 blob URL로 바꾸는 React 훅. 화면에서 빠지면 만든 URL을 돌려주고 늦게 온 결과는 버린다
import { useEffect, useRef, useState } from 'react';

type Load<K extends string> = (key: K) => Promise<Uint8Array | null>;

const toUrl = (b: Uint8Array) => URL.createObjectURL(new Blob([b as Uint8Array<ArrayBuffer>]));

/** key 하나의 그림 주소. key가 바뀌면 옛 URL을 돌려주고 새로 읽는다. key가 null이거나 읽는 중이면 null */
export function useBlobUrl<K extends string>(key: K | null, load: Load<K>): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!key) return;
    let made = '';
    let alive = true;
    load(key).then(
      (b) => alive && b && setUrl((made = toUrl(b))),
      () => undefined,
    );
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // load는 그릴 때마다 새 함수일 수 있어서 key만 본다
  }, [key]);
  return url;
}

/** 여러 key의 그림 주소. key마다 한 번만 읽고 화면에서 빠질 때 모두 돌려준다. 그 뒤에 온 결과는 URL을 만들지 않는다 */
export function useBlobUrls<K extends string>(keys: readonly K[], load: Load<K>): Partial<Record<K, string>> {
  const [urls, setUrls] = useState<Partial<Record<K, string>>>({});
  const box = useRef({ alive: true, asked: new Set<K>(), made: [] as string[] });
  useEffect(() => {
    const b = box.current;
    b.alive = true;
    return () => {
      b.alive = false;
      b.made.forEach((u) => URL.revokeObjectURL(u));
      b.made = [];
      b.asked.clear();
    };
  }, []);
  useEffect(() => {
    const b = box.current;
    for (const k of keys) {
      if (b.asked.has(k)) continue;
      b.asked.add(k);
      load(k).then(
        (bytes) => {
          if (!bytes || !b.alive) return;
          const u = toUrl(bytes);
          b.made.push(u);
          setUrls((m) => ({ ...m, [k]: u }));
        },
        () => undefined,
      );
    }
  });
  return urls;
}
