import { describe, expect, it } from 'vitest';
import { assertExpectedErrors } from '../../.claude/skills/verify-isshoni/drive.ts';

describe('verify 오류 판정', () => {
  it('예상하지 않은 오류는 실패하고 빈 목록은 통과한다', () => {
    expect(() => assertExpectedErrors([])).not.toThrow();
    expect(() => assertExpectedErrors(['panel crashed'])).toThrow('panel crashed');
  });
  it('명시한 오류도 정해진 횟수만 허용한다', () => {
    const expected = [{ pattern: /^의도한 오류$/, count: 1 }];
    expect(() => assertExpectedErrors(['의도한 오류'], expected)).not.toThrow();
    expect(() => assertExpectedErrors([], expected)).toThrow();
    expect(() => assertExpectedErrors(['의도한 오류', '의도한 오류'], expected)).toThrow();
    expect(() => assertExpectedErrors(['의도한 오류', '다른 오류'], expected)).toThrow('다른 오류');
  });
});
