// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import fragment from './rules';

const built = buildRules({ report: fragment });

describe('report 규칙 조각', () => {
  it('namespace 검사를 통과한다', () => {
    expect(built.rules.mod).toBeDefined();
  });
});

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('report 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const at = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(path);
  const TS = { '.sv': 'timestamp' };
  const report = (p: object = {}) => ({ text: '이상해요', ver: '0.1.1', at: TS, v: 1, ...p });

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-isshoni-report', database: { host, port: Number(port), rules: JSON.stringify(built) } });
  });
  afterAll(() => env?.cleanup());
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob')));
  });

  it('버그 제보는 본인이 서버 시각으로 만들기만 하고 다른 사람은 읽거나 쓰지 못한다', async () => {
    await assertSucceeds(at('alice', 'mod/report/u/alice/r/1').set(report()));
    await assertFails(at('alice', 'mod/report/u/alice/r/1').set(report({ text: '바꿈' })));
    await assertFails(at('alice', 'mod/report/u/alice/r/1').remove());
    await assertSucceeds(at('alice', 'mod/report/u/alice/r').get());
    await assertFails(at('bob', 'mod/report/u/alice/r').get());
    await assertFails(at('bob', 'mod/report/u/alice/r/2').set(report()));
    await assertFails(at('alice', 'mod/report/u/alice/r/3').set(report({ at: 1 })));
    await assertFails(at('alice', 'mod/report/u/alice/r/4').set(report({ text: '' })));
    await assertFails(at('alice', 'mod/report/u/alice/r/5').set(report({ text: 'x'.repeat(1001) })));
    await assertFails(at('alice', 'mod/report/u/alice/r/6').set(report({ extra: 1 })));
  });
});
