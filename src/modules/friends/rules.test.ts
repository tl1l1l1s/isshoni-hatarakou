import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CODE_ALPHABET, NAME_MAX_LENGTH, ROOM_CODE_LENGTH } from '@shared/constants';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import { templates, type RuleNode } from '../../../rules/core.ts';
import fragment from './rules';

const node = (...path: string[]) => path.reduce((n, k) => n[k] as RuleNode, fragment(templates));
const rule = (n: RuleNode) => n['.validate'] as string;

describe('friends 규칙 조각', () => {
  it('namespace 검사를 통과하고 mod/friends 아래에 들어간다', () => {
    const { rules } = buildRules({ friends: fragment });
    expect((rules.mod as RuleNode).friends).toBeDefined();
  });

  it('IS_FRIEND가 읽는 list/{친구 uid} 자리가 있다', () => {
    expect(node('u', '$uid', 'list', '$friend')).toBeDefined();
  });

  it('이름 길이와 방 코드 식이 shared 상수와 맞다', () => {
    const inv = node('u', '$uid', 'in', '$sender', 'inv');
    // ponytail: 이 식은 JS와 문법이 같아서 JS로 계산해 본다. 실제 규칙 엔진 확인은 아래 에뮬레이터 시험
    const name = (s: string) => new Function('newData', `return ${rule(inv.name as RuleNode)}`)({ isString: () => true, val: () => s }) as boolean;
    expect([name('가'.repeat(NAME_MAX_LENGTH)), name('가'.repeat(NAME_MAX_LENGTH + 1))]).toEqual([true, false]);
    const re = new Function(`return ${/matches\((.+)\)$/.exec(rule(inv.room as RuleNode))![1]!}`)() as RegExp;
    const all = CODE_ALPHABET.repeat(ROOM_CODE_LENGTH);
    for (let i = 0; i < CODE_ALPHABET.length; i++) expect(re.test(all.slice(i, i + ROOM_CODE_LENGTH))).toBe(true);
    expect(['ABCDE', 'ABCDEFG', 'ABCDEI', 'ABCDE0', 'ABCDE1', 'ABCDEO', 'abcdef'].map((c) => re.test(c))).toEqual(Array(7).fill(false));
  });
});

// 에뮬레이터가 있을 때만: npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/friends/rules.test.ts"
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('friends 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const db = (uid: string) => env.authenticatedContext(uid).database();
  const at = (uid: string, path: string) => db(uid).ref(`mod/friends/u/${path}`);
  const req = { name: '앨리스', at: 1 };
  const inv = { room: '7Q2K9M', name: '밥', at: 1 };

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-isshoni-friends',
      database: { host, port: Number(port), rules: JSON.stringify(buildRules({ friends: fragment })) },
    });
  });
  afterAll(() => env?.cleanup());
  // alice가 bob에게 신청해 둔 상태. carol은 남
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref().set({
        mod: { friends: { u: { bob: { in: { alice: { req } } } } } },
        users: { bob: { presence: { online: true, lastSeen: 1, m: { rooms: { code: 'ROOM22' } } } } },
      }),
    );
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob', 'carol')));
  });

  it('보낸 사람만 자기 칸에 쓰고 남의 칸에는 쓰지 못한다', async () => {
    await assertSucceeds(at('alice', 'bob/in/alice/req').set({ name: '앨리스', at: 2 }));
    await assertFails(at('carol', 'bob/in/alice/req').set({ name: '캐럴', at: 2 }));
    await assertSucceeds(at('carol', 'bob/in/carol/req').set({ name: '캐럴', at: 2 }));
    await assertFails(at('carol', 'bob/in/carol').set({ req: { name: '캐럴', at: 2 }, x: 1 }));
    await assertFails(at('carol', 'bob/in/carol/req').set({ name: '가'.repeat(21), at: 2 }));
  });

  it('받은 사람은 모두 읽고 칸이나 항목을 지우되 고치지 못한다. 보낸 사람은 자기 칸만 읽는다', async () => {
    await assertSucceeds(at('bob', 'bob/in').get());
    await assertFails(at('carol', 'bob/in').get());
    await assertFails(at('alice', 'bob/in').get());
    await assertSucceeds(at('alice', 'bob/in/alice/req').get());
    await assertFails(at('bob', 'bob/in/alice/req').set({ name: '바꿈', at: 3 }));
    await assertSucceeds(at('bob', 'bob/in/alice/req').remove());
    await assertSucceeds(at('bob', 'bob/in/alice').remove());
  });

  it('신청한 사람은 자기 신청을 지운다', async () => {
    await assertFails(at('carol', 'bob/in/alice/req').remove());
    await assertSucceeds(at('alice', 'bob/in/alice/req').remove());
  });

  it('친구 목록은 본인만 읽고 쓰고 나 자신은 넣지 못한다', async () => {
    await assertSucceeds(at('bob', 'bob/list/alice').set({ since: 1, v: 1 }));
    await assertFails(at('bob', 'bob/list/bob').set({ since: 1, v: 1 }));
    await assertFails(at('bob', 'bob/list/carol').set({ since: 1 }));
    await assertFails(at('alice', 'bob/list').get());
    await assertFails(at('alice', 'bob/list/alice').set({ since: 1, v: 1 }));
    await assertSucceeds(at('bob', 'bob/list/alice').remove());
  });

  it('초대는 받는 사람 목록에 든 사람만 보내고 받은 사람은 초대만 지운다', async () => {
    await assertFails(at('alice', 'bob/in/alice/inv').set(inv));
    await assertSucceeds(at('bob', 'bob/list/alice').set({ since: 1, v: 1 }));
    await assertFails(at('alice', 'bob/in/alice/inv').set({ ...inv, room: 'ROOM2' }));
    await assertSucceeds(at('alice', 'bob/in/alice/inv').set(inv));
    await assertSucceeds(at('bob', 'bob/in/alice/inv').remove());
    expect((await at('bob', 'bob/in/alice').get()).val()).toEqual({ req });
  });

  it('목록에 든 친구만 접속 상태의 방 코드를 읽는다 (core IS_FRIEND)', async () => {
    await assertFails(db('alice').ref('users/bob/presence/m').get());
    await assertSucceeds(at('bob', 'bob/list/alice').set({ since: 1, v: 1 }));
    await assertSucceeds(db('alice').ref('users/bob/presence/m').get());
    await assertFails(db('carol').ref('users/bob/presence/m').get());
  });
});
