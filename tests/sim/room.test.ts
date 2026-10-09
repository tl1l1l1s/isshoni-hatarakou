// 다중 클라이언트 시뮬레이터 (10.10.1의 3번). 메모리 허브 하나를 여러 클라이언트가 함께 쓰고
// vitest 가짜 시계가 모든 클라이언트의 타이머와 서버 시각(hub.now는 Date.now를 따른다)을 함께 움직인다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENCE_STALE_MS } from '@shared/constants';
import { PROTO } from '@shared/proto';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { RoomSession } from '@core/room/session';

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

let hub: MemoryHub;

async function client(name: string, deviceId = 'pc', proto = PROTO) {
  const server = createMemoryServer(hub);
  await server.identity.signIn(`dev-${name}`);
  const session = new RoomSession({
    server, deviceId, proto, mods: () => ({}), core: () => ({ name, look: null, state: 'online' }),
    presence: {}, clock: { now: () => Date.now() }, timers,
  });
  const kicked: string[] = [];
  session.onChange((code, reason) => {
    if (!code && reason) kicked.push(reason);
  });
  return { server, session, kicked, sees: () => session.members().map((m) => m.uid).sort() };
}

async function room() {
  const a = await client('alice');
  const b = await client('bob');
  const code = await a.session.create();
  expect(await a.session.join(code)).toEqual({ ok: true });
  expect(await b.session.join(code)).toEqual({ ok: true });
  return { a, b, code };
}

describe('방 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('두 클라이언트가 방을 만들고 들어가 서로를 본다', async () => {
    const { a, b } = await room();
    expect(a.sees()).toEqual(['alice', 'bob']);
    expect(b.sees()).toEqual(['alice', 'bob']);
  });

  it('앱 충돌(정상 연결 끊김)은 연결이 끊길 때의 삭제로 바로 사라진다', async () => {
    const { a, b } = await room();
    a.server.goOffline();
    expect(b.sees()).toEqual(['bob']);
  });

  it('갑자기 끊긴 클라이언트는 150초 안에 사라지고 다시 연결되면 돌아온다', async () => {
    const { a, b, code } = await room();
    await vi.advanceTimersByTimeAsync(30_000);
    a.server.goOffline({ abrupt: true });
    // 마지막 seenAt(입장 때)에서 150초가 지나는 순간 사라진다. 끊긴 때부터는 150초 안이다
    await vi.advanceTimersByTimeAsync(PRESENCE_STALE_MS - 30_000);
    expect(b.sees()).toEqual(['alice', 'bob']);
    await vi.advanceTimersByTimeAsync(1);
    expect(b.sees()).toEqual(['bob']);
    // B가 오래된 기록을 지웠다
    expect(hub.read(`rooms/${code}/members/alice_pc`)).toBeNull();

    a.server.goOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.sees()).toEqual(['alice', 'bob']);
    expect(a.session.current()).toBe(code);
  });

  it('옛 PROTO 앱은 업데이트 안내와 함께 입장을 거부당한다', async () => {
    const { code } = await room();
    hub.write('config/minProtocol', PROTO + 1);
    const old = await client('carol', 'pc', PROTO);
    const res = await old.session.join(code);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.reason).toContain('업데이트');
    expect(hub.read(`rooms/${code}/members/carol_pc`)).toBeNull();
  });

  it('주인이 방을 지우면 멤버가 나가고 다시 들어가지 못한다', async () => {
    const { a, b, code } = await room();
    await expect(b.session.remove(code)).rejects.toThrow('방 주인만');
    await a.session.remove(code);
    await vi.advanceTimersByTimeAsync(0);
    expect(a.session.current()).toBeNull();
    expect(b.session.current()).toBeNull();
    expect(b.kicked).toEqual(['주인이 방을 지웠습니다.']);
    expect(await b.session.join(code)).toEqual({ ok: false, reason: '주인이 지운 방입니다.', kind: 'gone' });
    // meta와 roster는 남는다
    expect(hub.read(`rooms/${code}/meta/owner`)).toBe('alice');
    expect(hub.read(`rooms/${code}/roster/bob`)).not.toBeNull();
  });

  it('한 계정의 두 기기는 한 번만 보이고 seenAt이 최근인 기록을 쓴다', async () => {
    const { b, code } = await room();
    await vi.advanceTimersByTimeAsync(1_000);
    const laptop = await client('alice', 'laptop');
    expect(await laptop.session.join(code)).toEqual({ ok: true });
    expect(Object.keys(hub.read(`rooms/${code}/members`) as object)).toHaveLength(3);
    expect(b.sees()).toEqual(['alice', 'bob']);
    expect(b.session.members().find((m) => m.uid === 'alice')?.key).toBe('alice_laptop');
    // 노트북만 끊겨도 PC 기록이 남아 계속 보인다
    laptop.server.goOffline();
    expect(b.sees()).toEqual(['alice', 'bob']);
  });

  it('지운 방이 아니면 자기 기록이 지워져도 다시 쓴다 (늦게 도착한 연결 끊김 삭제)', async () => {
    const { a, b, code } = await room();
    hub.write(`rooms/${code}/members/alice_pc`, null);
    await vi.advanceTimersByTimeAsync(0);
    expect(b.sees()).toEqual(['alice', 'bob']);
    expect(a.session.current()).toBe(code);
  });
});
