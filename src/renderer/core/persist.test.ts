import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Bridge } from '../../preload/api';
import { JsonFile, changedOnly, readLocal, readSettings } from './persist';
import { activeTunable } from './tunables';

describe('JsonFile', () => {
  it('set은 같은 틱의 변경을 모아 바로 메인에 보낸다. 디스크 쓰기를 미루는 일은 메인이 한다', async () => {
    const writes: unknown[] = [];
    const bridge = { invoke: async (ch: string, args: unknown) => void (ch === 'store.write' && writes.push(args)) } as unknown as Bridge;
    const f = new JsonFile(bridge, 'settings.json', { n: 0 });
    f.set({ n: 1 });
    f.set({ n: 2 });
    expect(writes).toEqual([]);
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toEqual([{ path: 'settings.json', data: { n: 2 } }]);
  });
});

describe('settings', () => {
  const decl = { version: 1, scope: 'device' as const, schema: z.object({ a: z.number().default(1), b: z.string().default('x') }) };
  it('바꾼 값만 저장하고 기본값을 채워 읽는다', () => {
    expect(changedOnly({ a: 1, b: 'y' }, { a: 1, b: 'x' })).toEqual({ b: 'y' });
    expect(readSettings(decl, { b: 'y' })).toEqual({ a: 1, b: 'y' });
  });
  it('schema에 맞지 않으면 기본값', () => {
    expect(readSettings(decl, { a: 'no' })).toEqual({ a: 1, b: 'x' });
  });
  it('맞지 않는 키만 기본값으로 돌리고 나머지 키는 남긴다', () => {
    expect(readSettings(decl, { a: 'no', b: 'y' })).toEqual({ a: 1, b: 'y' });
  });
});

describe('local', () => {
  const decl = { version: 2, schema: z.object({ n: z.number() }), initial: () => ({ n: 0 }), migrate: [(old: unknown) => ({ n: Number(old) })] };
  it('v1을 v2로 바꾼다', () => {
    expect(readLocal(decl, { v: 1, data: 7 })).toEqual({ data: { n: 7 }, error: null });
  });
  it('앱보다 새 형식이나 깨진 값은 처음 상태와 이유', () => {
    expect(readLocal(decl, { v: 3, data: {} }).error).toMatch(/새 형식/);
    expect(readLocal(decl, { v: 2, data: { n: 'x' } }).data).toEqual({ n: 0 });
  });
});

describe('tunables', () => {
  it('기간 한정 값은 기간 안에서만 쓴다', () => {
    const raw = [{ value: 50 }, { value: 35, from: 100, until: 200 }];
    expect(activeTunable(raw, 50)).toBe(50);
    expect(activeTunable(raw, 150)).toBe(35);
    expect(activeTunable(raw, 250)).toBe(50);
    expect(activeTunable(7, 0)).toBe(7);
  });
  it('배열 값은 그대로 쓰고 기간 목록의 빈 칸은 건너뛴다', () => {
    expect(activeTunable([10, 20, 30], 0)).toEqual([10, 20, 30]);
    expect(activeTunable([{ a: 1 }], 0)).toEqual([{ a: 1 }]);
    const holes = [{ value: 50 }, null, { value: 35, from: 100, until: 200 }];
    expect(activeTunable(holes, 150)).toBe(35);
    expect(activeTunable(holes, 250)).toBe(50);
  });
});
