// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import type { RuleNode } from '../../../rules/core.ts';
import fragment from './rules';

const built = buildRules({ account: fragment });

describe('account 규칙 조각', () => {
  it('프로필 사진은 친구가 읽는다', () => {
    const photo = ((((built.rules.mod as RuleNode).account as RuleNode).u as RuleNode).$uid as RuleNode).photo as RuleNode;
    expect(photo['.read']).toContain("root.child('mod/friends/u/'");
  });
});

describe.skipIf(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)('account 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  // alice의 친구는 bob이고 carol은 친구가 아니다
  const ref = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(`mod/account/u/alice/${path}`);
  const hash = 'a'.repeat(64);

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = process.env.FIREBASE_DATABASE_EMULATOR_HOST!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-account-rules', database: { host, port: Number(port), rules: JSON.stringify(built) } });
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob', 'carol')));
    await env.withSecurityRulesDisabled((c) => c.database().ref('mod/friends/u/alice/list').set({ bob: { since: 1, v: 1 } }));
  });
  afterAll(() => env?.cleanup());

  it('사진 해시는 본인만 쓰고 본인과 친구만 읽는다', async () => {
    await assertSucceeds(ref('alice', 'photo').set(hash));
    await assertSucceeds(ref('alice', 'photo').get());
    await assertSucceeds(ref('bob', 'photo').get());
    await assertFails(ref('carol', 'photo').get());
    await assertFails(ref('bob', 'photo').set(hash));
    await assertFails(ref('alice', 'photo').set('not-a-hash'));
    await assertFails(ref('alice', 'other').set(hash));
    await assertSucceeds(ref('alice', 'photo').remove());
  });
});
