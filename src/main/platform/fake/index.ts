import type { Point } from 'electron';
import type { AppKey } from '@shared/appkey';
import type { Platform } from '../ports';

/** 시험 코드가 앞에 있는 앱, 유휴 초, 커서 위치를 정하는 구현 (10.8.1 시험용 가짜) */
export class FakePlatform implements Platform {
  app: AppKey | null = null;
  unknownReason: string | null = null;
  idle = 0;
  cursor: Point = { x: 0, y: 0 };
  pens = new Set<AppKey>();
  autoStartOn = false;

  activeWindow = {
    foreground: async () => ({ appKey: this.app, unknownReason: this.app ? null : this.unknownReason }),
  };
  penApps = { user: new Set<AppKey>(), isPen: (k: AppKey) => this.pens.has(k) || this.penApps.user.has(k) };
  autoStart = { get: () => this.autoStartOn, set: (on: boolean) => void (this.autoStartOn = on) };
  overlay = { options: { frame: false, transparent: true, skipTaskbar: true }, afterCreate: () => {}, setOpacity252: () => {} };
  idleSeconds = () => this.idle;
  cursorPoint = () => this.cursor;
}
