import { describe, expect, it } from 'vitest';
import { expired } from './backup';

describe('expired', () => {
  it('최근 7개만 남기고 날짜 이름이 아닌 파일은 건드리지 않는다', () => {
    const days = Array.from({ length: 9 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}.json`);
    const names = ['files', '2026-10-10.json.tmp', 'notes.txt', ...days.reverse()];
    expect(expired(names)).toEqual(['2026-10-02.json', '2026-10-01.json']);
  });
  it('7개 이하면 지우지 않는다', () => {
    expect(expired(['2026-10-01.json', '2026-10-02.json'])).toEqual([]);
  });
});
