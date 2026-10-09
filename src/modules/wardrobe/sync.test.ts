import { describe, expect, it } from 'vitest';
import { emptyAppearance } from '@shared/schemas';
import { emptyChar, mergeChars, withPose, type Char } from './logic';
import { conflictsOf, syncedAfter } from './sync';

const ch = (c: string, mtime: number): Char => ({ appearance: withPose(emptyAppearance(), 'idle', c.repeat(64)), mtime });

describe('두 PC에서 다르게 고친 캐릭터 고르기 (ACC-13, NFR-17 askUser)', () => {
  it('마지막으로 맞춘 뒤 두 쪽이 모두 바뀌고 내용이 다를 때만 고르기로 넘긴다', () => {
    const local = [ch('a', 20), ch('b', 20), ch('c', 10), ch('d', 30)];
    const remote = [ch('x', 25), ch('b', 25), ch('y', 25), ch('z', 25)];
    // 0: 두 쪽 모두 바뀜, 1: 내용이 같음, 2: 서버만 바뀜, 3: synced를 모름
    expect(conflictsOf(local, remote, [10, 10, 10, null]).map((c) => c.slot)).toEqual([0]);
    expect(conflictsOf(local, remote, undefined)).toEqual([]);
    expect(conflictsOf(local, [null, null, null, null], [10, 10, 10, 10])).toEqual([]);
  });

  it('고르기를 기다리는 슬롯은 합치지 않고 synced도 그대로 둔다', () => {
    const local = [ch('a', 20), ch('b', 30), emptyChar()];
    const remote = [ch('x', 25), ch('b0', 10), null];
    const synced = [10, 10, null];
    const waiting = conflictsOf(local, remote, synced).map((c) => c.slot);
    expect(waiting).toEqual([0]);
    const m = mergeChars(local, remote.map((r, i) => (waiting.includes(i) ? local[i]! : r)), 99);
    expect(m.chars[0]).toBe(local[0]);
    expect(m.upload).toEqual([1]);
    // 올릴 슬롯은 지금 서버 쪽 mtime을 기준으로 삼아 그 기록만 덮어쓴다
    expect(syncedAfter(m.chars, remote, synced, m.upload, waiting)).toEqual([10, 10, 0]);
  });
});
