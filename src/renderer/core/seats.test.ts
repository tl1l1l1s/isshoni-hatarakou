import { expect, it } from 'vitest';
import { arrange, fitScale } from './seats';
import type { SeatView } from './types';

const seat = (key: string): SeatView => ({ key, uid: key, self: false, name: key, state: 'online', look: null, joinedAt: 0, m: {} });
const seats = ['a', 'b', 'c', 'd', 'e'].map(seat);
const keys = (xs: SeatView[]) => xs.map((s) => s.key);
const none = new Set<string>();

it('순서 힌트에 적은 좌석이 앞에 오고 같은 벤치 좌석은 첫 좌석 자리에 붙는다', () => {
  const r = arrange(seats, { attach: {}, order: ['d', 'b'], bench: { a: 'x', c: 'x', e: 'x' } }, none);
  expect(keys(r.row)).toEqual(['d', 'b', 'a', 'c', 'e']);
  expect([...r.joined]).toEqual(['c', 'e']);
});

it('bench id와 key가 같은 좌석이 벤치 맨 앞에 앉는다', () => {
  const r = arrange(seats, { attach: {}, order: [], bench: { b: 'd', d: 'd' } }, none);
  expect(keys(r.row)).toEqual(['a', 'd', 'b', 'c', 'e']);
  expect([...r.joined]).toEqual(['b']);
});

it('올라탄 좌석은 아래 좌석이 없거나 떠나 있으면 한 칸 아래로 내려가고 아무도 없으면 제자리에 앉는다', () => {
  const l = { attach: { b: 'a', c: 'b', d: 'gone' }, order: [], bench: {} };
  let r = arrange(seats, l, none);
  expect([...r.on]).toEqual([['b', 'a'], ['c', 'b']]);
  expect(r.depth).toBe(2);
  // b가 효과로 날아가면 c는 a에 앉고 b는 어디에도 올라타 있지 않다
  r = arrange(seats, l, new Set(['b']));
  expect([...r.on]).toEqual([['c', 'a']]);
  expect(r.depth).toBe(1);
  // a가 방을 나가면 b는 제자리로, c는 b 위에 남는다
  r = arrange(seats.filter((s) => s.key !== 'a'), l, none);
  expect([...r.on]).toEqual([['c', 'b']]);
});

it('서로 올라탄 순환은 끊는다', () => {
  const r = arrange(seats, { attach: { a: 'b', b: 'a', c: 'c' }, order: [], bench: {} }, none);
  expect(r.on.size).toBe(1);
  expect(r.depth).toBe(1);
});

it('좌석 줄이 작업 영역보다 넓거나 높으면 들어갈 만큼만 배율을 줄인다', () => {
  const fixed = { width: 16, height: 40 };
  const area = { width: 1280, height: 720 };
  expect(fitScale(1, { width: 496, height: 400 }, fixed, area)).toBe(1);
  expect(fitScale(1.6, { width: 2000, height: 900 }, fixed, null)).toBe(1.6);
  // 1080p 150%에서 좌석 10개 1616px: (1616 - 16) * r + 16 = 1280
  expect(fitScale(1, { width: 1616, height: 400 }, fixed, area)).toBeCloseTo(0.79, 2);
  // 높이도 본다. 둘 다 넘치면 더 작은 쪽
  expect(fitScale(1.6, { width: 1000, height: 900 }, fixed, area)).toBeCloseTo((1.6 * 680) / 860, 6);
  expect(fitScale(1, { width: 1616, height: 900 }, fixed, area)).toBeCloseTo(1264 / 1600, 6);
});
