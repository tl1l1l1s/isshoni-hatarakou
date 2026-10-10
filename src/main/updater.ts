// Windows 자동 업데이트 (NFR-19, OPS-13, 10.10.3). 시작할 때와 6시간마다 확인하고 자동으로 받는다.
// 설치는 사용자가 스테이지의 다시 시작을 누를 때 한다. 서명하지 않은 Mac은 아직 아무것도 하지 않는다.
// 받는 곳은 설치 파일 안의 app-update.yml(electron-builder.yml의 publish, 공개 저장소의 GitHub Releases)이다.
import { app } from 'electron';
import log from 'electron-log/main';
import { NsisUpdater } from 'electron-updater';
import { mainStatus } from './log';
import { osName } from './platform';

const CHECK_MS = 6 * 3_600_000;

let updater: NsisUpdater | null = null;
let ready: string | null = null;

export const updateState = () => ({ version: ready, status: mainStatus['업데이트'] ?? '' });
export const installUpdate = () => updater?.quitAndInstall();

/** onStatus는 업데이트 상태 줄이 바뀔 때마다 받는다. 렌더러가 이 기기의 버전 기록에 남긴다 (OPS-7) */
export function startUpdater(onReady: (version: string) => void, onStatus: (status: string) => void): void {
  const status = (s: string) => {
    mainStatus['업데이트'] = s;
    onStatus(s);
  };
  if (osName !== 'win' || !app.isPackaged) {
    mainStatus['업데이트'] = '꺼짐';
    return;
  }
  const u = (updater = new NsisUpdater());
  u.logger = log;
  // 기본값은 앱이 끝날 때 설치하기라서 Windows 로그오프 중에도 설치가 시작된다. 다시 시작 버튼으로만 설치한다
  u.autoInstallOnAppQuit = false;
  mainStatus['업데이트'] = '확인 전';
  // error 이벤트에 듣는 쪽이 없으면 예외가 된다. 내용은 logger가 이미 적는다
  u.on('error', (e: Error) => status(`오류 ${e.message.split('\n')[0]?.slice(0, 200)}`));
  u.on('update-downloaded', ({ version }) => {
    ready = version;
    status(`${version} 받음`);
    onReady(version);
  });
  // 받기 실패(체크섬, 끊긴 연결)는 error 이벤트로 이미 남는다. 돌려준 downloadPromise를 받아 두지 않으면 처리하지 않은 거절이 되어 오류 보고 자리를 차지한다
  const check = () => void u.checkForUpdates().then((r) => r?.downloadPromise?.catch(() => undefined)).catch(() => undefined);
  check();
  setInterval(check, CHECK_MS);
}
