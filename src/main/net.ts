import { net } from 'electron';

/** 모듈이 바깥으로 JSON을 보낼 수 있는 주소. 디스코드 웹훅처럼 미리 허락한 호스트의 웹훅 경로만 받는다 */
const POST_HOSTS = ['discord.com', 'discordapp.com'];
const TIMEOUT_MS = 10_000;
/** 읽기 응답 상한. oEmbed 응답은 1KB 안팎이다 */
const GET_MAX_BYTES = 64 * 1024;

export function allowedPost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && POST_HOSTS.includes(u.hostname) && u.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

/** 모듈이 바깥에서 읽을 수 있는 주소. 유튜브 oEmbed(영상 제목)의 JSON 주소만 받는다 */
export function allowedGet(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' && u.hostname === 'www.youtube.com' && !u.port && !u.username && !u.password && u.pathname === '/oembed' &&
      u.searchParams.get('format') === 'json' && !!u.searchParams.get('url')
    );
  } catch {
    return false;
  }
}

/** 허락한 주소에 JSON 본문을 POST한다. 10초 안에 답이 없으면 예외 */
export async function postJson(url: string, json: string): Promise<{ ok: boolean; status: number }> {
  if (!allowedPost(url)) throw new Error('보낼 수 없는 주소입니다');
  const r = await net.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { ok: r.ok, status: r.status };
}

/** 허락한 주소에서 JSON을 읽는다. ok가 아니면 json은 null이다. 다른 곳으로 넘기는 응답, 10초 넘김, 64KB 넘김, JSON이 아닌 본문은 예외 */
export async function getJson(url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  if (!allowedGet(url)) throw new Error('읽을 수 없는 주소입니다');
  const r = await net.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) return { ok: false, status: r.status, json: null };
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const part of r.body ?? []) {
    size += part.byteLength;
    if (size > GET_MAX_BYTES) throw new Error('응답이 너무 큽니다');
    parts.push(part);
  }
  return { ok: true, status: r.status, json: JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown };
}
