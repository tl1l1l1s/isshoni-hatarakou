import { describe, expect, it, vi } from 'vitest';

const onBeforeSendHeaders = vi.fn();
vi.mock('electron', () => ({ net: {}, protocol: {}, session: { defaultSession: { webRequest: { onBeforeSendHeaders } } } }));
const { getFrameOrigins, setFrameOrigins } = await import('./protocol');

describe('setFrameOrigins', () => {
  it('https 출처만 정렬해 저장하고 같은 목록이면 false라 다시 읽기를 되풀이하지 않는다', () => {
    const writes: unknown[] = [];
    const store = { read: () => null, write: (_p: string, d: unknown) => void writes.push(d), flush: () => {} };
    const list = ['https://www.youtube.com', 'http://evil.test', "https://a.test 'unsafe-inline'", 'https://a.test:8443', 'https://*.x.test', 'https://www.youtube.com'];
    expect(setFrameOrigins(store, list)).toBe(true);
    expect(getFrameOrigins()).toEqual(['https://a.test:8443', 'https://www.youtube.com']);
    expect(setFrameOrigins(store, list)).toBe(false);
    expect(setFrameOrigins(store, ['https://www.youtube.com', 'https://a.test:8443'])).toBe(false);
    expect(writes).toEqual([['https://a.test:8443', 'https://www.youtube.com']]);
    expect(setFrameOrigins(store, [])).toBe(true);
    expect(getFrameOrigins()).toEqual([]);
  });

  it('허용한 출처로 가는 요청에만 앱 id Referer를 붙이고 목록이 비면 처리 함수를 뺀다', () => {
    const store = { read: () => null, write: () => {}, flush: () => {} };
    setFrameOrigins(store, ['https://www.youtube-nocookie.com']);
    const [filter, fn] = onBeforeSendHeaders.mock.lastCall as [{ urls: string[] }, (d: unknown, cb: (r: unknown) => void) => void];
    expect(filter.urls).toEqual(['https://www.youtube-nocookie.com/*']);
    const cb = vi.fn();
    fn({ requestHeaders: { Accept: '*/*' } }, cb);
    expect(cb).toHaveBeenCalledWith({ requestHeaders: { Accept: '*/*', Referer: 'https://app.isshoni-hatarakou.gift/' } });
    setFrameOrigins(store, []);
    expect(onBeforeSendHeaders.mock.lastCall).toEqual([null]);
  });
});
