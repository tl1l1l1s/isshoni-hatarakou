// process.platform을 읽는 유일한 파일. 시작할 때 한 번 구현을 고른다 (10.8.1)
import { app, powerMonitor, screen, type BrowserWindowConstructorOptions } from 'electron';
import { release } from 'node:os';
import { macAppKey, winAppKey } from '@shared/appkey';
import { APP_ID } from '@shared/constants';
import { lessForeground } from '../activity';
import type { Platform } from './ports';
import { FakePlatform } from './fake';
import { mac } from './mac';
import { win } from './win';

export const osName = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'other';

/** 이 앱의 활성 앱 키. 직전에 쓴 다른 앱을 고를 때 뺀다. Mac 번들 ID는 electron-builder.yml의 appId */
export const selfAppKey =
  process.env.ISSHONI_FAKE_PLATFORM === '1'
    ? null
    : osName === 'win'
      ? winAppKey(process.execPath)
      : osName === 'mac'
        ? macAppKey(app.isPackaged ? APP_ID : 'com.github.Electron')
        : null;

const fake = process.env.ISSHONI_FAKE_PLATFORM === '1' ? new FakePlatform() : null;

/** 패널 창의 OS 반투명 재질. Acrylic은 Windows 11 22H2(빌드 22621)부터라 그 전에는 끈다. 시험용 가짜 플랫폼도 끈다 */
export const panelMaterial: BrowserWindowConstructorOptions | null = fake
  ? null
  : osName === 'win' && Number(release().split('.')[2] ?? 0) >= 22621
    ? { backgroundMaterial: 'acrylic', backgroundColor: '#00000000' }
    : osName === 'mac'
      ? { vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000' }
      : null;
// Playwright 시험이 app.evaluate로 앞에 있는 앱과 유휴 초를 바꾼다
if (fake) Object.assign(globalThis, { fakePlatform: fake });

export const platform: Platform =
  fake
    ? fake
    : {
        // 리눅스는 대상이 아니라 Windows 구현을 그대로 쓴다
        ...(osName === 'mac' ? mac : win),
        // Mac은 조회마다 보조 프로세스를 띄우므로 1.5초에 한 번까지만 묻는다
        // Windows get-windows 9.3.0은 조회마다 창 제목 버퍼를 놓쳐 오래 켜 둘수록 메모리가 조금씩 는다. 2초마다만 물어 누수를 줄인다
        activeWindow: lessForeground((osName === 'mac' ? mac : win).activeWindow, () => powerMonitor.getSystemIdleTime(), osName === 'mac' ? 1500 : 2000),
        idleSeconds: () => powerMonitor.getSystemIdleTime(),
        cursorPoint: () => screen.getCursorScreenPoint(),
      };
