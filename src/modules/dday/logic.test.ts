import { describe, expect, it } from 'vitest';
import { Card, cardWrites, COLORS, ddayLabel, inkOn, parseCards, parseHex } from './logic';

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
    expect(COLORS.map(([c]) => inkOn(c))).toEqual(['#000000', '#000000', '#000000', '#000000', '#ffffff', '#ffffff']);
  });

  it('사용자가 고른 어떤 색에서도 4.5:1 이상이다', () => {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    let worst = Infinity;
    for (let r = 0; r < 256; r += 5) {
      for (let g = 0; g < 256; g += 5) {
        for (let b = 0; b < 256; b += 5) {
          const c = `#${hex(r)}${hex(g)}${hex(b)}`;
          worst = Math.min(worst, contrast(c, inkOn(c)));
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it('색 코드는 #RRGGBB와 #RGB를 받아 소문자 #rrggbb로 바꾼다', () => {
    expect(parseHex('#3A8FD9')).toBe('#3a8fd9');
    expect(parseHex(' #f0a ')).toBe('#ff00aa');
    expect(parseHex('2f9e5b')).toBe('#2f9e5b');
    for (const bad of ['', '#', '#12', '#1234', '#12345', '#1234567', '#ggg', 'red', '##123456']) expect(parseHex(bad)).toBeNull();
    // 바꾼 값과 예전 기본 색은 카드 모양에 맞는다
    for (const color of [parseHex('#f0a'), parseHex('ABCDEF'), ...COLORS.map(([c]) => c)]) expect(Card.safeParse({ ...card, color }).success).toBe(true);
  });
});
