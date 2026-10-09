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

export const updateState = () => ({ version: ready });
export const installUpdate = () => updater?.quitAndInstall();

export function startUpdater(onReady: (version: string) => void): void {
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
  u.on('error', (e: Error) => (mainStatus['업데이트'] = `오류 ${e.message}`));
  u.on('update-downloaded', ({ version }) => {
    ready = version;
    mainStatus['업데이트'] = `${version} 받음`;
    onReady(version);
  });
  const check = () => void u.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, CHECK_MS);
}
