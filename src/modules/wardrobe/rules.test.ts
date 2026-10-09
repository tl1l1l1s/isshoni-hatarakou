// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다:
// npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/wardrobe/rules.test.ts"
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyAppearance } from '@shared/schemas';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import type { RuleNode } from '../../../rules/core.ts';
import fragment from './rules';
import { SLOT_COUNT } from './logic';

const built = buildRules({ wardrobe: fragment });

describe('wardrobe 규칙 조각', () => {
  it('mod/wardrobe/u/$uid 아래에 본인 전용으로 들어간다', () => {
    const u = (((built.rules.mod as RuleNode).wardrobe as RuleNode).u as RuleNode).$uid as RuleNode;
    expect(u['.read']).toContain('auth.uid === $uid');
    expect(u['.write']).toContain('auth.uid === $uid');
    // 슬롯 번호 범위가 SLOT_COUNT와 맞는다
    expect(JSON.stringify(u.chars)).toContain(`[0-${SLOT_COUNT - 1}]`);
  });
});

describe.skipIf(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)('wardrobe 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const ref = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(`mod/wardrobe/u/alice/${path}`);
  const char = { appearance: emptyAppearance(), mtime: 5, v: 1 };

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = process.env.FIREBASE_DATABASE_EMULATOR_HOST!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-wardrobe-rules', database: { host, port: Number(port), rules: JSON.stringify(built) } });
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob')));
  });
  afterAll(() => env?.cleanup());

  it('본인만 읽고 쓰며 정한 모양만 받는다', async () => {
    await assertSucceeds(ref('alice', 'chars/2').set(char));
    await assertFails(ref('alice', 'chars/3').set(char));
    await assertFails(ref('alice', 'chars/0').set({ ...char, v: 2 }));
    await assertSucceeds(ref('alice', 'trash/5_2').set({ ...char, slot: 2, at: 9 }));
    await assertSucceeds(ref('alice', 'trash/5_2').remove());
    await assertSucceeds(ref('alice', 'unlock').set({ at: 9, v: 1 }));
    await assertFails(ref('alice', 'other').set(1));
    await assertFails(ref('bob', 'chars/0').set(char));
    await assertFails(ref('bob', 'chars').get());
    await assertSucceeds(ref('alice', 'chars').get());
  });
});
