import { describe, expect, it } from 'vitest';
import { readLocal } from '@core/persist';
import { emptyAppearance } from '@shared/schemas';
import type { Appearance } from '@shared/schemas';
import fixture from './fixtures/account.v1.json';
import { soloKey, soloSeats } from './solo';
import wardrobe from './index';
import {
  activeOf, animalUnlocked, CharRecord, DEFAULT_BODY_COLOR, emptyChar, expiredTrash, faceOf, faceView, fileRefs, fitStamp, fromExport,
  initialLocal, mergeChars, mirror, pushOp, redoOp, remapFiles, resizeRect, toExport, toLocal, TRASH_KEEP_MS, undoOp, withDesk, withFace,
  withPose, withPoseFile, type Char, type Face, type History,
} from './logic';

const h = (c: string) => c.repeat(64);
const look = (c: string): Appearance => withPose(emptyAppearance(), 'idle', h(c));
const ch = (c: string, mtime: number): Char => ({ appearance: look(c), mtime });

describe('wardrobe 외형', () => {
  it('자세 그림 하나만 바꾸고 null이면 기본 그림으로 돌아간다', () => {
    const a = withPose(withPose(emptyAppearance(), 'idle', h('a')), 'sleep', h('b'));
    expect(a.poses).toEqual({ idle: h('a'), typing: null, sleep: h('b') });
    expect(withPose(a, 'idle', null).poses).toEqual({ idle: null, typing: null, sleep: h('b') });
  });

  it('책상을 바꾸고 빼도 다른 슬롯은 그대로다', () => {
    const sticker = [{ item: 'ROOM01/cat', file: h('c'), x: 0.1 }];
    const a = { ...emptyAppearance(), slots: { sticker } };
    const withWood = withDesk(withDesk(a, { item: 'wardrobe.desk.white', file: h('d') }), { item: 'wardrobe.desk.wood', file: h('e') });
    expect(withWood.slots).toEqual({ sticker, desk: [{ item: 'wardrobe.desk.wood', file: h('e') }] });
    expect(withDesk(withWood, null).slots).toEqual({ sticker });
  });
});

describe('로컬 데이터 v1 → v2 (AVT-15)', () => {
  const decl = wardrobe.local!.account!;
  it('v1 고정 자료의 캐릭터가 1번 슬롯에 들어가고 나머지는 빈 슬롯이다', () => {
    const r = readLocal(decl, fixture);
    expect(r.error).toBeNull();
    const l = r.data as ReturnType<typeof initialLocal>;
    expect(l.active).toBe(0);
    expect(l.chars[0]!.appearance.poses.idle).toBe(h('a'));
    expect(l.chars[0]!.mtime).toBe(1);
    expect(l.chars.slice(1)).toEqual([emptyChar(), emptyChar()]);
    expect(l.desks['wardrobe.desk.wood']).toBe(h('b'));
    expect(l.unlockedAt).toBeNull();
  });
  it('쓰는 슬롯의 외형을 고른다', () => {
    const l = { ...initialLocal(), chars: [ch('a', 1), ch('b', 2), emptyChar()], active: 1 };
    expect(activeOf(l).poses.idle).toBe(h('b'));
    expect(activeOf({ ...l, active: 2 })).toEqual(emptyAppearance());
  });
});

describe('perItemMtime 합치기와 휴지통 (10.7.3, ACC-08)', () => {
  it('슬롯마다 늦게 고친 쪽이 이기고 진 쪽은 휴지통에 간다', () => {
    const local = [ch('a', 10), ch('b', 30), ch('c', 5)];
    const remote = [ch('x', 20), ch('y', 25), null];
    const m = mergeChars(local, remote, 99);
    expect(m.chars.map((c) => c.appearance.poses.idle)).toEqual([h('x'), h('b'), h('c')]);
    expect(m.chars[1]).toBe(local[1]);
    expect(m.upload).toEqual([1, 2]);
    expect(m.trash.map((t) => [t.slot, t.mtime, t.appearance.poses.idle, t.at])).toEqual([[0, 10, h('a'), 99], [1, 25, h('y'), 99]]);
  });
  it('다시 설치한 PC(빈 슬롯)는 서버 캐릭터를 받고 빈 슬롯은 휴지통에 넣지 않는다', () => {
    const m = mergeChars([emptyChar(), emptyChar(), emptyChar()], [ch('x', 20), null, ch('z', 3)], 99);
    expect(m.chars.map((c) => c.mtime)).toEqual([20, 0, 3]);
    expect(m.upload).toEqual([]);
    expect(m.trash).toEqual([]);
  });
  it('같은 기록이면 아무것도 하지 않는다', () => {
    const local = [ch('a', 10), emptyChar(), emptyChar()];
    const m = mergeChars(local, [ch('a', 10), null, null], 99);
    expect(m.chars[0]).toBe(local[0]);
    expect(m).toMatchObject({ upload: [], trash: [] });
  });
  it('10일 지난 항목과 읽지 못하는 항목만 지운다', () => {
    const now = 100 * 86_400_000;
    const t = (at: number) => ({ appearance: emptyAppearance(), mtime: 1, slot: 0, at, v: 1 });
    const rows = [
      { key: 'old', value: t(now - TRASH_KEEP_MS - 1) },
      { key: 'edge', value: t(now - TRASH_KEEP_MS) },
      { key: 'new', value: t(now - 1000) },
      { key: 'bad', value: { at: 1 } },
    ];
    expect(expiredTrash(rows, now)).toEqual(['old', 'bad']);
  });
  it('Firebase가 지운 null과 빈 객체를 채워 읽는다', () => {
    const r = CharRecord.parse({ appearance: { v: 1, body: 'animal', poses: { idle: h('a') } }, mtime: 3, v: 1 });
    expect(r.appearance).toEqual({ ...look('a'), body: 'animal' });
  });
});

describe('동물 해금 (GRW-03)', () => {
  it('기준 레벨에 닿으면 열리고 한 번 열리면 기준이 올라가도 열려 있다', () => {
    expect(animalUnlocked(null, 29, 30)).toBe(false);
    expect(animalUnlocked(null, 30, 30)).toBe(true);
    expect(animalUnlocked(null, null, 30)).toBe(false);
    expect(animalUnlocked(123, 1, 50)).toBe(true);
  });
});

describe('캐릭터 파일 (AVT-17)', () => {
  const a: Appearance = {
    ...withPose(look('a'), 'sleep', h('b')),
    body: 'animal',
    slots: { desk: [{ item: 'wardrobe.desk.custom', file: h('c') }], sticker: [{ item: 'ROOM01/cat', file: h('a'), x: 0.2 }] },
  };
  const bytes = { [h('a')]: new Uint8Array([1, 2, 3]), [h('b')]: new Uint8Array([255, 0]), [h('c')]: new Uint8Array([7]) };

  it('외형과 그림을 내보내고 그대로 읽는다', () => {
    expect(fileRefs(a)).toEqual([h('a'), h('b'), h('c')]);
    const back = fromExport(toExport(a, bytes));
    expect(back.appearance).toEqual(a);
    expect(Object.fromEntries(back.files)).toEqual(bytes);
  });
  it('올린 해시로 바꾸면 자세와 슬롯이 모두 새 해시를 가리킨다', () => {
    const r = remapFiles(a, { [h('a')]: h('d'), [h('c')]: h('e') });
    expect(r.poses).toEqual({ idle: h('d'), typing: null, sleep: h('b') });
    expect(r.slots.desk![0]!.file).toBe(h('e'));
    expect(r.slots.sticker![0]).toEqual({ item: 'ROOM01/cat', file: h('d'), x: 0.2 });
  });
  it('캐릭터 파일이 아니거나 그림이 너무 크면 거부한다', () => {
    expect(() => fromExport('not json')).toThrow('캐릭터 파일이 아닙니다.');
    expect(() => fromExport(JSON.stringify({ kind: 'x' }))).toThrow();
    const big = JSON.parse(toExport(a, bytes)) as { files: Record<string, string> };
    big.files[h('a')] = 'A'.repeat(64 * 1024 + 4);
    expect(() => fromExport(JSON.stringify(big))).toThrow('그림이 너무 큽니다');
    expect(() => fromExport(' '.repeat(3 * 1024 * 1024 + 1))).toThrow('파일이 너무 큽니다.');
  });
});

describe('얼굴 그리기 (AVT-03, AVT-04)', () => {
  const face: Face = { tpl: 'wardrobe.body.human', color: '#ffe4ec', open: h('e'), closed: h('f'), use: { idle: true, typing: true, sleep: false } };

  it('편집 데이터가 없으면 그림을 넣지 않은 자세만 얼굴 그리기를 쓴다', () => {
    expect(faceOf(emptyAppearance())).toEqual({ tpl: 'wardrobe.body.human', color: DEFAULT_BODY_COLOR, use: { idle: true, typing: true, sleep: true } });
    expect(faceOf({ ...look('a'), body: 'animal' }).use).toEqual({ idle: false, typing: true, sleep: true });
    expect(faceOf(withFace(emptyAppearance(), face))).toEqual(face);
  });
  it('자세에 그림을 넣으면 그 자세만 넣은 그림을 쓴다', () => {
    const a = withPoseFile(withFace(emptyAppearance(), face), 'typing', h('a'));
    expect(a.poses.typing).toBe(h('a'));
    expect(faceOf(a)).toEqual({ ...face, use: { idle: true, typing: false, sleep: false } });
  });
  it('캐릭터 파일이 얼굴 편집 그림도 담고 올린 해시로 바꾼다', () => {
    const a = withFace(look('a'), face);
    expect(fileRefs(a)).toEqual([h('a'), h('e'), h('f')]);
    expect(faceOf(remapFiles(a, { [h('e')]: h('1') }))).toEqual({ ...face, open: h('1') });
    // 그리지 않은 얼굴은 키를 만들지 않는다 (Firebase는 undefined를 받지 않는다)
    const { open: _, closed: __, ...bare } = face;
    expect(Object.keys(faceOf(remapFiles(withFace(look('a'), bare), {})))).not.toContain('open');
  });
  it('얼굴 칸을 그림판에 꽉 채우고 포인터 위치를 그림판 좌표로 바꾼다', () => {
    const r = { x: 36, y: 84, w: 88, h: 88 };
    const v = faceView(r, 512);
    expect([r.x * v.s + v.dx, r.y * v.s + v.dy]).toEqual([0, 0]);
    expect([(r.x + r.w) * v.s + v.dx, (r.y + r.h) * v.s + v.dy]).toEqual([512, 512]);
    expect(toLocal(160, 85, { left: 10, top: 10, width: 300, height: 300 }, 512)).toEqual([256, 128]);
  });
  it('대칭 획은 좌우를 뒤집는다', () => {
    expect(mirror([[0, 5], [100, 7], [256, 9]], 512)).toEqual([[512, 5], [412, 7], [256, 9]]);
  });
  it('도장은 가운데에 비율을 지켜 놓고 가운데를 지키며 크기를 바꾼다', () => {
    const r = fitStamp(200, 100, 512, 0.5);
    expect(r).toEqual({ x: 128, y: 192, w: 256, h: 128 });
    expect(resizeRect(r, 128, 64)).toEqual({ x: 192, y: 224, w: 128, h: 64 });
  });
  it('되돌리기와 다시 하기. 새로 그리면 다시 하기 기록을 버린다', () => {
    let hs: History<string> = { done: [], undone: [] };
    hs = pushOp(pushOp(hs, 'a'), 'b');
    hs = undoOp(hs);
    expect(hs).toEqual({ done: ['a'], undone: ['b'] });
    expect(redoOp(hs)).toEqual({ done: ['a', 'b'], undone: [] });
    expect(pushOp(hs, 'c')).toEqual({ done: ['a', 'c'], undone: [] });
    const empty: History<string> = { done: [], undone: [] };
    expect(undoOp(empty)).toBe(empty);
    expect(redoOp(empty)).toBe(empty);
  });
});

describe('혼자 모드 자리 추가 (AVT-22)', () => {
  const l = { ...initialLocal(), chars: [ch('a', 1), ch('b', 2), emptyChar()], active: 0 };
  it('지금 슬롯과 빈 슬롯은 빼고 고른 순서대로 내 좌석 옆에 앉힌다', () => {
    expect(soloSeats(l, [1, 0, 2], false, 'me')).toEqual({ add: [1], order: [soloKey(1), 'me'] });
    expect(soloSeats(l, [1], false, 'me')).toEqual({ add: [1], order: ['me', soloKey(1)] });
  });
  it('지금 슬롯을 바꾸면 그 자리에 내가 앉고 방 안에서는 비운다', () => {
    expect(soloSeats({ ...l, active: 1 }, [1, 0], false, 'me')).toEqual({ add: [0], order: ['me', soloKey(0)] });
    expect(soloSeats(l, [1, 0], true, 'me')).toEqual({ add: [], order: [] });
  });
});
