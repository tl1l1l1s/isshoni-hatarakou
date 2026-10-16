// 앱 끝내기 (ADR 0042). 트레이 종료와 Mac Cmd+Q는 렌더러가 저장하지 않은 편집을 묻고 모듈이 저장한 뒤 app.quit을 다시 부르게 한다.
// 로그오프와 업데이트 설치는 묻지 않고 저장만 한다
import { app } from 'electron';
import { getStage, send, setQuitting } from './windows/manager';

/** 렌더러가 이 시간 안에 묻기 시작하거나 저장을 끝내지 않으면(멈춘 렌더러) 메인이 끝낸다 */
const WAIT_MS = 1500;
let going = false;
let ask = true;
let timer: ReturnType<typeof setTimeout> | null = null;

export function watchQuit(): void {
  app.on('before-quit', (e) => {
    if (going || !getStage()) return void setQuitting();
    e.preventDefault();
    // 로그오프는 창마다 오고 트레이 종료는 묻는 동안 또 누를 수 있다. 렌더러는 이미 끝내는 중이거나 묻는 중이면 다시 묻지 않는다
    send('quit.request', { ask });
    timer ??= setTimeout(quitNow, WAIT_MS);
  });
}

/** 렌더러가 저장을 마쳤거나 더 기다리지 않을 때. 다음 before-quit은 막지 않는다 */
export function quitNow(): void {
  going = true;
  app.quit();
}

/** 로그오프와 업데이트 설치. 업데이트는 렌더러가 다시 시작 단추에서 먼저 묻는다 */
export function quitWithoutAsking(quit: () => void = () => app.quit()): void {
  ask = false;
  quit();
}

/** 렌더러가 묻는 중이다. 사용자가 고를 때까지 끝내지 않고 계속하기를 고르면 그대로 둔다 */
export function waitQuit(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
