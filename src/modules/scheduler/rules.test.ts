// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import fragment from './rules';
import { MEMO_MAX, TITLE_MAX } from './logic';

const built = buildRules({ scheduler: fragment });

describe('scheduler 규칙 조각', () => {
  it('규칙의 수치가 logic.ts와 같다', () => {
    const json = JSON.stringify(built);
    expect(json).toContain(`length <= ${TITLE_MAX}`);
    expect(json).toContain(`length <= ${MEMO_MAX}`);
  });
});

describe.skipIf(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)('scheduler 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  // alice의 친구는 bob이고 carol은 친구가 아니다
  const ref = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(`mod/scheduler/u/alice/${path}`);
  const plan = { date: '2026-10-09', title: '마감', memo: '원고', pub: true, v: 1 };
  const id = '2026-10-09_k1';

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = process.env.FIREBASE_DATABASE_EMULATOR_HOST!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-scheduler-rules', database: { host, port: Number(port), rules: JSON.stringify(built) } });
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob', 'carol')));
    await env.withSecurityRulesDisabled((c) => c.database().ref('mod/friends/u/alice/list').set({ bob: true }));
  });
  afterAll(() => env?.cleanup());

  it('공개와 비공개를 한 번에 쓰고 친구는 pub만 읽는다', async () => {
    await assertSucceeds(ref('alice', '').update({ [`ev/${id}`]: plan, [`pub/${id}`]: plan, 'ev/2026-10-10_k2': { ...plan, date: '2026-10-10', pub: false } }));
    await assertSucceeds(ref('alice', 'ev').get());
    await assertSucceeds(ref('bob', 'pub').get());
    await assertFails(ref('bob', 'ev').get());
    await assertFails(ref('carol', 'pub').get());
    // 친구 일정 구독 전 권한 확인은 첫 항목 하나만 읽는다
    await assertSucceeds(ref('bob', 'pub').orderByKey().limitToFirst(1).get());
    await assertFails(ref('carol', 'pub').orderByKey().limitToFirst(1).get());
    await assertFails(ref('bob', `pub/${id}`).set(plan));
  });

  it('정한 모양과 날짜로 시작하는 키만 받는다', async () => {
    await assertFails(ref('alice', 'ev/k3').set(plan));
    await assertFails(ref('alice', `ev/${id}`).set({ ...plan, title: '' }));
    await assertFails(ref('alice', `ev/${id}`).set({ ...plan, title: 'x'.repeat(TITLE_MAX + 1) }));
    await assertFails(ref('alice', `ev/${id}`).set({ ...plan, memo: 'x'.repeat(MEMO_MAX + 1) }));
    await assertFails(ref('alice', `ev/${id}`).set({ ...plan, extra: 1 }));
    await assertFails(ref('alice', 'other').set(1));
  });
});
