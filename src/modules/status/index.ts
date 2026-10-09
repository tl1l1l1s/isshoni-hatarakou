import { z } from 'zod';
import { defineModule, type Ctx, type Dispose } from '@core/types';
import type { ActivitySample } from '@shared/schemas';
import type {} from '@modules/rooms/api';
import { BUBBLE_PRIORITY } from './api';
import { CUSTOM_MAX, isIdleAway, LEAVE_WARN_MS, leaveDue, Local, resolve, statusText, todayText } from './logic';
import Chip from './ui/Chip';

/** 고른 상태(50)는 자동 자리비움(20)보다 높아서 밥 먹는 중이나 바쁨이면 자동으로 바뀌지 않는다 (CHR-06) */
const apply = (ctx: Ctx, sel: Local) => {
  const { state, text } = resolve(sel);
  ctx.self.setStatus('chosen', state, 50);
  ctx.room.setMine({ text });
};

/** 자동 퇴장 안내의 취소. ctx마다 둔다 */
const stays = new WeakMap<Ctx, () => void>();

export default defineModule({
  id: 'status',
  title: '상태',
  version: '0.1.0',
  specIds: ['CHR-06', 'CHR-09', 'CHR-10', 'FOC-06', 'CHR-13', 'ROM-14'],
  optionalRequires: ['rooms'],
  uses: ['platform.activity'],
  local: { account: { version: 1, schema: Local, initial: () => ({ choice: 'work', custom: '' }) } },
  presence: { text: { schema: z.string().max(CUSTOM_MAX), sync: 'onChange', minIntervalMs: 3_000 } },
  bubbles: [
    { id: 'status.away', priority: BUBBLE_PRIORITY.away, text: (seat) => (seat.state === 'away' ? '자리비움' : null) },
    { id: 'status.text', priority: BUBBLE_PRIORITY.status, text: (seat) => statusText(seat.m.status?.text) },
    { id: 'status.today', priority: BUBBLE_PRIORITY.today, text: (seat) => todayText(seat.m.focus?.todayMin) },
  ],
  ui: {
    windows: [
      { id: 'status.pick', title: '상태 고르기', width: 260, height: 320, focusable: true, component: () => import('./ui/PickWindow') },
      { id: 'status.leave', title: '자리비움 안내', width: 340, height: 170, component: () => import('./ui/LeaveWindow') },
    ],
    contributions: [
      { slot: 'menu.main', id: 'status.menu', label: '상태 고르기', command: 'status.open', order: 5 },
      { slot: 'chip.buttons', id: 'status.chip', label: '상태', component: Chip },
    ],
  },
  commands: [
    { id: 'status.open', run: (ctx) => ctx.ui.open('status.pick') },
    {
      id: 'status.choose',
      run: (ctx, args) => {
        const sel = Local.parse(args);
        ctx.local.update<Local>('account', () => sel);
        apply(ctx, sel);
      },
    },
    { id: 'status.stay', run: (ctx) => stays.get(ctx)?.() },
  ],
  setup(ctx) {
    apply(ctx, ctx.local.get<Local>('account'));
    let auto = false;
    // 취소를 누른 때의 유휴 초. 그만큼 빼고 세다가 입력이 다시 들어오면 0으로 돌린다
    let base = 0;
    let leaving: Dispose | null = null;
    // 자동 퇴장으로 나온 방. 돌아오면 다시 들어간다
    let left: string | null = null;

    const check = (s: ActivitySample) => {
      if (s.idleSec < base) base = 0;
      const idle = s.idleSec - base;
      if (isIdleAway(idle) !== auto) {
        auto = !auto;
        ctx.self.setStatus('auto', auto ? 'away' : null, 20);
      }
      if (!auto && left) {
        const code = left;
        left = null;
        // 정원이 찼으면 rooms 모듈이 늦게 들어온 쪽인 나를 다시 내보낸다
        if (!ctx.room.current()) void ctx.room.join(code).then((r) => r.ok || ctx.ui.toast(r.reason));
      }
      // 그림 앱이 앞에 있으면 펜 입력이 유휴 시간에 잡히지 않을 수 있어서 내보내지 않는다 (CHR-12)
      // ponytail: 그림 앱을 앞에 둔 채 자리를 비우면 나가지 않는다. 펜 입력 시각을 따로 받게 되면 그 값으로 센다
      const due = leaveDue(idle, {
        inRoom: ctx.room.current() !== null,
        chosen: resolve(ctx.local.get<Local>('account')).state !== null,
        pen: s.pen,
        owner: ctx.modules.get('rooms')?.isOwner() ?? false,
      });
      if (due === (leaving !== null)) return;
      if (due) {
        ctx.ui.open('status.leave');
        leaving = ctx.timers.at(LEAVE_WARN_MS, () => {
          leaving = null;
          ctx.ui.close('status.leave');
          left = ctx.room.current();
          void ctx.room.leave();
          ctx.ui.toast('자리를 오래 비워서 방에서 나왔습니다.');
        });
      } else {
        leaving?.();
        leaving = null;
        ctx.ui.close('status.leave');
      }
    };
    ctx.activity.on(check);
    stays.set(ctx, () => {
      const s = ctx.activity.last();
      if (!s) return;
      base = s.idleSec;
      check(s);
    });
  },
});
