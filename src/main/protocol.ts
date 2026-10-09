// 앱 전용 scheme과 CSP (10.4 페이지 출처와 CSP)
import { net, protocol, session } from 'electron';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ID } from '@shared/constants';
import { FRAME_ORIGIN } from '../preload/api';
import type { Store } from './store';

const DEV = process.env.ELECTRON_RENDERER_URL;

export const pageUrl = DEV ?? 'app://bundle/index.html';

/** app ready 전에 불러야 한다 */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  ]);
}

// 모듈 manifest externalOrigins를 렌더러가 알려 주면 여기에 저장한다. 비어 있으면 frame-src 'none'
const CSP_FILE = 'device/csp.json';
let frameOrigins: string[] = [];
const normalize = (list: unknown[]) => [...new Set(list.filter((o): o is string => typeof o === 'string' && FRAME_ORIGIN.test(o)))].sort();
export const getFrameOrigins = () => frameOrigins;

/** 지금 정책과 다를 때만 저장하고 true. 같은 목록으로는 다시 읽기를 부르지 않으므로 반복되지 않는다 */
export function setFrameOrigins(store: Store, list: string[]): boolean {
  const next = normalize(list);
  if (next.join(' ') === frameOrigins.join(' ')) return false;
  frameOrigins = next;
  applyReferer();
  store.write(CSP_FILE, next);
  return true;
}

function csp(): string {
  // 개발 때는 Vite React preamble(인라인 스크립트)과 HMR 웹소켓을 허용한다
  const dev = DEV ? new URL(DEV).origin : '';
  const devConnect = dev ? ` ${dev} ${dev.replace(/^http/, 'ws')}` : '';
  return [
    "default-src 'self'",
    `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.googleapis.com${devConnect}`,
    // about:blank 패널은 스테이지의 정책을 물려받는다
    `frame-src ${frameOrigins.join(' ') || "'none'"}`,
  ].join('; ');
}

/** 허용한 외부 출처로 가는 요청에 앱 id 주소를 Referer로 붙인다. YouTube 삽입 플레이어는 Referer가 없으면 재생을 막는다(오류 153).
 *  YouTube는 웹이 아닌 앱에 앱 id를 Referer로 보내라고 안내한다. 세션마다 처리 함수가 하나라서 출처가 바뀌면 다시 등록한다 */
function applyReferer(): void {
  const urls = frameOrigins.map((o) => `${o}/*`);
  if (!urls.length) return void session.defaultSession.webRequest.onBeforeSendHeaders(null);
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (d, cb) =>
    cb({ requestHeaders: { ...d.requestHeaders, Referer: `https://${APP_ID}/` } }),
  );
}

export function serveApp(store: Store): void {
  const saved = store.read(CSP_FILE);
  frameOrigins = normalize(Array.isArray(saved) ? saved : []);
  applyReferer();
  if (DEV) {
    session.defaultSession.webRequest.onHeadersReceived({ urls: [`${new URL(DEV).origin}/*`] }, (d, cb) =>
      cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': [csp()] } }),
    );
    return;
  }
  const root = join(__dirname, '../renderer');
  protocol.handle('app', async (req) => {
    const file = join(root, decodeURIComponent(new URL(req.url).pathname));
    if (!file.startsWith(root + sep)) return new Response(null, { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', csp());
    return new Response(res.body, { status: res.status, headers });
  });
}
