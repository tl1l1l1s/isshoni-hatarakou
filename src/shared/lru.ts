// 자주 쓴 순서로 두는 Map 도우미. Map은 넣은 순서를 지키므로 가져올 때 뒤로 옮기면 맨 앞이 가장 오래 안 쓴 것이다

/** 값을 돌려주며 맨 뒤로 옮긴다 */
export function lruGet<K, V>(m: Map<K, V>, k: K): V | undefined {
  const v = m.get(k);
  if (v !== undefined) {
    m.delete(k);
    m.set(k, v);
  }
  return v;
}

/** max개를 넘으면 가장 오래 안 쓴 것부터 뺀다. evict는 뺀 값을 정리한다 */
export function lruTrim<K, V>(m: Map<K, V>, max: number, evict?: (k: K, v: V) => void): void {
  for (const [k, v] of m) {
    if (m.size <= max) return;
    m.delete(k);
    evict?.(k, v);
  }
}
