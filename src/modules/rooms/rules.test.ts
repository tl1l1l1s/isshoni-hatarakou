import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROOM_CAP_MAX, ROOM_CAP_MIN } from '@shared/constants';
import { buildRules } from '../../../rules/build.ts';
import { templates, type RuleNode } from '../../../rules/core.ts';
import fragment from './rules';

describe('rooms 규칙 조각', () => {
  it('namespace 검사를 통과하고 mod/rooms 아래에 들어간다', () => {
    const { rules } = buildRules({ rooms: fragment });
    expect((rules.mod as RuleNode).rooms).toBeDefined();
  });

  it('정원은 ROOM_CAP_MIN부터 ROOM_CAP_MAX까지 정수만 받는다', () => {
    const rule = ((fragment(templates).r as RuleNode).$room as RuleNode).cfg as RuleNode;
    // ponytail: 이 식은 JS와 문법이 같아서 JS로 계산해 본다. 실제 규칙 엔진 확인은 아래 에뮬레이터 시험
    const ok = (v: unknown) => new Function('newData', `return ${(rule.cap as RuleNode)['.validate'] as string}`)({ isNumber: () => typeof v === 'number', val: () => v }) as boolean;
    expect([ROOM_CAP_MIN, 4, ROOM_CAP_MAX].map(ok)).toEqual([true, true, true]);
    expect([ROOM_CAP_MIN - 1, ROOM_CAP_MAX + 1, 2.5, '3'].map(ok)).toEqual([false, false, false, false]);
  });
});

// 에뮬레이터가 있을 때만: npx firebase emulators:exec --only database "npx vitest run src/modules/rooms/rules.test.ts"
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('rooms 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const cfg = (uid: string, room = 'ROOM22') => env.authenticatedContext(uid).database().ref(`mod/rooms/r/${room}/cfg`);

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-isshoni-rooms',
      database: { host, port: Number(port), rules: JSON.stringify(buildRules({ rooms: fragment })) },
    });
  });
  afterAll(() => env?.cleanup());
  // alice가 주인, bob은 멤버, carol은 방 밖. GONE22는 지운 방
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref().set({
        rooms: {
          ROOM22: { meta: { kind: 'work', owner: 'alice', createdAt: 1 }, roster: { alice: 1, bob: 1 } },
          GONE22: { meta: { kind: 'work', owner: 'alice', createdAt: 1, deletedAt: 2 }, roster: { alice: 1 } },
        },
      }),
    );
  });

  it('주인만 정원을 쓰고 2부터 10까지 정수만 받는다', async () => {
    await assertSucceeds(cfg('alice').set({ cap: 3, v: 1 }));
    await assertFails(cfg('bob').set({ cap: 4, v: 1 }));
    await assertFails(cfg('alice').set({ cap: 11, v: 1 }));
    await assertFails(cfg('alice').set({ cap: 2.5, v: 1 }));
    await assertFails(cfg('alice').set({ cap: 3 }));
  });

  it('roster에 있는 사람만 읽는다', async () => {
    await assertSucceeds(cfg('bob').get());
    await assertFails(cfg('carol').get());
  });

  it('지운 방에는 쓰지 못한다', async () => {
    await assertFails(cfg('alice', 'GONE22').set({ cap: 3, v: 1 }));
  });
});
