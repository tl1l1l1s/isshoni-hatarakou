import { describe, expect, it } from 'vitest';
import { FILE_MAX_RAW_BYTES } from '@shared/constants';
import { keyOrder } from '@server/memory/index';
import {
  addSticker, BG_SIDE, CLAP_DAILY, CLAP_KEY, CLIMB, countClap, EMPTY_HOME, FALL, fitsFile, FLOOR, GIFT_KEY, lastAt, linkify, MALLANGI_MAX, moveSticker,
  mergeInbox, ON_SCREEN_MAX, parseHome, parseShelf, resizeSticker, restack, rotateSticker, SHELF_MAX, splitInbox, stepAll, STICKER_CAP, STICKER_W_MAX,
  STICKER_W_MIN, summon, unread, VIEW, WALK, WALKER,
} from './logic';
import type { Sticker, Walker } from './logic';

const H = (c: string) => c.repeat(64);

describe('스티커 (HOM-08)', () => {
  const s: Sticker = { file: H('a'), x: 100, y: 100, w: 100, rot: 0, z: 1, anim: 'none', speed: 1 };

  it('10개까지 가운데에 맨 앞으로 붙인다', () => {
    let list: Sticker[] = [];
    for (let i = 0; i < STICKER_CAP; i++) list = addSticker(list, H('b'))!;
    expect(list).toHaveLength(10);
    expect(list.at(-1)).toMatchObject({ x: VIEW.width / 2, y: VIEW.height / 2, z: 10 });
    expect(addSticker(list, H('b'))).toBeNull();
  });

  it('옮길 때 가운데가 보기 화면 밖으로 나가지 않는다', () => {
    expect(moveSticker(s, { x: 50.4, y: 60.6 })).toMatchObject({ x: 50, y: 61 });
    expect(moveSticker(s, { x: -30, y: 9999 })).toMatchObject({ x: 0, y: VIEW.height });
  });

  it('모서리를 끈 거리 비율만큼 너비를 바꾸고 상한과 하한을 지킨다', () => {
    expect(resizeSticker(s, { x: 150, y: 100 }, { x: 200, y: 100 }).w).toBe(200);
    expect(resizeSticker(s, { x: 150, y: 100 }, { x: 125, y: 100 }).w).toBe(50);
    expect(resizeSticker(s, { x: 150, y: 100 }, { x: 900, y: 100 }).w).toBe(STICKER_W_MAX);
    expect(resizeSticker(s, { x: 150, y: 100 }, { x: 100, y: 100 }).w).toBe(STICKER_W_MIN);
  });

  it('회전 손잡이가 가리키는 쪽으로 돌린다. 바로 위가 0도', () => {
    expect(rotateSticker(s, { x: 100, y: 0 }).rot).toBe(0);
    expect(rotateSticker(s, { x: 200, y: 100 }).rot).toBe(90);
    expect(rotateSticker(s, { x: 0, y: 100 }).rot).toBe(-90);
    expect(rotateSticker(s, { x: 100, y: 200 }).rot).toBe(-180);
  });

  it('맨 앞과 맨 뒤로 보낸다', () => {
    const list = [s, { ...s, z: 5 }, { ...s, z: -2 }];
    expect(restack(list, 0, 1)[0]!.z).toBe(6);
    expect(restack(list, 0, -1)[0]!.z).toBe(-3);
  });
});

describe('마이홈 문서', () => {
  it('빈 값과 틀린 값은 빈 마이홈이고 Firebase 숫자 키 객체를 배열로 읽는다', () => {
    expect(parseHome(null)).toEqual(EMPTY_HOME);
    expect(parseHome({ profile: 'x'.repeat(501) })).toEqual(EMPTY_HOME);
    const h = parseHome({ profile: '안녕', mallangi: { 0: H('a'), 1: H('b') }, v: 1 });
    expect(h.mallangi).toEqual([H('a'), H('b')]);
    expect(h.stickers).toEqual([]);
  });

  it('말랑이 목록은 10개까지', () => {
    expect(parseHome({ mallangi: Array(MALLANGI_MAX + 1).fill(H('a')) })).toEqual(EMPTY_HOME);
  });
});

describe('방명록과 선물 (HOM-09, HOM-14)', () => {
  const raw = {
    bob: {
      k1: { name: '밥', text: '안녕', at: 10 },
      k2: { name: '밥', text: '또 왔어', at: 30 },
      bad: { name: '밥', text: '', at: 40 },
      [GIFT_KEY]: { g1: { file: H('c'), msg: '선물', name: '밥', at: 20 } },
    },
    carol: { k3: { name: '캐롤', text: '반가워', at: 20 }, [CLAP_KEY]: 3 },
    dave: { [CLAP_KEY]: 2 },
  };

  it('받은 기록을 방명록과 선물로 나누고 새것부터 놓는다', () => {
    const { book, gifts } = splitInbox(raw);
    expect(book.map((b) => `${b.sender}/${b.id}`)).toEqual(['bob/k2', 'carol/k3', 'bob/k1']);
    expect(gifts).toEqual([{ file: H('c'), msg: '선물', name: '밥', at: 20, sender: 'bob', id: 'g1' }]);
    expect(splitInbox(null)).toEqual({ book: [], gifts: [], claps: 0 });
  });

  it('박수는 보낸 사람마다의 수를 더한다 (HOM-15)', () => {
    expect(splitInbox(raw).claps).toBe(5);
  });

  it('보낸 사람마다 받은 최근 항목을 합치고 방명록은 새것부터 limit개만 남긴다', () => {
    // 서버는 키 순서로 마지막 limit + 2개를 준다. 13자리 시각 키가 clap과 gift보다 앞이다
    expect(['gift', CLAP_KEY, '1700000000009', '1700000000010'].sort(keyOrder)).toEqual(['1700000000009', '1700000000010', CLAP_KEY, GIFT_KEY]);
    const book = (at: number) => ({ key: String(at), value: { name: 'n', text: 't', at } });
    const rows = new Map([
      ['a', [book(3), book(4), { key: CLAP_KEY, value: 2 }, { key: GIFT_KEY, value: { g: { file: H('a'), msg: '', name: 'a', at: 9 } } }]],
      ['b', [book(1), book(2), book(5)]],
    ]);
    const v = mergeInbox(rows, 2);
    expect(v.book.map((b) => `${b.sender}/${b.at}`)).toEqual(['b/5', 'a/4']);
    expect([v.claps, v.gifts.length, v.more]).toEqual([2, 1, true]);
    expect(mergeInbox(new Map([['b', [book(1)]]]), 2).more).toBe(false);
  });

  it('안 읽은 글은 마지막으로 본 시각 뒤의 글이다', () => {
    const { book } = splitInbox(raw);
    expect(unread(book, 0)).toBe(3);
    expect(unread(book, 20)).toBe(1);
    expect(lastAt(book, 0)).toBe(30);
    expect(unread(book, lastAt(book, 0))).toBe(0);
    expect(lastAt([], 7)).toBe(7);
  });
});

describe('배경 그림 크기 (HOM-06, 10.14의 13번)', () => {
  it('가로 960px로 줄이고 base64로 64KB 안에 들어야 올린다', () => {
    expect(BG_SIDE).toBe(960);
    expect(fitsFile(FILE_MAX_RAW_BYTES)).toBe(true);
    expect(fitsFile(FILE_MAX_RAW_BYTES + 1)).toBe(false);
  });
});

describe('말랑이 (HOM-12, HOM-13)', () => {
  const m: Walker = { id: 1, file: H('a'), x: 100, y: FLOOR, vx: WALK, held: false, act: 'walk', t: 5000, on: null, hop: 0 };
  const R = VIEW.width - WALKER;
  // rand가 0이면 벽에서 벽을 타고, 0.99면 돌아선다
  const step = (w: Walker, dt: number, r = 0.99) => stepAll([w], dt, () => r)[0]!;

  it('바닥에서 걷고 양끝 벽에서 돌아서거나 벽을 탄다', () => {
    expect(step(m, 100)).toMatchObject({ x: 104, y: FLOOR, vx: WALK });
    expect(step({ ...m, x: R - 1 }, 100)).toMatchObject({ x: R, vx: -WALK, act: 'walk' });
    expect(step({ ...m, x: 1, vx: -WALK }, 100)).toMatchObject({ x: 0, vx: WALK });
    expect(step({ ...m, x: R - 1 }, 100, 0)).toMatchObject({ x: R, vx: WALK, act: 'climb' });
  });

  it('벽을 타고 오르다가 시간이 다 되면 반대쪽을 보며 떨어진다', () => {
    const c: Walker = { ...m, x: 0, vx: -WALK, act: 'climb', t: 150 };
    expect(step(c, 100)).toMatchObject({ x: 0, y: FLOOR - CLIMB * 100, act: 'climb' });
    const off = step(step(c, 100), 100);
    expect(off).toMatchObject({ x: 8, vx: WALK, act: 'walk' });
    expect(step(off, 100).y).toBeGreaterThan(off.y);
  });

  it('걷기와 쉬기를 번갈아 한다', () => {
    expect(step({ ...m, t: 50 }, 100)).toMatchObject({ x: 100, act: 'rest' });
    expect(step({ ...m, act: 'rest', t: 500 }, 100)).toMatchObject({ x: 100, act: 'rest', t: 400 });
    expect(step({ ...m, act: 'rest', t: 50 }, 100).act).toBe('walk');
  });

  it('떠 있으면 바닥까지 떨어지고 잡혀 있으면 그대로다', () => {
    expect(step({ ...m, y: 0 }, 100)).toMatchObject({ x: 100, y: FALL * 100 });
    expect(step({ ...m, y: FLOOR - 1 }, 100).y).toBe(FLOOR);
    const held = { ...m, y: 0, held: true };
    expect(step(held, 100)).toBe(held);
  });

  it('떨어지다 다른 말랑이 머리에 닿으면 올라타서 따라가고 아래가 잡히면 떨어진다', () => {
    const base: Walker = { ...m, id: 1, act: 'rest', t: 9999 };
    const top: Walker = { ...m, id: 2, x: 110, y: FLOOR - WALKER - 10, vx: WALK };
    const [b1, t1] = stepAll([base, top], 100, () => 0.99);
    expect(t1).toMatchObject({ x: 100, y: FLOOR - WALKER, on: 1 });
    const [, t2] = stepAll([{ ...b1!, x: 140 }, t1!], 100, () => 0.99);
    expect(t2).toMatchObject({ x: 140, y: FLOOR - WALKER, on: 1 });
    const [, t3] = stepAll([{ ...b1!, held: true }, t2!], 100, () => 0.99);
    expect(t3).toMatchObject({ on: null, y: FLOOR - WALKER + FALL * 100 });
  });

  it('걷다가 앞의 말랑이에 닿으면 민다', () => {
    const a: Walker = { ...m, id: 1, x: 100 };
    const b: Walker = { ...m, id: 2, x: 130, act: 'rest', t: 9999 };
    const [a1, b1] = stepAll([a, b], 100, () => 0.99);
    expect(a1!.x).toBe(104);
    expect(b1!.x).toBe(134);
    const behind: Walker = { ...b, x: 70 };
    expect(stepAll([a, behind], 100, () => 0.99)[1]!.x).toBe(70);
  });

  it('누르면 제자리에서 뛰는 동안 움직이지 않는다', () => {
    expect(step({ ...m, hop: 300 }, 100)).toMatchObject({ x: 100, hop: 200 });
  });

  it('한 화면에 5마리까지 부르고 그림이 없으면 부르지 않는다', () => {
    let list: Walker[] = [];
    for (let i = 0; i < ON_SCREEN_MAX; i++) list = summon(list, [H('a'), H('b')], () => 0.99)!;
    expect(list).toHaveLength(5);
    expect(new Set(list.map((w) => w.id)).size).toBe(5);
    expect(list[0]).toMatchObject({ file: H('b'), y: 0, vx: WALK, act: 'walk', on: null });
    expect(summon(list, [H('a')], () => 0)).toBeNull();
    expect(summon([], [], () => 0)).toBeNull();
  });
});

describe('웹박수 하루 횟수 (HOM-15)', () => {
  it('마이홈마다 하루 5번까지 세고 날이 바뀌면 처음부터 센다', () => {
    let c = { day: '', n: {} as Record<string, number> };
    for (let i = 0; i < CLAP_DAILY; i++) c = countClap(c, 'bob', '2026-10-09')!;
    expect(c).toEqual({ day: '2026-10-09', n: { bob: 5 } });
    expect(countClap(c, 'bob', '2026-10-09')).toBeNull();
    expect(countClap(c, 'carol', '2026-10-09')).toEqual({ day: '2026-10-09', n: { bob: 5, carol: 1 } });
    expect(countClap(c, 'bob', '2026-10-10')).toEqual({ day: '2026-10-10', n: { bob: 1 } });
  });
});

describe('북마크 (HOM-11)', () => {
  const mark = { title: '로그', url: 'https://x.y/z', color: '#112233', pub: false };
  it('http, https 링크만 받고 50권까지 읽는다', () => {
    expect(parseShelf({ 0: mark, 1: { ...mark, pub: true } })).toHaveLength(2);
    expect(parseShelf([{ ...mark, url: 'javascript:alert(1)' }])).toEqual([]);
    expect(parseShelf(Array(SHELF_MAX + 1).fill(mark))).toEqual([]);
    expect(parseShelf(null)).toEqual([]);
  });
});

describe('게시글 링크 (HOM-05)', () => {
  it('http, https 주소만 링크로 나눈다', () => {
    expect(linkify('보러 와 https://a.b/c?d=1 이거 ftp://x')).toEqual([
      { text: '보러 와 ' },
      { text: 'https://a.b/c?d=1', url: 'https://a.b/c?d=1' },
      { text: ' 이거 ftp://x' },
    ]);
  });
});
