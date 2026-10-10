// 자동 오류 보고 (NFR-21, OPS-03). 메인과 렌더러의 처리하지 않은 오류, 렌더러와 보조 프로세스 종료, 응답 없음, 지난 실행의 비정상 종료를
// 보고로 만들어 디스코드 웹훅에 올리고 렌더러가 서버 기록으로 남길 때까지 PC에 둔다. 웹훅 주소와 켜짐은 렌더러가 알려 주고 PC에 남긴다
import { app } from 'electron';
import log from 'electron-log/main';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, release } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { createLimiter, discordBody, recordText, sanitizer, signature } from './crashReport';
import { logDir } from './log';
import { postJson } from './net';
import type { Store } from './store';

const FILE = 'device/crash.json';
/** 켜 있는 동안 데이터 폴더에 두는 표시. 정상 종료가 지우므로 켤 때 남아 있으면 지난 실행이 비정상으로 끝난 것이다 */
const MARKER = 'running';
const LOG_LINES = 50;
const PENDING_MAX = 20;

const Saved = z.object({
  day: z.string().default(''),
  count: z.number().default(0),
  config: z.object({ hook: z.string(), enabled: z.boolean() }).default({ hook: '', enabled: true }),
  pending: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
});
type Saved = z.infer<typeof Saved>;
type Config = Saved['config'];

let store: Store | null = null;
let saved: Saved = Saved.parse({});
let limiter = createLimiter(saved);
let sanitize = (t: string) => t;
let notify = () => {};
let ready = false;
let seq = 0;
const launchedAt = Date.now();
const queue: Array<Parameters<typeof report>> = [];
const persist = () => store?.write(FILE, saved);

/** 가장 최근 로그 파일의 마지막 줄들. 지난 실행이 어제 끝났으면 어제 파일이다 */
function readLogTail(): string[] {
  try {
    const dir = logDir();
    const files = readdirSync(dir).filter((f) => f.startsWith('main-') && f.endsWith('.log')).map((f) => join(dir, f));
    const newest = files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    return newest ? readFileSync(newest, 'utf8').split(/\r?\n/).filter(Boolean).slice(-LOG_LINES) : [];
  } catch {
    return [];
  }
}

/** 보고 하나를 만든다. 꺼져 있으면 버리고 같은 서명은 실행마다 한 번, 5분에 하나, 하루 20개까지만 보낸다.
 *  lines는 지난 실행의 로그처럼 따로 읽어 둔 줄이고 없으면 지금 로그 파일 끝을 읽는다. app ready 전에는 모아 두었다가 뒤에 처리한다 */
export function report(type: string, message: string, stack = '', lines?: string[]): void {
  if (!ready) return void queue.push([type, message, stack, lines]);
  if (!saved.config.enabled) return;
  if (!limiter.allow(signature(type, message))) return void log.info(`[crash] 보고 생략 ${type}`);
  const input = {
    type,
    message: sanitize(message),
    stack: sanitize(stack),
    version: app.getVersion(),
    os: `${process.platform} ${release()}`,
    minutes: Math.round((Date.now() - launchedAt) / 60_000),
    log: (lines ?? readLogTail()).map(sanitize),
  };
  saved.pending.push({ id: `${Date.now().toString(36)}-${++seq}`, text: recordText(input) });
  if (saved.pending.length > PENDING_MAX) saved.pending.splice(0, saved.pending.length - PENDING_MAX);
  persist();
  notify();
  if (!saved.config.hook) return;
  void postJson(saved.config.hook, JSON.stringify(discordBody(input))).then(
    (r) => void (r.ok || log.warn(`[crash] 디스코드 응답 ${r.status}`)),
    (e: Error) => log.warn(`[crash] 디스코드로 보내기 실패: ${e.message}`),
  );
}

/** initLog 뒤에 부른다. 표시 파일을 보고 지난 실행의 로그 끝을 새 실행이 덮기 전에 읽어 둔다. onAdded는 새 보고가 생겼을 때 렌더러에 알리는 함수 */
export function startCrash(s: Store, onAdded: () => void): void {
  store = s;
  notify = onAdded;
  const userData = app.getPath('userData');
  sanitize = sanitizer(homedir(), userData);
  const r = Saved.safeParse(s.read(FILE));
  if (r.success) saved = r.data;
  limiter = createLimiter(saved);
  const marker = join(userData, MARKER);
  if (existsSync(marker)) report('abnormal-exit', '지난 실행이 비정상으로 끝났습니다', '', readLogTail());
  mkdirSync(userData, { recursive: true });
  writeFileSync(marker, String(process.pid));
  app.on('will-quit', endRun);
  // electron-log가 로그에 적은 뒤에 읽어야 그 줄까지 들어간다
  log.errorHandler.setOptions({
    onError: ({ error, errorName }) => void setImmediate(() => report(errorName === 'Unhandled rejection' ? 'main.rejection' : 'main.uncaught', error.message, error.stack ?? '')),
  });
  app.on('render-process-gone', (_e, _w, d) => {
    if (d.reason === 'clean-exit') return;
    log.warn(`[crash] 렌더러 프로세스 종료 ${d.reason} ${d.exitCode}`);
    report('render-process-gone', `렌더러 프로세스가 끝났습니다 (${d.reason}, exit ${d.exitCode})`);
  });
  app.on('child-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return;
    log.warn(`[crash] ${d.type} 프로세스 종료 ${d.reason} ${d.exitCode}`);
    report('child-process-gone', `${d.type} 프로세스가 끝났습니다 (${d.reason}, exit ${d.exitCode})`);
  });
}

/** 정상 종료 표시. will-quit과 로그오프의 app.exit 앞에서 부른다 */
export function endRun(): void {
  try {
    unlinkSync(join(app.getPath('userData'), MARKER));
  } catch {
    // 이미 없으면 그만
  }
}

/** app ready 뒤에 부른다. net.fetch는 ready 뒤에만 쓸 수 있다 */
export function crashReady(): void {
  ready = true;
  for (const q of queue.splice(0)) report(...q);
}

/** 렌더러가 알려 준 웹훅 주소와 켜짐. 끄면 들고 있던 보고도 버린다 */
export function setCrashConfig(c: Config): void {
  saved.config = c;
  if (!c.enabled) saved.pending = [];
  persist();
}

export const pendingReports = () => saved.pending.map((p) => ({ ...p }));

export function ackReports(ids: string[]): void {
  saved.pending = saved.pending.filter((p) => !ids.includes(p.id));
  persist();
}
