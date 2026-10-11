import { describe, expect, it, vi } from 'vitest';
import type { Ctx } from '@core/types';
import report from './index';

async function setup() {
  const rows = new Map<string, { text: string }>();
  let pending = [{ id: 'abc-1', text: '진단 기록' }];
  let added = () => {};
  let online = (_e: { type: string }) => {};
  let retry = () => {};
  const set = vi.fn(async (key: string, value: { text: string }) => {
    if (rows.has(key)) throw new Error('appendOnly');
    rows.set(key, value);
  });
  const ack = vi.fn(async (ids: string[]) => { pending = pending.filter(p => !ids.includes(p.id)); });
  const ctx = {
    modules: { get: () => ({ addTab: () => {} }) },
    crash: { config: async () => {}, pending: async () => pending, ack, onAdded: (fn: () => void) => { added = fn; } },
    settings: { get: () => ({ autoReport: true }), onChange: () => {} },
    tunables: { get: () => '' },
    timers: { every: (ms: number, fn: () => void) => { if (ms === 60_000) retry = fn; } },
    lifecycle: { on: (fn: typeof online) => { online = fn; } },
    server: { user: () => ({ get: async (key: string) => rows.get(key) ?? null, set }) },
    clock: { serverNow: () => 1 }, app: { version: 'test' }, log: { warn: vi.fn() },
  } as unknown as Ctx;
  // 처음 sync부터 실패를 넣을 수 있도록 setup은 호출자가 시작한다.
  return { rows, set, ack, pending: () => pending, start: () => report.setup(ctx), added: () => added(), online: () => online({ type: 'online' }), retry: () => retry() };
}

const drained = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe('자동 진단 기록 복구', () => {
  it('서버 저장 실패는 pending을 보존하고 재연결 뒤 저장한 것만 확인한다', async () => {
    const f = await setup();
    f.set.mockRejectedValueOnce(new Error('offline'));
    await f.start(); await drained();
    expect(f.pending()).toHaveLength(1);
    expect(f.ack).not.toHaveBeenCalled();
    f.online(); await drained();
    expect(f.rows.size).toBe(1);
    expect(f.pending()).toEqual([]);
  });
  it('ack 실패 후 타이머 재시도와 동시 알림이 와도 기록은 한 개다', async () => {
    const f = await setup();
    f.ack.mockRejectedValueOnce(new Error('IPC disconnected'));
    await f.start(); await drained();
    expect(f.rows.size).toBe(1);
    expect(f.pending()).toHaveLength(1);
    f.retry(); f.added(); f.online(); await drained();
    expect(f.pending()).toEqual([]);
    expect(f.set).toHaveBeenCalledTimes(1);
    expect(f.rows.get('auto_abc-1')?.text).toBe('진단 기록');
  });
});
