import { describe, expect, it } from 'vitest';
import type { Ctx } from '@core/types';
import type { ActivitySample } from '@shared/schemas';
import status from './index';
import { AUTO_LEAVE_SEC, hm, isIdleAway, leaveDue, resolve, statusText, todayText } from './logic';

describe('자동 자리비움 판정', () => {
  it.each([
    [0, false],
    [1199, false],
    [1200, true],
    [5000, true],
  ])('입력 없이 %d초면 %s', (idleSec, away) => expect(isIdleAway(idleSec)).toBe(away));
});

describe('자동 퇴장 판정', () => {
  const free = { inRoom: true, chosen: false, pen: false, owner: false };
  it('입력 없이 6시간 20분이 되기 1분 전부터 안내한다', () => {
    expect(leaveDue(AUTO_LEAVE_SEC - 61, free)).toBe(false);
    expect(leaveDue(AUTO_LEAVE_SEC - 60, free)).toBe(true);
  });
  it.each([
    ['방 밖', { inRoom: false }],
    ['직접 고른 상태', { chosen: true }],
    ['그림 앱이 앞에 있음', { pen: true }],
    ['방 주인', { owner: true }],
  ])('%s이면 나가지 않는다', (_, o) => expect(leaveDue(AUTO_LEAVE_SEC * 2, { ...free, ...o })).toBe(false));
});

describe('말풍선 글', () => {
  it.each([
    [1, '1분'],
    [59, '59분'],
    [60, '1시간'],
    [130, '2시간 10분'],
    [1500, '25시간'],
  ])('%d분은 %s', (min, text) => expect(hm(min)).toBe(text));

  it('오늘 집중 시간은 0분이거나 숫자가 아니면 숨긴다', () => {
    expect(todayText(130)).toBe('오늘 2시간 10분');
    expect(todayText(0)).toBeNull();
    expect(todayText(undefined)).toBeNull();
    expect(todayText('130')).toBeNull();
  });

  it('상태 글은 문자열만 받고 20자로 자른다', () => {
    expect(statusText('밥 먹는 중')).toBe('밥 먹는 중');
    expect(statusText('')).toBeNull();
    expect(statusText({ x: 1 })).toBeNull();
    expect(statusText('가'.repeat(30))).toHaveLength(20);
  });

  it('고른 상태를 코어 상태와 글로 바꾼다', () => {
    expect(resolve({ choice: 'work', custom: '빡일중' })).toEqual({ state: null, text: '' });
    expect(resolve({ choice: 'meal', custom: '' })).toEqual({ state: 'busy', text: '밥 먹는 중' });
    expect(resolve({ choice: 'away', custom: '' })).toEqual({ state: 'away', text: '자리비움' });
    expect(resolve({ choice: 'custom', custom: ' 빡일중 ' })).toEqual({ state: null, text: '빡일중' });
  });
});

describe('status 모듈', () => {
  it('저장한 상태를 되살리고 입력이 20분 없으면 자리비움, 입력이 오면 바로 푼다', async () => {
    const calls: Array<[string, string | null, number]> = [];
    const mine: Record<string, unknown> = {};
    let onSample = (_s: ActivitySample) => {};
    const ctx = {
      local: { get: () => ({ choice: 'busy', custom: '' }) },
      self: { setStatus: (id: string, v: string | null, p: number) => calls.push([id, v, p]) },
      room: { setMine: (f: Record<string, unknown>) => Object.assign(mine, f), current: () => null },
      modules: { get: () => undefined },
      activity: { on: (fn: typeof onSample) => void (onSample = fn) },
    } as unknown as Ctx;
    await status.setup(ctx);
    expect(calls).toEqual([['chosen', 'busy', 50]]);
    expect(mine).toEqual({ text: '바쁨' });

    const at = (idleSec: number) => onSample({ at: 0, appKey: null, idleSec, pen: false, unknownReason: null });
    [0, 1199, 1200, 1500, 1800, 0, 3].forEach(at);
    expect(calls.slice(1)).toEqual([
      ['auto', 'away', 20],
      ['auto', null, 20],
    ]);
  });
});
