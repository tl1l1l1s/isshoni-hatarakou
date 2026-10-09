import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import type { RuleNode } from '../../../rules/core.ts';
import { DEFAULT_SEC_PER_TICKET, ITEM_NAME_MAX } from './logic';
import fragment from './rules';

const built = buildRules({ gacha: fragment });

describe('gacha 규칙 조각', () => {
  it('namespace 검사를 통과하고 mod/gacha 아래에 들어간다', () => {
    const gacha = (built.rules.mod as RuleNode).gacha as RuleNode;
    expect(Object.keys(gacha)).toEqual(['r', 'u', 'g']);
  });

  it('규칙의 숫자가 logic.ts 상수와 같다', () => {
    const json = JSON.stringify(built);
    expect(json).toContain(`.val() : ${DEFAULT_SEC_PER_TICKET})`);
    expect(json).toContain(`newData.val().length <= ${ITEM_NAME_MAX}`);
  });
});

// 에뮬레이터가 있을 때만: npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/gacha/rules.test.ts"
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
describe.skipIf(!HOST)('gacha 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  const H = 'a'.repeat(64);
  const db = (uid: string) => env.authenticatedContext(uid).database();
  const room = (uid: string, path: string, code = 'ROOM22') => db(uid).ref(`mod/gacha/r/${code}/${path}`);
  const rec = (uid: string, code = 'ROOM22') => db(uid).ref(`mod/gacha/u/${uid}/r/${code}`);
  const item = (by: string, st = 'on', w = 10) => ({ name: '모자', file: H, w, by, st, at: 1, v: 1 });
  const got = (n: number) => ({ n, name: '모자', file: H, at: 1 });

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = (HOST as string).split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-isshoni-gacha', database: { host, port: Number(port), rules: JSON.stringify(built) } });
  });
  afterAll(() => env?.cleanup());
  // alice가 주인, bob은 멤버, carol은 방 밖. 1회에 3600초, hat은 on, cap은 off
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref().set({
        rooms: { ROOM22: { meta: { kind: 'work', owner: 'alice', createdAt: 1 }, roster: { alice: 1, bob: 1 } } },
        mod: {
          gacha: {
            r: { ROOM22: { cfg: { adders: 'owner', secPerTicket: 3600, onRemove: 'keep', v: 1 }, items: { hat: item('alice'), cap: item('alice', 'off') } } },
            u: { bob: { r: { ROOM22: { sec: 7200, spent: 0, bonus: 0, v: 1 } } } },
          },
        },
      }),
    );
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob', 'carol')));
  });

  it('cfg는 주인만 쓰고 값 범위를 지킨다', async () => {
    await assertSucceeds(room('alice', 'cfg').set({ adders: 'members', secPerTicket: 1800, onRemove: 'revoke', v: 1 }));
    await assertFails(room('bob', 'cfg').set({ adders: 'members', secPerTicket: 1800, onRemove: 'keep', v: 1 }));
    await assertFails(room('alice', 'cfg').set({ adders: 'all', secPerTicket: 1800, onRemove: 'keep', v: 1 }));
    await assertFails(room('alice', 'cfg').set({ adders: 'owner', secPerTicket: 30, onRemove: 'keep', v: 1 }));
  });

  it('멤버는 adders가 members일 때 자기 이름으로 만들기만 한다', async () => {
    await assertFails(room('bob', 'items/b1').set(item('bob')));
    await room('alice', 'cfg/adders').set('members');
    await assertSucceeds(room('bob', 'items/b1').set(item('bob')));
    await assertFails(room('bob', 'items/b2').set(item('alice')));
    await assertFails(room('bob', 'items/b1/st').set('off'));
    await assertFails(room('bob', 'items/b1').remove());
    await assertFails(room('carol', 'items/c1').set(item('carol')));
    await assertSucceeds(room('alice', 'items/b1/st').set('off'));
  });

  it('가중치는 1부터 100까지 정수', async () => {
    await assertSucceeds(room('alice', 'items/i1').set(item('alice', 'on', 100)));
    for (const w of [0, 101, 2.5]) await assertFails(room('alice', 'items/i2').set(item('alice', 'on', w)));
  });

  it('아이템 지우기는 같은 쓰기 안에 삭제 표시가 있어야 하고 삭제 표시는 한 번만 만든다', async () => {
    await assertFails(room('alice', 'items/hat').remove());
    await assertSucceeds(db('alice').ref('mod/gacha/r/ROOM22').update({ 'items/hat': null, 'tomb/hat': { mode: 'revoke', at: 2 } }));
    await assertFails(room('alice', 'tomb/hat').set({ mode: 'keep', at: 3 }));
    await assertFails(room('alice', 'tomb/hat').remove());
    await assertFails(room('bob', 'tomb/cap').set({ mode: 'keep', at: 3 }));
    await assertSucceeds(room('bob', 'tomb/hat').get());
    await assertFails(room('carol', 'tomb/hat').get());
  });

  it('남은 횟수만큼만 spent를 올리고 got은 on인 아이템만 spent만큼 늘린다', async () => {
    await assertSucceeds(rec('bob').set({ sec: 7200, spent: 1, bonus: 0, v: 1, got: { hat: got(1) } }));
    await assertSucceeds(rec('bob').set({ sec: 7200, spent: 2, bonus: 0, v: 1, got: { hat: got(2) } }));
    // 남은 횟수보다 많이 쓰기
    await assertFails(rec('bob').set({ sec: 7200, spent: 3, bonus: 0, v: 1, got: { hat: got(3) } }));
    // 쓰지 않고 got 늘리기
    await assertFails(rec('bob').child('got/hat/n').set(3));
    await assertFails(rec('bob').set({ sec: 10800, spent: 2, bonus: 0, v: 1, got: { hat: got(3) } }));
    // 꺼 둔 아이템, 없는 아이템, 다른 그림
    await assertFails(rec('bob').set({ sec: 10800, spent: 3, bonus: 0, v: 1, got: { hat: got(2), cap: got(1) } }));
    await assertFails(rec('bob').set({ sec: 10800, spent: 3, bonus: 0, v: 1, got: { hat: got(2), nope: got(1) } }));
    await assertFails(rec('bob').set({ sec: 10800, spent: 3, bonus: 0, v: 1, got: { hat: { ...got(3), file: 'b'.repeat(64) } } }));
    // 줄이기, 남의 기록
    await assertFails(rec('bob').set({ sec: 3600, spent: 2, bonus: 0, v: 1, got: { hat: got(2) } }));
    await assertFails(db('alice').ref('mod/gacha/u/bob/r/ROOM22/sec').set(99999));
    await assertFails(db('alice').ref('mod/gacha/u/bob/r/ROOM22').get());
  });

  it('기간 한정 아이템은 서버 시각이 기간 안일 때만 뽑힌다 (GCH-04)', async () => {
    const now = Date.now();
    await room('alice', 'items/soon').set({ ...item('alice'), from: now + 86_400_000 });
    await room('alice', 'items/gone').set({ ...item('alice'), until: now - 86_400_000 });
    await room('alice', 'items/live').set({ ...item('alice'), from: now - 86_400_000, until: now + 86_400_000 });
    await assertFails(room('alice', 'items/bad').set({ ...item('alice'), from: 'tomorrow' }));
    const draw = (id: string) => rec('bob').set({ sec: 7200, spent: 1, bonus: 0, v: 1, got: { [id]: got(1) } });
    await assertFails(draw('soon'));
    await assertFails(draw('gone'));
    await assertSucceeds(draw('live'));
  });

  it('작업 초는 더하기 연산으로 처음 기록을 만든다', async () => {
    const inc = (n: number) => ({ '.sv': { increment: n } });
    await assertSucceeds(rec('carol').update({ sec: inc(60), spent: inc(0), bonus: inc(0), v: 1 }));
    await assertSucceeds(rec('carol').update({ sec: inc(60), spent: inc(0), bonus: inc(0), v: 1 }));
    expect((await rec('carol').child('sec').get()).val()).toBe(120);
  });

  it('got 지우기는 revoke 삭제 표시가 있을 때만', async () => {
    await rec('bob').set({ sec: 7200, spent: 2, bonus: 0, v: 1, got: { hat: got(2) } });
    await assertFails(rec('bob').child('got/hat').remove());
    await room('alice', 'tomb/hat').set({ mode: 'keep', at: 2 });
    await assertFails(rec('bob').child('got/hat').remove());
    await room('alice', 'tomb/_room').set({ mode: 'revoke', at: 3 });
    await assertSucceeds(rec('bob').child('got').update({ hat: null }));
  });

  it('지운 방에서는 뽑지 못하고 방을 지울 때 주인은 items를 통째로 지운다', async () => {
    await assertFails(room('alice', 'items').remove());
    await room('alice', 'tomb/_room').set({ mode: 'keep', at: 3 });
    await assertFails(rec('bob').set({ sec: 7200, spent: 1, bonus: 0, v: 1, got: { hat: got(1) } }));
    await assertFails(rec('bob').set({ sec: 7200, spent: 1, bonus: 0, v: 1 }));
    await assertFails(room('bob', 'items').remove());
    await assertSucceeds(room('alice', 'items').remove());
  });
});
