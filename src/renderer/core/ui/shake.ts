// 캐릭터를 누른 채로 좌우로 빠르게 흔드는 동작 (seat.shake 슬롯). DOM 없이 x 좌표와 시각만 본다

// 방향을 바꿨다고 칠 최소 거리(CSS 픽셀)와 흔들었다고 칠 방향 바꿈 횟수와 그 시간.
// ponytail: 고정 값, 너무 쉽게나 어렵게 흔들리면 이 세 값만 고친다
const MIN_PX = 12;
const TURNS = 4;
const WINDOW_MS = 1000;

export interface Shake {
  /** 지금 방향으로 가장 멀리 간 x */
  edge: number;
  dir: number;
  turns: number[];
  /** MIN_PX보다 크게 움직였다. 이번 누름은 짧은 클릭이 아니다 */
  moved: boolean;
  done: boolean;
}

export const startShake = (x: number): Shake => ({ edge: x, dir: 0, turns: [], moved: false, done: false });

/** 누른 채로 x까지 움직였다. 이번 누름에서 처음 흔든 것으로 보면 true */
export function shakeMove(s: Shake, x: number, t: number): boolean {
  const d = x - s.edge;
  if (Math.sign(d) === s.dir) s.edge = x;
  else if (Math.abs(d) >= MIN_PX) {
    if (s.dir) s.turns.push(t);
    s.dir = Math.sign(d);
    s.edge = x;
    s.moved = true;
  }
  s.turns = s.turns.filter((at) => t - at <= WINDOW_MS);
  if (s.done || s.turns.length < TURNS) return false;
  return (s.done = true);
}
