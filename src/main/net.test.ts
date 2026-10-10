import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }));
const { allowedPost } = await import('./net');

describe('allowedPost', () => {
  it('디스코드 웹훅 주소만 받는다', () => {
    expect(allowedPost('https://discord.com/api/webhooks/1/abc')).toBe(true);
    expect(allowedPost('https://discordapp.com/api/webhooks/1/abc')).toBe(true);
    expect(allowedPost('http://discord.com/api/webhooks/1/abc')).toBe(false);
    expect(allowedPost('https://discord.com/api/users/@me')).toBe(false);
    expect(allowedPost('https://example.com/api/webhooks/1/abc')).toBe(false);
    expect(allowedPost('not a url')).toBe(false);
  });
});
