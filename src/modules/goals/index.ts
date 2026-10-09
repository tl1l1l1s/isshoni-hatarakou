import { defineModule } from '@core/types';
import type {} from '@modules/focus/api';
import { Cfg, Day, readCfg } from './logic';
import { live } from './live';
import DrawerButton from './ui/DrawerButton';

// 달성표 (GRW-06). 보상 없이 하루 집중 목표 하나와 이번 주 요일별 표시만 둔다.
// 기록은 서버에 두어 다른 PC에서 열어도 같은 표가 보인다 (FOC-08)
export default defineModule({
  id: 'goals',
  title: '달성표',
  version: '0.1.0',
  specIds: ['GRW-06'],
  requires: ['focus'],
  server: {
    version: 1,
    collections: {
      cfg: { scope: 'user', schema: Cfg, template: 'owner' },
      days: { scope: 'user', schema: Day, template: 'owner', merge: 'max' },
    },
  },
  ui: {
    windows: [{ id: 'goals.week', title: '달성표', width: 340, height: 400, component: () => import('./ui/WeekWindow') }],
    contributions: [{ slot: 'focus.drawer', id: 'goals.drawer', label: '달성표', component: DrawerButton, order: 20 }],
  },
  setup(ctx) {
    const focus = ctx.modules.get('focus')!;
    const days = ctx.server.user(['days']);
    live.focus = focus;
    ctx.server.user().watch('cfg', (v) => live.set({ cfg: readCfg(v) }));
    // 지난주 일요일과 이번 주 7일이면 충분하다
    days.watchList('', { limit: 8, last: true }, (rows) =>
      live.set({ days: Object.fromEntries(rows.flatMap((r) => (Day.safeParse(r.value).success ? [[r.key, r.value as Day]] : []))) }),
    );

    // 오늘 합계를 1분마다, 목표를 채우는 순간, 끄거나 절전에 들어갈 때 올린다. 이 PC가 쓰는 기기일 때만 쓰고 서버 값보다 줄지 않게 쓴다
    let sent = '';
    const write = () => {
      const { goal } = live.cfg;
      if (!goal || !ctx.self.activeDevice()) return;
      const day = ctx.clock.dayKey();
      const rec: Day = { sec: Math.max(Math.floor(focus.todaySec()), live.days[day]?.sec ?? 0), goal, v: 1 };
      const key = `${day} ${Math.floor(rec.sec / 60)} ${goal}`;
      if (key === sent) return;
      sent = key;
      days.set(day, rec).catch((e: Error) => {
        sent = '';
        ctx.log.warn(`달성표 기록을 쓰지 못했습니다: ${e.message}`);
      });
    };
    ctx.timers.every(60_000, write);
    ctx.lifecycle.on((e) => (e.type === 'suspend' || e.type === 'shutdown') && write());

    // 오늘 목표를 채우는 순간 한 번 알린다. 목표를 읽기 전이나 켤 때 이미 채운 날은 알리지 않는다
    let last: string | null = null;
    const check = () => {
      const { goal } = live.cfg;
      const day = ctx.clock.dayKey();
      const met = goal > 0 && focus.todaySec() >= goal;
      const prev = last;
      // write가 기록 구독을 거쳐 check를 다시 부를 수 있어서 먼저 바꿔 둔다
      last = goal > 0 ? `${day} ${met}` : null;
      if (met && prev === `${day} false`) ctx.ui.toast('오늘 집중 목표를 채웠어요.');
      if (prev !== null && last !== null && last !== prev) write();
    };
    focus.onTotal(check);
    live.subscribe(check);
  },
});
