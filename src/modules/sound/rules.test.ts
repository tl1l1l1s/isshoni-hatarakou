// 규칙 조각 시험. 에뮬레이터 부분은 FIREBASE_DATABASE_EMULATOR_HOST가 있을 때만 실행한다:
// npx firebase emulators:exec --project demo-isshoni --only database "npx vitest run src/modules/sound/rules.test.ts"
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRules } from '../../../rules/build.ts';
import { issued } from '../../../rules/tests/issued.ts';
import type { RuleNode } from '../../../rules/core.ts';
import fragment from './rules';
import { BIO_MAX, initialPlaylist, MAX_TRACKS, parseShared, PRESET_NAME_MAX, PRESETS, toShared, type Playlist } from './logic';

const built = buildRules({ sound: fragment });
const track = (i: number) => ({ k: `k${i}`, v: 'dQw4w9WgXcQ', title: `곡 ${i}` });
const full: Playlist = {
  ...initialPlaylist(),
  presets: [
    { name: '작업', tracks: Array.from({ length: MAX_TRACKS }, (_, i) => track(i)) },
    { name: '', tracks: [] },
    { name: 'x'.repeat(PRESET_NAME_MAX), tracks: [track(0)] },
  ],
  cur: 2,
  bio: 'b'.repeat(BIO_MAX),
  locked: true,
  home: false,
};

describe('sound 규칙 조각', () => {
  it('사본은 친구가 읽고 수치가 logic.ts와 같다', () => {
    const share = ((((built.rules.mod as RuleNode).sound as RuleNode).u as RuleNode).$uid as RuleNode).share as RuleNode;
    expect(share['.read']).toContain("root.child('mod/friends/u/'");
    const json = JSON.stringify(share);
    expect(json).toContain(`length <= ${PRESET_NAME_MAX}`);
    expect(json).toContain(`length <= ${BIO_MAX}`);
    // 곡 키 /^1?[0-9]$/는 0..19, 프리셋 키는 p0..p2
    expect([MAX_TRACKS, PRESETS]).toEqual([20, 3]);
  });

  it('올린 사본을 다시 읽으면 같은 목록이다', () => {
    const back = parseShared(JSON.parse(JSON.stringify(toShared(full))), 'alice')!;
    expect(back.presets.map((p) => [p.name, p.tracks.length])).toEqual([['작업', 20], ['', 0], [full.presets[2]!.name, 1]]);
    expect(back.presets[0]!.tracks[3]).toEqual({ k: 'alice:0:3', v: 'dQw4w9WgXcQ', title: '곡 3' });
    expect([back.cur, back.bio, back.locked, back.home]).toEqual([2, full.bio, true, false]);
  });

  it('Firebase가 돌려주는 모양(숫자 키 객체, 빈 목록 없음)도 읽는다', () => {
    const raw = { p0: { name: '', tracks: { 0: { v: 'dQw4w9WgXcQ', title: '' }, 1: { v: 'jNQXAC9IVRw', title: 'b' } } }, p1: { name: 'x' }, p2: { name: '' }, cur: 0, bio: '', locked: false, v: 1 };
    expect(parseShared(raw, 'u')!.presets.map((p) => p.tracks.map((t) => t.v))).toEqual([['dQw4w9WgXcQ', 'jNQXAC9IVRw'], [], []]);
    // 마이홈 공개가 없던 사본은 켜진 것으로 읽는다 (SND-05)
    expect(parseShared(raw, 'u')!.home).toBe(true);
    expect(parseShared(null, 'u')).toBeNull();
  });
});

describe.skipIf(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)('sound 규칙 (에뮬레이터)', () => {
  let env: RulesTestEnvironment;
  // alice의 친구는 bob이고 carol은 친구가 아니다
  const ref = (uid: string, path = 'share') => env.authenticatedContext(uid).database().ref(`mod/sound/u/alice/${path}`);
  const doc = toShared(full);

  beforeAll(async () => {
    const [host = '127.0.0.1', port = '9000'] = process.env.FIREBASE_DATABASE_EMULATOR_HOST!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-sound-rules', database: { host, port: Number(port), rules: JSON.stringify(built) } });
    await env.withSecurityRulesDisabled((c) => c.database().ref().update(issued('alice', 'bob', 'carol')));
    await env.withSecurityRulesDisabled((c) => c.database().ref('mod/friends/u/alice/list').set({ bob: { since: 1, v: 1 } }));
  });
  afterAll(() => env?.cleanup());

  it('본인만 쓰고 본인과 친구만 읽는다', async () => {
    await assertSucceeds(ref('alice').set(doc));
    await assertSucceeds(ref('alice').get());
    await assertSucceeds(ref('bob').get());
    await assertFails(ref('carol').get());
    await assertFails(ref('bob').set(doc));
    await assertFails(ref('alice', 'other').set(1));
  });

  it('정한 모양만 받는다', async () => {
    const p0 = doc.p0!;
    await assertFails(ref('alice').set({ ...doc, p3: p0 }));
    await assertFails(ref('alice').set({ ...doc, p0: { ...p0, tracks: [...p0.tracks, p0.tracks[0]] } }));
    await assertFails(ref('alice').set({ ...doc, p0: { ...p0, tracks: [{ v: 'short', title: '' }] } }));
    await assertFails(ref('alice').set({ ...doc, p0: { ...p0, name: 'x'.repeat(PRESET_NAME_MAX + 1) } }));
    await assertFails(ref('alice').set({ ...doc, bio: 'x'.repeat(BIO_MAX + 1) }));
    await assertFails(ref('alice').set({ ...doc, cur: 3 }));
    await assertFails(ref('alice').set({ ...doc, extra: 1 }));
    await assertFails(ref('alice').set({ ...doc, home: 'yes' }));
    await assertFails(ref('alice').set({ ...doc, v: 2 }));
  });
});
