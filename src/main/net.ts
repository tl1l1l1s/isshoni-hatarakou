import { net } from 'electron';

/** 모듈이 바깥으로 JSON을 보낼 수 있는 주소. 디스코드 웹훅처럼 미리 허락한 호스트의 웹훅 경로만 받는다 */
const POST_HOSTS = ['discord.com', 'discordapp.com'];

export function allowedPost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && POST_HOSTS.includes(u.hostname) && u.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

/** 허락한 주소에 JSON 본문을 POST한다. 10초 안에 답이 없으면 예외 */
export async function postJson(url: string, json: string): Promise<{ ok: boolean; status: number }> {
  if (!allowedPost(url)) throw new Error('보낼 수 없는 주소입니다');
  const r = await net.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json, signal: AbortSignal.timeout(10_000) });
  return { ok: r.ok, status: r.status };
}
