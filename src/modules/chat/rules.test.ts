import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH } from '@shared/constants';
import { buildRules } from '../../../rules/build.ts';
import type { RuleNode } from '../../../rules/core.ts';
import { MSG_MAX, msgKey } from './logic';
import fragment from './rules';

const built = buildRules({ chat: fragment });

describe('chat 규칙 조각', () => {
  it('namespace 검사를 통과하고 mod/chat 아래에 들어간다', () => {
    const chat = (built.rules.mod as RuleNode).chat as RuleNode;
    expect(Object.keys((chat.r as RuleNode).$room as RuleNode)).toEqual(['msgs', 'cfg']);
  });

  it('규칙의 숫자가 상수와 같다', () => {
    const json = JSON.stringify(built);
    expect(json).toContain(`newData.val().length <= ${NAME_MAX_LENGTH}`);
    expect(json).toContain(`newData.val().length <= ${MSG_MAX}`);
  });
});

// 에뮬레이터가 있을 때만: npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/chat/rules.test.ts"
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('chat 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const NOW = { '.sv': 'timestamp' };
  const ref = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(`mod/chat/r/ROOM22/${path}`);
  const msg = (uid: string, over: Record<string, unknown> = {}) => ({ uid, name: uid, text: '안녕', at: NOW, v: 1, ...over });
  const key = (uid: string, t = 1) => `msgs/${msgKey(t, uid)}`;

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-isshoni-chat', database: { host, port: Number(port), rules: JSON.stringify(built) } });
  });
  afterAll(() => env?.cleanup());
  // alice가 주인, bob은 멤버, carol은 방 밖
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref().set({ rooms: { ROOM22: { meta: { kind: 'work', owner: 'alice', createdAt: 1 }, roster: { alice: 1, bob: 1 } } } }),
    );
  });

  it('멤버는 자기 uid로 서버 시각 메시지를 만들기만 한다', async () => {
    await assertSucceeds(ref('bob', key('bob')).set(msg('bob')));
    await assertFails(ref('bob', key('bob')).set(msg('bob', { text: '고침' })));
    await assertFails(ref('bob', key('bob')).remove());
    await assertFails(ref('bob', key('bob', 2)).set(msg('alice')));
    await assertFails(ref('bob', key('alice', 2)).set(msg('bob')));
    await assertFails(ref('bob', key('bob', 3)).set(msg('bob', { at: 1 })));
    await assertFails(ref('bob', key('bob', 4)).set(msg('bob', { extra: 1 })));
    await assertFails(ref('carol', key('carol')).set(msg('carol')));
  });

  it('키는 15자리 시각으로 시작하고 서버 시각보다 1분 넘게 앞서지 못한다 (M19)', async () => {
    await assertSucceeds(ref('bob', key('bob', Date.now())).set(msg('bob')));
    await assertSucceeds(ref('bob', key('bob', Date.now() + 30_000)).set(msg('bob')));
    await assertFails(ref('bob', key('bob', Date.now() + 10 * 60_000)).set(msg('bob')));
    await assertFails(ref('bob', 'msgs/999999999999999_bob').set(msg('bob')));
    await assertFails(ref('bob', 'msgs/x_bob').set(msg('bob')));
    await assertFails(ref('bob', 'msgs/12_bob').set(msg('bob')));
  });

  it('글은 1자부터 MSG_MAX자까지', async () => {
    await assertSucceeds(ref('bob', key('bob')).set(msg('bob', { text: 'a'.repeat(MSG_MAX) })));
    await assertFails(ref('bob', key('bob', 2)).set(msg('bob', { text: 'a'.repeat(MSG_MAX + 1) })));
    await assertFails(ref('bob', key('bob', 3)).set(msg('bob', { text: '' })));
  });

  it('roster에 있는 사람만 읽는다', async () => {
    await assertSucceeds(ref('bob', 'msgs').get());
    await assertFails(ref('carol', 'msgs').get());
  });

  it('채팅 설정은 주인만 쓰고 꺼지면 메시지를 받지 않는다', async () => {
    await assertFails(ref('bob', 'cfg').set({ on: false, v: 1 }));
    await assertFails(ref('alice', 'cfg').set({ on: 'no', v: 1 }));
    await assertSucceeds(ref('alice', 'cfg').set({ on: false, v: 1 }));
    await assertFails(ref('bob', key('bob')).set(msg('bob')));
    await assertSucceeds(ref('alice', 'cfg/on').set(true));
    await assertSucceeds(ref('bob', key('bob')).set(msg('bob')));
  });

  it('주인만 메시지 전체를 지운다', async () => {
    await assertSucceeds(ref('bob', key('bob')).set(msg('bob')));
    await assertFails(ref('bob', 'msgs').remove());
    await assertSucceeds(ref('alice', 'msgs').remove());
  });
});
