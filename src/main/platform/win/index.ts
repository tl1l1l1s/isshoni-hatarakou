import { app, screen } from 'electron';
import { winAppKey, type AppKey } from '@shared/appkey';
import type { Platform } from '../ports';

// 자주 쓰는 Windows 그림 앱의 실행 파일 이름. 없는 앱은 사용자가 설정에서 더한다
const PEN_APPS = new Set<AppKey>(
  [
    'clipstudiopaint.exe', 'photoshop.exe', 'illustrator.exe', 'sai.exe', 'sai2.exe', 'krita.exe',
    'firealpaca.exe', 'medibangpaintpro.exe', 'mspaint.exe', 'paintdotnet.exe', 'aseprite.exe',
    'sketchbook.exe', 'artrage.exe', 'animate.exe', 'blender.exe', 'zbrush.exe', 'coreldrw.exe',
  ].map(winAppKey),
);

// 읽기와 쓰기에 같은 객체를 써야 켜짐으로 읽힌다
const LOGIN_ITEM = { path: process.execPath, args: [] as string[] };

// 바탕화면(Win+D, 빈 가상 데스크톱)과 작업 보기는 모니터를 꽉 채우는 explorer.exe 창이지만 전체 화면 앱이 아니다. 영역을 넘기지 않아 캐릭터가 숨지 않게 한다.
// shortcut: 파일 탐색기 전체 화면(F11)도 함께 빠진다, 그 위에서도 숨겨야 하면 창 클래스로 바탕화면만 고른다
const SHELL = winAppKey('explorer.exe');

export const win: Omit<Platform, 'idleSeconds' | 'cursorPoint'> = {
  activeWindow: {
    async foreground() {
      try {
        const { activeWindow } = await import('get-windows');
        const w = await activeWindow();
        // get-windows는 물리 픽셀을 준다. 리눅스에는 바꾸는 함수가 없어 그대로 둔다
        const bounds = w && (screen.screenToDipRect?.(null, w.bounds) ?? w.bounds);
        // 관리자 권한 창처럼 경로를 못 읽으면 이유가 있는 알 수 없음으로 둔다
        if (!w?.owner.path) return { appKey: null, unknownReason: 'elevated-or-unknown', ...(bounds && { bounds }) };
        const appKey = winAppKey(w.owner.path);
        return { appKey, unknownReason: null, ...(bounds && appKey !== SHELL && { bounds }) };
      } catch {
        return { appKey: null, unknownReason: 'error' };
      }
    },
  },
  penApps: {
    user: new Set(),
    isPen(k) {
      return PEN_APPS.has(k) || this.user.has(k);
    },
  },
  autoStart: {
    // openAtLogin은 Windows 설정의 시작 앱에서 끈 것을 모른다. 이 값은 실제로 켜질지를 본다
    get: () => app.getLoginItemSettings(LOGIN_ITEM).executableWillLaunchAtLogin,
    set: (on) => app.setLoginItemSettings({ ...LOGIN_ITEM, openAtLogin: on }),
  },
  overlay: {
    options: {
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      resizable: false,
    },
    afterCreate: (w) => w.setAlwaysOnTop(true, 'screen-saver'),
    // 불투명도가 255보다 낮은 창은 Chromium이 아래 창을 가리는 창으로 세지 않는다. GPU 합성이 꺼져 있으면 건너뛴다
    setOpacity252: (w, on) => {
      if (on && !app.getGPUFeatureStatus().gpu_compositing.startsWith('enabled')) return;
      w.setOpacity(on ? 252 / 255 : 1);
    },
  },
};
