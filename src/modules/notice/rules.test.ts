// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import fragment from './rules';

const built = buildRules({ notice: fragment });

describe('notice 규칙 조각', () => {
  it('namespace 검사를 통과한다', () => {
    expect(built.rules.mod).toBeDefined();
  });
});

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('notice 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const at = (uid: string | undefined, path: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database().ref(path);
  const post = { tag: 'notice', title: '안녕', body: '', at: 1, v: 1 };

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-isshoni-notice', database: { host, port: Number(port), rules: JSON.stringify(built) } });
  });
  afterAll(() => env?.cleanup());
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref('mod/notice').set({ g: { posts: { p1: post }, shout: { text: '힘내', at: 1, sec: 60, v: 1 } }, u: { alice: { mail: { m1: { ...post, tag: 'letter' } } } } }),
    );
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob')));
  });

  it('전체 글과 확성기는 로그인한 사용자가 읽기만 한다', async () => {
    await assertSucceeds(at('bob', 'mod/notice/g/posts').get());
    await assertSucceeds(at('bob', 'mod/notice/g/shout').get());
    await assertFails(at(undefined, 'mod/notice/g/posts').get());
    await assertFails(at('bob', 'mod/notice/g/posts/p2').set(post));
    await assertFails(at('bob', 'mod/notice/g/shout').set({ text: 'x', at: 1, sec: 60, v: 1 }));
  });

  it('개인 우편은 본인만 읽고 아무도 쓰지 못한다', async () => {
    await assertSucceeds(at('alice', 'mod/notice/u/alice/mail').get());
    await assertFails(at('bob', 'mod/notice/u/alice/mail').get());
    await assertFails(at('alice', 'mod/notice/u/alice/mail/m2').set(post));
    await assertFails(at('alice', 'mod/notice/u/alice/mail/m1').remove());
  });
});
