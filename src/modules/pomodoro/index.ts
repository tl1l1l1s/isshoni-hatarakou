import { defineModule, type Ctx } from '@core/types';
import { Local, minLeft, minutes, next, Pomo, sameShare, shareOf, STALE_MS, type Phase, type Run, type Shared } from './logic';
import type { PomodoroApi } from './api';
import DrawerButton from './ui/DrawerButton';


/** 짧은 두 음. 소리 파일 없이 Web Audio로 낸다 */
function chime(): void {
  const ac = new AudioContext();
  [784, 1047].forEach((hz, i) => {
    const t = ac.currentTime + i * 0.25;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = hz;
    // 음 머리에 딸깍 소리가 나지 않게 10ms 동안 키운다
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.01);
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
        ? '휴식이 끝났어요. 뽀모도로 창에서 다시 시작을 눌러 주세요.'
        : `휴식이 끝났어요. 다시 ${minutes(l, 'focus')}분 집중해요.`
      : `집중이 끝났어요. ${minutes(l, n.phase)}분 쉬어요.`;
  ctx.notify({ title: '뽀모도로', body, onClick: () => ctx.ui.open('pomodoro.timer') });
  ctx.ui.toast(body);
  ring(ctx);
}

/** 끝날 때 소리를 켰으면 짧은 두 음을 낸다. 같이 작업하기도 이 설정을 따른다 (ROM-15) */
function ring(ctx: Ctx): void {
  if (!ctx.local.get<Local>('device').sound) return;
  try {
    chime();
  } catch (e) {
    ctx.log.warn(`알림 소리를 내지 못했습니다: ${(e as Error).message}`);
  }
}

// 뽀모도로 (FOC-07). ▼ 메뉴와 포커스 기록 창 서랍에서 열고 남은 시간을 머리 위에 보낸다 (FOC-06)
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
      text: (seat, ctx) => {
        const p = Pomo.safeParse(seat.m.pomodoro?.pomo).data;
        return p ? `${p.ph === 'f' ? '집중' : '휴식'} ${minLeft(p, ctx.clock.serverNow())}분 남음` : null;
      },
    },
  ],
  ui: {
    windows: [{ id: 'pomodoro.timer', title: '뽀모도로', width: 300, height: 420, component: () => import('./ui/TimerWindow') }],
    contributions: [
      { slot: 'focus.drawer', id: 'pomodoro.drawer', label: '뽀모도로', component: DrawerButton, order: 10 },
      { slot: 'menu.main', id: 'pomodoro.menu', label: '뽀모도로', command: 'pomodoro.open', order: 13 },
    ],
  },
  commands: [{ id: 'pomodoro.open', run: (ctx) => ctx.ui.open('pomodoro.timer') }],
  setup(ctx): PomodoroApi {
    let sent: Shared | null | undefined;
    let shown = '';
    const isRunning = () => ctx.local.get<Local>('device').run !== null;
    const subs = new Set<(running: boolean) => void>();
    let wasRunning = isRunning();
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
      // 창에서 시작하거나 끝내면 다음 틱에 알린다
      if (isRunning() !== wasRunning) {
        wasRunning = !wasRunning;
        subs.forEach((fn) => fn(wasRunning));
      }
      const r = ctx.local.get<Local>('device').run;
      const serverNow = ctx.clock.serverNow();
      const pomo = shareOf(r, now, serverNow);
      if (sent === undefined || !sameShare(sent, pomo)) {
        sent = pomo;
        ctx.room.setMine({ pomo });
      }
      // 다른 PC의 남은 분은 여기서 계산하므로 분이 바뀌면 좌석 말풍선을 다시 그린다
      const mins = ctx.room.members().map((s) => {
        const p = Pomo.safeParse(s.m.pomodoro?.pomo).data;
        return p ? minLeft(p, serverNow) : '';
      });
      if (mins.join() === shown) return;
      shown = mins.join();
      ctx.seats.refresh();
    };
    tick();
    ctx.timers.every(1000, tick);
    return {
      running: isRunning,
      stop: () => {
        ctx.local.update<Local>('device', (x) => ({ ...x, run: null }));
        tick();
      },
      onChange: (fn) => {
        subs.add(fn);
        return () => void subs.delete(fn);
      },
      chime: () => ring(ctx),
    };
  },
});
