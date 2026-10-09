// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import type { RuleNode } from '../../../rules/core.ts';
import fragment from './rules';

const built = buildRules({ goals: fragment });

describe('goals 규칙 조각', () => {
  it('namespace 검사를 통과한다', () => {
    expect((built.rules.mod as RuleNode).goals).toBeDefined();
  });
});

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('goals 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const ref = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(`mod/goals/u/alice/${path}`);
  const day = (sec: number) => ({ sec, goal: 3600, v: 1 });

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-isshoni-goals', database: { host, port: Number(port), rules: JSON.stringify(built) } });
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob')));
  });
  afterAll(() => env?.cleanup());

  it('본인만 읽고 쓰며 목표는 12시간까지다', async () => {
    await assertSucceeds(ref('alice', 'cfg').set({ goal: 3600, since: '2026-10-09', v: 1 }));
    await assertFails(ref('alice', 'cfg').set({ goal: 13 * 3600, since: '2026-10-09', v: 1 }));
    await assertFails(ref('bob', 'cfg').set({ goal: 3600, since: '2026-10-09', v: 1 }));
    await assertFails(ref('bob', 'cfg').get());
    await assertFails(ref('alice', 'other').set(1));
  });

  it('하루 기록은 날짜 키에만 쓰고 sec가 줄지 않는다', async () => {
    await assertSucceeds(ref('alice', 'days/2026-10-09').set(day(600)));
    await assertSucceeds(ref('alice', 'days/2026-10-09').set(day(660)));
    await assertFails(ref('alice', 'days/2026-10-09').set(day(60)));
    await assertFails(ref('alice', 'days/today').set(day(60)));
    await assertFails(ref('alice', 'days/2026-10-10').set({ ...day(60), extra: 1 }));
  });
});
