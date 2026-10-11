import type { Point, Rectangle } from 'electron';
import type { AppKey } from '@shared/appkey';
import type { Platform } from '../ports';

/** 시험 코드가 앞에 있는 앱, 유휴 초, 커서 위치, 앞 창 영역을 정하는 구현 (10.8.1 시험용 가짜) */
export class FakePlatform implements Platform {
  app: AppKey | null = null;
  unknownReason: string | null = null;
  idle = 0;
  cursor: Point = { x: 0, y: 0 };
  /** 앞 창의 화면 영역(DIP). 모니터 영역과 같게 두면 전체 화면 앱이다 */
  bounds: Rectangle | null = null;
  pens = new Set<AppKey>();
  autoStartOn = false;

  activeWindow = {
    foreground: async () => ({ appKey: this.app, unknownReason: this.app ? null : this.unknownReason, ...(this.bounds && { bounds: this.bounds }) }),
  };
  penApps = { user: new Set<AppKey>(), isPen: (k: AppKey) => this.pens.has(k) || this.penApps.user.has(k) };
  autoStart = { get: () => this.autoStartOn, set: (on: boolean) => void (this.autoStartOn = on) };
  overlay = { options: { frame: false, transparent: true, skipTaskbar: true, hasShadow: false }, afterCreate: () => {}, setOpacity252: () => {} };
  idleSeconds = () => this.idle;
  cursorPoint = () => this.cursor;
}
