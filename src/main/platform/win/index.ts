import { app } from 'electron';
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

export const win: Omit<Platform, 'idleSeconds' | 'cursorPoint'> = {
  activeWindow: {
    async foreground() {
      try {
        const { activeWindow } = await import('get-windows');
        const w = await activeWindow();
        // 관리자 권한 창처럼 경로를 못 읽으면 이유가 있는 알 수 없음으로 둔다
        if (!w?.owner.path) return { appKey: null, unknownReason: 'elevated-or-unknown' };
        return { appKey: winAppKey(w.owner.path), unknownReason: null };
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
