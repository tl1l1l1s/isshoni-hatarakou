// 좌석 배치 (10.8.2 좌석 계층). 순서 힌트, 벤치, 올라타기를 DOM 없이 계산한다
import type { SeatView } from './types';

export interface SeatLayout {
  /** 올라탄 좌석 key → 아래 좌석 key (ctx.seats.attach) */
  attach: Record<string, string>;
  order: string[];
  bench: Record<string, string>;
}

export interface Arranged {
  /** 한 줄에 놓는 순서. 같은 벤치 좌석은 붙어 있다 */
  row: SeatView[];
  /** 앞 좌석과 같은 벤치라 겹쳐 놓는 좌석 */
  joined: Set<string>;
  /** 지금 올라타 있는 좌석 → 실제로 앉은 아래 좌석 */
  on: Map<string, string>;
  /** 가장 높이 쌓인 층 수 (스테이지 높이) */
  depth: number;
}

/** away는 효과로 자리를 떠난 좌석. 아래 좌석이 없거나 떠나 있으면 그 아래로 내려가고 아무도 없으면 제자리에 앉는다 */
export function arrange(seats: SeatView[], l: SeatLayout, away: ReadonlySet<string>): Arranged {
  const rank = new Map(l.order.map((k, i) => [k, i]));
  const sorted = seats
    .map((s, i) => ({ s, i, r: rank.get(s.key) ?? Infinity }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
    .map((x) => x.s);
  const row: SeatView[] = [];
  for (const s of sorted) {
    if (row.includes(s)) continue;
    const b = l.bench[s.key];
    if (b === undefined) {
      row.push(s);
      continue;
    }
    // bench id와 key가 같은 좌석이 있으면 그 좌석이 맨 앞에 앉고 뒤 좌석들이 그 책상을 함께 쓴다
    const group = sorted.filter((t) => l.bench[t.key] === b && !row.includes(t));
    row.push(...group.filter((t) => t.key === b), ...group.filter((t) => t.key !== b));
  }
  const joined = new Set(row.filter((s, i) => i > 0 && l.bench[s.key] !== undefined && l.bench[s.key] === l.bench[row[i - 1]!.key]).map((s) => s.key));

  const ok = new Set(seats.filter((s) => !away.has(s.key)).map((s) => s.key));
  const on = new Map<string, string>();
  for (const k of ok) {
    let t = l.attach[k];
    const seen = new Set([k]);
    while (t !== undefined && !ok.has(t) && !seen.has(t)) {
      seen.add(t);
      t = l.attach[t];
    }
    if (t !== undefined && t !== k && ok.has(t)) on.set(k, t);
  }
  // 서로 올라탄 순환은 끊는다
  for (const k of [...on.keys()]) {
    const seen = new Set([k]);
    for (let t = on.get(k); t !== undefined; t = on.get(t)) {
      if (seen.has(t)) {
        on.delete(k);
        break;
      }
      seen.add(t);
    }
  }
  let depth = 0;
  for (const k of on.keys()) {
    let n = 0;
    for (let t: string | undefined = k; t !== undefined && on.has(t); t = on.get(t)) n++;
    depth = Math.max(depth, n);
  }
  return { row, joined, on, depth };
}

type Size = { width: number; height: number };

/** 요청한 배율로 잰 스테이지(need)가 작업 영역(area)에 들어가도록 줄인 배율. fixed는 배율과 무관하게 더해진 픽셀(여백, 닫힌 메뉴, 안내 줄).
 *  들어가거나 작업 영역을 아직 모르면 요청한 배율 그대로 */
export function fitScale(scale: number, need: Size, fixed: Size, area: Size | null): number {
  if (!area) return scale;
  const by = (k: keyof Size) => (need[k] <= area[k] ? 1 : (area[k] - fixed[k]) / (need[k] - fixed[k]));
  return scale * Math.min(1, by('width'), by('height'));
}
