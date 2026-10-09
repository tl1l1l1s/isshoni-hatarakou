// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import fragment from './rules';
import { NAME_MAX } from './logic';

const built = buildRules({ dday: fragment });

describe('dday 규칙 조각', () => {
  it('규칙의 수치가 logic.ts와 같다', () => {
    expect(JSON.stringify(built)).toContain(`length <= ${NAME_MAX}`);
  });
});

describe.skipIf(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)('dday 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  // alice의 친구는 bob이고 carol은 친구가 아니다
  const ref = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(`mod/dday/u/alice/${path}`);
  const card = { name: '마감', date: '2026-10-19', fromOne: false, color: '#112233', notify: true, pub: true, v: 1 };

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = process.env.FIREBASE_DATABASE_EMULATOR_HOST!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-dday-rules', database: { host, port: Number(port), rules: JSON.stringify(built) } });
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob', 'carol')));
    await env.withSecurityRulesDisabled((c) => c.database().ref('mod/friends/u/alice/list').set({ bob: true }));
  });
  afterAll(() => env?.cleanup());

  it('카드는 본인만 읽고 공개본은 친구도 읽으며 정한 모양만 받는다', async () => {
    await assertSucceeds(ref('alice', '').update({ 'cards/k1': card, 'pub/k1': card, 'cards/k2': { ...card, pub: false } }));
    await assertSucceeds(ref('bob', 'pub').get());
    await assertFails(ref('bob', 'cards').get());
    await assertFails(ref('carol', 'pub').get());
    await assertFails(ref('bob', 'pub/k1').set(card));
    await assertFails(ref('alice', 'cards/k3').set({ ...card, name: 'x'.repeat(NAME_MAX + 1) }));
    await assertFails(ref('alice', 'cards/k3').set({ ...card, date: '10월 19일' }));
    await assertFails(ref('alice', 'cards/k3').set({ ...card, extra: 1 }));
  });
});
