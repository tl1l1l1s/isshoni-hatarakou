// adapter 계약 시험 (10.10.1의 4번). 같은 시험을 메모리 ServerPort와 Firebase 에뮬레이터에 실행한다.
// Firebase는 FIREBASE_DATABASE_EMULATOR_HOST와 FIREBASE_AUTH_EMULATOR_HOST가 있을 때만 실행한다 (emulators:exec가 넣는다).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FILE_MAX_RAW_BYTES } from '@shared/constants';
import { randomCode } from '@shared/codes';
import { PROTO } from '@shared/proto';
import type { MemberRecord } from '@shared/schemas';
import { createFirebaseServer } from '@server/firebase';
import { encodeFile } from '@server/firebase/layout';
import { encodeSetupCode } from '@server/firebase/setup-code';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { SERVER_TIME, type AccountPresence, type RoomEvent, type ServerPort } from '@server/port';
import { buildRules } from '../../rules/build';

interface Client { server: ServerPort; uid: string; goOffline(): void; goOnline(): void; close?(): Promise<void> }

const until = (fn: () => void) => vi.waitFor(fn, { timeout: 5_000, interval: 20 });

/** 규칙을 거치지 않고 쓴다 (친구 목록, 친구 코드처럼 다른 모듈이나 스크립트가 쓰는 값) */
type Seed = (path: string, value: unknown) => Promise<void>;

function contract(make: (name: string) => Promise<Client>, seed: Seed) {
  let a: Client;
  let b: Client;
  beforeAll(async () => {
    a = await make('alice');
    b = await make('bob');
  });
  afterAll(async () => {
    await a?.close?.();
    await b?.close?.();
  });

  const record = (c: Client): MemberRecord => ({
    uid: c.uid, name: c.uid.slice(0, 8), look: null, state: 'online', proto: PROTO, mods: { x: 1 },
    joinedAt: c.server.time.serverNow(), seenAt: c.server.time.serverNow(), m: {},
  });
  const newRoom = async () => {
    const code = randomCode();
    expect(await a.server.room.createMeta(code, { kind: 'work', owner: a.uid, createdAt: a.server.time.serverNow() })).toBe(true);
    for (const c of [a, b]) await c.server.room.ensureRoster(code, c.uid, c.server.time.serverNow());
    return code;
  };

  it('docs: 쓴 값을 바로 읽고 없는 값은 null, update는 얕은 병합과 $inc', async () => {
    const d = a.server.docs({ scope: 'user', module: 'contract', uid: a.uid });
    await d.set('x', { n: 1, s: 'a', deep: { k: 1 } });
    expect(await d.get('x')).toEqual({ n: 1, s: 'a', deep: { k: 1 } });
    expect(await d.get('missing')).toBeNull();
    await d.update('x', { n: { $inc: 2 }, t: true, deep: { j: 2 } });
    expect(await d.get('x')).toEqual({ n: 3, s: 'a', t: true, deep: { j: 2 } });
    await d.update('x', { fresh: { $inc: 5 } });
    expect(await d.get('x/fresh')).toBe(5);
    await d.remove('x');
    expect(await d.get('x')).toBeNull();
  });

  it('docs: list는 키 순서로 limit개, 정수 키가 먼저', async () => {
    const d = a.server.docs({ scope: 'user', module: 'contract', uid: a.uid, path: ['list'] });
    for (const k of ['b', 'a', '10', '9', 'c']) await d.set(k, k);
    expect((await d.list({ limit: 4 })).map((e) => e.key)).toEqual(['9', '10', 'a', 'b']);
    expect(await d.list({ limit: 1 })).toEqual([{ key: '9', value: '9' }]);
  });

  it('docs: watch는 처음 값과 바뀐 값을 준다', async () => {
    const d = a.server.docs({ scope: 'user', module: 'contract', uid: a.uid });
    const seen: unknown[] = [];
    const stop = d.watch('w', (v) => seen.push(v));
    await until(() => expect(seen).toEqual([null]));
    await d.set('w', { v: 1 });
    await until(() => expect(seen.at(-1)).toEqual({ v: 1 }));
    stop();
    await d.set('w', { v: 2 });
    expect(seen.at(-1)).toEqual({ v: 1 });
  });

  it('docs: watchList는 키 순서로 처음이나 마지막 limit개를 처음과 바뀔 때 준다', async () => {
    const d = a.server.docs({ scope: 'user', module: 'contract', uid: a.uid });
    for (const k of ['b', 'a', '10', 'c']) await d.set(`wl/${k}`, { k });
    const first: string[][] = [];
    const last: Array<Array<{ key: string; value: { k: string } }>> = [];
    const stopFirst = d.watchList('wl', { limit: 2 }, (items) => first.push(items.map((e) => e.key)));
    const stopLast = a.server.docs({ scope: 'user', module: 'contract', uid: a.uid, path: ['wl'] }).watchList<{ k: string }>('', { limit: 2, last: true }, (items) => last.push(items));
    await until(() => expect(first.at(-1)).toEqual(['10', 'a']));
    await until(() => expect(last.at(-1)).toEqual([{ key: 'b', value: { k: 'b' } }, { key: 'c', value: { k: 'c' } }]));
    await d.set('wl/d', { k: 'd' });
    await until(() => expect(last.at(-1)?.map((e) => e.key)).toEqual(['c', 'd']));
    await d.remove('wl/10');
    await until(() => expect(first.at(-1)).toEqual(['a', 'b']));
    stopFirst();
    stopLast();
    await d.remove('wl/a');
    expect(first.at(-1)).toEqual(['a', 'b']);
    const empty: unknown[] = [];
    const stopEmpty = d.watchList('nothing', { limit: 5 }, (items) => empty.push(items));
    await until(() => expect(empty).toEqual([[]]));
    stopEmpty();
    await d.remove('wl');
  });

  it('docs: transaction은 더하고 undefined면 취소한다', async () => {
    const d = a.server.docs({ scope: 'user', module: 'contract', uid: a.uid });
    expect(await d.transaction<number>('t', (cur) => (cur ?? 0) + 1)).toEqual({ committed: true, value: 1 });
    expect(await d.transaction<number>('t', (cur) => (cur ?? 0) + 1)).toEqual({ committed: true, value: 2 });
    expect((await d.transaction<number>('t', () => undefined)).committed).toBe(false);
    expect(await d.get('t')).toBe(2);
  });

  it('docs: 남의 사용자 범위에는 쓰지 못한다', async () => {
    await expect(b.server.docs({ scope: 'user', module: 'contract', uid: a.uid }).set('x', 1)).rejects.toThrow();
  });

  it('docs: removeOnDisconnect는 끊기면 지우고 거둔 예약은 지우지 않는다', async () => {
    const d = a.server.docs({ scope: 'user', module: 'contract', uid: a.uid });
    await d.set('gone', 1);
    await d.set('kept', 1);
    await d.removeOnDisconnect('gone');
    await d.removeOnDisconnect('kept');
    await d.removeOnDisconnect('kept', false);
    a.goOffline();
    a.goOnline();
    await until(async () => expect(await d.get('gone')).toBeNull());
    expect(await d.get('kept')).toBe(1);
    await d.remove('kept');
  });

  it('room: meta는 한 번만 만들고 멤버 기록을 쓰고 지운다', async () => {
    const code = await newRoom();
    expect(await b.server.room.createMeta(code, { kind: 'work', owner: b.uid, createdAt: 1 })).toBe(false);
    expect((await b.server.room.getMeta(code))?.owner).toBe(a.uid);
    expect(await a.server.room.getMeta(randomCode())).toBeNull();

    const seen: Array<Record<string, MemberRecord>> = [];
    const stop = b.server.room.watchMembers(code, (m) => seen.push(m));
    const key = `${a.uid}_d1`;
    await a.server.room.join(code, key, record(a));
    await until(() => expect(Object.keys(seen.at(-1) ?? {})).toEqual([key]));
    expect(seen.at(-1)?.[key]).toMatchObject({ uid: a.uid, proto: PROTO, mods: { x: 1 } });

    await a.server.room.writeMine(code, key, { seenAt: SERVER_TIME, 'm/x/y': 1, state: 'away' });
    await until(() => expect(seen.at(-1)?.[key]?.m).toEqual({ x: { y: 1 } }));
    expect(seen.at(-1)?.[key]?.state).toBe('away');
    expect(Math.abs((seen.at(-1)?.[key]?.seenAt ?? 0) - b.server.time.serverNow())).toBeLessThan(5_000);

    // 갓 쓴 남의 기록은 지우지 못하고 남의 키로는 쓰지 못한다
    await expect(b.server.room.removeStale(code, key)).rejects.toThrow();
    await expect(b.server.room.join(code, `${a.uid}_d2`, record(b))).rejects.toThrow();

    await a.server.room.leave(code, key);
    await until(() => expect(seen.at(-1)).toEqual({}));
    stop();
  });

  it('room: 연결이 끊기면 멤버 기록이 지워지고 다시 연결되면 다시 쓴다', async () => {
    const code = await newRoom();
    const seen: Array<Record<string, MemberRecord>> = [];
    const stop = b.server.room.watchMembers(code, (m) => seen.push(m));
    const key = `${a.uid}_d1`;
    await a.server.room.join(code, key, record(a));
    await until(() => expect(Object.keys(seen.at(-1) ?? {})).toEqual([key]));
    a.goOffline();
    await until(() => expect(seen.at(-1)).toEqual({}));
    a.goOnline();
    await until(() => expect(Object.keys(seen.at(-1) ?? {})).toEqual([key]));
    await a.server.room.leave(code, key);
    stop();
  });

  it('room: 주인이 지우면 삭제 표시와 함께 멤버 기록이 지워지고 다시 쓰지 못한다', async () => {
    const code = await newRoom();
    await b.server.room.join(code, `${b.uid}_d1`, record(b));
    await expect(b.server.room.markDeleted(code, 1)).rejects.toThrow();
    await a.server.room.markDeleted(code, a.server.time.serverNow());
    expect((await b.server.room.getMeta(code))?.deletedAt).toBeTypeOf('number');
    await expect(b.server.room.join(code, `${b.uid}_d1`, record(b))).rejects.toThrow();
    await b.server.room.leave(code, `${b.uid}_d1`);
  });

  it('ev: roster 멤버가 서버 시각과 함께 보내고 since 뒤 키만 마지막 50개를 준다', async () => {
    const code = await newRoom();
    const seen: RoomEvent[][] = [];
    const stop = b.server.room.watchEvents(code, (evs) => seen.push(evs), b.server.time.serverNow() - 1_000);
    const future: RoomEvent[][] = [];
    const stopFuture = b.server.room.watchEvents(code, (evs) => future.push(evs), b.server.time.serverNow() + 3_600_000);
    const key = await a.server.room.emit(code, { t: 'x.hi', uid: a.uid, p: '{"n":1}' });
    await until(() => expect(seen.at(-1)?.map((e) => e.key)).toEqual([key]));
    const ev = seen.at(-1)?.[0];
    expect(ev).toMatchObject({ key, t: 'x.hi', uid: a.uid, p: '{"n":1}' });
    expect(Math.abs((ev?.at ?? 0) - b.server.time.serverNow())).toBeLessThan(5_000);
    await until(() => expect(future.at(-1)).toEqual([]));

    const keys = [key];
    for (let i = 0; i < 50; i++) keys.push(await b.server.room.emit(code, { t: 'x.n', uid: b.uid, p: String(i) }));
    await until(() => expect(seen.at(-1)?.map((e) => e.key)).toEqual(keys.slice(-50)));
    stop();
    stopFuture();
  });

  it('ev: 보낸 사람은 언제나 지우고 남의 갓 쓴 이벤트는 지우지 못하며 잘못된 이벤트는 거부한다', async () => {
    const code = await newRoom();
    const key = await a.server.room.emit(code, { t: 'x.hi', uid: a.uid, p: '1' });
    await expect(b.server.room.removeEvent(code, key)).rejects.toThrow();
    await a.server.room.removeEvent(code, key);
    const seen: RoomEvent[][] = [];
    const stop = b.server.room.watchEvents(code, (evs) => seen.push(evs));
    await until(() => expect(seen.at(-1)).toEqual([]));
    stop();

    await expect(a.server.room.emit(code, { t: 'x.hi', uid: b.uid, p: '1' })).rejects.toThrow();
    await expect(a.server.room.emit(code, { t: 'x'.repeat(65), uid: a.uid, p: '1' })).rejects.toThrow();
    await expect(a.server.room.emit(code, { t: 'x.hi', uid: a.uid, p: 'x'.repeat(1025) })).rejects.toThrow();
    // roster에 없는 방, 지운 방
    const other = randomCode();
    await a.server.room.createMeta(other, { kind: 'work', owner: a.uid, createdAt: a.server.time.serverNow() });
    await expect(b.server.room.emit(other, { t: 'x.hi', uid: b.uid, p: '1' })).rejects.toThrow();
    await a.server.room.emit(code, { t: 'x.hi', uid: a.uid, p: '1' });
    await a.server.room.markDeleted(code, a.server.time.serverNow());
    await expect(b.server.room.emit(code, { t: 'x.hi', uid: b.uid, p: '1' })).rejects.toThrow();
  });

  it('ev: 연결이 끊기면 보낸 이벤트가 지워진다', async () => {
    const code = await newRoom();
    const seen: RoomEvent[][] = [];
    const stop = b.server.room.watchEvents(code, (evs) => seen.push(evs));
    await a.server.room.emit(code, { t: 'x.hi', uid: a.uid, p: '1' });
    await until(() => expect(seen.at(-1)).toHaveLength(1));
    a.goOffline();
    await until(() => expect(seen.at(-1)).toEqual([]));
    a.goOnline();
    stop();
  });

  it('presence: online과 lastSeen은 누구나, m은 친구만 보고 끊기면 m을 남긴 채 offline', async () => {
    const seen: Array<AccountPresence | null> = [];
    let stop = b.server.presence.watch(a.uid, (p) => seen.push(p));
    await a.server.presence.start(a.uid, { rooms: { code: 'ABCDEF' } });
    await until(() => expect(seen.at(-1)).toEqual({ online: true, lastSeen: expect.any(Number), m: {} }));
    expect(Math.abs((seen.at(-1)?.lastSeen ?? 0) - b.server.time.serverNow())).toBeLessThan(5_000);
    stop();

    // a가 b를 친구 목록에 두면 b가 m을 본다 (친구가 된 뒤에는 다시 구독한다)
    await seed(`mod/friends/u/${a.uid}/list/${b.uid}`, true);
    stop = b.server.presence.watch(a.uid, (p) => seen.push(p));
    await until(() => expect(seen.at(-1)?.m).toEqual({ rooms: { code: 'ABCDEF' } }));
    await a.server.presence.set(a.uid, 'rooms', { code: 'GHJKLM' });
    await until(() => expect(seen.at(-1)?.m).toEqual({ rooms: { code: 'GHJKLM' } }));

    a.goOffline();
    await until(() => expect(seen.at(-1)).toMatchObject({ online: false, m: { rooms: { code: 'GHJKLM' } } }));
    a.goOnline();
    await until(() => expect(seen.at(-1)).toMatchObject({ online: true, m: { rooms: { code: 'GHJKLM' } } }));
    stop();

    await expect(b.server.presence.set(a.uid, 'rooms', null)).rejects.toThrow();
    await expect(b.server.presence.start(a.uid, {})).rejects.toThrow();
    const none: Array<AccountPresence | null> = [];
    const stopNone = a.server.presence.watch('nobody', (p) => none.push(p));
    await until(() => expect(none).toEqual([null]));
    stopNone();
  });

  it('userPrivate: 본인만 쓰고 구독한다', async () => {
    const seen: unknown[] = [];
    const stop = a.server.userPrivate.watch(a.uid, 'activeDevice', (v) => seen.push(v));
    await a.server.userPrivate.set(a.uid, 'activeDevice', { id: 'pc1', at: SERVER_TIME });
    await until(() => expect(seen.at(-1)).toEqual({ id: 'pc1', at: expect.any(Number) }));
    stop();
    await expect(b.server.userPrivate.set(a.uid, 'activeDevice', { id: 'x', at: 1 })).rejects.toThrow();
  });

  it('codes: 친구 코드로 uid를 찾는다', async () => {
    await seed('codes/CONTRACT', a.uid);
    expect(await b.server.codes.lookup('CONTRACT')).toBe(a.uid);
    expect(await b.server.codes.lookup('NOPE2345')).toBeNull();
  });

  it('inbox: 보낸 사람은 자기 칸에만 쓰고 받는 사람은 읽고 지우되 고치지 못한다', async () => {
    const toA = b.server.docs({ scope: 'user.inbox', module: 'post', uid: a.uid, sender: b.uid });
    await toA.set('req', { at: 1 });
    await toA.update('req', { at: 2 });
    expect(await toA.get('req')).toEqual({ at: 2 });
    const mine = a.server.docs({ scope: 'user.inbox', module: 'post', uid: a.uid });
    expect(await mine.list({ limit: 10 })).toEqual([{ key: b.uid, value: { req: { at: 2 } } }]);
    await expect(a.server.docs({ scope: 'user.inbox', module: 'post', uid: a.uid, sender: b.uid }).set('req', { at: 3 })).rejects.toThrow();
    await expect(mine.set(`${b.uid}/req`, { at: 3 })).rejects.toThrow();
    await expect(a.server.docs({ scope: 'user.inbox', module: 'post', uid: b.uid, sender: b.uid }).set('req', 1)).rejects.toThrow();
    await mine.remove(b.uid);
    expect(await mine.list({ limit: 10 })).toEqual([]);
  });

  it('files: 해시로 올리고 받고 64KB를 넘으면 거부한다', async () => {
    const bytes = new TextEncoder().encode('hello');
    const hash = await a.server.files.put(bytes);
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(await a.server.files.put(bytes)).toBe(hash);
    expect(await b.server.files.get(hash)).toEqual(bytes);
    expect(await b.server.files.get('0'.repeat(64))).toBeNull();
    const max = new Uint8Array(FILE_MAX_RAW_BYTES).fill(7);
    expect(await b.server.files.get(await a.server.files.put(max))).toEqual(max);
    await expect(a.server.files.put(new Uint8Array(FILE_MAX_RAW_BYTES + 1))).rejects.toThrow('너무 큽니다');
  });

  it('files: 해시와 내용이 맞지 않는 파일은 없는 것으로 보고 그 해시로는 올리지 못한다', async () => {
    const bytes = new TextEncoder().encode(`poison-${randomCode()}`);
    const { hash } = await encodeFile(bytes);
    await seed(`files/${hash}`, btoa('garbage'));
    expect(await b.server.files.get(hash)).toBeNull();
    await expect(a.server.files.put(bytes)).rejects.toThrow();
    const { hash: broken } = await encodeFile(new TextEncoder().encode(`broken-${randomCode()}`));
    await seed(`files/${broken}`, '%%% not base64');
    expect(await b.server.files.get(broken)).toBeNull();
  });

  it('profile, config, time', async () => {
    await a.server.profile.write(a.uid, { name: '앨리스', 'm/growth/level': 2 });
    expect(await b.server.profile.read(a.uid)).toMatchObject({ name: '앨리스', m: { growth: { level: 2 } } });
    await expect(b.server.profile.write(a.uid, { name: 'x' })).rejects.toThrow();
    expect(await a.server.config.minProtocol()).toBe(1);
    expect(Math.abs(a.server.time.serverNow() - Date.now())).toBeLessThan(5_000);
    expect(a.server.connection.online()).toBe(true);
    expect(a.server.identity.current()).toBe(a.uid);
  });
}

describe('memory', () => {
  const hub = new MemoryHub();
  contract(
    async (name) => {
      const server = createMemoryServer(hub);
      const uid = await server.identity.signIn(`dev-${name}`);
      return { server, uid, goOffline: () => server.goOffline(), goOnline: () => server.goOnline() };
    },
    async (path, value) => hub.write(path, value),
  );

  it('serverNow는 hub 시각을 따른다', async () => {
    const server = createMemoryServer(hub);
    const before = server.time.serverNow();
    hub.advance(60_000);
    expect(server.time.serverNow() - before).toBeGreaterThanOrEqual(60_000);
    expect(server.time.offset()).toBeGreaterThanOrEqual(60_000);
  });
});

const DB = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
describe.skipIf(!DB || !AUTH)('firebase emulator', () => {
  const ns = `contract-${randomCode(6).toLowerCase()}`;
  beforeAll(async () => {
    // 시험 모듈 contract의 사용자 범위와 post의 받은 기록만 더한 규칙을 이 namespace에 올린다
    const rules = buildRules({ contract: (t) => ({ u: { $uid: t.owner() } }), post: (t) => ({ u: { $uid: { in: t.inbox() } } }) });
    const res = await fetch(`http://${DB}/.settings/rules.json?ns=${ns}`, {
      method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(rules),
    });
    expect(res.ok).toBe(true);
  });
  const make = async (name: string) => {
    const email = `${name}-${randomCode(10).toLowerCase()}@isshoni-hatarakou.invalid`;
    const password = randomCode(24);
    const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    expect(res.ok).toBe(true);
    const server = createFirebaseServer(
      { apiKey: 'fake', projectId: 'demo-isshoni', databaseURL: `http://${DB}?ns=${ns}`, databaseEmulator: DB, authEmulator: AUTH },
      `contract-${name}-${ns}`,
    );
    expect(await server.identity.restore()).toBeNull();
    const uid = await server.identity.signIn(encodeSetupCode(email, password));
    // 계정 발급 스크립트처럼 friendCode를 넣는다. 규칙은 friendCode가 없는 계정을 거른다 (rules/core.ts의 ISSUED)
    const code = await fetch(`http://${DB}/users/${uid}/public/friendCode.json?ns=${ns}`, {
      method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(`CODE${name}`),
    });
    expect(code.ok).toBe(true);
    await until(() => expect(server.connection.online()).toBe(true));
    return { server, uid, goOffline: server.goOffline, goOnline: server.goOnline, close: server.close };
  };
  contract(make, async (path, value) => {
    const res = await fetch(`http://${DB}/${path}.json?ns=${ns}`, {
      method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value),
    });
    expect(res.ok).toBe(true);
  });

  // 로그인 전에 연결을 열면 그 연결이 로그인하지 않은 채로 남는다 (firebase/index.ts의 start)
  it('로그인 직후 연결이 로그인한 상태다', async () => {
    for (let i = 0; i < 5; i++) {
      const c = await make(`fresh${i}`);
      expect(await c.server.config.minProtocol()).toBe(1);
      await c.close();
    }
  });
});
