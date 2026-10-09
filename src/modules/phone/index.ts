import { z } from 'zod';
import { defineModule } from '@core/types';
import type {} from '@modules/focus/api';
import { live } from './live';
import { APP_NAME_MAX, readSig, Sig, stateOf } from './logic';
import PhoneTab from './ui/PhoneTab';

// 폰 연동 (FOC-09). 폰이 그림 앱을 여는 동안 focus가 PC 입력 대신 이 출처로 시간을 센다 (focus.sources)
export default defineModule({
  id: 'phone',
  title: '폰 연결',
  version: '0.1.0',
  specIds: ['FOC-09'],
  requires: ['focus'],
  server: {
    version: 1,
    collections: {
      key: { scope: 'user', schema: z.string().length(32), template: 'owner' },
      // 키마다 칸이 하나다. 지금 키 칸만 읽고 키를 새로 만들면 sig를 통째로 지운다
      sig: { scope: 'user', schema: z.record(z.string(), Sig), template: 'keyedWrite' },
    },
  },
  // 폰 안내 페이지 주소. Hosting에 올린 뒤 선물하는 사람이 정한다 (예: https://<프로젝트>.web.app/phone/)
  tunables: { pageUrl: { schema: z.string().max(200), default: '' } },
  // null이면 폰에서 그리지 않는 중, 빈 글이면 앱 이름 없이 그리는 중
  presence: { app: { schema: z.string().max(APP_NAME_MAX).nullable(), sync: 'onChange', minIntervalMs: 3_000 } },
  bubbles: [
    {
      id: 'phone.app',
      priority: 110,
      text: (seat) => {
        const app = seat.m.phone?.app;
        return typeof app === 'string' ? `폰에서 ${app || '작업 중'}` : null;
      },
    },
  ],
  ui: { contributions: [{ slot: 'settings.tabs', id: 'phone.tab', label: '폰 연결', component: PhoneTab, order: 11 }] },
  setup(ctx) {
    const doc = ctx.server.user();
    let all: Record<string, unknown> = {};
    const pick = (key: string | null) => (key ? readSig(all[key]) : null);
    doc.watch('key', (v) => {
      const key = typeof v === 'string' ? v : null;
      live.set({ key, sig: pick(key) });
    });
    // 처음 읽은 값은 예전 신호라서 받음 표시를 하지 않는다
    let first = true;
    doc.watch('sig', (v) => {
      all = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
      const sig = pick(live.key);
      live.set({ sig, ...(!first && sig && sig.at !== live.sig?.at && { gotAt: ctx.clock.now() }) });
      first = false;
    });
    const drawing = () => stateOf(live.key, live.sig, ctx.clock.serverNow()) === 'drawing';
    ctx.modules.get('focus')!.addSource({ id: 'phone', active: drawing });

    // 머리 위 앱 이름. 4시간이 지나는 것도 잡도록 몇 초마다 확인한다
    let sent: string | null | undefined;
    const show = () => {
      const app = drawing() ? live.sig!.app : null;
      if (app === sent) return;
      // 128바이트를 넘는 이름(제어 문자가 많은 이름 등)은 이름 없이 그리는 중으로 보낸다
      try {
        ctx.room.setMine({ app });
      } catch {
        ctx.room.setMine({ app: '' });
      }
      sent = app;
    };
    live.subscribe(show);
    ctx.timers.every(5_000, show);
  },
});
