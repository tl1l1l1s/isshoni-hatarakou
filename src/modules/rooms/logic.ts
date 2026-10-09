import { z } from 'zod';
import { ROOM_CAP_MAX, ROOM_CAP_MIN } from '@shared/constants';
import type { SeatView } from '@core/types';

export const Local = z.object({ lastRoom: z.string().nullable(), recent: z.array(z.string()).max(5) });
export type Local = z.infer<typeof Local>;

export const CAPS = Array.from({ length: ROOM_CAP_MAX - ROOM_CAP_MIN + 1 }, (_, i) => ROOM_CAP_MIN + i);

/** 들어간 방을 마지막 방과 최근 목록 맨 앞에 둔다 */
export function remember(s: Local, code: string): Local {
  return { lastRoom: code, recent: [code, ...s.recent.filter((c) => c !== code)].slice(0, 5) };
}

export function forget(s: Local, code: string): Local {
  return { lastRoom: s.lastRoom === code ? null : s.lastRoom, recent: s.recent.filter((c) => c !== code) };
}

/** 정원을 넘었을 때 내가 나가야 하는지. 들어온 순서로 정원 밖이면 나간다. 시각이 같으면 키 순서 (코어 RoomSession과 같은 정렬) */
export function mustLeave(seats: Array<Pick<SeatView, 'key' | 'self' | 'joinedAt'>>, cap: number): boolean {
  const order = seats.toSorted((a, b) => a.joinedAt - b.joinedAt || (a.key < b.key ? -1 : 1));
  return order.findIndex((s) => s.self) >= cap;
}
