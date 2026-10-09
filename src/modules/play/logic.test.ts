import { describe, expect, it } from 'vitest';
import { seeded } from '@core/effects';
import { busted, countShow, dice, flightPath, SHOW_WINDOW_MS } from './logic';

describe('러시안룰렛 주사위 (COM-14)', () => {
  it('시드로 1부터 6까지 두 개를 정하고 36가지가 고르게 나온다', () => {
    const seen = new Map<string, number>();
    for (let s = 0; s < 36 * 100; s++) {
      const d = dice(s);
      expect(d.every((v) => v >= 1 && v <= 6)).toBe(true);
      seen.set(d.join(), (seen.get(d.join()) ?? 0) + 1);
    }
    expect([...seen.values()]).toEqual(Array(36).fill(100));
  });
  it('하나라도 1이면 날아간다 (11/36)', () => {
    const n = Array.from({ length: 36 }, (_, s) => busted(dice(s))).filter(Boolean).length;
    expect(n).toBe(11);
  });
});

describe('깜짝쇼 (COM-17)', () => {
  it('같은 춤을 1분 안에 세 번 추면 열리고 다시 처음부터 센다', () => {
    let t: number[] = [];
    const at = (now: number) => {
      const r = countShow(t, now);
      t = r.times;
      return r.show;
    };
    expect([at(0), at(10_000), at(20_000), at(30_000)]).toEqual([false, false, true, false]);
  });
  it('1분이 지난 춤은 세지 않는다', () => {
    const r = countShow([0, 1], SHOW_WINDOW_MS + 1);
    expect(r).toEqual({ show: false, times: [SHOW_WINDOW_MS + 1] });
  });
});

describe('날아가는 궤적 (COM-13)', () => {
  const from = { x: 900, y: 1000 };
  const half = { w: 50, h: 60 };
  const screen = { w: 1920, h: 1080 };
  it('같은 시드면 같고 화면 안에 머물다 제자리로 돌아온다', () => {
    const a = flightPath(seeded(42), from, half, screen);
    expect(flightPath(seeded(42), from, half, screen)).toEqual(a);
    expect(flightPath(seeded(43), from, half, screen)).not.toEqual(a);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(half.w);
      expect(p.x).toBeLessThanOrEqual(screen.w - half.w);
      expect(p.y).toBeGreaterThanOrEqual(half.h);
      expect(p.y).toBeLessThanOrEqual(screen.h - half.h);
    }
    expect(a.at(-1)).toEqual({ ...from, r: 0 });
  });
});
