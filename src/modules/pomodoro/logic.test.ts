import { describe, expect, it } from 'vitest';
import { leftOf, Local, minLeft, mmss, next, pause, resume, roundText, sameShare, shareOf, start, type Run } from './logic';

const M = 60_000;
const l = Local.parse({});

describe('뽀모도로', () => {
  it('25 / 5는 집중 4바퀴마다 긴 휴식 15분이고 휴식 뒤 집중은 자동으로 시작한다', () => {
    let t = 0;
    let r: Run = start(l, t);
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(`${roundText(l, r)} ${(r.endsAt! - t) / M}`);
      t = r.endsAt!;
      r = next(l, r, t);
    }
    expect(seen).toEqual(['집중 1/4 25', '짧은 휴식 5', '집중 2/4 25', '짧은 휴식 5', '집중 3/4 25', '짧은 휴식 5', '집중 4/4 25', '긴 휴식 15']);
    expect(roundText(l, r)).toBe('집중 1/4');
  });

  it('50 / 10은 긴 휴식 20분이고 직접은 고른 값을 쓴다', () => {
    const fifty = { ...l, preset: '50' as const };
    const r = next(fifty, { phase: 'focus', round: 4, endsAt: 0, leftMs: 0 }, 0);
    expect([r.phase, r.endsAt]).toEqual(['long', 20 * M]);
    expect(start({ ...l, preset: 'custom', focus: 40 }, 0).endsAt).toBe(40 * M);
  });

  it('자동 시작을 끄면 휴식 뒤 집중은 멈춘 채 기다린다', () => {
    const r = next({ ...l, auto: false }, { phase: 'short', round: 1, endsAt: 0, leftMs: 0 }, 0);
    expect(r).toEqual({ phase: 'focus', round: 2, endsAt: null, leftMs: 25 * M });
  });

  it('일시정지하면 남은 시간을 두고 다시 시작하면 그만큼 이어간다', () => {
    const p = pause(start(l, 0), 10 * M);
    expect(leftOf(p, 99 * M)).toBe(15 * M);
    expect(resume(p, 50 * M).endsAt).toBe(65 * M);
    expect(mmss(15 * M)).toBe('15:00');
    expect(mmss(61_001)).toBe('1:02');
  });

  it('방에는 끝나는 서버 시각을 보내고 받는 PC가 남은 분을 계산한다. 0.1.1 앱의 min도 읽는다', () => {
    const r = start(l, 0);
    // 이 PC 시각 0, 서버 시각 1000초. 25분 뒤 끝나는 타이머는 서버 시각 1000초 + 25분에 끝난다
    const s = shareOf(r, 0, 1_000_000)!;
    expect(s).toEqual({ ph: 'f', end: 1_000_000 + 25 * M });
    expect(shareOf(pause(r, 0), 0, 0)).toBeNull();
    expect(minLeft(s, 1_000_000)).toBe(25);
    expect(minLeft(s, 1_000_000 + 24 * M + 1)).toBe(1);
    // 다음 단계가 오기 전 몇 초는 0분 대신 1분으로 둔다
    expect(minLeft(s, 1_000_000 + 26 * M)).toBe(1);
    expect(minLeft({ ph: 'b', min: 7 }, 0)).toBe(7);
  });

  it('서버 시각 보정이 2초 안에서 바뀌면 다시 보내지 않고 단계나 멈춤이 바뀌면 보낸다', () => {
    const a = { ph: 'f' as const, end: 100_000 };
    expect(sameShare(a, { ph: 'f', end: 101_500 })).toBe(true);
    expect(sameShare(a, { ph: 'f', end: 102_001 })).toBe(false);
    expect(sameShare(a, { ph: 'b', end: 100_000 })).toBe(false);
    expect(sameShare(a, null)).toBe(false);
    expect(sameShare(null, null)).toBe(true);
  });
});
