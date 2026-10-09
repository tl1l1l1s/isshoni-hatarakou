import { describe, expect, it } from 'vitest';
import type { ActivitySample } from '@shared/schemas';
import { hms, labelOf, splitDay, step, type Prev, type Reason, type Rule } from './logic';

const PAINT = 'win:clipstudiopaint.exe';
const APPS = [{ key: PAINT, label: '클튜' }, null, null, null, null, null, null, null];
const sample = (at: number, appKey: string | null, idleSec = 0): ActivitySample => ({
  at, appKey, idleSec, pen: false, unknownReason: appKey ? null : 'noWindow',
});

describe('step', () => {
  const prev: Prev = { at: 0, countedAt: 0 };
  // 이름, 규칙, 샘플, 더할 초, 깨어 있음, 타이핑, 이유
  it.each<[string, Rule, ActivitySample, number, boolean, boolean, Reason | null]>([
    ['등록 앱', 'foregroundUntilIdle20m', sample(500, PAINT), 0.5, true, true, null],
    ['그림 앱은 입력 4초 전까지 타이핑 (CHR-12)', 'foregroundUntilIdle20m', { ...sample(500, PAINT, 4), pen: true }, 0.5, true, true, null],
    ['그림 앱이 아니면 입력 4초 전은 타이핑이 아니다', 'foregroundUntilIdle20m', sample(500, PAINT, 4), 0.5, true, false, null],
    ['다른 앱은 세지 않고 5초 동안 깨어 있다', 'foregroundUntilIdle20m', sample(500, 'win:chrome.exe'), 0, true, true, 'otherApp'],
    ['알 수 없는 앱', 'foregroundUntilIdle20m', sample(500, null), 0, true, true, 'unknownApp'],
    ['입력 없이 19분 59초', 'foregroundUntilIdle20m', sample(500, PAINT, 1199), 0.5, true, false, null],
    ['입력 없이 20분', 'foregroundUntilIdle20m', sample(500, PAINT, 1200), 0, true, false, 'idle'],
    ['foreground는 유휴를 보지 않는다', 'foreground', sample(500, PAINT, 5000), 0.5, true, false, null],
    ['foregroundWithInput 입력 1초 안', 'foregroundWithInput', sample(500, PAINT, 1), 0.5, true, true, null],
    ['foregroundWithInput 입력 2초 전', 'foregroundWithInput', sample(500, PAINT, 2), 0, true, false, 'idle'],
    ['30초 간격은 센다', 'foregroundUntilIdle20m', sample(30_000, PAINT), 30, true, true, null],
    ['30초 넘는 간격은 절전으로 보고 버린다', 'foregroundUntilIdle20m', sample(30_001, PAINT), 0, true, true, 'gap'],
    ['절전 뒤 다른 앱이면 잠든다', 'foregroundUntilIdle20m', sample(30_001, 'win:chrome.exe'), 0, false, false, 'otherApp'],
    ['시계가 뒤로 가면 더하지 않는다', 'foregroundUntilIdle20m', sample(-500, PAINT), 0, true, true, null],
  ])('%s', (_name, rule, s, sec, awake, typing, reason) => {
    expect(step(prev, s, { rule }, APPS)).toMatchObject({ sec, awake, typing, reason });
  });

  it('첫 샘플은 더하지 않는다', () => {
    expect(step(null, sample(0, PAINT), { rule: 'foreground' }, APPS)).toMatchObject({ sec: 0, awake: true });
    expect(step(null, sample(0, 'win:chrome.exe'), { rule: 'foreground' }, APPS)).toMatchObject({ sec: 0, awake: false });
  });

  it('등록 앱을 벗어나고 5초가 지나면 잠든다', () => {
    const left = { at: 4_500, countedAt: 0 };
    expect(step(left, sample(5_000, 'win:chrome.exe'), { rule: 'foreground' }, APPS).awake).toBe(true);
    expect(step({ at: 5_000, countedAt: 0 }, sample(5_500, 'win:chrome.exe'), { rule: 'foreground' }, APPS).awake).toBe(false);
  });

  it('등록 앱 10분을 500ms마다 재생하면 600초가 쌓인다', () => {
    let p: Prev | null = null;
    let total = 0;
    for (let at = 0; at <= 600_000; at += 500) {
      const r = step(p, sample(at, PAINT), { rule: 'foregroundUntilIdle20m' }, APPS);
      p = r.next;
      total += r.sec;
    }
    expect(total).toBe(600);
  });
});

describe('splitDay', () => {
  it('오전 6시를 걸친 tick은 둘로 나눈다', () => {
    expect(splitDay(Date.parse('2026-10-09T06:00:10+09:00'), 20)).toEqual([['2026-10-08', 10], ['2026-10-09', 10]]);
  });
  it('하루 안이면 그대로 둔다', () => {
    expect(splitDay(Date.parse('2026-10-09T05:59:59+09:00'), 0.5)).toEqual([['2026-10-08', 0.5]]);
    expect(splitDay(Date.parse('2026-10-09T00:00:10+09:00'), 20)).toEqual([['2026-10-08', 20]]);
  });
});

describe('표시', () => {
  it('시:분:초는 100시간을 넘어도 늘어난다', () => {
    expect(hms(0)).toBe('00:00:00');
    expect(hms(115 * 3600 + 32 * 60 + 32.9)).toBe('115:32:32');
  });
  it('앱 키에서 기본 이름을 뽑는다', () => {
    expect(labelOf(PAINT)).toBe('clipstudiopaint');
    expect(labelOf('mac:com.apple.textedit')).toBe('textedit');
  });
});
