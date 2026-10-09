// 자리비움과 방 관리 묶음 시뮬레이터 (CHR-07, CHR-13, ROM-14). 코어 런타임 여러 개가 메모리 허브 하나를 함께 쓴다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { ActivitySample } from '@shared/schemas';
import type { Bridge } from '../../preload/api';
import rooms from '@modules/rooms';
import { createRoom, joinRoom } from '@modules/rooms/state';
import awaypic from '@modules/awaypic';
import status from './index';
import { AUTO_AWAY_SEC, AUTO_LEAVE_SEC } from './logic';

let hub: MemoryHub;
let disk: Map<string, unknown>;

async function app(name: string) {
  const subs = new Map<string, (p: unknown) => void>();
  const bridge = {
    version: 0,
    invoke: async (ch: string, args: { path?: string; data?: unknown }) => {
      if (ch === 'store.read') return disk.get(args.path!) ?? null;
      if (ch === 'store.write') disk.set(args.path!, args.data);
      return null;
    },
    on: (ch: string, fn: (p: unknown) => void) => {
      subs.set(ch, fn);
      return () => {};
    },
    invokeModule: async () => null,
  } as unknown as Bridge;
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn(`dev-${name}`);
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: { name } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  // 패널 창은 열지 않고 연 창 id만 남긴다
  const shown = new Set<string>();
  vi.spyOn(core.windows, 'show').mockImplementation(async (decl) => void shown.add(decl.id));
  vi.spyOn(core.windows, 'close').mockImplementation((id) => void shown.delete(id));
  const ms = [rooms, status, awaypic] as ModuleManifest[];
  await core.preloadLocal(ms);
  await core.start(ms);
  await vi.advanceTimersByTimeAsync(0);
  const ctx = core.ctxs.get('rooms')!.ctx;
  const idle = async (idleSec: number, pen = false) => {
    subs.get('activity')!({ at: Date.now(), appKey: pen ? 'win:clipstudiopaint.exe' : null, idleSec, pen, unknownReason: null } satisfies ActivitySample);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { core, ctx, uid, shown, idle, toasts: () => core.toasts.get().map((t) => t.text), seat: (key: string) => core.seats.get().find((s) => s.key === key)! };
}

describe('자리비움과 방 관리 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
    disk = new Map();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('자동 자리비움이 6시간 이어지면 1분 안내 뒤 방에서 나가고 돌아오면 다시 들어간다. 방 주인은 남는다', async () => {
    const [a, b] = await Promise.all(['alice', 'bob'].map(app));
    await createRoom(a!.ctx, 4);
    const code = a!.ctx.room.current()!;
    expect(await joinRoom(b!.ctx, code)).toBeNull();

    for (const x of [a!, b!]) await x.idle(AUTO_LEAVE_SEC - 60);
    expect(a!.shown.has('status.leave')).toBe(false);
    expect(b!.shown.has('status.leave')).toBe(true);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(b!.ctx.room.current()).toBe(code);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(b!.ctx.room.current()).toBeNull();
    expect(b!.shown.has('status.leave')).toBe(false);
    expect(b!.toasts()).toContain('자리를 오래 비워서 방에서 나왔습니다.');
    expect(a!.ctx.room.members().map((s) => s.uid)).toEqual(['alice']);
    // 다음에 켤 때도 다시 들어가도록 마지막 방은 남긴다
    expect(b!.ctx.local.get<{ lastRoom: string | null }>('account').lastRoom).toBe(code);

    await b!.idle(3);
    expect(b!.ctx.room.current()).toBe(code);
    expect(a!.ctx.room.members().map((s) => s.uid).sort()).toEqual(['alice', 'bob']);
  });

  it('안내에서 취소하면 접속 중으로 돌아가고 나가지 않는다. 그림 앱이나 직접 고른 자리비움이면 안내하지 않는다', async () => {
    const [a, b] = await Promise.all(['alice', 'bob'].map(app));
    await createRoom(a!.ctx, 4);
    const code = a!.ctx.room.current()!;
    await joinRoom(b!.ctx, code);

    await b!.idle(AUTO_LEAVE_SEC - 30);
    expect(b!.core.self.get().state).toBe('away');
    await b!.core.registry.run('status.stay');
    expect(b!.shown.has('status.leave')).toBe(false);
    expect(b!.core.self.get().state).toBe('online');
    await vi.advanceTimersByTimeAsync(120_000);
    await b!.idle(AUTO_LEAVE_SEC - 20); // 실제 PC에서는 취소를 누른 입력으로 유휴 시간이 0이 된다
    expect(b!.ctx.room.current()).toBe(code);
    expect(b!.shown.has('status.leave')).toBe(false);

    await b!.idle(0);
    await b!.idle(AUTO_LEAVE_SEC, true);
    expect(b!.shown.has('status.leave')).toBe(false);
    await b!.core.registry.run('status.choose', { choice: 'away', custom: '' });
    await b!.idle(AUTO_LEAVE_SEC);
    expect(b!.shown.has('status.leave')).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(b!.ctx.room.current()).toBe(code);
  });

  it('나간 사이 정원이 차면 돌아와 다시 들어갔다가 늦게 들어온 쪽으로 다시 나온다', async () => {
    const [a, b, c] = await Promise.all(['alice', 'bob', 'carol'].map(app));
    await createRoom(a!.ctx, 2);
    const code = a!.ctx.room.current()!;
    await joinRoom(b!.ctx, code);
    await b!.idle(AUTO_LEAVE_SEC);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b!.ctx.room.current()).toBeNull();
    expect(await joinRoom(c!.ctx, code)).toBeNull();

    await vi.advanceTimersByTimeAsync(1_000);
    await b!.idle(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(b!.ctx.room.current()).toBeNull();
    expect(b!.toasts()).toContain('정원 2명이 차서 방에서 나왔습니다.');
    expect(c!.ctx.room.current()).toBe(code);
  });

  it('자리비움 그림은 자리비움인 동안 방 사람 화면에서 몸 대신 서고 조용한 모드에서는 숨는다', async () => {
    const [a, b] = await Promise.all(['alice', 'bob'].map(app));
    await createRoom(a!.ctx, 4);
    await joinRoom(b!.ctx, a!.ctx.room.current()!);
    const file = await a!.ctx.files.upload(new Uint8Array([1, 2, 3]));
    await a!.core.registry.run('awaypic.set', { file, size: 100 });
    await vi.advanceTimersByTimeAsync(3_000);
    const alice = `${a!.uid}_pc`;
    expect(b!.core.imageOf(b!.seat(alice))).toBeNull();

    await a!.idle(AUTO_AWAY_SEC);
    expect(b!.seat(alice).state).toBe('away');
    expect(b!.core.imageOf(b!.seat(alice))).toEqual({ file, size: 100 });
    expect(a!.core.imageOf(a!.seat(alice))).toEqual({ file, size: 100 });
    b!.core.ctxs.get('awaypic')!.ctx.mode.set('quiet');
    expect(b!.core.imageOf(b!.seat(alice))).toBeNull();
    b!.core.ctxs.get('awaypic')!.ctx.mode.set('normal');

    await a!.core.registry.run('awaypic.set', { file: null, size: 100 });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(b!.core.imageOf(b!.seat(alice))).toBeNull();
  });
});
