// 메인 프로세스 생명주기 (10.4). 기능 로직은 두지 않는다
import { app, globalShortcut, Menu, powerMonitor, screen, session } from 'electron';
import log from 'electron-log/main';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ID } from '@shared/constants';
import type { CoreEventMap } from '../preload/api';
import { startActivity } from './activity';
import { startClickThrough } from './clickthrough';
import { crashReady, endRun, startCrash } from './crash';
import { registerIpc } from './ipc';
import { initLog, mainStatus } from './log';
import { osName, platform } from './platform';
import { registerScheme, serveApp } from './protocol';
import { createStore } from './store';
import { createTray } from './tray';
import { startUpdater } from './updater';
import { createStage, getRects, getStage, place, send, setVisible, toggle, useStore } from './windows/manager';

registerScheme();

// 데이터 폴더를 지금 이름에 고정한다. productName을 바꿔도 설정, 저장 파일, 로그인이 그대로 남는다 (ADR 0024).
// 시험은 --user-data-dir로 따로 준다. 단일 실행 잠금도 이 폴더에 생기므로 잠금보다 먼저 한다
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'isshoni-hatarakou'));
// GPU가 투명 창을 검게 그리는 PC용. 데이터 폴더에 no-gpu 파일을 두거나 ISSHONI_NO_GPU=1로 켠다
if (process.env.ISSHONI_NO_GPU === '1' || existsSync(join(app.getPath('userData'), 'no-gpu'))) {
  app.disableHardwareAcceleration();
  mainStatus['하드웨어 가속'] = '꺼짐';
}

if (!app.requestSingleInstanceLock()) app.quit();
else boot();

function boot(): void {
  initLog();
  // Windows 알림은 설치 프로그램이 만든 바로 가기와 같은 ID가 있어야 뜬다 (electron-builder.yml의 appId)
  if (osName === 'win') app.setAppUserModelId(APP_ID);
  const store = createStore(app.getPath('userData'), (e) => log.error('store write failed', e));
  useStore(store);
  // 자동 오류 보고 (NFR-21). 지난 실행의 비정상 종료 표시를 새 로그가 쌓이기 전에 본다
  startCrash(store, () => send('crash.added', {}));

  app.on('second-instance', () => setVisible(true));
  // Mac에서 켜져 있는 앱을 Finder로 다시 열면 second-instance 대신 이 이벤트가 온다
  app.on('activate', () => setVisible(true));
  // 트레이 앱이라 창이 모두 닫혀도(스테이지를 다시 만드는 중에도) 끝내지 않는다
  app.on('window-all-closed', () => {});
  // 종료 전에 렌더러에 shutdown을 보내 모듈이 저장하게 한다. 렌더러가 app.quit을 다시 부르거나 1.5초가 지나면 끝낸다
  let shutdownSent = false;
  app.on('before-quit', (e) => {
    if (shutdownSent || !getStage()) return;
    e.preventDefault();
    shutdownSent = true;
    send('lifecycle', { type: 'shutdown' });
    setTimeout(() => app.quit(), 1500);
  });
  app.on('will-quit', () => {
    store.flush();
    globalShortcut.unregisterAll();
  });

  const lifecycle = (type: CoreEventMap['lifecycle']['type']) => () => {
    send('lifecycle', { type });
    store.flush();
  };
  // Windows 로그오프. session-end 처리기에서 돌아가면 Windows가 언제든 프로세스를 끝내므로 IPC를 기다릴 수 없다.
  // 렌더러는 바뀐 값을 바로 보내고 메인이 들고 있으므로(store) 앞선 확인 단계(query-session-end)에서 트레이 종료와 같은 길로
  // 끝내기 시작해 모듈이 shutdown에 저장하는 값까지 받고 session-end에서는 들고 있는 것을 동기로 쓰고 바로 끝낸다.
  // 창마다 오므로 shutdown은 한 번만 보낸다
  app.on('browser-window-created', (_e, w) => {
    w.on('query-session-end', () => void (shutdownSent || app.quit()));
    w.on('session-end', () => {
      store.flush();
      // app.exit은 will-quit 없이 끝나므로 정상 종료 표시를 여기서 지운다
      endRun();
      app.exit(0);
    });
  });

  void app.whenReady().then(() => {
    // 앱이 쓰는 웹 권한이 없다. 알림과 클립보드는 메인이 직접 한다
    session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    if (osName === 'mac') {
      // 기본 메뉴의 Cmd+R이 about:blank 패널을 다시 읽어 비운다. 복사와 붙여넣기 단축키에 필요한 메뉴만 둔다.
      // 트레이 앱이라 Dock에서도 뺀다
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
      app.dock?.hide();
    }
    serveApp(store);
    registerIpc(store);
    crashReady();
    createStage();
    createTray();
    startActivity(platform, (s) => send('activity', s));
    startClickThrough(getStage, getRects, platform.cursorPoint);
    startUpdater((version) => send('update.ready', { version }));
    // 렌더러가 멈춰도 동작하도록 메인이 처리한다. Mac의 Cmd+Option+H는 다른 앱 가리기라서 두 OS 모두 Control을 쓴다
    if (!globalShortcut.register('Control+Alt+H', toggle)) {
      log.warn('hide shortcut register failed');
      mainStatus['전역 단축키'] = 'Ctrl+Alt+H 등록 실패';
    }

    powerMonitor.on('suspend', lifecycle('suspend'));
    powerMonitor.on('resume', lifecycle('resume'));
    powerMonitor.on('lock-screen', lifecycle('lock'));
    powerMonitor.on('unlock-screen', lifecycle('unlock'));
    powerMonitor.on('shutdown', lifecycle('shutdown'));

    // 배율과 해상도 변경은 마지막 변경 뒤 0.4초에 한 번 처리한다
    let t: ReturnType<typeof setTimeout> | undefined;
    const replace = () => {
      clearTimeout(t);
      t = setTimeout(place, 400);
    };
    screen.on('display-metrics-changed', replace);
    screen.on('display-added', replace);
    screen.on('display-removed', replace);
  });
}
