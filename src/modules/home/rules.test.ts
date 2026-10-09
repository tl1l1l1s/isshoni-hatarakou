// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다:
// npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/home/rules.test.ts"
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH } from '@shared/constants';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import type { RuleNode } from '../../../rules/core.ts';
import fragment from './rules';
import {
  BGM_TITLE_MAX, BOOK_MAX, CLAP_EMOJI_MAX, CLAP_KEY, GIFT_KEY, GIFT_MSG_MAX, MALLANGI_MAX, MARK_TITLE_MAX, MARK_URL_MAX, POST_MAX, PROFILE_MAX, SHELF_MAX,
  SPEED_MAX, SPEED_MIN, STICKER_CAP, STICKER_W_MAX, STICKER_W_MIN,
} from './logic';

const built = buildRules({ home: fragment });
const H = 'a'.repeat(64);

describe('home 규칙 조각', () => {
  it('마이홈은 친구가 읽고 받은 기록은 친구도 읽는다', () => {
    const u = (((built.rules.mod as RuleNode).home as RuleNode).u as RuleNode).$uid as RuleNode;
    expect((u.home as RuleNode)['.read']).toContain("root.child('mod/friends/u/'");
    expect((u.in as RuleNode)['.read']).toContain("root.child('mod/friends/u/'");
    expect(((u.in as RuleNode).$sender as RuleNode)[GIFT_KEY]).toBeDefined();
    expect(((u.in as RuleNode).$sender as RuleNode)[CLAP_KEY]).toBeDefined();
    expect((u.shelfPub as RuleNode)['.read']).toContain("root.child('mod/friends/u/'");
    expect((u.shelf as RuleNode)['.read']).not.toContain('friends');
    expect((u.senders as RuleNode)['.read']).not.toContain('friends');
  });

  it('규칙의 수치가 logic.ts와 같다', () => {
    const json = JSON.stringify(built);
    for (const n of [PROFILE_MAX, POST_MAX, BOOK_MAX, GIFT_MSG_MAX, NAME_MAX_LENGTH, STICKER_W_MIN, STICKER_W_MAX, SPEED_MIN, SPEED_MAX, BGM_TITLE_MAX, CLAP_EMOJI_MAX, MARK_TITLE_MAX, MARK_URL_MAX]) {
      expect(json).toContain(`${n}`);
    }
    // 스티커와 말랑이는 0..9 키, 북마크는 0..49 키
    expect([STICKER_CAP, MALLANGI_MAX, SHELF_MAX]).toEqual([10, 10, 50]);
    expect(json).toContain('/^[0-9]$/');
    expect(json).toContain('/^([0-9]|[1-4][0-9])$/');
  });
});

describe.skipIf(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)('home 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  // alice의 친구는 bob이고 carol은 친구가 아니다
  const ref = (uid: string, path: string) => env.authenticatedContext(uid).database().ref(`mod/home/u/alice/${path}`);
  const sticker = { file: H, x: 10, y: 10, w: 100, rot: 0, z: 1, anim: 'bob', speed: 1 };
  const home = { profile: '안녕\n반가워', post: { text: '글', at: 1 }, bg: { color: '#aabbcc' }, stickers: [sticker], mallangi: [H], v: 1 };
  const entry = { name: '밥', text: '놀러 왔어', at: 5 };
  const mark = { title: '로그', url: 'https://example.com/log', color: '#3a8fd9', img: H, pub: true };
  const gift = { file: H, msg: '선물이야', name: '밥', at: 6 };

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = process.env.FIREBASE_DATABASE_EMULATOR_HOST!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-home-rules', database: { host, port: Number(port), rules: JSON.stringify(built) } });
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob', 'carol')));
    await env.withSecurityRulesDisabled((c) => c.database().ref('mod/friends/u/alice/list').set({ bob: true }));
  });
  afterAll(() => env?.cleanup());

  it('마이홈은 본인이 쓰고 본인과 친구만 읽으며 정한 모양만 받는다', async () => {
    await assertSucceeds(ref('alice', 'home').set(home));
    await assertSucceeds(ref('alice', 'home').update({ mallangi: [H, H], v: 1 }));
    await assertSucceeds(ref('alice', 'home').get());
    await assertSucceeds(ref('bob', 'home').get());
    await assertFails(ref('carol', 'home').get());
    await assertFails(ref('bob', 'home').set(home));
    await assertFails(ref('alice', 'home').set({ ...home, profile: 'x'.repeat(PROFILE_MAX + 1) }));
    await assertFails(ref('alice', 'home').set({ ...home, bg: { url: 'http://x' } }));
    await assertFails(ref('alice', 'home').set({ ...home, stickers: Array(STICKER_CAP + 1).fill(sticker) }));
    await assertFails(ref('alice', 'home').set({ ...home, stickers: [{ ...sticker, anim: 'jump' }] }));
    await assertFails(ref('alice', 'home').set({ ...home, mallangi: Array(MALLANGI_MAX + 1).fill(H) }));
    await assertFails(ref('alice', 'home').set({ ...home, extra: 1 }));
    await assertFails(ref('alice', 'other').set(1));
  });

  it('배경음악, 마이홈 색, 창 바탕, 박수 이모지는 정한 모양만 받는다 (HOM-04, HOM-07, HOM-15)', async () => {
    const extra = { bgm: { v: 'dQw4w9WgXcQ', title: '노래' }, accent: '#e0559a', wall: H, clap: '🎉✨' };
    await assertSucceeds(ref('alice', 'home').set({ ...home, ...extra }));
    await assertFails(ref('alice', 'home').set({ ...home, ...extra, bgm: { v: 'bad id', title: '' } }));
    await assertFails(ref('alice', 'home').set({ ...home, ...extra, accent: 'red' }));
    await assertFails(ref('alice', 'home').set({ ...home, ...extra, clap: 'x'.repeat(CLAP_EMOJI_MAX + 1) }));
  });

  it('북마크는 주인만 읽고 공개본은 친구도 읽는다 (HOM-11)', async () => {
    await assertSucceeds(ref('alice', '').update({ shelf: [mark, { ...mark, pub: false }], shelfPub: [mark] }));
    await assertSucceeds(ref('bob', 'shelfPub').get());
    await assertFails(ref('bob', 'shelf').get());
    await assertFails(ref('carol', 'shelfPub').get());
    await assertFails(ref('bob', 'shelfPub').set([mark]));
    await assertFails(ref('alice', 'shelf').set([{ ...mark, url: 'javascript:alert(1)' }]));
    await assertFails(ref('alice', 'shelf').set([{ ...mark, title: 'x'.repeat(MARK_TITLE_MAX + 1) }]));
    await assertFails(ref('alice', 'shelf').set([{ ...mark, url: `https://${'x'.repeat(MARK_URL_MAX)}` }]));
    await assertFails(ref('alice', 'shelf').set(Array(SHELF_MAX + 1).fill(mark)));
    await assertSucceeds(ref('alice', 'shelf').set(Array(SHELF_MAX).fill(mark)));
  });

  it('박수는 친구가 자기 칸에서 1씩 올리기만 한다 (HOM-15)', async () => {
    await assertSucceeds(ref('bob', `in/bob/${CLAP_KEY}`).set(1));
    await assertSucceeds(ref('bob', `in/bob/${CLAP_KEY}`).set(2));
    await assertFails(ref('bob', `in/bob/${CLAP_KEY}`).set(10));
    await assertFails(ref('bob', `in/bob/${CLAP_KEY}`).set(1));
    await assertFails(ref('carol', `in/carol/${CLAP_KEY}`).set(1));
    await assertFails(ref('bob', `in/carol/${CLAP_KEY}`).set(1));
  });

  it('방명록은 친구만 쓰고 친구가 읽으며 주인만 하나씩 지운다', async () => {
    await assertSucceeds(ref('bob', 'in/bob/k1').set(entry));
    await assertFails(ref('carol', 'in/carol/k1').set(entry));
    await assertFails(ref('bob', 'in/carol/k2').set(entry));
    await assertFails(ref('bob', 'in/bob/k2').set({ ...entry, text: '' }));
    await assertFails(ref('bob', 'in/bob/k2').set({ ...entry, text: 'x'.repeat(BOOK_MAX + 1) }));
    await assertSucceeds(ref('bob', 'in').get());
    await assertFails(ref('carol', 'in').get());
    await assertFails(ref('alice', 'in/bob/k1').update({ text: '고침' }));
    await assertSucceeds(ref('alice', 'in/bob/k1').remove());
  });

  it('말랑이 선물은 친구가 보내고 주인이 하나씩 지운다', async () => {
    await assertSucceeds(ref('bob', `in/bob/${GIFT_KEY}/g1`).set(gift));
    await assertFails(ref('bob', `in/bob/${GIFT_KEY}/g2`).set({ ...gift, msg: 'x'.repeat(GIFT_MSG_MAX + 1) }));
    await assertFails(ref('carol', `in/carol/${GIFT_KEY}/g1`).set(gift));
    await assertFails(ref('alice', `in/bob/${GIFT_KEY}/g1`).update({ msg: '고침' }));
    await assertSucceeds(ref('alice', `in/bob/${GIFT_KEY}/g1`).remove());
  });

  it('보낸 사람 색인은 주인만 읽고 쓰며 true만 받는다', async () => {
    await assertSucceeds(ref('alice', 'senders').update({ bob: true, carol: true }));
    await assertSucceeds(ref('alice', 'senders').get());
    await assertFails(ref('bob', 'senders').get());
    await assertFails(ref('bob', 'senders/bob').set(true));
    await assertFails(ref('alice', 'senders/bob').set(1));
  });

  it('보낸 사람 칸마다 최근 몇 개만 읽는 질의를 주인과 친구가 쓰고 보낸 사람은 자기 선물만 센다 (HOM-09, HOM-14)', async () => {
    await assertSucceeds(ref('bob', 'in/bob/1700000000001').set(entry));
    await assertSucceeds(ref('bob', `in/bob/${GIFT_KEY}/1700000000002`).set(gift));
    const last = (uid: string) => ref(uid, 'in/bob').orderByKey().limitToLast(32).get();
    const keys = Object.keys(((await assertSucceeds(last('alice'))) as { val(): Record<string, unknown> }).val());
    expect(keys).toEqual(expect.arrayContaining(['1700000000001', GIFT_KEY]));
    await assertSucceeds(last('bob'));
    await assertFails(last('carol'));
    await assertSucceeds(ref('bob', `in/bob/${GIFT_KEY}`).orderByKey().limitToFirst(30).get());
    await assertFails(ref('carol', `in/bob/${GIFT_KEY}`).orderByKey().limitToFirst(30).get());
  });
});
