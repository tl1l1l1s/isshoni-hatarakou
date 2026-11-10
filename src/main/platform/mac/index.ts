// 개발용 최소 구현. Mac에서 동작을 확인하지 않았다 (Mac판을 만들 때 다시 본다)
import { app } from 'electron';
import { macAppKey, type AppKey } from '@shared/appkey';
import type { Platform } from '../ports';

// 자주 쓰는 Mac 그림 앱의 번들 ID. 공개된 앱 Info.plist로 확인한 것만 넣었다 (2026년 10월). 없는 앱은 사용자가 설정에서 더한다
const PEN_APPS = new Set<AppKey>(
  [
    'jp.co.celsys.CLIPSTUDIOPAINT', 'com.adobe.Photoshop', 'com.adobe.illustrator', 'org.krita', 'com.firealpaca',
    'org.aseprite.Aseprite', 'org.blenderfoundation.blender',
  ].map(macAppKey),
);

export const mac: Omit<Platform, 'idleSeconds' | 'cursorPoint'> = {
  activeWindow: {
    async foreground() {
      try {
        const { activeWindow } = await import('get-windows');
        // 창 제목과 주소를 읽지 않으니 두 권한 확인을 끈다
        const w = await activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
        if (w?.platform !== 'macos' || !w.owner.bundleId) return { appKey: null, unknownReason: 'unknown' };
        return { appKey: macAppKey(w.owner.bundleId), unknownReason: null, bounds: w.bounds };
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
      // 없으면 macOS가 창을 메뉴 막대 아래로 되돌려 스테이지 위쪽이 작업 영역 위로 나가지 못한다 (stage.setSize의 spare)
      enableLargerThanScreen: true,
    },
    afterCreate: (w) => w.setAlwaysOnTop(true, 'screen-saver'),
    afterShow: () => {},
    // Windows 전용 우회라 Mac에서는 바꾸지 않는다
    setOpacity252: () => {},
  },
};
