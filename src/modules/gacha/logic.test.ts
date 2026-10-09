import { describe, expect, it } from 'vitest';
import type { InventoryItem } from './api';
import { applyDraw, dayStart, draw, duration, EMPTY, kinds, odds, percent, periodText, pool, reconcile, revokedIds, secToNext, tickets, type Entry, type Rec } from './logic';

const H = 'a'.repeat(64);
const entry = (id: string, w: number): Entry => ({ id, name: id, file: H, w, by: 'alice', st: 'on', at: 1, v: 1 });

describe('뽑기 확률', () => {
  const pool = [entry('a', 10), entry('b', 10), entry('c', 10), entry('rare', 1)];

  it('가중치 10, 10, 10, 1이면 희귀 아이템은 31번에 1번', () => {
    const counts: Record<string, number> = {};
    const N = 3100;
    for (let i = 0; i < N; i++) {
      const e = draw(pool, (i + 0.5) / N)!;
      counts[e.id] = (counts[e.id] ?? 0) + 1;
    }
    expect(counts).toEqual({ a: 1000, b: 1000, c: 1000, rare: 100 });
    expect(odds(pool)[3]).toBeCloseTo(1 / 31);
    expect(draw(pool, 0)!.id).toBe('a');
    expect(draw(pool, 0.999999)!.id).toBe('rare');
    expect(draw([], 0.5)).toBeNull();
  });

  it.each([
    [1 / 31, '3.2%'],
    [10 / 31, '32.3%'],
    [1, '100%'],
    [0.5, '50%'],
    [1 / 3000, '0.1% 미만'],
  ])('%f는 %s', (p, s) => expect(percent(p)).toBe(s));
});

describe('뽑기 횟수', () => {
  it.each([
    // sec, secPerTicket, bonus, spent, 남은 횟수, 다음 1회까지 초
    [0, 3600, 0, 0, 0, 3600],
    [5400, 3600, 0, 0, 1, 1800],
    [5400, 1800, 0, 0, 3, 1800],
    [5400, 3600, 0, 1, 0, 1800],
    // 기준을 늘려 계산값이 음수가 되면 0이고 다음 1회는 쓴 횟수를 다 채운 뒤
    [5400, 3600, 0, 3, 0, 9000],
    [5400, 3600, 2, 3, 0, 1800],
    [7200, 3600, 1, 0, 3, 3600],
  ])('sec %d, 1회 %d초, bonus %d, spent %d', (sec, spt, bonus, spent, left, next) => {
    expect(tickets(sec, spt, bonus, spent)).toBe(left);
    expect(secToNext(sec, spt, bonus, spent)).toBe(next);
  });

  it('90분이 쌓인 사람은 60분 기준에서 1회, 30분 기준에서 3회', () => {
    expect(tickets(5400, 3600, 0, 0)).toBe(1);
    expect(tickets(5400, 1800, 0, 0)).toBe(3);
  });

  it('남은 시간을 분과 시간으로 보여 준다', () => {
    expect([duration(59), duration(1800), duration(3600), duration(5400)]).toEqual(['1분', '30분', '1시간', '1시간 30분']);
  });
});

describe('뽑기 transaction 본문', () => {
  const item = entry('x', 5);
  it('빈 값으로 처음 불리면 빈 기록을 돌려 서버 값으로 다시 불리게 한다', () => {
    expect(applyDraw(null, item, 3600, 9)).toEqual(EMPTY);
  });
  it('남은 횟수가 없으면 취소하고 있으면 spent와 개수를 함께 올린다', () => {
    expect(applyDraw({ ...EMPTY, sec: 3599 }, item, 3600, 9)).toBeUndefined();
    const once = applyDraw({ ...EMPTY, sec: 7200 }, item, 3600, 9)!;
    expect(once).toEqual({ sec: 7200, spent: 1, bonus: 0, v: 1, got: { x: { n: 1, name: 'x', file: H, at: 9 } } });
    const twice = applyDraw(once, { ...item, name: '바뀐 이름' }, 3600, 20)!;
    expect(twice.spent).toBe(2);
    // 이름과 그림은 처음 뽑을 때의 사본을 그대로 둔다
    expect(twice.got!.x).toEqual({ n: 2, name: 'x', file: H, at: 9 });
    expect(applyDraw(twice, item, 3600, 30)).toBeUndefined();
  });
});

describe('함께 지우기 동기화', () => {
  const got = (n = 1) => ({ n, name: 'n', file: H, at: 1 });
  const inv = (room: string, itemId: string): InventoryItem => ({ key: `${room}/${itemId}`, room, itemId, name: 'n', file: H, n: 1, at: 1 });

  it('revoke 표시만 빼고 keep 표시는 남긴다', () => {
    expect(revokedIds({ a: got(), b: got(), c: got() }, { a: { mode: 'revoke' }, b: { mode: 'keep' } })).toEqual(['a']);
    expect(revokedIds({ a: got(), b: got() }, { _room: { mode: 'revoke' } })).toEqual(['a', 'b']);
    expect(revokedIds({ a: got() }, { _room: { mode: 'keep' } })).toEqual([]);
    expect(revokedIds({ a: got() }, null)).toEqual([]);
  });

  it('서버 목록으로 보관함을 다시 만들고 지울 got 항목을 고른다. 목록 밖 방은 그대로 둔다', () => {
    const prev = [inv('AAA', 'a'), inv('AAA', 'b'), inv('ZZZ', 'z'), inv('BBB', 'gone')];
    const rows: Array<{ code: string; got: Rec['got'] }> = [
      { code: 'AAA', got: { a: got(), b: got(3) } },
      { code: 'BBB', got: {} },
      { code: 'CCC', got: { c: got() } },
    ];
    const r = reconcile(prev, rows, { AAA: { a: { mode: 'revoke' }, b: { mode: 'keep' } }, CCC: { _room: { mode: 'revoke' } } });
    expect(r.drop).toEqual({ AAA: ['a'], CCC: ['c'] });
    expect(r.inventory.map((i) => `${i.key}:${i.n}`)).toEqual(['AAA/b:3', 'ZZZ/z:1']);
  });
});

describe('방마다 모은 종 수 (GCH-06)', () => {
  const mine = [{ itemId: 'a' }, { itemId: 'b' }, { itemId: 'gone' }];
  it('지금 방에 있는 아이템 가운데 가진 종 수와 전체를 센다', () => {
    expect(kinds(mine, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])).toBe('2/4종');
  });
  it('방이 지워졌거나 읽지 못하면 가진 종 수만 쓴다', () => {
    expect(kinds(mine, [])).toBe('3종');
    expect(kinds(mine, null)).toBe('3종');
    expect(kinds(mine, undefined)).toBe('3종');
  });
});

describe('기간 한정 (GCH-04)', () => {
  const from = dayStart('2026-12-24');
  const until = dayStart('2026-12-25') + 86_400_000;
  const items = [entry('always', 10), { ...entry('xmas', 10), from, until }, { ...entry('off', 10), st: 'off' as const }];
  it('하루는 오전 6시에 시작하고 기간 밖 아이템은 확률에서 빠진다', () => {
    expect(new Date(from).toISOString()).toBe('2026-12-23T21:00:00.000Z');
    expect(pool(items, from - 1).map((e) => e.id)).toEqual(['always']);
    expect(pool(items, from).map((e) => e.id)).toEqual(['always', 'xmas']);
    expect(pool(items, until - 1).map((e) => e.id)).toEqual(['always', 'xmas']);
    expect(pool(items, until).map((e) => e.id)).toEqual(['always']);
  });
  it('기간 글은 끝 날을 포함해 적는다', () => {
    expect(periodText({ from, until })).toBe('12/24부터 12/25까지');
    expect(periodText({ until })).toBe('12/25까지');
    expect(periodText({})).toBeNull();
  });
});
