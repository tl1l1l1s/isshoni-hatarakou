import { describe, expect, it } from 'vitest';
import { emptyAppearance } from '@shared/schemas';
import type { Equip } from '@shared/schemas';
import { BOARD_ITEM, CAP, adjust, capMessage, editOf, fitIn, fresh, moveTo, opaqueRect, parseColor, placeOf, twist, withColor, withEdit, withoutKeys } from './logic';

const h = (c: string) => c.repeat(64);
const view = { width: 240, height: 300 };
const sq = { width: 100, height: 100 };

describe('위치 변환', () => {
  it('기본값은 contain으로 맞추고 아래에 붙인 자리다', () => {
    // 100x100은 2.4배로 240x240이 되고 아래에 붙어 가운데가 (120, 180)
    expect(placeOf(sq, { item: 'a', file: null }, view)).toEqual({ cx: 120, cy: 180, w: 240, h: 240 });
    expect(placeOf(sq, { item: 'a', file: null, x: 0.25, y: -0.5 }, view)).toMatchObject({ cx: 180, cy: 30 });
  });

  it('픽셀 자리를 Equip 값으로 바꾸고 다시 픽셀로 돌아온다', () => {
    const e = moveTo(sq, { item: 'a', file: null, scale: 0.4 }, view, 60, 90);
    expect(e).toMatchObject({ x: -0.25, y: -0.3, scale: 0.4 });
    expect(placeOf(sq, e, view)).toMatchObject({ cx: 60, cy: 90 });
  });

  it('가운데는 view 밖으로 나가지 않는다', () => {
    const e = moveTo(sq, { item: 'a', file: null }, view, -50, 999);
    expect(placeOf(sq, e, view)).toMatchObject({ cx: 0, cy: 300 });
  });
});

describe('크기와 회전', () => {
  const e: Equip = { item: 'a', file: null };
  it('크기는 범위 안으로, 회전은 -180..179 정수로 맞춘다', () => {
    expect(adjust(e, 5, 0).scale).toBe(2);
    expect(adjust(e, 0.01, 0).scale).toBe(0.1);
    expect(adjust(e, 1, 190).rot).toBe(-170);
    expect(adjust(e, 1, -190).rot).toBe(170);
    expect(adjust(e, 1, 180).rot).toBe(-180);
    expect(adjust(e, 1, 45.4).rot).toBe(45);
  });

  it('손잡이를 두 배 멀리 끌면 두 배, 90도 돌리면 시계 방향 90도', () => {
    const c = { x: 0, y: 0 };
    expect(twist({ ...e, scale: 0.5, rot: 10 }, c, { x: 10, y: 0 }, { x: 20, y: 0 })).toMatchObject({ scale: 1, rot: 10 });
    // 화면 좌표는 아래가 +y라서 오른쪽에서 아래로 끌면 시계 방향
    expect(twist({ ...e, scale: 1, rot: 0 }, c, { x: 10, y: 0 }, { x: 0, y: 10 })).toMatchObject({ scale: 1, rot: 90 });
  });
});

describe('색', () => {
  it('형식을 읽고 쓴다', () => {
    expect(parseColor('h120s80')).toEqual({ h: 120, s: 80 });
    expect(parseColor(undefined)).toEqual({ h: 0, s: 100 });
    expect(parseColor('red')).toEqual({ h: 0, s: 100 });
    expect(parseColor('h999s999')).toEqual({ h: 279, s: 200 });
    expect(withColor({ item: 'a', file: null }, { h: 120, s: 80 }).color).toBe('h120s80');
    expect(withColor({ item: 'a', file: null }, { h: -30.4, s: 300 }).color).toBe('h330s200');
  });

  it('원래 색이면 color 키를 지운다', () => {
    expect(withColor({ item: 'a', file: null, color: 'h10s100' }, { h: 360, s: 100 })).toEqual({ item: 'a', file: null });
  });
});

describe('상한', () => {
  it(`${CAP}개가 차면 안내한다`, () => {
    expect(capMessage('sticker', CAP - 1)).toBeNull();
    expect(capMessage('sticker', CAP)).toContain(`${CAP}개`);
    expect(capMessage('desk.items', CAP)).toContain('소품');
    expect(capMessage('floor', CAP)).toContain('바닥');
  });
});

describe('슬롯', () => {
  const s = (item: string): Equip => ({ item, file: h('a') });
  const desk = [{ item: 'wardrobe.desk.wood', file: h('b') }];

  it('함께 지우기로 빠진 key를 모든 슬롯에서 빼고 빈 슬롯은 지운다', () => {
    const slots = { sticker: [s('R1/a'), s('R2/b')], 'desk.items': [s('R1/a')], desk };
    expect(withoutKeys(slots, ['R1/a'])).toEqual({ sticker: [s('R2/b')], desk });
  });

  it('뺄 것이 없으면 같은 객체', () => {
    const slots = { sticker: [s('R2/b'), s('stickers.own')] };
    expect(withoutKeys(slots, ['R1/a'])).toBe(slots);
  });

  it('편집한 슬롯만 바꾸고 빈 슬롯은 지운다', () => {
    const a = { ...emptyAppearance(), slots: { desk, sticker: [s('R1/a')] } };
    // 같은 아이템을 여러 개 붙여도 목록에 하나씩 남는다 (AVT-19)
    const floor = [s('R1/a'), { ...s('R1/a'), x: 0.2 }];
    const out = withEdit(a, { sticker: [], 'desk.items': [s('stickers.own')], floor });
    expect(out.slots).toEqual({ desk, 'desk.items': [s('stickers.own')], floor });
    expect(editOf(out)).toEqual({ sticker: [], 'desk.items': [s('stickers.own')], floor });
  });

  it('바닥 오브제는 그림 아래가 바닥에 닿고 칠판은 머리 위에 붙는다', () => {
    for (const img of [sq, { width: 300, height: 100 }, { width: 50, height: 200 }]) {
      const f = fresh('floor', 'R1/a', h('a'), img), p = placeOf(img, f, view);
      expect(p.cy + (p.h * f.scale!) / 2).toBeCloseTo(view.height, 0);
    }
    expect(fresh('sticker', BOARD_ITEM, h('a')).y).toBeLessThan(fresh('sticker', 'R1/a', h('a')).y!);
  });
});

describe('직접 그리기 (AVT-09)', () => {
  it('그린 픽셀만 감싸는 사각형을 찾고 다 투명하면 null', () => {
    const w = 8, h = 6, px = new Uint8ClampedArray(w * h * 4);
    expect(opaqueRect(px, w, h)).toBeNull();
    for (const [x, y] of [[2, 1], [5, 4]]) px[(y! * w + x!) * 4 + 3] = 255;
    expect(opaqueRect(px, w, h)).toEqual({ x: 2, y: 1, w: 4, h: 4 });
  });

  it('비율을 지켜 칸 가운데에 꽉 맞춘다', () => {
    expect(fitIn(200, 100, { x: 0, y: 0, w: 512, h: 512 })).toEqual({ x: 0, y: 128, w: 512, h: 256 });
    expect(fitIn(100, 100, { x: 16, y: 96, w: 480, h: 320 })).toEqual({ x: 96, y: 96, w: 320, h: 320 });
  });
});
