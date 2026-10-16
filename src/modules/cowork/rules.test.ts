import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import type { RuleNode } from '../../../rules/core.ts';
import { issued } from '../../../rules/tests/issued.ts';
import { BREAK_MAX, FOCUS_MAX, FOCUS_MIN, GOAL_MAX, LEAD_MS, TITLE_MAX, WAIT_MAX_MS } from './logic';
import fragment from './rules';

const built = buildRules({ cowork: fragment });

describe('cowork 규칙 조각', () => {
  it('namespace 검사를 통과하고 숫자가 logic.ts 상수와 같다', () => {
    expect(Object.keys((built.rules.mod as RuleNode).cowork as RuleNode)).toEqual(['r', 'g']);
    const json = JSON.stringify(built);
    expect(json).toContain(`+ ${LEAD_MS} +`);
    expect(json).toContain(`+ ${WAIT_MAX_MS}`);
    expect(json).toContain(`length <= ${TITLE_MAX}`);
    expect(json).toContain(`>= ${FOCUS_MIN} && newData.val() <= ${FOCUS_MAX}`);
    expect(json).toContain(`<= ${BREAK_MAX}`);
    expect(json).toContain(`length <= ${GOAL_MAX}`);
  });
});

// 에뮬레이터가 있을 때만: npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/cowork/rules.test.ts"
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('cowork 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const r = (uid: string, path = '') => env.authenticatedContext(uid).database().ref(path ? `mod/cowork/r/ROOM22/${path}` : 'mod/cowork/r/ROOM22');
  const session = (by: string, extra: Record<string, unknown> = {}) => ({ id: `s${Date.now()}${by}`, by, title: '원고', f: 50, b: 10, st: 'wait', at: Date.now(), v: 1, ...extra });
  const seed = (cur: unknown) => env.withSecurityRulesDisabled((ctx) => ctx.database().ref('mod/cowork/r/ROOM22/cur').set(cur));

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-isshoni-cowork', database: { host, port: Number(port), rules: JSON.stringify(built) } });
  });
  afterAll(() => env?.cleanup());
  // alice가 방 주인, bob과 carol은 멤버, eve는 방 밖
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref().set({ rooms: { ROOM22: { meta: { kind: 'work', owner: 'alice', createdAt: 1 }, roster: { alice: 1, bob: 1, carol: 1 } } } }),
    );
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref().update(issued('alice', 'bob', 'carol', 'eve')));
  });

  it('방 사람만 진행 중인 세션이 없을 때 자기 이름으로 만들고 시각은 서버 시각과 1분 안이어야 한다', async () => {
    await assertFails(r('eve', 'cur').set(session('eve')));
    await assertFails(r('bob', 'cur').set(session('carol')));
    await assertFails(r('bob', 'cur').set(session('bob', { at: Date.now() - 120_000 })));
    await assertFails(r('bob', 'cur').set(session('bob', { st: 'run', go: Date.now() })));
    await assertFails(r('bob', 'cur').set(session('bob', { f: FOCUS_MAX + 1 })));
    await assertFails(r('bob', 'cur').set(session('bob', { extra: 1 })));
    await assertSucceeds(r('bob', 'cur').set(session('bob')));
    // 진행 중인 세션 위에는 아무도 새로 만들지 못한다
    await assertFails(r('carol', 'cur').set(session('carol')));
    await assertFails(r('alice', 'cur').set(session('alice')));
  });

  it('개설자만 시작하고 개설자와 방 주인만 끝내며 끝난 세션 위에는 새 id로 만든다', async () => {
    const s = session('bob');
    await seed(s);
    await assertFails(r('carol', 'cur').set({ ...s, st: 'run', go: Date.now() }));
    await assertFails(r('bob', 'cur').set({ ...s, st: 'run', go: Date.now(), f: 25 }));
    await assertSucceeds(r('bob', 'cur').set({ ...s, st: 'run', go: Date.now() }));
    const run = { ...s, st: 'run', go: Date.now() };
    await seed(run);
    await assertFails(r('bob', 'cur').set({ ...run, go: Date.now() + 1000 }));
    await assertFails(r('carol', 'cur').set({ ...run, st: 'stop' }));
    await assertFails(r('bob', 'cur').remove());
    await assertSucceeds(r('alice', 'cur').set({ ...run, st: 'stop' }));
    await seed({ ...run, st: 'stop' });
    await assertFails(r('bob', 'cur').set({ ...run, st: 'stop', title: '바꿈' }));
    await assertFails(r('carol', 'cur').set(session('carol', { id: s.id })));
    await assertSucceeds(r('carol', 'cur').set(session('carol')));
  });

  it('시간이 지나 끝난 세션은 누구나 덮어 새로 만든다', async () => {
    await seed(session('bob', { st: 'run', go: Date.now() - LEAD_MS - 60 * 60_000 - 1000 }));
    await assertSucceeds(r('carol', 'cur').set(session('carol')));
    await seed(session('bob', { at: Date.now() - WAIT_MAX_MS - 1000 }));
    await assertSucceeds(r('carol', 'cur').set(session('carol')));
  });

  it('참여 기록은 내 것만 쓰고 방을 나온 뒤에도 내 기록은 지운다. 방 밖 사람은 읽지 못한다', async () => {
    const part = { sid: 'abc', at: Date.now(), v: 1 };
    await assertSucceeds(r('bob', 'parts/bob').set({ ...part, goal: '러프 끝내기' }));
    await assertFails(r('bob', 'parts/carol').set(part));
    await assertFails(r('bob', 'parts/bob').set({ ...part, goal: 'x'.repeat(GOAL_MAX + 1) }));
    await assertFails(r('bob', 'parts/bob').set({ ...part, goal: '' }));
    await assertFails(r('bob', 'parts/bob').set({ ...part, extra: 1 }));
    await assertFails(r('eve', 'parts/eve').set(part));
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('mod/cowork/r/ROOM22/parts/eve').set(part));
    await assertSucceeds(r('eve', 'parts/eve').remove());
    await assertFails(r('eve').once('value'));
    await assertSucceeds(r('carol').once('value'));
  });

  it('방 주인은 방을 지울 때 세션과 참여 기록을 통째로 지운다', async () => {
    await seed(session('bob'));
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('mod/cowork/r/ROOM22/parts/bob').set({ sid: 'abc', at: 1, v: 1 }));
    await assertFails(r('bob', 'parts').remove());
    await assertSucceeds(r('alice', 'parts').remove());
    await assertSucceeds(r('alice', 'cur').remove());
  });
});
