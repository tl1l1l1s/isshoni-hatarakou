// 유튜브 embed iframe에 postMessage로 명령을 보내고 이벤트를 받는다. 유튜브 스크립트는 쓰지 않는다 (CSP script-src 'self')
import { useEffect, useRef, type RefObject } from 'react';
import type { Ctx } from '@core/types';

// embed 주소에 origin을 붙이지 않으면 플레이어가 app:// 창에서 온 명령을 무시한다
const YT = 'https://www.youtube-nocookie.com';
export type YtMsg = { event?: string; info?: unknown };
type Frame = RefObject<HTMLIFrameElement | null>;

export const embedSrc = (v: string) => `${YT}/embed/${v}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`;

export const command = (frame: Frame, func: string, args: unknown[] = []) =>
  frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT);

/** iframe이 뜨면 이벤트를 받겠다고 알린다. 첫 응답이 올 때까지 0.5초마다 다시 알린다. key가 바뀌면(새 iframe) 다시 건다.
 *  플레이어는 메시지를 보낸 창으로 답하는데 이 코드는 패널이 아니라 스테이지 창에서 돈다 */
export function useYouTube(ctx: Ctx, frame: Frame, key: unknown, onMsg: (m: YtMsg) => void): void {
  const handler = useRef(onMsg);
  handler.current = onMsg;
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const hello = () => f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT);
    let stopHello = () => {};
    const onLoad = () => {
      stopHello();
      stopHello = ctx.timers.every(500, hello);
      hello();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== f.contentWindow || e.origin !== YT || typeof e.data !== 'string') return;
      stopHello();
      let m: YtMsg;
      try {
        m = JSON.parse(e.data) as YtMsg;
      } catch {
        return;
      }
      handler.current(m);
    };
    f.addEventListener('load', onLoad);
    window.addEventListener('message', onMessage);
    return () => {
      stopHello();
      f.removeEventListener('load', onLoad);
      window.removeEventListener('message', onMessage);
    };
  }, [ctx, frame, key]);
}
