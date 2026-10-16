import { describe, expect, it } from 'vitest';
import { active, bubbleText, canJoin, create, LATE_MS, LEAD_MS, minutesLeft, notice, phaseOf, readParts, readSession, start, stop, WAIT_MAX_MS, type Session } from './logic';

const M = 60_000;
const draft = { title: ' 원고 작업 ', f: 50, b: 10 };
const made = create(null, 'alice', draft, 'abc', 1_000)!;
const run = start(made, 'alice', 2_000)!;

describe('같이 작업하기 단계', () => {
  it('만들면 시작 전이고 30분 동안 시작하지 않으면 끝난다', () => {
    expect(made).toEqual({ id: 'abc', by: 'alice', title: '원고 작업', f: 50, b: 10, st: 'wait', at: 1_000, v: 1 });
    expect(phaseOf(made, 1_000 + WAIT_MAX_MS).phase).toBe('wait');
    expect(phaseOf(made, 1_001 + WAIT_MAX_MS).phase).toBe('done');
  });

  it('시작하면 5초 뒤 집중, 집중 뒤 휴식, 휴식 뒤 끝이고 휴식 0분이면 집중 뒤 바로 끝난다', () => {
    const t0 = 2_000 + LEAD_MS;
    expect(phaseOf(run, t0 - 1)).toEqual({ phase: 'lead', end: t0 });
    expect(phaseOf(run, t0)).toEqual({ phase: 'focus', end: t0 + 50 * M });
    expect(phaseOf(run, t0 + 50 * M)).toEqual({ phase: 'break', end: t0 + 60 * M });
    expect(phaseOf(run, t0 + 60 * M).phase).toBe('done');
    const noBreak = { ...run, b: 0 };
    expect(phaseOf(noBreak, t0 + 50 * M).phase).toBe('done');
    expect(phaseOf({ ...run, st: 'stop' }, t0 + M).phase).toBe('done');
    expect(phaseOf(null, 0).phase).toBe('done');
  });

  it('대기와 집중 중에만 참여하고 머리 위에는 남은 분을 올림해서 보인다', () => {
    expect(['wait', 'lead', 'focus', 'break', 'done'].map((p) => canJoin(p as never))).toEqual([true, true, true, false, false]);
    const t0 = 2_000 + LEAD_MS;
    expect(bubbleText(made, 5_000)).toBeNull();
    expect(bubbleText(run, t0 - 1)).toBe('함께 집중 50분 남음');
    expect(bubbleText(run, t0 + 12 * M + 1)).toBe('함께 집중 38분 남음');
    expect(bubbleText(run, t0 + 54 * M)).toBe('함께 휴식 6분 남음');
    expect(minutesLeft(1_000, 5_000)).toBe(1);
  });
});

describe('같이 작업하기 전이', () => {
  it('진행 중인 세션이 있으면 만들지 않고 끝난 세션 위에는 새로 만든다', () => {
    expect(create(made, 'bob', draft, 'def', 2_000)).toBeUndefined();
    expect(create(run, 'bob', draft, 'def', 2_000 + LEAD_MS + 10 * M)).toBeUndefined();
    expect(create(run, 'bob', draft, 'def', 2_000 + LEAD_MS + 60 * M)?.id).toBe('def');
    expect(create({ ...made, st: 'stop' }, 'bob', draft, 'def', 2_000)?.by).toBe('bob');
  });

  it('개설자만 시작 전 세션을 시작하고 개설자와 방 주인만 끝낸다', () => {
    expect(start(made, 'bob', 2_000)).toBeUndefined();
    expect(start(run, 'alice', 3_000)).toBeUndefined();
    expect(run).toMatchObject({ st: 'run', go: 2_000 });
    expect(stop(run, 'bob', false, 3_000)).toBeUndefined();
    expect(stop(run, 'bob', true, 3_000)?.st).toBe('stop');
    expect(stop(made, 'alice', false, 3_000)).toEqual({ ...made, st: 'stop' });
    expect(stop({ ...run, st: 'stop' }, 'alice', false, 3_000)).toBeUndefined();
    expect(active(stop(run, 'alice', false, 3_000)!, 3_000)).toBe(false);
  });

  it('단계 알림은 1분이 넘게 늦으면 띄우지 않는다', () => {
    const at = 10 * M;
    expect(notice(run, 'lead', 'focus', at, at)).toBe('함께 집중을 시작해요. 50분 집중해요.');
    expect(notice(run, 'focus', 'break', at, at + LATE_MS)).toBe('집중이 끝났어요. 10분 쉬어요.');
    expect(notice(run, 'focus', 'break', at, at + LATE_MS + 1)).toBeNull();
    expect(notice(run, 'break', 'done', at, at)).toBe('같이 작업이 끝났어요.');
    expect(notice({ ...run, b: 0 }, 'focus', 'done', at, at)).toBe('같이 작업이 끝났어요.');
    expect(notice({ ...run, st: 'stop' }, 'focus', 'done', at, at)).toBe('같이 작업을 끝냈어요.');
    expect(notice(made, 'wait', 'done', at, at)).toBeNull();
    expect(notice(made, 'wait', 'lead', at, at)).toBeNull();
  });

  it('서버 값은 모양이 맞을 때만 읽는다', () => {
    expect(readSession(run)).toEqual(run);
    expect(readSession({ ...run, f: 999 })).toBeNull();
    expect(readSession({ ...run, extra: 1 } as Session & { extra: number })).toEqual(run);
    expect(readParts({ alice: { sid: 'abc', at: 1, v: 1 }, bob: { sid: 'abc', at: 1, goal: '', v: 1 }, carol: 3 })).toEqual({ alice: { sid: 'abc', at: 1, v: 1 } });
  });
});
