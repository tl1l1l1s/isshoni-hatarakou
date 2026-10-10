import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }));
const { allowedGet, allowedPost } = await import('./net');

describe('allowedGet', () => {
  it('유튜브 oEmbed JSON 주소만 받는다', () => {
    const video = encodeURIComponent('https://youtu.be/dQw4w9WgXcQ');
    expect(allowedGet(`https://www.youtube.com/oembed?url=${video}&format=json`)).toBe(true);
    expect(allowedGet(`http://www.youtube.com/oembed?url=${video}&format=json`)).toBe(false);
    expect(allowedGet(`https://www.youtube.com/oembed?url=${video}`)).toBe(false);
    expect(allowedGet('https://www.youtube.com/oembed?format=json')).toBe(false);
    expect(allowedGet(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json&url=x`)).toBe(false);
    expect(allowedGet(`https://youtube.com.evil.example/oembed?url=${video}&format=json`)).toBe(false);
    expect(allowedGet(`https://www.youtube.com:8443/oembed?url=${video}&format=json`)).toBe(false);
    expect(allowedGet(`https://user@www.youtube.com/oembed?url=${video}&format=json`)).toBe(false);
    expect(allowedGet(`https://:pw@www.youtube.com/oembed?url=${video}&format=json`)).toBe(false);
  });
});

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
