import { z } from 'zod';
import { defineModule } from '@core/types';
import type {} from '@modules/focus/api';
import type { GrowthApi } from './api';
import { isReward, levelOf, levelText, MAX_LEVEL, MAX_ROUNDS, roundOf, xpOf } from './logic';
import Badge from './ui/Badge';

export default defineModule<GrowthApi>({
  id: 'growth',
  title: '레벨',
  version: '0.2.0',
  specIds: ['GRW-01', 'GRW-02', 'GRW-04', 'GRW-07', 'CHR-02'],
  requires: ['focus'],
  presence: {
    // lv는 이번 회차의 레벨, rd는 회차 (GRW-04)
    lv: { schema: z.number().int().min(1).max(MAX_LEVEL), sync: 'onChange', minIntervalMs: 60_000 },
    xp: { schema: z.number().int().min(0).max(100), sync: 'batch' },
    rd: { schema: z.number().int().min(1).max(MAX_ROUNDS), sync: 'onChange', minIntervalMs: 60_000 },
  },
  profile: { level: z.number().int() },
  tunables: {
    secondsPerLevel: { schema: z.number().int().min(60), default: 3600 },
    // 티어가 오르는 레벨 (GRW-07). 친구 작업량을 보고 서버에서 바꾼다. badge.module.css가 티어 6까지 모양을 둔다
    tierLevels: { schema: z.array(z.number().int().min(1).max(MAX_LEVEL)).max(6), default: [50, 100, 150, 200, 300, 500] },
  },
  ui: {
    windows: [{ id: 'growth.rewards', title: '레벨 보상', width: 320, height: 420, component: () => import('./ui/RewardsWindow') }],
    contributions: [
      { slot: 'seat.badge', id: 'growth.badge', label: '레벨', component: Badge },
      { slot: 'menu.main', id: 'growth.rewardsMenu', label: '레벨 보상', command: 'growth.rewards', order: 12 },
    ],
  },
  commands: [{ id: 'growth.rewards', run: (ctx) => ctx.ui.open('growth.rewards') }],
  setup(ctx) {
    const focus = ctx.modules.get('focus')!;
    const spl = () => ctx.tunables.get<number>('secondsPerLevel');
    let level = levelOf(focus.totalSec(), spl());
    let shown = { ...roundOf(focus.totalSec(), spl()), xp: -1 };
    const update = (total: number) => {
      const r = roundOf(total, spl());
      const xp = Math.floor(xpOf(total, spl()) * 100);
      // 같은 값이면 좌석을 다시 그리지 않도록 setMine을 부르지 않는다
      if (r.level === shown.level && r.round === shown.round && xp === shown.xp) return;
      if (r.round > shown.round) ctx.ui.toast(`${r.round}회차가 시작됐어요. 레벨이 1부터 다시 올라요`);
      else if (r.level > shown.level) ctx.ui.toast(`레벨이 올랐어요. 이제 ${levelText(r.round, r.level)}`);
      const lv = levelOf(total, spl());
      if (lv !== level) ctx.self.setProfile({ level: lv });
      level = lv;
      shown = { ...r, xp };
      ctx.room.setMine({ lv: r.level, xp, rd: r.round });
    };
    ctx.self.setProfile({ level });
    update(focus.totalSec());
    focus.onTotal(update);

    // 레벨 보상이 열리면 알린다. 켤 때 이미 열려 있던 보상은 알리지 않는다
    let opened: Set<string> | null = null;
    const rewards = () => ctx.gates.list().filter((g) => isReward(g) && g.open);
    ctx.lifecycle.on((e) => {
      if (e.type === 'ready') opened = new Set(rewards().map((g) => g.id));
    });
    ctx.gates.onChange(() => {
      if (!opened) return;
      for (const g of rewards()) {
        if (opened.has(g.id)) continue;
        opened.add(g.id);
        ctx.ui.toast(`새 보상이 열렸어요. ${g.label ?? g.id}`);
      }
    });
    return {
      level: () => level,
      levelText: () => {
        const r = roundOf(focus.totalSec(), spl());
        return levelText(r.round, r.level);
      },
      xp: () => xpOf(focus.totalSec(), spl()),
    };
  },
});
