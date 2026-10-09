import { z } from 'zod';
import { defineModule, type Ctx } from '@core/types';
import { leftOf, Local, minutes, next, STALE_MS, type Phase, type Run } from './logic';
import DrawerButton from './ui/DrawerButton';

const Pomo = z.object({ ph: z.enum(['f', 'b']), min: z.number().int().min(0).max(999) }).nullable();

/** 짧은 두 음. 소리 파일 없이 Web Audio로 낸다 */
function chime(): void {
  const ac = new AudioContext();
  [784, 1047].forEach((hz, i) => {
    const t = ac.currentTime + i * 0.25;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.45);
    if (i === 1) o.onended = () => void ac.close();
  });
}

function announce(ctx: Ctx, l: Local, ended: Phase, n: Run): void {
  const body =
    ended !== 'focus'
      ? n.endsAt === null
        ? '휴식이 끝났어요. 준비되면 다음 집중을 시작해 주세요.'
        : `휴식이 끝났어요. 다시 ${minutes(l, 'focus')}분 집중해요.`
      : `집중이 끝났어요. ${minutes(l, n.phase)}분 쉬어요.`;
  ctx.notify({ title: '뽀모도로', body, onClick: () => ctx.ui.open('pomodoro.timer') });
  ctx.ui.toast(body);
  if (l.sound) {
    try {
      chime();
    } catch (e) {
      ctx.log.warn(`알림 소리를 내지 못했습니다: ${(e as Error).message}`);
    }
  }
}

// 뽀모도로 (FOC-07). 포커스 기록 창 서랍에서 열고 남은 시간을 머리 위에 보낸다 (FOC-06)
export default defineModule({
  id: 'pomodoro',
  title: '뽀모도로',
  version: '0.1.0',
  specIds: ['FOC-07'],
  local: { device: { version: 1, schema: Local, initial: () => Local.parse({}) } },
  presence: { pomo: { schema: Pomo, sync: 'onChange', minIntervalMs: 30_000 } },
  // 고른 상태(200)보다 낮고 오늘 집중 시간(100)보다 높다. 돌고 있으면 오늘 시간 대신 남은 시간이 보인다
  bubbles: [
    {
      id: 'pomodoro.left',
      priority: 150,
      text: (seat) => {
        const p = Pomo.safeParse(seat.m.pomodoro?.pomo).data;
        return p ? `${p.ph === 'f' ? '집중' : '휴식'} ${p.min}분 남음` : null;
      },
    },
  ],
  ui: {
    windows: [{ id: 'pomodoro.timer', title: '뽀모도로', width: 300, height: 420, focusable: true, component: () => import('./ui/TimerWindow') }],
    contributions: [{ slot: 'focus.drawer', id: 'pomodoro.drawer', label: '뽀모도로', component: DrawerButton, order: 10 }],
  },
  setup(ctx) {
    let sent = '';
    const tick = () => {
      const now = ctx.clock.now();
      const l = ctx.local.get<Local>('device');
      // 앱을 끈 사이나 절전 중에 1분 넘게 지난 타이머는 알리지 않고 끝낸다
      if (l.run && l.run.endsAt !== null && now - l.run.endsAt > STALE_MS) ctx.local.update<Local>('device', (x) => ({ ...x, run: null }));
      else if (l.run && l.run.endsAt !== null && now >= l.run.endsAt) {
        const n = next(l, l.run, now);
        ctx.local.update<Local>('device', (x) => ({ ...x, run: n }));
        announce(ctx, l, l.run.phase, n);
      }
      const r = ctx.local.get<Local>('device').run;
      const pomo = r && r.endsAt !== null ? { ph: r.phase === 'focus' ? 'f' : 'b', min: Math.ceil(leftOf(r, now) / 60_000) } : null;
      if (JSON.stringify(pomo) === sent) return;
      sent = JSON.stringify(pomo);
      ctx.room.setMine({ pomo });
    };
    tick();
    ctx.timers.every(1000, tick);
  },
});
