// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다:
// npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/focus/rules.test.ts"
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build';
import { issued } from '../../../rules/tests/issued.ts';
import focus from './rules';

const built = buildRules({ focus });

describe('focus 규칙 조각', () => {
  it('mod/focus/u/$uid/dev/$dev에 들어가고 누적이 줄지 않게 한다', () => {
    const dev = (built.rules as { mod: { focus: { u: { $uid: { dev: { $dev: Record<string, string> } } } } } }).mod.focus.u.$uid.dev.$dev;
    expect(dev['.write']).toContain("newData.child('total').val() >= data.child('total').val()");
  });
});

describe.skipIf(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)('focus 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const ref = (uid: string, path = 'mod/focus/u/alice/dev/pc') => env.authenticatedContext(uid).database().ref(path);
  const rec = (total: number) => ({ v: 1, total, day: '2026-10-09', today: 0 });

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = process.env.FIREBASE_DATABASE_EMULATOR_HOST!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-focus-rules', database: { host, port: Number(port), rules: JSON.stringify(built) } });
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob')));
  });
  afterAll(() => env?.cleanup());

  it('본인만 읽고 쓰며 누적을 줄이거나 지우지 못한다', async () => {
    await assertSucceeds(ref('alice').set(rec(100)));
    await assertSucceeds(ref('alice').set(rec(160)));
    await assertFails(ref('alice').set(rec(50)));
    await assertFails(ref('alice').remove());
    await assertFails(ref('alice').set({ v: 1, total: 200 }));
    await assertFails(ref('bob').set(rec(500)));
    await assertSucceeds(ref('alice', 'mod/focus/u/alice/dev').get());
    await assertFails(ref('bob', 'mod/focus/u/alice/dev').get());
  });
});
