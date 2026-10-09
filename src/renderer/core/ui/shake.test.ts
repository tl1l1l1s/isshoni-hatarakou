import { expect, test } from 'vitest';
import { shakeMove, startShake } from './shake';

const run = (xs: number[], gap: number) => {
  const s = startShake(0);
  return { hits: xs.map((x, i) => shakeMove(s, x, i * gap)).filter(Boolean).length, s };
};

test('빠르게 좌우로 흔들면 한 번만 흔든 것이다', () => {
  expect(run([30, 0, 30, 0, 30, 0, 30, 0, 30], 60).hits).toBe(1);
});

test('천천히 흔들거나 조금 떨리면 흔든 것이 아니다', () => {
  expect(run([30, 0, 30, 0, 30, 0], 400).hits).toBe(0);
  const jitter = run([5, -4, 6, -5, 4, -6, 5, -4], 30);
  expect(jitter.hits).toBe(0);
  expect(jitter.s.moved).toBe(false);
});

test('한 방향으로 끌면 움직임만 남는다', () => {
  const drag = run([10, 20, 40, 80], 30);
  expect(drag.hits).toBe(0);
  expect(drag.s.moved).toBe(true);
});
