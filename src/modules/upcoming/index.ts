import { defineModule } from '@core/types';
import { Local, Settings } from './logic';
import { checkToday } from './state';
import Bell from './ui/Bell';

// 상태칩의 🔔과 다가오는 일정 창, 오늘 일정 알림 (HOM-22)
export default defineModule({
  id: 'upcoming',
  title: '다가오는 일정',
  version: '0.1.0',
  specIds: ['HOM-22'],
  requires: ['scheduler'],
  optionalRequires: ['dday'],
  settings: { version: 1, scope: 'account', schema: Settings, fields: { notify: { label: '오늘 일정을 알림으로 알려 주기', widget: 'toggle' } } },
  local: { account: { version: 1, schema: Local, initial: () => ({ day: '', sent: [] }) } },
  ui: {
    windows: [{ id: 'upcoming.main', title: '다가오는 일정', width: 320, height: 400, component: () => import('./ui/UpcomingWindow') }],
    contributions: [{ slot: 'chip.buttons', id: 'upcoming.chip', label: '다가오는 일정', component: Bell, order: 15 }],
  },
  setup(ctx) {
    // 일정을 받거나 바뀔 때와 1분마다(날짜가 바뀔 수 있음) 확인한다
    const check = () => checkToday(ctx);
    ctx.bus.on('scheduler.changed', check);
    ctx.bus.on('dday.changed', check);
    ctx.timers.every(60_000, check);
    ctx.lifecycle.on((e) => e.type === 'ready' && check());
  },
});
