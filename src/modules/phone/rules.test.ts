// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import type { RuleNode } from '../../../rules/core.ts';
import { issued } from '../../../rules/tests/issued.ts';
import { APP_NAME_MAX } from './logic';
import fragment from './rules';

const built = buildRules({ phone: fragment });

describe('phone 규칙 조각', () => {
  it('namespace 검사를 통과하고 신호는 경로의 키와 PC 실행 중 표시를 본다', () => {
    const user = (((built.rules.mod as RuleNode).phone as RuleNode).u as RuleNode).$uid as RuleNode;
    const sig = (user.sig as RuleNode).$key as RuleNode;
    expect(sig['.write'] as string).toContain("$key === root.child('mod/phone/u/' + $uid + '/key').val()");
    expect(JSON.stringify(sig)).toContain(`newData.val().length <= ${APP_NAME_MAX}`);
  });
});

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('phone 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const KEY = '0123456789abcdef0123456789abcdef';
  const TS = { '.sv': 'timestamp' };
  const phone = (path = `mod/phone/u/alice/sig/${KEY}`) => env.unauthenticatedContext().database().ref(path);
  const sig = (p: Record<string, unknown> = {}) => ({ open: true, app: 'Procreate', at: TS, ...p });

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-isshoni-phone', database: { host, port: Number(port), rules: JSON.stringify(built) } });
  });
  afterAll(() => env?.cleanup());
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref().update(issued('alice', 'bob')));
    const alice = env.authenticatedContext('alice').database();
    await alice.ref('mod/phone/u/alice/key').set(KEY);
    await alice.ref('users/alice/presence').set({ online: true, lastSeen: 1 });
  });

  it('PC가 켜져 있고 경로의 키가 맞으면 로그인하지 않은 폰이 신호를 쓴다', async () => {
    await assertSucceeds(phone().set(sig()));
    await assertSucceeds(phone().set(sig({ open: false })));
    await assertSucceeds(phone().set({ open: true, at: TS }));
    await assertSucceeds(phone().update({ open: false, at: TS }));
    await assertSucceeds(phone().set(sig({ app: '가'.repeat(APP_NAME_MAX) })));
  });

  it('키가 틀리거나 PC가 꺼져 있거나 형식이 틀리면 거부한다', async () => {
    await assertFails(phone(`mod/phone/u/alice/sig/${'f'.repeat(32)}`).set(sig()));
    await assertFails(phone().set(sig({ at: 1 })));
    await assertFails(phone().set(sig({ app: 'x'.repeat(APP_NAME_MAX + 1) })));
    await assertFails(phone().set(sig({ extra: 1 })));
    await assertFails(phone().set({ at: TS }));
    await env.authenticatedContext('alice').database().ref('users/alice/presence/online').set(false);
    await assertFails(phone().set(sig()));
  });

  it('키 없이는 이미 있는 신호의 하위 칸을 쓰지 못하고 키가 있어도 서버 시각을 함께 쓴다 (R2)', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('mod/phone/u/alice/sig').set({ h: KEY, open: false, at: 1, [KEY]: { open: false, at: 1 } }));
    await assertFails(phone('mod/phone/u/alice/sig/open').set(true));
    await assertFails(phone('mod/phone/u/alice/sig/at').set(TS));
    await assertFails(phone(`mod/phone/u/alice/sig/${KEY}/open`).set(true));
    await assertFails(phone('mod/phone/u/alice/sig').update({ [`${KEY}/open`]: true }));
    await assertFails(phone().remove());
  });

  it('폰은 키와 신호를 읽지 못하고 다른 칸에 쓰지 못한다', async () => {
    await assertFails(phone('mod/phone/u/alice/key').get());
    await assertFails(phone().get());
    await assertFails(phone('mod/phone/u/alice/sig').get());
    await assertFails(phone('mod/phone/u/alice/key').set('f'.repeat(32)));
    await assertFails(phone(`mod/phone/u/alice/other/${KEY}`).set(sig()));
    await assertFails(env.authenticatedContext('bob').database().ref('mod/phone/u/alice/key').get());
  });

  it('본인은 신호를 읽고 연결 끊기로 키와 신호를 지운다', async () => {
    await assertSucceeds(phone().set(sig()));
    const alice = env.authenticatedContext('alice').database();
    await assertSucceeds(alice.ref('mod/phone/u/alice/sig').get());
    await assertSucceeds(alice.ref('mod/phone/u/alice/sig').remove());
    await assertSucceeds(alice.ref('mod/phone/u/alice/key').remove());
    await assertFails(alice.ref('mod/phone/u/alice/key').set('short'));
  });
});
