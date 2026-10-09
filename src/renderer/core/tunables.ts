export interface TunablePeriod { value: unknown; from?: number; until?: number }

/** 기간 한정 값 목록인지. 모든 칸이 value가 있는 객체이거나 빈 칸(null)이어야 한다. 아니면 배열 값 하나다.
 *  Firebase는 배열 가운데를 지우면 그 칸을 null로 돌려준다 */
export function isPeriodList(raw: unknown): raw is Array<TunablePeriod | null> {
  return Array.isArray(raw) && raw.every((e) => e === null || (typeof e === 'object' && 'value' in e));
}

/** { value, from, until } 목록에서 지금 적용할 값. 기간이 겹치면 나중 항목 (OPS-12 기간 한정 값) */
export function activeTunable(raw: unknown, now: number): unknown {
  if (!isPeriodList(raw)) return raw;
  let pick: unknown = undefined;
  for (const e of raw) {
    if (e && (e.from ?? -Infinity) <= now && now < (e.until ?? Infinity)) pick = e.value;
  }
  return pick;
}
