import { describe, expect, it } from 'vitest';
import { hookBody } from './logic';

describe('hookBody', () => {
  it('머리줄에 이름과 버전을 넣고 멘션을 끈다', () => {
    const b = hookBody('토끼', '0.1.0', '방에 들어가면 창이 깜빡여요');
    expect(b.content).toBe('[버그 제보] 토끼 (v0.1.0)\n방에 들어가면 창이 깜빡여요');
    expect(b.allowed_mentions).toEqual({ parse: [] });
  });
  it('이름이 없으면 이름 없음이고 긴 글은 1900자에서 자른다', () => {
    const b = hookBody('', '0.1.0', '가'.repeat(3000));
    expect(b.content.startsWith('[버그 제보] 이름 없음 (v0.1.0)')).toBe(true);
    expect(b.content.length).toBe(1900);
  });
});
