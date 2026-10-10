// 메모리와 CPU 측정 (NFR-10). `node measure.ts [--soak 초]`로 실행한다. verify()로 앱을 켜고 상태마다
// macOS footprint(활성 상태 보기의 메모리 열), app.getAppMetrics(), 스테이지 JS 힙, ps로 잰 15초 평균 CPU를 재서
// 표로 찍고 증거 폴더에 measure.json으로 남긴다. 소크는 방에서 20초마다 춤 효과를 돌리며 30초마다 재서 증가를 본다
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus, release } from 'node:os';
import { join } from 'node:path';
import type { CDPSession, Page } from '@playwright/test';
import { expect, menu, verify, type Session } from './drive.ts';

const arg = (name: string, fallback: number) => Number(process.argv[process.argv.indexOf(name) + 1]) || fallback;
const SOAK_SEC = arg('--soak', 300);
const CPU_SEC = 15;
const SOAK_STEP_SEC = 30;
const DANCE_SEC = 20;
/** 가짜 친구에 더해 10좌석을 채우는 가짜 멤버 수 */
const EXTRA_SEATS = 8;
const PANELS = ['설정', '캐릭터 만들기', '마이홈', '대화하기'];

const MB = (b: number) => Math.round(b / 1048576);
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 메인 pid 아래의 모든 프로세스 (GPU, 렌더러, 유틸리티). pgrep -P로 자식을 따라 내려간다 */
function pids(root: number): number[] {
  let kids: number[] = [];
  try {
    kids = sh('/usr/bin/pgrep', ['-P', String(root)]).split('\n').filter(Boolean).map(Number);
  } catch {
    // 자식이 없으면 pgrep이 1로 끝난다
  }
  return [root, ...kids.flatMap(pids)];
}

/** /usr/bin/footprint의 프로세스별 Footprint 바이트 */
function footprint(ps: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const m of sh('/usr/bin/footprint', ['--noCategories', '-f', 'bytes', ...ps.map(String)]).matchAll(/\[(\d+)\]: \S+\s+Footprint: (\d+) B/g)) out[Number(m[1])] = Number(m[2]);
  return out;
}

/** ps의 누적 CPU 시간(초). 형식은 [[시:]분:]초.백분초 */
function cpuTimes(ps: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const line of sh('/bin/ps', ['-o', 'pid=,time=', '-p', ps.join(',')]).trim().split('\n')) {
    const [pid, t] = line.trim().split(/\s+/);
    if (pid && t) out[Number(pid)] = t.split(':').reduce((a, x) => a * 60 + Number(x), 0);
  }
  return out;
}

interface Proc { pid: number; kind: string; footprint: number; workingSet: number; cpu: number }
interface Heap { used: number; total: number; afterGc: number }
interface Row {
  state: string;
  totalMB: number;
  procs: Proc[];
  heap: Heap;
  /** 모든 프로세스의 CPU 시간 합을 잰 시간으로 나눈 값. 코어 하나 기준 퍼센트 */
  cpu: number;
  windows: string[];
  /** 메모리 서버 구독 수. Firebase 빌드에서는 같은 수의 onValue 리스너가 된다 */
  watchers: number;
  /** 측정을 시작한 뒤 스테이지에 새로 생겨 아직 살아 있는 타이머 */
  timers: { intervals: number; timeouts: number };
}

type Win = Window & {
  devHub: { read(p: string): unknown; writeMany(u: Record<string, unknown>): void; now(): number; watchers: Set<unknown> };
  core: {
    deps: { uid: string; server: { userPrivate: { set(uid: string, path: string, v: unknown): Promise<void> } } };
    registry: { run(id: string): Promise<void> };
    gateOpen(id: string): boolean;
  };
  __timers?: { intervals: Set<unknown>; timeouts: Set<unknown> };
  __seats?: () => void;
};

/** 측정 하나. 2초 쉬어 안정시킨 뒤 15초 CPU를 재고 끝에 메모리를 읽는다 */
async function sample(s: Session, cdp: CDPSession, state: string): Promise<Row> {
  await sleep(2000);
  await s.stage.evaluate(() => (window as unknown as Win).__seats?.());
  const root = s.app.process().pid!;
  const before = pids(root);
  const t0 = cpuTimes(before);
  await sleep(CPU_SEC * 1000);
  const t1 = cpuTimes(before);
  const cpuOf = (pid: number) => Math.round((((t1[pid] ?? t0[pid] ?? 0) - (t0[pid] ?? 0)) / CPU_SEC) * 1000) / 10;
  const now = pids(root);
  const fp = footprint(now);
  const metrics = await s.app.evaluate(({ app }) => app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, name: m.name, ws: m.memory.workingSetSize })));
  const kindOf = (pid: number) => {
    const m = metrics.find((x) => x.pid === pid);
    if (!m) return pid === root ? 'main' : 'other';
    return m.type === 'Browser' ? 'main' : m.type === 'GPU' ? 'gpu' : m.type === 'Tab' ? 'renderer' : (m.name ?? m.type).toLowerCase();
  };
  const procs = now.map<Proc>((pid) => ({ pid, kind: kindOf(pid), footprint: fp[pid] ?? 0, workingSet: (metrics.find((x) => x.pid === pid)?.ws ?? 0) * 1024, cpu: cpuOf(pid) }));
  const row: Row = {
    state,
    totalMB: MB(procs.reduce((a, p) => a + p.footprint, 0)),
    procs,
    heap: await heapOf(s, cdp),
    cpu: Math.round(before.reduce((a, p) => a + cpuOf(p), 0) * 10) / 10,
    windows: await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => `${w.getTitle() || '스테이지'}${w.isVisible() ? '' : '(숨김)'}`)),
    watchers: await s.stage.evaluate(() => (window as unknown as Win).devHub.watchers.size),
    timers: await s.stage.evaluate(() => {
      const t = (window as unknown as Win).__timers;
      return { intervals: t?.intervals.size ?? 0, timeouts: t?.timeouts.size ?? 0 };
    }),
  };
  console.log(line(row));
  return row;
}

/** performance.memory로 읽은 스테이지 JS 힙과 GC를 한 번 돌린 뒤의 힙 */
async function heapOf(s: Session, cdp: CDPSession): Promise<Heap> {
  const m = await s.stage.evaluate(() => {
    const p = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    return { used: p?.usedJSHeapSize ?? 0, total: p?.totalJSHeapSize ?? 0 };
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return { ...m, afterGc: usedSize };
}

const sumKind = (r: Row, kind: string) => MB(r.procs.filter((p) => p.kind === kind).reduce((a, p) => a + p.footprint, 0));
const cpuKind = (r: Row, kind: string) => Math.round(r.procs.filter((p) => p.kind === kind).reduce((a, p) => a + p.cpu, 0) * 10) / 10;
const line = (r: Row) =>
  `${r.state.padEnd(22)} 합계 ${String(r.totalMB).padStart(4)}MB  메인 ${sumKind(r, 'main')}  GPU ${sumKind(r, 'gpu')}  렌더러 ${sumKind(r, 'renderer')}(${r.procs.filter((p) => p.kind === 'renderer').length})  네트워크 ${sumKind(r, 'network service')}  힙 ${MB(r.heap.used)}→GC ${MB(r.heap.afterGc)}MB  CPU ${r.cpu}% (메인 ${cpuKind(r, 'main')} GPU ${cpuKind(r, 'gpu')} 렌더러 ${cpuKind(r, 'renderer')})  창 ${r.windows.length}  구독 ${r.watchers}  타이머 ${r.timers.intervals}/${r.timers.timeouts}`;

/** 측정 뒤에 생기는 타이머를 센다. 부팅 때 만든 타이머는 세지 않는다 */
const countTimers = (s: Session) =>
  s.stage.evaluate(() => {
    const w = window as unknown as Win;
    const live = { intervals: new Set<unknown>(), timeouts: new Set<unknown>() };
    const [si, ci, st, ct] = [window.setInterval, window.clearInterval, window.setTimeout, window.clearTimeout];
    window.setInterval = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => {
      const id = si(fn, ms, ...a);
      live.intervals.add(id);
      return id;
    }) as typeof setInterval;
    window.clearInterval = (id) => {
      live.intervals.delete(id);
      ci(id);
    };
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => {
      const id: number = st(
        (...x: unknown[]) => {
          live.timeouts.delete(id);
          if (typeof fn === 'function') fn(...x);
        },
        ms,
        ...a,
      );
      live.timeouts.add(id);
      return id;
    }) as typeof setTimeout;
    window.clearTimeout = (id) => {
      live.timeouts.delete(id);
      ct(id);
    };
    w.__timers = live;
  });

/** 가짜 친구 기록을 복제해 방을 10좌석으로 채운다. seenAt은 sample마다 __seats로 새로 써서 150초 거름을 피한다 */
const fillSeats = (s: Session) =>
  s.stage.evaluate((n) => {
    const w = window as unknown as Win;
    const hub = w.devHub;
    const base = hub.read('rooms/DEVDEV/members/devfriend_dev') as Record<string, unknown>;
    w.__seats = () =>
      hub.writeMany(
        Object.fromEntries(
          Array.from({ length: n }, (_, i) => `devextra${i}`).flatMap((uid, i) => [
            [`rooms/DEVDEV/roster/${uid}`, hub.now()],
            [`rooms/DEVDEV/members/${uid}_dev`, { ...base, uid, name: `친구 ${i + 2}`, joinedAt: (base.joinedAt as number) + i + 1, seenAt: hub.now() }],
          ]),
        ),
      );
    w.__seats();
  }, EXTRA_SEATS);

const fake = (s: Session, p: { idle?: number; app?: string | null }) =>
  s.app.evaluate((_, q) => {
    const f = (globalThis as unknown as { fakePlatform: { idle: number; app: string | null; pens: Set<string> } }).fakePlatform;
    if (q.idle !== undefined) f.idle = q.idle;
    if (q.app !== undefined) f.app = q.app;
    if (q.app) f.pens.add(q.app);
  }, p);

interface SoakSample { sec: number; totalMB: number; gpuMB: number; rendererMB: number; heapAfterGcMB: number; windows: number }

await verify('measure', async (s) => {
  const cdp = await s.app.context().newCDPSession(s.stage);
  await countTimers(s);
  const rows: Row[] = [];
  const at = async (state: string) => void rows.push(await sample(s, cdp, state));

  await at('런처');
  await s.launcher.getByText('시작하기').click();
  await s.stage.locator('button[title="메뉴"]').waitFor();
  await at('혼자 실행 화면');

  const rooms = await menu(s, '방 만들기 / 참여하기', '방 만들기 / 참여하기');
  await rooms.getByPlaceholder('예: 7Q2K9M').fill('devdev');
  await rooms.getByRole('button', { name: '참여' }).click();
  await expect(s.stage.getByText('가짜 친구')).toBeVisible();
  await rooms.close();
  await fake(s, { app: 'win:clipstudiopaint.exe', idle: 0 });
  await at('방 2좌석 깨어 있음');
  await fillSeats(s);
  await expect(s.stage.getByText(`친구 ${EXTRA_SEATS + 1}`)).toBeVisible();
  await at('방 10좌석 깨어 있음');
  await fake(s, { idle: 600 });
  await at('방 10좌석 잠듦');
  await fake(s, { idle: 0 });

  // 패널을 열고 닫은 뒤 메모리가 돌아오는지. 한 번 뒤와 세 번 뒤를 비교해 캐시인지 누수인지 본다
  const cycle = async (measure: boolean) => {
    const open: Page[] = [];
    for (const t of PANELS) open.push(await menu(s, t, t));
    if (measure) await at('패널 4개 열림');
    for (const p of open) await p.close();
  };
  await cycle(true);
  await at('패널 닫은 뒤 1회');
  await cycle(false);
  await cycle(false);
  await at('패널 닫은 뒤 3회');

  const player = await menu(s, '플레이리스트', '플레이리스트');
  await player.getByLabel('플레이리스트 음량').fill('0');
  await player.getByLabel('유튜브 링크').fill('https://youtu.be/dQw4w9WgXcQ');
  await player.getByRole('button', { name: '+ 추가' }).click();
  await player.getByText('dQw4w9WgXcQ').dblclick();
  await expect(player.locator('iframe')).toBeVisible();
  await sleep(5000);
  await at('플레이리스트 영상 열림');
  await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === '플레이리스트')?.close());
  await at('플레이리스트 숨김');

  // 소크: 춤 gate를 열고 20초마다 춤 효과를 돌린다 (효과 창이 열렸다 닫힌다)
  await s.stage.evaluate(async () => {
    const c = (window as unknown as Win).core;
    await c.deps.server.userPrivate.set(c.deps.uid, 'gates/play:dance', 1);
  });
  await expect.poll(() => s.stage.evaluate(() => (window as unknown as Win).core.gateOpen('play.dance'))).toBe(true);
  const soak: SoakSample[] = [];
  const root = s.app.process().pid!;
  const soakPids = pids(root);
  const c0 = cpuTimes(soakPids);
  const t0 = Date.now();
  const windowCount = () => s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const baseWindows = await windowCount();
  let nextDance = 0;
  let nextSample = 0;
  /** 효과 창이 열린 순간의 합계 최대. 표본은 효과 창이 닫힌 뒤에 재서 서로 비교할 수 있게 한다 */
  let peakMB = 0;
  console.log(`소크 ${SOAK_SEC}초 시작`);
  while (Date.now() - t0 <= SOAK_SEC * 1000) {
    const sec = Math.round((Date.now() - t0) / 1000);
    if (sec >= nextDance) {
      nextDance += DANCE_SEC;
      await s.stage.evaluate(() => (window as unknown as Win).core.registry.run('play.dance').catch(() => undefined));
      await sleep(1500);
      peakMB = Math.max(peakMB, MB(Object.values(footprint(pids(root))).reduce((a, b) => a + b, 0)));
    }
    if (sec >= nextSample) {
      nextSample += SOAK_STEP_SEC;
      await s.stage.evaluate(() => (window as unknown as Win).__seats?.());
      for (let i = 0; i < 10 && (await windowCount()) > baseWindows; i++) await sleep(1000);
      // GPU 프로세스는 닫힌 효과 창의 버퍼를 몇 초 뒤에 돌려준다
      await sleep(5000);
      const fp = footprint(pids(root));
      const metrics = await s.app.evaluate(({ app }) => app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type })));
      const of = (type: string) => MB(metrics.filter((m) => m.type === type).reduce((a, m) => a + (fp[m.pid] ?? 0), 0));
      const heap = await heapOf(s, cdp);
      const windows = await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
      const row: SoakSample = { sec, totalMB: MB(Object.values(fp).reduce((a, b) => a + b, 0)), gpuMB: of('GPU'), rendererMB: of('Tab'), heapAfterGcMB: Math.round(heap.afterGc / 104857.6) / 10, windows };
      soak.push(row);
      console.log(`  ${String(sec).padStart(4)}s 합계 ${row.totalMB}MB GPU ${row.gpuMB} 렌더러 ${row.rendererMB} 힙(GC뒤) ${row.heapAfterGcMB}MB 창 ${row.windows}`);
    }
    await sleep(1000);
  }
  const c1 = cpuTimes(soakPids);
  const soakCpu = Math.round((soakPids.reduce((a, p) => a + ((c1[p] ?? c0[p] ?? 0) - (c0[p] ?? 0)), 0) / ((Date.now() - t0) / 1000)) * 1000) / 10;
  const first = soak[0]!;
  const last = soak[soak.length - 1]!;
  const growth = { totalMB: last.totalMB - first.totalMB, rendererMB: last.rendererMB - first.rendererMB, gpuMB: last.gpuMB - first.gpuMB, heapAfterGcMB: Math.round((last.heapAfterGcMB - first.heapAfterGcMB) * 10) / 10 };
  console.log(`소크 ${last.sec}초 CPU 평균 ${soakCpu}%  증가 합계 ${growth.totalMB}MB 렌더러 ${growth.rendererMB}MB GPU ${growth.gpuMB}MB 힙(GC뒤) ${growth.heapAfterGcMB}MB  효과 창이 열린 순간 최대 ${peakMB}MB`);

  console.log('\n상태별 요약');
  for (const r of rows) console.log(line(r));
  const host = {
    os: `darwin ${release()}`,
    cpu: cpus()[0]?.model ?? '',
    ...(await s.app.evaluate(({ screen }) => {
      const d = screen.getPrimaryDisplay();
      return { display: `${d.size.width}x${d.size.height} 배율 ${d.scaleFactor}`, electron: process.versions.electron, chrome: process.versions.chrome };
    })),
  };
  writeFileSync(join(s.dir, 'measure.json'), JSON.stringify({ at: new Date().toISOString(), host, cpuSec: CPU_SEC, states: rows, soak: { sec: SOAK_SEC, danceEverySec: DANCE_SEC, cpu: soakCpu, peakMB, samples: soak, growth } }, null, 2));
});
