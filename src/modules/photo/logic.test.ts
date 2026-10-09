import { expect, it } from 'vitest';
import { canTake, countdown, cutRects, dueCuts, EMPTY, fileName, fullRun, handleOf, hostSlot, jump, keyPose, liftAt, POSE0, push, redo, running, SLOT_STALE_MS, slotsOf, stickerAt, twist, undo } from './logic';
import type { Cfg, Shot } from './logic';

it('컷을 테두리 안에 1컷은 가득, 2컷은 좌우로, 4컷은 2행 2열로 놓는다', () => {
  expect(cutRects('wide', 1)).toEqual([{ x: 24, y: 24, width: 912, height: 672 }]);
  expect(cutRects('wide', 2).map((r) => [r.x, r.y, r.width, r.height])).toEqual([[24, 24, 450, 672], [486, 24, 450, 672]]);
  expect(cutRects('tall', 4).map((r) => [r.x, r.y, r.width, r.height])).toEqual([
    [24, 24, 330, 450], [366, 24, 330, 450], [24, 486, 330, 450], [366, 486, 330, 450],
  ]);
});

it('A D는 내 칸 너비의 10%씩 옮기고 한 칸까지만 간다. Q E는 돌고 W S는 거리를 바꾼다', () => {
  let p = POSE0;
  for (let i = 0; i < 15; i++) p = keyPose(p, 'KeyD')!;
  expect(p.x).toBe(10);
  expect(keyPose(p, 'KeyA')!.x).toBe(9);
  expect(keyPose(p, 'KeyQ')!.f).toBe(1);
  expect(keyPose(keyPose(keyPose(p, 'KeyW')!, 'KeyW')!, 'KeyW')!.z).toBe(2);
  expect(keyPose(p, 'KeyS')!.z).toBe(0);
  expect(keyPose(p, 'KeyX')).toBeNull();
});

it('점프는 0.5초 동안 오르내리고 뛰는 중에는 다시 뛰지 않는다', () => {
  const p = jump(POSE0, 1000);
  expect(p.j).toBe(1000);
  expect(jump(p, 1200)).toBe(p);
  expect(liftAt(p.j, 1250)).toBeCloseTo(0.12);
  expect(liftAt(p.j, 1500)).toBe(0);
});

it('자리는 빈자리, 내 자리, 15분 지난 자리만 잡고 진행자는 사람이 있는 가장 작은 번호다', () => {
  // Firebase는 숫자 키 객체를 배열로 줄 수 있다
  const slots = slotsOf([null, { uid: 'b', at: 0 }, { uid: 'c', at: 0 }]);
  expect(slots).toEqual([null, { uid: 'b', at: 0 }, { uid: 'c', at: 0 }, null]);
  expect(slotsOf({ 2: { uid: 'c', at: 0 }, 3: 'bad' })[2]).toEqual({ uid: 'c', at: 0 });
  expect(hostSlot(slots)).toBe(1);
  expect(hostSlot(slotsOf(null))).toBe(-1);
  expect(canTake(null, 'a', 0)).toBe(true);
  expect(canTake({ uid: 'a', at: 0 }, 'a', 0)).toBe(true);
  expect(canTake({ uid: 'b', at: 0 }, 'a', SLOT_STALE_MS)).toBe(false);
  expect(canTake({ uid: 'b', at: 0 }, 'a', SLOT_STALE_MS + 1)).toBe(true);
});

it('컷마다 5초를 세고 셔터 시각이 지난 컷만 찍으며 진행자가 사라진 촬영은 끝난다', () => {
  const cfg: Cfg = { o: 'wide', n: 2, bg: '#ffffff', fl: 'none', fr: 'none', own: '', t0: 10_000 };
  expect(countdown(cfg, 10_000)).toEqual({ cut: 0, left: 5 });
  expect(countdown(cfg, 14_100)).toEqual({ cut: 0, left: 1 });
  expect(countdown(cfg, 15_000)).toEqual({ cut: 1, left: 5 });
  expect(dueCuts(cfg, {}, 14_999)).toEqual([]);
  // 진행자가 끊긴 사이 두 컷이 밀렸으면 다음 진행자가 둘 다 찍는다
  expect(dueCuts(cfg, {}, 20_000)).toEqual([0, 1]);
  const shot = (t0: number): Shot => ({ ...cfg, t0, ppl: [] });
  expect(dueCuts(cfg, { 0: shot(10_000), 1: shot(1) }, 20_000)).toEqual([1]);
  expect(fullRun({ 0: shot(10_000) }, 10_000)).toBeNull();
  expect(fullRun({ 0: shot(10_000), 1: shot(1) }, 10_000)).toBeNull();
  expect(fullRun({ 1: shot(10_000), 0: shot(10_000) }, 10_000)).toHaveLength(2);
  expect(running(cfg, 35_000)).toBe(true);
  expect(running(cfg, 35_001)).toBe(false);
  expect(running({ ...cfg, t0: 0 }, 0)).toBe(false);
});

it('되돌린 뒤 새로 바꾸면 앞으로 갈 문서를 버린다', () => {
  const a = { ...EMPTY, stickers: [{ e: 'a', x: 0, y: 0, size: 10, rot: 0 }] };
  const b = { ...EMPTY, stickers: [] };
  let h = push(push({ list: [EMPTY], at: 0 }, a), b);
  h = undo(h);
  expect(h.list[h.at]).toBe(a);
  expect(redo(h).list[redo(h).at]).toBe(b);
  h = push(h, EMPTY);
  expect(h.list).toEqual([EMPTY, a, EMPTY]);
  expect(redo(h).at).toBe(2);
});

it('손잡이를 끌면 스티커가 커지고 돌며 돌아간 스티커도 누른 자리로 찾는다', () => {
  const s = { e: '💖', x: 100, y: 100, size: 40, rot: 0 };
  expect(handleOf(s)).toEqual({ x: 120, y: 80 });
  // 가운데에서 두 배 멀어지고 시계 방향으로 90도 돈다
  const t = twist(s, { x: 120, y: 80 }, { x: 140, y: 140 });
  expect(t.size).toBeCloseTo(80);
  expect(t.rot).toBe(90);
  const r = { ...s, rot: 45 };
  expect(stickerAt([r], { x: 100, y: 127 })).toBe(0);
  expect(stickerAt([r], { x: 119, y: 119 })).toBeNull();
});

it('받은 WebP 사진은 webp로 저장한다', () => {
  const at = new Date(2026, 9, 9, 7, 5, 3);
  const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
  expect(fileName(at)).toBe('스티커사진-20261009-070503.png');
  expect(fileName(at, webp)).toBe('스티커사진-20261009-070503.webp');
});
