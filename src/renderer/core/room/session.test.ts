import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PRESENCE_SEEN_MS } from '@shared/constants';
import { PROTO } from '@shared/proto';
import type { MemberRecord } from '@shared/schemas';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { RoomSession } from './session';

const codes = vi.hoisted(() => [] as string[]);
vi.mock('@shared/codes', async (orig) => {
  const real = await orig<{ randomCode: () => string }>();
  return { ...real, randomCode: () => codes.shift() ?? real.randomCode() };
});

const timers = {
  every: (ms: number, fn: () => void) => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
  at: (ms: number, fn: () => void) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

async function setup() {
  const hub = new MemoryHub();
  const server = createMemoryServer(hub);
  await server.identity.signIn('dev-alice');
  const session = new RoomSession({
    server, deviceId: 'pc', proto: PROTO, mods: () => ({ focus: 1 }),
    core: () => ({ name: '앨리스', look: null, state: 'online' }),
    presence: {
      focus: {
        awake: { schema: z.boolean(), sync: 'onChange', minIntervalMs: 3_000 },
        todayMin: { schema: z.number().int(), sync: 'batch' },
        note: { schema: z.string(), sync: 'batch' },
      },
    },
    clock: { now: () => Date.now() }, timers,
  });
  const join = async () => {
    const code = await session.create();
    expect(await session.join(code)).toEqual({ ok: true });
    return () => hub.read(`rooms/${code}/members/alice_pc`) as MemberRecord;
  };
  return { hub, server, session, join };
}

describe('RoomSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('입장 기록에 코어 필드, mods, 입장 전에 정한 presence 필드를 함께 쓴다', async () => {
    const { session, join } = await setup();
    session.setMine('focus', { awake: true, todayMin: 3 });
    const rec = (await join())();
    expect(rec).toMatchObject({ uid: 'alice', name: '앨리스', state: 'online', proto: PROTO, mods: { focus: 1 }, m: { focus: { awake: true, todayMin: 3 } } });
    expect(session.members().map((m) => m.key)).toEqual(['alice_pc']);
  });

  it('onChange 필드는 바로 쓰고 minIntervalMs 안의 변경은 마지막 값만 뒤에 쓴다', async () => {
    const { session, join } = await setup();
    const rec = await join();
    session.setMine('focus', { awake: false });
    expect(rec().m.focus?.awake).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    session.setMine('focus', { awake: true });
    session.setMine('focus', { awake: false });
    session.setMine('focus', { awake: true });
    expect(rec().m.focus?.awake).toBe(false);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(rec().m.focus?.awake).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(rec().m.focus?.awake).toBe(true);
  });

  it('batch 필드는 다음 seenAt 쓰기에 함께 쓴다', async () => {
    const { session, join } = await setup();
    const rec = await join();
    const joinedSeen = rec().seenAt;
    session.setMine('focus', { todayMin: 5 });
    expect(rec().m).toBeUndefined(); // 빈 객체는 저장하지 않는다 (Firebase와 같음)
    await vi.advanceTimersByTimeAsync(PRESENCE_SEEN_MS);
    expect(rec().m.focus?.todayMin).toBe(5);
    expect(rec().seenAt).toBe(joinedSeen + PRESENCE_SEEN_MS);
  });

  it('선언하지 않은 키, schema에 맞지 않는 값, 128바이트 초과를 거부하고 값을 바꾸지 않는다', async () => {
    const { session, join } = await setup();
    const rec = await join();
    expect(() => session.setMine('focus', { awake: 'yes' })).toThrow('schema');
    expect(() => session.setMine('focus', { sleepy: true })).toThrow('선언하지 않은');
    expect(() => session.setMine('nope', { awake: true })).toThrow('선언하지 않은 모듈');
    expect(() => session.setMine('focus', { note: 'x'.repeat(120) })).toThrow('128바이트');
    session.setMine('focus', { note: 'x'.repeat(80) });
    await vi.advanceTimersByTimeAsync(PRESENCE_SEEN_MS);
    expect(rec().m.focus).toEqual({ note: 'x'.repeat(80) });
  });

  it('setCore는 방에 있을 때 바뀐 필드만 바로 쓴다', async () => {
    const { session, join } = await setup();
    const rec = await join();
    session.setCore({ state: 'away', name: '앨리스' });
    expect(rec()).toMatchObject({ state: 'away', name: '앨리스' });
  });

  it('create는 이미 있는 코드를 피해 다시 뽑고 만든 사람이 주인이 된다', async () => {
    const { hub, session } = await setup();
    hub.write('rooms/AAAAAA/meta', { kind: 'work', owner: 'bob', createdAt: 1 });
    codes.push('AAAAAA', 'BBBBBB');
    expect(await session.create()).toBe('BBBBBB');
    expect(await session.owner('BBBBBB')).toBe('alice');
  });

  it('beforeJoin 거부 이유를 그대로 돌려준다', async () => {
    const { session } = await setup();
    const code = await session.create();
    session.beforeJoin(async () => '정원이 찼습니다.');
    expect(await session.join(code)).toEqual({ ok: false, reason: '정원이 찼습니다.', kind: 'blocked' });
    expect(session.current()).toBeNull();
  });

  it('방 이벤트: 방 밖이면 false, 보내면 나에게도 오고 60초 뒤에 지운다', async () => {
    const { hub, session, join } = await setup();
    const got: unknown[] = [];
    session.onEvent('focus.cheer', (e) => got.push(e));
    expect(session.emit('focus.cheer', { n: 1 }, 30)).toBe(false);
    await join();
    const code = session.current();
    expect(session.emit('focus.cheer', { n: 1 }, 30)).toBe(true);
    session.emit('focus.other', 1, 30); // 처리 함수가 없는 이름은 무시한다
    await vi.advanceTimersByTimeAsync(0);
    expect(got).toEqual([{ uid: 'alice', at: expect.any(Number), payload: { n: 1 }, self: true }]);
    expect(Object.values(hub.read(`rooms/${code}/ev`) as object)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hub.read(`rooms/${code}/ev`)).toBeNull();
    expect(got).toHaveLength(1);
  });

  it('방 이벤트: 분당 한도를 넘으면 false, 1분이 지나면 다시 보낸다. 1024자를 넘으면 예외', async () => {
    const { session, join } = await setup();
    await join();
    expect([1, 2, 3].map(() => session.emit('focus.cheer', {}, 2))).toEqual([true, true, false]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(session.emit('focus.cheer', {}, 2)).toBe(true);
    expect(() => session.emit('focus.cheer', 'x'.repeat(1100), 30)).toThrow('1024');
  });

  it('방 이벤트: 들어오기 전 것과 60초 넘은 것은 버리고 같은 키는 한 번만 전한다', async () => {
    const { hub, session } = await setup();
    const got: unknown[] = [];
    session.onEvent('focus.cheer', (e) => got.push(e.payload));
    const code = await session.create();
    // 입장 전 이벤트
    hub.write(`rooms/${code}/ev/${hub.pushKey()}`, { t: 'focus.cheer', uid: 'bob', at: hub.now(), p: '"before"' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await session.join(code)).toEqual({ ok: true });
    // 입장 뒤 키지만 서버 시각이 60초 넘게 지난 이벤트, 깨진 JSON, 정상 이벤트
    hub.write(`rooms/${code}/ev/${hub.pushKey()}`, { t: 'focus.cheer', uid: 'bob', at: hub.now() - 61_000, p: '"old"' });
    hub.write(`rooms/${code}/ev/${hub.pushKey()}`, { t: 'focus.cheer', uid: 'bob', at: hub.now(), p: '{' });
    const key = hub.pushKey();
    hub.write(`rooms/${code}/ev/${key}`, { t: 'focus.cheer', uid: 'bob', at: hub.now(), p: '"ok"' });
    hub.write(`rooms/${code}/ev/${key}/p`, '"again"');
    expect(got).toEqual(['ok']);
  });

  it('pause는 나가고 resume은 같은 방에 다시 들어간다', async () => {
    const { session, join } = await setup();
    const rec = await join();
    const code = session.current();
    await session.pause();
    expect(session.current()).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(rec()).toBeNull();
    expect(await session.resume()).toEqual({ ok: true });
    expect(session.current()).toBe(code);
    expect(rec()).not.toBeNull();
  });

  it('입장이 겹치면 마지막 입장만 들어가고 앞 입장과 나가기 전에 시작한 입장은 취소한다', async () => {
    const { hub, session } = await setup();
    const a = await session.create();
    const b = await session.create();
    const seen: Array<string | null> = [];
    session.onChange((c) => seen.push(c));
    const [ra, rb] = await Promise.all([session.join(a), session.join(b)]);
    expect(ra).toMatchObject({ ok: false, kind: 'cancelled' });
    expect(rb).toEqual({ ok: true });
    expect(session.current()).toBe(b);
    expect(seen).toEqual([b]);
    expect(hub.read(`rooms/${a}/members`)).toBeNull();

    const pending = session.join(a);
    await session.leave();
    expect(await pending).toMatchObject({ ok: false, kind: 'cancelled' });
    expect(session.current()).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(hub.read(`rooms/${a}/members`)).toBeNull();
    expect(hub.read(`rooms/${b}/members`)).toBeNull();

    // 들어가는 중에 절전하면 깨어날 때 그 방에 들어간다
    const sleeping = session.join(a);
    await session.pause();
    expect(await sleeping).toMatchObject({ ok: false, kind: 'cancelled' });
    expect(await session.resume()).toEqual({ ok: true });
    expect(session.current()).toBe(a);
  });
});
