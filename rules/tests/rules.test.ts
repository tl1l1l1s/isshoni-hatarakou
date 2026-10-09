// 규칙 시험 (10.10.1의 5번). 데이터베이스 에뮬레이터가 있을 때만 실행한다:
// npx firebase emulators:exec --project demo-isshoni --only database,auth "npx vitest run rules/tests tests/adapter-contract"
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { FILE_MAX_BASE64_BYTES, NAME_MAX_LENGTH, PRESENCE_STALE_MS } from '../../src/shared/constants';
import { dayIndex } from '../../src/shared/time';
import { buildRules, type Fragment } from '../build';
import { issued } from './issued';

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const ROOM = 'ROOM22';
const HASH = 'a'.repeat(64);

// 템플릿 시험용 모듈 조각
const hello: Fragment = (t) => ({
  u: {
    $uid: {
      notes: t.owner(), card: t.ownerWritePublicRead(), memo: t.friendsRead(),
      // 방명록처럼 한 사람이 여러 항목을 두고 친구도 읽는 받은 기록
      in: t.inbox({ $id: { '.validate': "newData.child('text').isString()" } }, 'friends'),
      key: t.owner(), sig: t.keyedWrite("'mod/hello/u/' + $uid + '/key'"), uq: t.dailyQuota('user', 1),
    },
  },
  r: { $room: { cfg: t.roomOwner(), items: t.roomMember(), msgs: t.appendOnly(t.roomMember(), { '.validate': "newData.hasChild('text')" }), rq: t.dailyQuota('room', 1) } },
  g: { quota: t.dailyQuota('global', 2) },
});
// 보낸 사람마다 기록 하나인 받은 기록 (친구 신청)
const post: Fragment = (t) => ({ u: { $uid: { in: t.inbox({ '.validate': "newData.hasChild('at')" }) } } });
const NOW = { '.sv': 'timestamp' };

describe.skipIf(!HOST)('database rules', () => {
  let env: RulesTestEnvironment;
  const db = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
  const at = (uid: string | undefined, path: string) => db(uid).ref(path);
  const member = (uid: string, extra: object = {}) => ({
    uid, name: uid, look: null, state: 'online', proto: 1, mods: {}, joinedAt: Date.now(), seenAt: Date.now(), ...extra,
  });

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-isshoni-rules',
      database: { host, port: Number(port), rules: JSON.stringify(buildRules({ hello, post })) },
    });
  });
  afterAll(() => env?.cleanup());
  // alice가 주인, bob은 roster에 있는 멤버, carol은 방 밖 사용자. eve는 스스로 가입해 friendCode가 없는 계정
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref().set({
        rooms: {
          [ROOM]: {
            meta: { kind: 'work', owner: 'alice', createdAt: 1 },
            roster: { alice: 1, bob: 1 },
            members: { bob_pc: member('bob') },
          },
        },
        mod: { friends: { u: { alice: { list: { bob: true } } } } },
      });
      await ctx.database().ref().update(issued('alice', 'bob', 'carol', 'dave'));
    });
  });

  describe('meta', () => {
    it('없을 때 자기를 주인으로만 만든다', async () => {
      const meta = { kind: 'work', owner: 'carol', createdAt: 1 };
      await assertFails(at(undefined, 'rooms/NEW222/meta').set(meta));
      await assertFails(at('carol', 'rooms/NEW222/meta').set({ ...meta, owner: 'alice' }));
      await assertFails(at('carol', 'rooms/NEW222/meta').set({ ...meta, extra: 1 }));
      await assertSucceeds(at('carol', 'rooms/NEW222/meta').set(meta));
      await assertFails(at('carol', `rooms/${ROOM}/meta`).set(meta));
      await assertFails(at('alice', `rooms/${ROOM}/meta`).set({ kind: 'work', owner: 'alice', createdAt: 2 }));
    });
    it('deletedAt은 주인만 한 번 쓰고 meta는 지우지 못한다', async () => {
      await assertFails(at('bob', `rooms/${ROOM}/meta/deletedAt`).set(5));
      await assertSucceeds(at('alice', `rooms/${ROOM}/meta/deletedAt`).set(5));
      await assertFails(at('alice', `rooms/${ROOM}/meta/deletedAt`).set(6));
      await assertFails(at('alice', `rooms/${ROOM}/meta`).remove());
    });
    it('로그인한 사용자만 읽는다', async () => {
      await assertSucceeds(at('carol', `rooms/${ROOM}/meta`).get());
      await assertFails(at(undefined, `rooms/${ROOM}/meta`).get());
    });
  });

  describe('roster', () => {
    it('본인 uid로 한 번만, 지우지 않은 방에서만 만든다', async () => {
      await assertFails(at('carol', `rooms/${ROOM}/roster/dave`).set(1));
      await assertFails(at('carol', 'rooms/NONE22/roster/carol').set(1));
      await assertSucceeds(at('carol', `rooms/${ROOM}/roster/carol`).set(1));
      await assertFails(at('carol', `rooms/${ROOM}/roster/carol`).set(2));
      await assertFails(at('carol', `rooms/${ROOM}/roster/carol`).remove());
      await assertSucceeds(at('alice', `rooms/${ROOM}/meta/deletedAt`).set(5));
      await assertFails(at('dave', `rooms/${ROOM}/roster/dave`).set(1));
    });
    it('멤버는 목록을 읽고 밖의 사람은 자기 항목만 읽는다', async () => {
      await assertSucceeds(at('bob', `rooms/${ROOM}/roster`).get());
      await assertFails(at('carol', `rooms/${ROOM}/roster`).get());
      await assertSucceeds(at('carol', `rooms/${ROOM}/roster/carol`).get());
    });
  });

  describe('members', () => {
    it('roster에 있는 사람이 자기 uid 접두어 키로만 쓴다', async () => {
      await assertSucceeds(at('alice', `rooms/${ROOM}/members/alice_pc`).set(member('alice')));
      await assertFails(at('carol', `rooms/${ROOM}/members/carol_pc`).set(member('carol')));
      await assertFails(at('alice', `rooms/${ROOM}/members/bob_pc`).set(member('alice')));
      await assertFails(at('alice', `rooms/${ROOM}/members/alice_pc`).set(member('bob')));
      await assertFails(at('alice', `rooms/${ROOM}/members/alice_pc`).set({ uid: 'alice', seenAt: 1 }));
      await assertFails(at(undefined, `rooms/${ROOM}/members/alice_pc`).set(member('alice')));
    });
    it('seenAt만 바꾸는 update와 서버 시각', async () => {
      await assertSucceeds(at('bob', `rooms/${ROOM}/members/bob_pc`).update({ seenAt: { '.sv': 'timestamp' }, 'm/focus/awake': true }));
      await assertFails(at('carol', 'rooms/NONE22/members/carol_pc').update({ seenAt: 1 }));
    });
    it('config/minProtocol보다 낮은 proto는 거부한다', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.database().ref('config/minProtocol').set(2);
      });
      await assertFails(at('alice', `rooms/${ROOM}/members/alice_pc`).set(member('alice')));
      await assertSucceeds(at('alice', `rooms/${ROOM}/members/alice_pc`).set(member('alice', { proto: 2 })));
    });
    it('자기 기록은 언제나 지우고 남의 기록은 150초가 지난 것만 방 멤버가 지운다', async () => {
      await assertFails(at('alice', `rooms/${ROOM}/members/bob_pc`).remove());
      await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.database().ref(`rooms/${ROOM}/members/bob_pc/seenAt`).set(Date.now() - PRESENCE_STALE_MS - 5_000);
      });
      await assertFails(at('carol', `rooms/${ROOM}/members/bob_pc`).remove());
      await assertSucceeds(at('alice', `rooms/${ROOM}/members/bob_pc`).remove());
      await assertSucceeds(at('alice', `rooms/${ROOM}/members/alice_pc`).set(member('alice')));
      await assertSucceeds(at('alice', `rooms/${ROOM}/members/alice_pc`).remove());
    });
    it('지운 방에는 쓰지 못하고 주인은 삭제 표시와 함께 멤버 기록을 지운다', async () => {
      await assertFails(at('bob', `rooms/${ROOM}`).update({ 'meta/deletedAt': 5, members: null }));
      await assertFails(at('alice', `rooms/${ROOM}/members`).remove());
      await assertSucceeds(at('alice', `rooms/${ROOM}`).update({ 'meta/deletedAt': 5, members: null }));
      await assertFails(at('bob', `rooms/${ROOM}/members/bob_pc`).set(member('bob')));
      await assertSucceeds(at('bob', `rooms/${ROOM}/members/bob_pc`).remove());
    });
    it('look, mods, m은 정한 모양과 크기만 받는다 (M20)', async () => {
      const path = `rooms/${ROOM}/members/alice_pc`;
      const m = { status: { text: '안녕' }, awaypic: { pic: { file: HASH, size: 80 } }, focus: { awake: true, todayMin: 3 } };
      await assertSucceeds(at('alice', path).set(member('alice', { look: HASH, mods: { focus: 1, status: 2 }, m })));
      await assertSucceeds(at('alice', path).update({ 'm/status/text': 'x'.repeat(128) }));
      await assertFails(at('alice', path).update({ 'm/status/text': 'x'.repeat(129) }));
      await assertFails(at('alice', path).update({ 'm/status': 'x' }));
      await assertFails(at('alice', path).update({ 'm/a/b/c/d': 1 }));
      await assertFails(at('alice', path).update({ [`m/${'a'.repeat(33)}/b`]: 1 }));
      await assertFails(at('alice', path).update({ look: 'x'.repeat(200) }));
      await assertFails(at('alice', path).update({ 'mods/focus': 'x' }));
      await assertFails(at('alice', path).update({ junk: 'x' }));
      await assertFails(at('alice', path).set(member('alice', { m: { big: { s: 'x'.repeat(200_000) } } })));
    });
    it('roster에 있는 사람만 읽는다', async () => {
      await assertSucceeds(at('bob', `rooms/${ROOM}/members`).get());
      await assertFails(at('carol', `rooms/${ROOM}/members`).get());
      await assertFails(at(undefined, `rooms/${ROOM}/members`).get());
    });
  });

  describe('ev', () => {
    const ev = (uid: string, extra: object = {}) => ({ t: 'x.hi', uid, at: NOW, p: '{"n":1}', ...extra });
    it('roster에 있는 사람이 자기 uid와 서버 시각으로 만들기만 한다', async () => {
      await assertSucceeds(at('bob', `rooms/${ROOM}/ev/e1`).set(ev('bob')));
      await assertFails(at('bob', `rooms/${ROOM}/ev/e1`).set(ev('bob', { p: '2' })));
      await assertFails(at('carol', `rooms/${ROOM}/ev/e2`).set(ev('carol')));
      await assertFails(at('bob', `rooms/${ROOM}/ev/e2`).set(ev('alice')));
      await assertFails(at('bob', `rooms/${ROOM}/ev/e2`).set(ev('bob', { at: 5 })));
      await assertFails(at('bob', `rooms/${ROOM}/ev/e2`).set(ev('bob', { t: 'x'.repeat(65) })));
      await assertFails(at('bob', `rooms/${ROOM}/ev/e2`).set(ev('bob', { p: 'x'.repeat(1025) })));
      await assertFails(at('bob', `rooms/${ROOM}/ev/e2`).set(ev('bob', { p: { n: 1 } })));
      await assertFails(at('bob', `rooms/${ROOM}/ev/e2`).set(ev('bob', { extra: 1 })));
      await assertFails(at(undefined, `rooms/${ROOM}/ev/e2`).set(ev('bob')));
      await assertSucceeds(at('bob', `rooms/${ROOM}/ev/e2`).set(ev('bob', { p: 'x'.repeat(1024) })));
    });
    it('roster에 있는 사람만 읽는다', async () => {
      await assertSucceeds(at('bob', `rooms/${ROOM}/ev`).orderByKey().limitToLast(50).get());
      await assertFails(at('carol', `rooms/${ROOM}/ev`).get());
    });
    it('보낸 사람은 언제나, 방 멤버는 60초 지난 것만 지운다', async () => {
      await assertSucceeds(at('bob', `rooms/${ROOM}/ev/e1`).set(ev('bob')));
      await assertFails(at('alice', `rooms/${ROOM}/ev/e1`).remove());
      await assertSucceeds(at('bob', `rooms/${ROOM}/ev/e1`).remove());
      await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.database().ref(`rooms/${ROOM}/ev/old`).set(ev('bob', { at: Date.now() - 61_000 }));
      });
      await assertFails(at('carol', `rooms/${ROOM}/ev/old`).remove());
      await assertSucceeds(at('alice', `rooms/${ROOM}/ev/old`).remove());
    });
    it('주인은 방을 지울 때 이벤트도 지우고 지운 방에는 만들지 못한다', async () => {
      await assertSucceeds(at('bob', `rooms/${ROOM}/ev/e1`).set(ev('bob')));
      await assertFails(at('bob', `rooms/${ROOM}`).update({ 'meta/deletedAt': 5, ev: null }));
      await assertFails(at('alice', `rooms/${ROOM}/ev`).remove());
      await assertSucceeds(at('alice', `rooms/${ROOM}`).update({ 'meta/deletedAt': 5, members: null, ev: null }));
      await assertFails(at('bob', `rooms/${ROOM}/ev/e2`).set(ev('bob')));
    });
  });

  describe('users/presence', () => {
    const presence = { online: true, lastSeen: NOW, m: { rooms: { code: 'ABCDEF' } } };
    it('본인만 쓰고 정한 필드만 받는다', async () => {
      await assertSucceeds(at('alice', 'users/alice/presence').set(presence));
      await assertSucceeds(at('alice', 'users/alice/presence/m/rooms').set({ code: 'GHJKLM' }));
      await assertFails(at('bob', 'users/alice/presence').set(presence));
      await assertFails(at('alice', 'users/alice/presence').set({ ...presence, extra: 1 }));
      await assertFails(at('alice', 'users/alice/presence/online').set('yes'));
      await assertSucceeds(at('alice', 'users/alice/presence').onDisconnect().update({ online: false, lastSeen: NOW }));
    });
    it('online과 lastSeen은 로그인한 사용자가, 전체와 m은 본인과 친구만 읽는다', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.database().ref('users/alice/presence').set({ online: true, lastSeen: 1, m: { rooms: { code: 'ABCDEF' } } });
      });
      await assertSucceeds(at('alice', 'users/alice/presence').get());
      await assertSucceeds(at('bob', 'users/alice/presence').get());
      await assertFails(at('carol', 'users/alice/presence').get());
      await assertFails(at('carol', 'users/alice/presence/m/rooms').get());
      await assertSucceeds(at('carol', 'users/alice/presence/online').get());
      await assertSucceeds(at('carol', 'users/alice/presence/lastSeen').get());
      await assertFails(at(undefined, 'users/alice/presence/online').get());
    });
  });

  describe('files, config, users', () => {
    it('files는 64KB 이하 문자열을 한 번 쓰고 같은 값으로만 다시 쓴다', async () => {
      await assertSucceeds(at('carol', `files/${HASH}`).set('x'.repeat(FILE_MAX_BASE64_BYTES)));
      await assertSucceeds(at('bob', `files/${HASH}`).set('x'.repeat(FILE_MAX_BASE64_BYTES)));
      await assertFails(at('bob', `files/${HASH}`).set('y'));
      await assertFails(at('bob', `files/${HASH}`).remove());
      await assertFails(at('bob', `files/${'b'.repeat(64)}`).set('x'.repeat(FILE_MAX_BASE64_BYTES + 1)));
      await assertFails(at('bob', 'files/not-a-hash').set('x'));
      await assertFails(at(undefined, `files/${'c'.repeat(64)}`).set('x'));
      await assertSucceeds(at('dave', `files/${HASH}`).get());
    });
    it('스스로 가입한 계정은 파일, 방, 자기 기록, 받은 기록에 쓰지 못하고 프로필과 친구 코드를 읽지 못한다 (R3)', async () => {
      await assertFails(at('eve', `files/${'d'.repeat(64)}`).set('x'));
      await assertFails(at('eve', 'rooms/NEW222/meta').set({ kind: 'work', owner: 'eve', createdAt: 1 }));
      await assertFails(at('eve', `rooms/${ROOM}/roster/eve`).set(1));
      await assertFails(at('eve', 'users/eve/private/x').set('x'.repeat(1000)));
      await assertFails(at('eve', 'users/eve/public').update({ name: 'eve' }));
      await assertFails(at('eve', 'users/eve/public/friendCode').set('EVEEVEEV'));
      await assertFails(at('eve', 'users/eve/presence').set({ online: true, lastSeen: 1 }));
      await assertFails(at('eve', 'mod/hello/u/eve/notes').set({ a: 1 }));
      await assertFails(at('eve', 'mod/post/u/alice/in/eve').set({ at: 1 }));
      await assertFails(at('eve', 'users/alice/public').get());
      await assertFails(at('eve', 'codes/ABCDEFGH').get());
      await assertFails(at('eve', `files/${HASH}`).get());
      await assertFails(at('eve', 'config/minProtocol').get());
      await assertFails(at('eve', 'mod/hello/g/tunables').get());
      await assertSucceeds(at('carol', `files/${'d'.repeat(64)}`).set('x'));
      await assertSucceeds(at('carol', 'rooms/NEW222/meta').set({ kind: 'work', owner: 'carol', createdAt: 1 }));
    });
    it('공개 프로필 이름은 NAME_MAX_LENGTH자까지 (M20)', async () => {
      await assertSucceeds(at('alice', 'users/alice/public').update({ name: '가'.repeat(NAME_MAX_LENGTH) }));
      await assertFails(at('alice', 'users/alice/public').update({ name: '가'.repeat(NAME_MAX_LENGTH + 1) }));
      await assertFails(at('alice', 'users/alice/public').update({ name: 5 }));
    });
    it('config와 catalog는 읽기만 한다', async () => {
      await assertSucceeds(at('carol', 'config/minProtocol').get());
      await assertFails(at('carol', 'config/minProtocol').set(0));
      await assertFails(at('carol', 'catalog/items').set({}));
      await assertFails(at(undefined, 'config/minProtocol').get());
    });
    it('users/public은 본인이 쓰고 로그인한 사용자가 읽고 friendCode는 바꾸지 못한다', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.database().ref('users/alice/public').set({ v: 1, name: 'alice', friendCode: 'ABCDEFGH' });
      });
      await assertSucceeds(at('alice', 'users/alice/public').update({ name: '앨리스' }));
      await assertFails(at('alice', 'users/alice/public').update({ friendCode: 'ZZZZZZZZ' }));
      await assertFails(at('bob', 'users/alice/public').update({ name: 'x' }));
      await assertSucceeds(at('bob', 'users/alice/public').get());
      await assertFails(at(undefined, 'users/alice/public').get());
      await assertFails(at('bob', 'users/alice/private').get());
      await assertFails(at('bob', 'codes/ABCDEFGH').set('bob'));
    });
  });

  describe('모듈 템플릿', () => {
    it('owner와 ownerWritePublicRead', async () => {
      await assertSucceeds(at('alice', 'mod/hello/u/alice/notes').set({ a: 1 }));
      await assertFails(at('bob', 'mod/hello/u/alice/notes').get());
      await assertSucceeds(at('bob', 'mod/hello/u/alice/card').get());
      await assertFails(at('bob', 'mod/hello/u/alice/card').set(1));
      await assertFails(at('alice', 'mod/other/u/alice/notes').set(1));
    });
    it('friendsRead는 친구 목록에 있는 사람만 읽는다', async () => {
      await assertSucceeds(at('bob', 'mod/hello/u/alice/memo').get());
      await assertFails(at('carol', 'mod/hello/u/alice/memo').get());
      await assertFails(at('bob', 'mod/hello/u/alice/memo').set(1));
    });
    it('inbox: 보낸 사람은 자기 칸에만 쓰고 받는 사람은 항목을 하나씩 지우되 고치지 못한다', async () => {
      const box = 'mod/hello/u/alice/in';
      await assertSucceeds(at('bob', `${box}/bob/e1`).set({ text: 'hi' }));
      await assertSucceeds(at('bob', `${box}/bob/e2`).set({ text: 'hi2' }));
      await assertSucceeds(at('carol', `${box}/carol/e1`).set({ text: 'yo' }));
      await assertFails(at('carol', `${box}/bob/e3`).set({ text: 'fake' }));
      await assertFails(at('bob', `${box}/bob/e3`).set({ nope: 1 }));
      await assertFails(at('alice', `${box}/bob/e1`).set({ text: 'edited' }));
      await assertFails(at('alice', `${box}/bob/e1/text`).set('edited'));
      await assertSucceeds(at('alice', `${box}/bob/e1`).remove());
      await assertSucceeds(at('bob', `${box}/bob/e2`).remove());
      await assertSucceeds(at('alice', `${box}/carol`).remove());
      await assertFails(at(undefined, `${box}/bob/e9`).set({ text: 'x' }));
    });
    it('inbox: 받는 사람과 친구가 모두 읽고 다른 사람은 자기 칸만 읽는다', async () => {
      await assertSucceeds(at('bob', 'mod/hello/u/alice/in/bob/e1').set({ text: 'hi' }));
      await assertSucceeds(at('alice', 'mod/hello/u/alice/in').get());
      await assertSucceeds(at('bob', 'mod/hello/u/alice/in').get());
      await assertFails(at('carol', 'mod/hello/u/alice/in').get());
      await assertSucceeds(at('carol', 'mod/hello/u/alice/in/carol').get());
      await assertSucceeds(at('alice', 'mod/hello/u/alice/in').remove());
    });
    it('inbox: 보낸 사람마다 기록 하나, 받는 사람만 읽는다', async () => {
      await assertSucceeds(at('bob', 'mod/post/u/alice/in/bob').set({ at: 1 }));
      await assertSucceeds(at('bob', 'mod/post/u/alice/in/bob').update({ at: 2 }));
      await assertFails(at('bob', 'mod/post/u/alice/in/bob').set({ text: 1 }));
      await assertFails(at('alice', 'mod/post/u/alice/in/bob').set({ at: 3 }));
      await assertFails(at('bob', 'mod/post/u/alice/in').get());
      await assertSucceeds(at('bob', 'mod/post/u/alice/in/bob').get());
      await assertSucceeds(at('alice', 'mod/post/u/alice/in').get());
      await assertSucceeds(at('alice', 'mod/post/u/alice/in/bob').remove());
    });
    it('appendOnly: 방 멤버가 만들기만 하고 아무도 고치거나 지우지 못한다', async () => {
      const msgs = `mod/hello/r/${ROOM}/msgs`;
      await assertSucceeds(at('bob', `${msgs}/m1`).set({ text: 'hi' }));
      await assertFails(at('carol', `${msgs}/m2`).set({ text: 'hi' }));
      await assertFails(at('bob', `${msgs}/m2`).set({ nope: 1 }));
      await assertFails(at('bob', `${msgs}/m1`).set({ text: 'edit' }));
      await assertFails(at('bob', `${msgs}/m1/text`).set('edit'));
      await assertFails(at('bob', `${msgs}/m1`).remove());
      await assertFails(at('alice', `${msgs}/m1`).remove());
      await assertFails(at('alice', msgs).remove());
      await assertSucceeds(at('bob', msgs).orderByKey().limitToLast(10).get());
      await assertFails(at('carol', msgs).get());
    });
    it('roomMember와 roomOwner', async () => {
      await assertSucceeds(at('bob', `mod/hello/r/${ROOM}/items/i1`).set({ n: 1 }));
      await assertFails(at('carol', `mod/hello/r/${ROOM}/items/i1`).set({ n: 1 }));
      await assertFails(at('carol', `mod/hello/r/${ROOM}/items`).get());
      await assertSucceeds(at('alice', `mod/hello/r/${ROOM}/cfg`).set({ cap: 4 }));
      await assertFails(at('bob', `mod/hello/r/${ROOM}/cfg`).set({ cap: 4 }));
      await assertSucceeds(at('bob', `mod/hello/r/${ROOM}/cfg`).get());
      await assertSucceeds(at('alice', `rooms/${ROOM}/meta/deletedAt`).set(5));
      await assertFails(at('alice', `mod/hello/r/${ROOM}/cfg`).set({ cap: 5 }));
    });
    it('지운 방: 멤버는 새로 쓰지 못하고 주인과 멤버가 남은 기록을 지운다 (M17)', async () => {
      const today = dayIndex(Date.now());
      await assertSucceeds(at('bob', `mod/hello/r/${ROOM}/items/i1`).set({ n: 1 }));
      await assertSucceeds(at('alice', `mod/hello/r/${ROOM}/cfg`).set({ cap: 4 }));
      await assertSucceeds(at('alice', `rooms/${ROOM}/meta/deletedAt`).set(5));
      await assertFails(at('bob', `mod/hello/r/${ROOM}/items/i2`).set({ n: 1 }));
      await assertFails(at('bob', `mod/hello/r/${ROOM}/items/i1/n`).set(2));
      await assertFails(at('bob', `mod/hello/r/${ROOM}/msgs/m1`).set({ text: 'hi' }));
      await assertFails(at('bob', `mod/hello/r/${ROOM}/rq`).set({ d: today, n: 1 }));
      await assertFails(at('bob', `mod/hello/r/${ROOM}/cfg`).remove());
      await assertSucceeds(at('alice', `mod/hello/r/${ROOM}/cfg`).remove());
      await assertSucceeds(at('bob', `mod/hello/r/${ROOM}/items/i1`).remove());
    });
    it('dailyQuota: 오늘 날 번호로 1씩 한도까지만 올리고 날이 바뀌면 1부터 센다', async () => {
      const today = dayIndex(Date.now());
      const q = (uid?: string) => at(uid, 'mod/hello/g/quota');
      await assertFails(q().set({ d: today, n: 1 }));
      await assertFails(q('carol').set({ d: today + 1, n: 1 }));
      await assertFails(q('carol').set({ d: today, n: 2 }));
      await assertSucceeds(q('carol').set({ d: today, n: 1 }));
      await assertFails(q('alice').set({ d: today, n: 1 }));
      await assertSucceeds(q('alice').set({ d: today, n: 2 }));
      await assertFails(q('alice').set({ d: today, n: 3 }));
      await assertFails(q('alice').remove());
      await assertSucceeds(q('bob').get());
      await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('mod/hello/g/quota').set({ d: today - 1, n: 2 }));
      await assertFails(q('alice').set({ d: today - 1, n: 3 }));
      await assertSucceeds(q('alice').set({ d: today, n: 1 }));
      // user는 본인만, room은 방 멤버만
      await assertFails(at('bob', 'mod/hello/u/alice/uq').set({ d: today, n: 1 }));
      await assertSucceeds(at('alice', 'mod/hello/u/alice/uq').set({ d: today, n: 1 }));
      await assertFails(at('carol', `mod/hello/r/${ROOM}/rq`).set({ d: today, n: 1 }));
      await assertSucceeds(at('bob', `mod/hello/r/${ROOM}/rq`).set({ d: today, n: 1 }));
      await assertFails(at('alice', `mod/hello/r/${ROOM}/rq`).set({ d: today, n: 2 }));
    });
    it('keyedWrite: 로그인 없이도 경로의 키가 저장한 키와 같고 앱이 켜져 있을 때만 쓴다', async () => {
      const sig = (k: string) => at(undefined, `mod/hello/u/alice/sig/${k}`);
      await assertSucceeds(at('alice', 'mod/hello/u/alice/key').set('h1'));
      await assertFails(sig('h1').set({ open: true }));
      await assertSucceeds(at('alice', 'users/alice/presence').set({ online: true, lastSeen: 1 }));
      await assertSucceeds(sig('h1').set({ open: true }));
      await assertSucceeds(sig('h1/open').set(false));
      await assertFails(sig('h2').set({ open: true }));
      await assertFails(at(undefined, 'mod/hello/u/alice/sig').set({ h1: { open: true } }));
      await assertFails(at(undefined, 'mod/hello/u/alice/sig').update({ 'h2/open': true }));
      await assertFails(sig('h1').remove());
      await assertFails(at(undefined, 'mod/hello/u/alice/sig').get());
      await assertFails(sig('h1').get());
      await assertFails(at('bob', 'mod/hello/u/alice/key').get());
      await assertSucceeds(at('alice', 'mod/hello/u/alice/sig').get());
      await assertSucceeds(at('alice', 'users/alice/presence/online').set(false));
      await assertFails(sig('h1').set({ open: false }));
      await assertSucceeds(at('alice', 'mod/hello/u/alice/sig').remove());
    });
    it('keyedWrite: 키를 모르면 이미 있는 신호의 하위 칸도 쓰지 못한다 (R2)', async () => {
      await assertSucceeds(at('alice', 'mod/hello/u/alice/key').set('h1'));
      await assertSucceeds(at('alice', 'users/alice/presence').set({ online: true, lastSeen: 1 }));
      await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('mod/hello/u/alice/sig').set({ h: 'h1', open: false, h1: { open: false } }));
      await assertFails(at(undefined, 'mod/hello/u/alice/sig/open').set(true));
      await assertFails(at(undefined, 'mod/hello/u/alice/sig').update({ open: true }));
      await assertFails(at(undefined, 'mod/hello/u/alice/sig/x').set({ open: true }));
    });
    it('keyedWrite: 오프라인으로 보이기 표시를 켜도 online은 그대로라 폰 신호를 받는다 (FRD-06)', async () => {
      await assertSucceeds(at('alice', 'mod/hello/u/alice/key').set('h1'));
      await assertSucceeds(at('alice', 'users/alice/presence').set({ online: true, lastSeen: 1, m: { friends: { hidden: true } } }));
      await assertSucceeds(at(undefined, 'mod/hello/u/alice/sig/h1').set({ open: true }));
      // 친구는 표시를 읽고 친구가 아닌 사람은 m을 읽지 못한다
      await assertSucceeds(at('bob', 'users/alice/presence/m/friends/hidden').get());
      await assertFails(at('carol', 'users/alice/presence/m/friends/hidden').get());
    });
    it('서버 조정값: 로그인한 사용자가 읽기만 하고 조각이 없는 모듈도 같다 (OPS-12)', async () => {
      for (const path of ['mod/hello/g/tunables', 'mod/growth/g/tunables']) {
        await assertSucceeds(at('carol', path).get());
        await assertFails(at(undefined, path).get());
        await assertFails(at('alice', path).set({ x: 1 }));
      }
      await assertFails(at('carol', 'mod/growth/g/other').get());
    });
  });
});
