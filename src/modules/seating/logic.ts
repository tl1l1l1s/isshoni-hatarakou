// 올라타기와 동물탑, 벤치의 순수 계산 (COM-16, HOM-17, AVT-21). 모든 PC가 멤버 기록만으로 같은 배치를 계산한다
import type { SeatView } from '@core/types';

/** presence 필드 seating. on은 내가 올라탄 사람, bench는 같이 앉은 벤치 주인의 uid. cap은 내 책상이 벤치일 때 자리 수 */
export interface Mine { on?: string | null; bench?: string | null; cap?: number }
export const mineOf = (s: SeatView | undefined): Mine => (s?.m.seating ?? {}) as Mine;

/** 한 탑에 올라탈 수 있는 수. ponytail: 층마다 스테이지가 좌석 높이만큼 커지므로 화면을 넘지 않게 막는다. 스테이지가 실제 높이만 쓰게 되면 늘린다 */
export const TOWER_MAX = 3;

const byJoin = (a: SeatView, b: SeatView) => a.joinedAt - b.joinedAt;
// 로컬 좌석은 이 PC에만 있어서 다른 PC와 맞출 수 없으므로 뺀다
const people = (seats: SeatView[]) => seats.filter((s) => !s.local);

/** ctx.seats.attach와 setBench에 넣을 값. 벤치 id는 벤치 주인 좌석 key라서 주인이 맨 앞에 앉고 주인 책상을 함께 쓴다 */
export function layoutOf(seats: SeatView[]): { attach: Record<string, string>; bench: Record<string, string> } {
  const ps = people(seats);
  const keyOf = new Map(ps.map((s) => [s.uid, s.key]));
  const attach: Record<string, string> = {};
  for (const s of ps) {
    const k = keyOf.get(mineOf(s).on ?? '');
    if (k && k !== s.key) attach[s.key] = k;
  }
  const bench: Record<string, string> = {};
  for (const h of ps) {
    const cap = mineOf(h).cap ?? 0;
    // 남의 벤치에 앉은 사람은 벤치 주인이 되지 않는다. 자리보다 많이 앉으면 먼저 들어온 사람부터 앉는다
    if (cap < 2 || mineOf(h).bench) continue;
    const guests = ps.filter((s) => s !== h && mineOf(s).bench === h.uid).sort(byJoin).slice(0, cap - 1);
    for (const s of guests.length ? [h, ...guests] : []) bench[s.key] = h.key;
  }
  return { attach, bench };
}

/** me가 target 머리 위에 올라탈 때 실제로 앉을 사람. target 위에 이미 탑이 있으면 맨 위에 앉는다 */
export function rideTarget(seats: SeatView[], me: string, target: string): { seat: SeatView } | { reason: string } {
  const ps = people(seats);
  const byUid = new Map(ps.map((s) => [s.uid, s]));
  const t = byUid.get(target);
  if (!t || target === me) return { reason: '올라탈 수 없는 사람이에요.' };
  let height = 0;
  const seen = new Set<string>();
  for (let x: SeatView | undefined = t; x && !seen.has(x.uid); x = byUid.get(mineOf(x).on ?? '')) {
    if (x.uid === me) return { reason: '내 위에 있는 캐릭터에는 올라탈 수 없어요.' };
    seen.add(x.uid);
    height++;
  }
  let top = t;
  for (;;) {
    const next = ps.filter((s) => s.uid !== me && !seen.has(s.uid) && mineOf(s).on === top.uid).sort(byJoin)[0];
    if (!next) break;
    seen.add(next.uid);
    top = next;
    height++;
  }
  if (mineOf(byUid.get(me)).on === top.uid) return { reason: '이미 올라타 있어요.' };
  // height는 맨 아래 사람까지 센 층 수라서 올라탄 수는 하나 적다
  if (height - 1 >= TOWER_MAX) return { reason: `한 탑에는 ${TOWER_MAX}명까지 올라탈 수 있어요.` };
  return { seat: top };
}

/** me가 owner의 벤치에 같이 앉을 수 없으면 이유 */
export function benchReason(seats: SeatView[], me: string, owner: string): string | null {
  const ps = people(seats);
  const o = ps.find((s) => s.uid === owner);
  const cap = mineOf(o).cap ?? 0;
  if (!o || owner === me || cap < 2) return '벤치 책상을 쓰는 사람 옆에만 앉을 수 있어요.';
  if (mineOf(o).bench) return '벤치 주인이 다른 벤치에 앉아 있어요.';
  if (mineOf(ps.find((s) => s.uid === me)).bench === owner) return '이미 같이 앉아 있어요.';
  if (ps.filter((s) => s.uid !== me && mineOf(s).bench === owner).length >= cap - 1) return '벤치에 빈자리가 없어요.';
  return null;
}
