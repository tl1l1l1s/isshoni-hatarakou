import { describe, expect, it } from 'vitest';
import { PRESENCE_MODULE_MAX_BYTES } from '@shared/constants';
import { APP_NAME_MAX, newKey, OPEN_MAX_MS, stateOf } from './logic';
import { qr, rs } from './qr';

describe('폰 연결 상태', () => {
  const K = 'k'.repeat(32);
  const sig = (p: Partial<{ open: boolean; at: number }> = {}) => ({ open: true, app: '', at: 0, ...p });
  it.each([
    ['키 없음', null, sig(), 0, 'off'],
    ['신호 없음', K, null, 0, 'waiting'],
    ['열림', K, sig(), OPEN_MAX_MS - 1, 'drawing'],
    ['4시간 넘은 열림', K, sig(), OPEN_MAX_MS, 'expired'],
    ['닫힘', K, sig({ open: false }), 0, 'resting'],
  ] as const)('%s', (_n, key, s, now, state) => {
    expect(stateOf(key, s, now)).toBe(state);
  });
  it('키는 32자 16진수다', () => {
    expect(newKey()).toMatch(/^[0-9a-f]{32}$/);
  });
  it('가장 긴 한글 앱 이름도 presence 128바이트 안에 든다', () => {
    expect(new TextEncoder().encode(JSON.stringify({ app: '가'.repeat(APP_NAME_MAX) })).length).toBeLessThanOrEqual(PRESENCE_MODULE_MAX_BYTES);
  });
});

describe('QR', () => {
  it('리드 솔로몬 코드워드가 규격 예시와 같다 (HELLO WORLD 1-M)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rs(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
  it('길이에 맞는 버전을 고르고 세 모서리에 찾기 무늬를 둔다', () => {
    expect(qr('hi')!.length).toBe(21);
    const m = qr(`https://example.web.app/phone/#${'u'.repeat(28)}.${'k'.repeat(32)}`)!;
    expect(m.length).toBe(37);
    for (const [x, y] of [[0, 0], [30, 0], [0, 30]] as const) {
      expect(m[y + 3]!.slice(x, x + 7).map(Number)).toEqual([1, 0, 1, 1, 1, 0, 1]);
    }
    expect(qr('x'.repeat(107))).toBeNull();
  });
});
