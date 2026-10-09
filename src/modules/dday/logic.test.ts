import { describe, expect, it } from 'vitest';
import { cardWrites, COLORS, ddayLabel, inkOn, parseCards, type Card } from './logic';

const card: Card = { name: '마감', date: '2026-10-19', fromOne: false, color: '#112233', notify: true, pub: true, v: 1 };

describe('D-day (HOM-21)', () => {
  it('앞날은 D-n, 오늘은 D-day, 지난날은 D+n', () => {
    expect(ddayLabel('2026-10-19', '2026-10-09', false)).toBe('D-10');
    expect(ddayLabel('2026-10-09', '2026-10-09', false)).toBe('D-day');
    expect(ddayLabel('2026-10-01', '2026-10-09', false)).toBe('D+8');
  });

  it('고른 날을 1일째로 세면 그날이 1일째다', () => {
    expect(ddayLabel('2026-10-09', '2026-10-09', true)).toBe('1일째');
    expect(ddayLabel('2026-07-02', '2026-10-09', true)).toBe('100일째');
    expect(ddayLabel('2026-10-19', '2026-10-09', true)).toBe('D-10');
  });

  it('공개 카드는 pub에도 쓰고 날짜 순서로 읽는다', () => {
    expect(cardWrites('k', card)).toEqual({ 'cards/k': card, 'pub/k': card });
    expect(cardWrites('k', { ...card, pub: false })).toEqual({ 'cards/k': { ...card, pub: false }, 'pub/k': null });
    expect(cardWrites('k', null)).toEqual({ 'cards/k': null, 'pub/k': null });
    const rows = parseCards([{ key: 'b', value: card }, { key: 'a', value: { ...card, date: '2026-10-01' } }, { key: 'x', value: { ...card, name: '' } }]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('카드 글자색 (HOM-21)', () => {
  const lum = (hex: string) =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };

  it('모든 카드 색에서 작은 글자도 4.5:1 이상이다', () => {
    for (const [c] of COLORS) expect(contrast(c, inkOn(c))).toBeGreaterThanOrEqual(4.5);
    expect(COLORS.map(([c]) => inkOn(c))).toEqual(['#1d1d1f', '#1d1d1f', '#1d1d1f', '#1d1d1f', '#ffffff', '#ffffff']);
  });
});
