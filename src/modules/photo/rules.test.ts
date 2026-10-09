import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dayIndex } from '@shared/time';
import { buildRules } from '../../../rules/build.ts';
import type { RuleNode } from '../../../rules/core.ts';
import { issued } from '../../../rules/tests/issued.ts';
import { DAILY_CAP_MAX, SLOT_STALE_MS } from './logic';
import fragment from './rules';

const built = buildRules({ photo: fragment });

describe('photo 규칙 조각', () => {
  it('namespace 검사를 통과하고 숫자가 logic.ts 상수와 같다', () => {
    expect(Object.keys((built.rules.mod as RuleNode).photo as RuleNode)).toEqual(['r', 'g']);
    const json = JSON.stringify(built);
    expect(json).toContain(`> ${SLOT_STALE_MS}`);
    expect(json).toContain(`<= ${DAILY_CAP_MAX}`);
  });
});

// 에뮬레이터가 있을 때만: npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/photo/rules.test.ts"
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('photo 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const ref = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(`mod/photo/${path}`);
  const r = (uid: string, path = '') => ref(uid, path ? `r/ROOM22/${path}` : 'r/ROOM22');
  const cfg = { o: 'wide', n: 4, bg: '#ffd9e4', fl: 'none', fr: 'heart', own: '', t0: 0 };
  const pose = { x: 3, f: 1, z: 2, j: 0 };
  const shot = { ...cfg, t0: 5, ppl: [{ l: '', x: 0, f: 0, z: 0, y: 0 }] };

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-isshoni-photo', database: { host, port: Number(port), rules: JSON.stringify(built) } });
  });
  afterAll(() => env?.cleanup());
  // alice가 방 주인, bob과 carol은 멤버, eve는 방 밖. bob이 1번 자리, carol이 2번 자리
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref().set({
        rooms: { ROOM22: { meta: { kind: 'work', owner: 'alice', createdAt: 1 }, roster: { alice: 1, bob: 1, carol: 1 } } },
        mod: { photo: { r: { ROOM22: { slots: { 1: { uid: 'bob', at: Date.now() }, 2: { uid: 'carol', at: Date.now() } }, cfg } } } },
      }),
    );
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref().update(issued('alice', 'bob', 'carol', 'eve')));
  });

  it('자리는 빈자리나 내 자리만 내 uid로 잡고 남의 자리는 15분이 지나야 덮는다', async () => {
    // 앞날 시각으로는 잡지 못하고 내 자리 시각은 고친다
    await assertFails(r('carol', 'slots/0').set({ uid: 'carol', at: 9e15 }));
    await assertSucceeds(r('bob', 'slots/1/at').set(Date.now()));
    await assertFails(r('carol', 'slots/1/at').set(Date.now()));
    await assertSucceeds(r('carol', 'slots/0').set({ uid: 'carol', at: 1 }));
    await assertFails(r('carol', 'slots/3').set({ uid: 'bob', at: 1 }));
    await assertFails(r('carol', 'slots/1').set({ uid: 'carol', at: 1 }));
    await assertFails(r('carol', 'slots/1').remove());
    await assertFails(r('eve', 'slots/3').set({ uid: 'eve', at: 1 }));
    await assertFails(r('carol', 'slots/4').set({ uid: 'carol', at: 1 }));
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('mod/photo/r/ROOM22/slots/1/at').set(Date.now() - SLOT_STALE_MS - 1000));
    await assertSucceeds(r('carol', 'slots/1').set({ uid: 'carol', at: 1 }));
    await assertSucceeds(r('bob', 'slots/3').set({ uid: 'bob', at: 1 }));
    await assertSucceeds(r('bob', 'slots/3').remove());
  });

  it('지운 방에서는 자리를 잡지 못한다', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('rooms/ROOM22/meta/deletedAt').set(1));
    await assertFails(r('carol', 'slots/0').set({ uid: 'carol', at: Date.now() }));
  });

  it('자세는 그 자리 주인만 쓰고 범위를 지킨다', async () => {
    await assertSucceeds(r('bob', 'p/1').set(pose));
    await assertFails(r('carol', 'p/1').set(pose));
    await assertFails(r('bob', 'p/1').set({ ...pose, x: 11 }));
    await assertFails(r('bob', 'p/1').set({ ...pose, z: 1.5 }));
    // 자리가 비면 누구나 지운다
    await assertFails(r('carol', 'p/1').remove());
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('mod/photo/r/ROOM22/slots/1').remove());
    await assertSucceeds(r('carol', 'p/1').remove());
  });

  it('설정과 컷은 진행자(가장 작은 번호의 자리)만 쓰고 컷은 한 번만 만든다', async () => {
    await assertSucceeds(r('bob', 'cfg/t0').set(5));
    await assertFails(r('carol', 'cfg/t0').set(5));
    await assertFails(r('bob', 'cfg/bg').set('red'));
    await assertSucceeds(r('bob', 'shots/0').set(shot));
    await assertFails(r('bob', 'shots/0').set({ ...shot, bg: '#ffffff' }));
    await assertFails(r('carol', 'shots/1').set(shot));
    await assertFails(r('bob', 'shots/1').set({ ...shot, ppl: [{ l: 'x', x: 0, f: 0, z: 0, y: 0 }] }));
    // 새 촬영은 설정과 컷 지우기를 한 번에 쓴다
    await assertSucceeds(r('bob').update({ 'cfg/t0': 9, shots: null }));
    await assertFails(r('carol').update({ shots: null }));
    // bob이 자리를 놓으면 carol이 진행자가 된다
    await assertSucceeds(r('bob').update({ 'slots/1': null, 'p/1': null }));
    await assertSucceeds(r('carol', 'cfg/fl').set('mono'));
  });

  it('마지막 사람이 나가며 세션을 지우고 방 주인은 언제든 지운다', async () => {
    await assertFails(r('carol', 'cfg').remove());
    await assertFails(r('bob', 'slots').remove());
    await assertSucceeds(r('alice', 'slots').remove());
    // 자리가 모두 비면 누구나 세션을 지운다
    await assertSucceeds(r('bob').update({ cfg: null, shots: null }));
  });

  it('하루 촬영 한도는 로그인한 사용자가 오늘 날짜로 1씩만 올린다', async () => {
    const d = dayIndex(Date.now());
    await assertSucceeds(ref('bob', 'g/quota').set({ d, n: 1 }));
    await assertSucceeds(ref('eve', 'g/quota').set({ d, n: 2 }));
    await assertFails(ref('eve', 'g/quota').set({ d, n: 4 }));
    await assertFails(ref('eve', 'g/quota').set({ d: d + 1, n: 1 }));
  });
});
