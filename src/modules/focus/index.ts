import { z } from 'zod';
import { defineModule } from '@core/types';
import type { FocusApi, FocusSource } from './api';
import { live } from './live';
import { splitDay, step, type App, type Prev } from './logic';
import AppsTab from './ui/AppsTab';

const Settings = z.object({
  rule: z.enum(['foreground', 'foregroundUntilIdle20m', 'foregroundWithInput']).default('foregroundUntilIdle20m'),
  figureMode: z.boolean().default(false),
});
type Settings = z.infer<typeof Settings>;

/** 등록 앱 8칸. 앱 키는 OS마다 달라서 기기 범위에 둔다 */
const Apps = z.array(z.object({ key: z.string(), label: z.string().max(20) }).nullable()).length(8);

/** 오늘과 누적. 다른 기기 누적은 오프라인으로 켜도 레벨이 내려가지 않게 마지막 값을 둔다 */
const Totals = z.object({
  day: z.string(),
  todaySec: z.number().min(0),
  todayByApp: z.record(z.string(), z.number().min(0)),
  deviceTotalSec: z.number().min(0),
  otherDevicesSec: z.number().min(0),
});
type Totals = z.infer<typeof Totals>;

/** mod/focus/u/{uid}/dev/{deviceId}. 앱 키는 넣지 않는다 */
const DevRecord = z.object({ v: z.literal(1), total: z.number().int().min(0), day: z.string(), today: z.number().int().min(0) });

export default defineModule<FocusApi>({
  id: 'focus',
  title: '집중 기록',
  version: '0.1.0',
  specIds: ['CHR-05', 'CHR-08', 'FOC-01', 'FOC-02', 'FOC-03', 'FOC-04', 'FOC-05', 'FOC-08', 'SET-02'],
  uses: ['platform.activity'],
  settings: {
    version: 1,
    scope: 'account',
    schema: Settings,
    fields: {
      rule: {
        label: '시간이 쌓이는 규칙',
        widget: 'select',
        options: [
          { value: 'foregroundUntilIdle20m', label: '등록 앱 사용 중, 입력이 20분 넘게 없으면 멈춤' },
          { value: 'foreground', label: '등록 앱이 앞에 있는 동안' },
          { value: 'foregroundWithInput', label: '등록 앱에서 입력하는 동안' },
        ],
      },
      figureMode: { label: '피규어 모드 (잠든 모습 숨기기)', widget: 'toggle' },
    },
  },
  local: {
    // 친구가 쓰는 그림 프로그램을 첫 칸에 미리 넣어 선물 받은 날 바로 시간이 쌓이게 한다 (FOC-01 메모)
    device: { version: 1, schema: Apps, initial: () => [{ key: 'win:clipstudiopaint.exe', label: '클립 스튜디오' }, ...Array<App>(7).fill(null)] },
    account: { version: 1, schema: Totals, initial: () => ({ day: '', todaySec: 0, todayByApp: {}, deviceTotalSec: 0, otherDevicesSec: 0 }) },
  },
  server: { version: 1, collections: { dev: { scope: 'user', schema: DevRecord, template: 'owner', merge: 'sumByDevice' } } },
  presence: {
    awake: { schema: z.boolean(), sync: 'onChange', minIntervalMs: 3_000 },
    todayMin: { schema: z.number().int().min(0), sync: 'batch' },
    // 타이핑은 방에 보내지 않고 내 좌석에만 보인다 (10.7.5)
    typing: { schema: z.boolean(), sync: 'local' },
  },
  characterStates: [
    { id: 'sleep', priority: 50, when: (seat) => (seat.self ? !live.shown : seat.m.focus?.awake === false) },
    { id: 'typing', priority: 40, when: (seat) => seat.self && seat.m.focus?.typing === true },
  ],
  ui: {
    windows: [
      { id: 'focus.record', title: '포커스 기록', width: 300, height: 360, component: () => import('./ui/RecordWindow') },
      { id: 'focus.mini', title: '기록', width: 200, height: 110, component: () => import('./ui/MiniWindow') },
    ],
    contributions: [
      { slot: 'menu.main', id: 'focus.open', label: '포커스 기록', command: 'focus.open', order: 10 },
      { slot: 'settings.tabs', id: 'focus.apps', label: '집중 앱', component: AppsTab, order: 10 },
    ],
  },
  commands: [{ id: 'focus.open', run: (ctx) => ctx.ui.open('focus.record') }],
  diagnose: () => [`focus: 깨어 있음 ${live.shown}, 마지막 판정 ${live.reason ?? '집중 중'}, 오늘 ${Math.floor(live.api?.todaySec() ?? 0)}초`],
  setup(ctx) {
    const data: Totals = structuredClone(ctx.local.get<Totals>('account'));
    const subs = new Set<(total: number) => void>();
    const sources = new Set<FocusSource>();
    // 다른 기기의 오늘 기록. 켤 때와 이 PC가 다시 쓰는 기기가 될 때 읽는다 (FOC-08)
    const others = { day: '', sec: 0 };
    const today = () => (data.day === ctx.clock.dayKey() ? data : null);
    const api: FocusApi = {
      todaySec: () => (today()?.todaySec ?? 0) + (others.day === ctx.clock.dayKey() ? others.sec : 0),
      totalSec: () => data.deviceTotalSec + data.otherDevicesSec,
      todayByApp: () => ({ ...today()?.todayByApp }),
      onTotal: (fn) => {
        subs.add(fn);
        return () => void subs.delete(fn);
      },
      addSource: (src) => {
        sources.add(src);
        return () => void sources.delete(src);
      },
    };
    const totalChanged = () => subs.forEach((fn) => fn(api.totalSec()));
    // 로컬 저장은 바뀔 때마다 바로 한다. 렌더러는 같은 틱의 변경을 모아 메인에 바로 보내고 메인이 디스크 쓰기를 모으므로 (ADR 0024)
    // 렌더러를 기다릴 수 없는 Windows 로그오프에도 마지막 값이 남는다. 절전과 종료 때는 한 번 더 쓴다
    const save = () => ctx.local.update<Totals>('account', () => structuredClone(data));
    const add = (day: string, sec: number, appKey: string) => {
      if (data.day !== day) Object.assign(data, { day, todaySec: 0, todayByApp: {} });
      data.todaySec += sec;
      data.todayByApp[appKey] = (data.todayByApp[appKey] ?? 0) + sec;
      data.deviceTotalSec += sec;
    };

    Object.assign(live, { api, shown: ctx.settings.get<Settings>().figureMode, typing: false, streakSec: 0, reason: null });
    let todayMin = Math.floor(api.todaySec() / 60);
    ctx.room.setMine({ awake: live.shown, todayMin });

    let prev: Prev | null = null;
    let awake = false;
    ctx.activity.on((sample) => {
      // 다른 기기에서 쓰는 중이면 세지 않는다. 돌아오면 그 사이를 더하지 않도록 첫 샘플부터 다시 잰다 (FOC-08)
      if (!ctx.self.activeDevice()) return void (prev = null);
      const settings = ctx.settings.get<Settings>();
      const ext = [...sources].find((src) => src.active());
      const r = step(prev, sample, settings, ctx.local.get<App[]>('device'), !!ext);
      prev = r.next;
      const key = ext?.id ?? sample.appKey;
      if (r.sec > 0 && key) {
        for (const [day, sec] of splitDay(ctx.clock.serverNow(), r.sec)) {
          add(day, sec, key);
          ctx.bus.emit('focus.tick', { sec, dayKey: day, appKey: key, source: ext?.id ?? 'pc' });
        }
        totalChanged();
        save();
      }
      live.streakSec = r.awake && r.reason !== 'gap' ? live.streakSec + r.sec : 0;
      live.reason = r.reason;
      if (r.awake !== awake) {
        awake = r.awake;
        ctx.bus.emit('focus.awakeChanged', { awake });
      }
      const shown = r.awake || settings.figureMode;
      const min = Math.floor(api.todaySec() / 60);
      if (shown === live.shown && r.typing === live.typing && min === todayMin) return;
      [live.shown, live.typing, todayMin] = [shown, r.typing, min];
      ctx.room.setMine({ awake: shown, todayMin, typing: r.typing });
    });

    ctx.lifecycle.on((e) => (e.type === 'suspend' || e.type === 'shutdown') && save());

    // 서버: 기기마다 자기 기록만 쓰고 누적과 오늘은 기기별 값을 더한다 (sumByDevice, FOC-08)
    const dev = ctx.server.user(['dev']);
    const me = ctx.self.deviceId();
    // 한 계정은 한 번에 한 기기만 세므로 켤 때와 다시 쓰는 기기가 될 때만 읽으면 된다
    const loadOthers = () =>
      dev.list({ limit: 20 }).then(
        (rows) => {
          data.otherDevicesSec = 0;
          Object.assign(others, { day: ctx.clock.dayKey(), sec: 0 });
          for (const row of rows) {
            const r = DevRecord.safeParse(row.value);
            if (!r.success) continue;
            if (row.key === me) data.deviceTotalSec = Math.max(data.deviceTotalSec, r.data.total);
            else {
              data.otherDevicesSec += r.data.total;
              if (r.data.day === others.day) others.sec += r.data.today;
            }
          }
          totalChanged();
          save();
        },
        (e: Error) => ctx.log.warn(`기기별 기록을 읽지 못했습니다: ${e.message}`),
      );
    let sent = -1;
    const push = () => {
      const total = Math.floor(data.deviceTotalSec);
      if (total === sent) return;
      sent = total;
      dev.set(me, { v: 1, total, day: data.day, today: Math.floor(data.todaySec) }).catch((e: Error) => {
        sent = -1;
        ctx.log.warn(`기기별 기록을 쓰지 못했습니다: ${e.message}`);
      });
    };
    void loadOthers();
    ctx.timers.every(60_000, push);
    ctx.lifecycle.on((e) => (e.type === 'suspend' || e.type === 'shutdown') && push());
    // 다른 기기가 가져가면 그때까지 센 것을 바로 올리고 돌아오면 그 기기가 센 것을 읽는다
    ctx.self.onActiveDevice((active) => (active ? void loadOthers() : push()));

    return api;
  },
});
