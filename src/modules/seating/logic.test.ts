import { expect, it } from 'vitest';
import type { SeatView } from '@core/types';
import { benchReason, layoutOf, rideTarget, type Mine } from './logic';

const seat = (uid: string, joinedAt: number, seating: Mine = {}): SeatView => ({
  key: `${uid}_pc`, uid, self: false, name: uid, state: 'online', look: null, joinedAt, m: { seating: seating as Record<string, unknown> },
});

it('올라탄 사람과 벤치를 멤버 기록에서 좌석 key로 바꾼다', () => {
  const seats = [
    seat('a', 1, { cap: 2 }),
    seat('b', 2, { on: 'a' }),
    seat('c', 3, { bench: 'a' }),
    seat('d', 4, { bench: 'a' }),
    seat('e', 5, { on: 'gone' }),
  ];
  const l = layoutOf(seats);
  expect(l.attach).toEqual({ b_pc: 'a_pc' });
  // 2인 벤치라 먼저 들어온 c만 앉는다
  expect(l.bench).toEqual({ a_pc: 'a_pc', c_pc: 'a_pc' });
});

it('남의 벤치에 앉은 사람의 벤치에는 아무도 앉지 않는다', () => {
  const l = layoutOf([seat('a', 1, { cap: 3 }), seat('b', 2, { cap: 2, bench: 'a' }), seat('c', 3, { bench: 'b' })]);
  expect(l.bench).toEqual({ a_pc: 'a_pc', b_pc: 'a_pc' });
});

it('탑 맨 위에 올라타고 내 위에 있는 사람이나 너무 높은 탑에는 올라타지 않는다', () => {
  const seats = [seat('me', 1), seat('a', 2), seat('b', 3, { on: 'a' }), seat('c', 4, { on: 'b' })];
  expect(rideTarget(seats, 'me', 'a')).toEqual({ seat: seats[3] });
  expect(rideTarget(seats, 'me', 'b')).toEqual({ seat: seats[3] });
  expect(rideTarget(seats, 'me', 'me')).toHaveProperty('reason');

  const mine = [seat('me', 1), seat('a', 2, { on: 'me' }), seat('b', 3, { on: 'a' })];
  expect(rideTarget(mine, 'me', 'b')).toEqual({ reason: '내 위에 있는 캐릭터에는 올라탈 수 없어요.' });

  const on = [seat('me', 1, { on: 'a' }), seat('a', 2)];
  expect(rideTarget(on, 'me', 'a')).toEqual({ reason: '이미 올라타 있어요.' });

  const tall = [...seats, seat('d', 5, { on: 'c' })];
  expect(rideTarget(tall, 'me', 'a')).toHaveProperty('reason');
});

it('벤치 책상이고 빈자리가 있을 때만 같이 앉는다', () => {
  expect(benchReason([seat('me', 1), seat('a', 2)], 'me', 'a')).not.toBeNull();
  expect(benchReason([seat('me', 1), seat('a', 2, { cap: 2 })], 'me', 'a')).toBeNull();
  expect(benchReason([seat('me', 1, { bench: 'a' }), seat('a', 2, { cap: 2 })], 'me', 'a')).toBe('이미 같이 앉아 있어요.');
  expect(benchReason([seat('me', 1), seat('a', 2, { cap: 2 }), seat('b', 3, { bench: 'a' })], 'me', 'a')).toBe('벤치에 빈자리가 없어요.');
});
