// 개발용 최소 구현. Mac에서 동작을 확인하지 않았다 (Mac판을 만들 때 다시 본다)
import { app } from 'electron';
import { macAppKey } from '@shared/appkey';
import type { Platform } from '../ports';

export const mac: Omit<Platform, 'idleSeconds' | 'cursorPoint'> = {
  activeWindow: {
    async foreground() {
      try {
        const { activeWindow } = await import('get-windows');
        // 창 제목과 주소를 읽지 않으니 두 권한 확인을 끈다
        const w = await activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
        if (w?.platform !== 'macos' || !w.owner.bundleId) return { appKey: null, unknownReason: 'unknown' };
        return { appKey: macAppKey(w.owner.bundleId), unknownReason: null };
      } catch {
        return { appKey: null, unknownReason: 'error' };
      }
    },
  },
  penApps: {
    user: new Set(),
    isPen(k) {
      return this.user.has(k);
    },
  },
  autoStart: {
    get: () => app.getLoginItemSettings().openAtLogin,
    set: (on) => app.setLoginItemSettings({ openAtLogin: on }),
  },
  overlay: {
    options: {
      type: 'panel',
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      resizable: false,
    },
    afterCreate: (w) => w.setAlwaysOnTop(true, 'screen-saver'),
    // Windows 전용 우회라 Mac에서는 바꾸지 않는다
    setOpacity252: () => {},
  },
};
