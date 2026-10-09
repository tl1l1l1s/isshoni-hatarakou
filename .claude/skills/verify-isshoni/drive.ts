// verify-isshoni 하네스. 검증 스크립트가 import해서 쓰고 `node drive.ts doctor`로 빌드 상태를 확인한다.
// 실행마다 새 user-data-dir, 가짜 플랫폼, 메모리 서버로 앱을 따로 켠다 (tests/e2e/boot.spec.ts와 같은 방식)
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// 검증 스크립트는 고정 대기 대신 expect의 자동 대기와 expect.poll, toPass로 결과를 기다린다
export { expect } from '@playwright/test';

const repo = resolve(import.meta.dirname, '../../..');
const out = join(repo, 'out');
const BUILD = 'npx electron-vite build --mode e2e';
export const evidenceRoot = join(tmpdir(), 'isshoni-verify');

export interface Session {
  app: ElectronApplication;
  /** 첫 창. 런처에서 시작하기를 누르면 실행 화면(투명 오버레이)이 된다 */
  stage: Page;
  launcher: Page;
  /** 이 실행의 증거 폴더. 정리 뒤에도 남는다 */
  dir: string;
  /** 스테이지의 pageerror와 console.error. 끝나면 errors.json으로 남긴다 */
  errors: string[];
  /** 화면과 ARIA 스냅샷을 <dir>/<name>.png, <name>.aria.txt로 남긴다 */
  shot(page: Page, name: string): Promise<void>;
}

/** 스테이지를 뺀 창 가운데 제목이 같은 창 */
export async function windowTitled(app: ElectronApplication, title: string): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const w of app.windows().slice(1)) if (!w.isClosed() && (await w.title()) === title) return w;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${title} 창이 열리지 않았습니다`);
}

/** 실행 화면의 ▼ 메뉴에서 항목을 눌러 열린 창 */
export async function menu(s: Session, item: string, title: string): Promise<Page> {
  await s.stage.locator('button[title="메뉴"]').click();
  await s.stage.getByRole('button', { name: item, exact: true }).click();
  return windowTitled(s.app, title);
}

/** 앱을 켜고 body를 실행한 뒤 이번에 켠 앱과 데이터 폴더만 정리한다 */
export async function verify(name: string, body: (s: Session) => Promise<void>): Promise<void> {
  const problems = doctor();
  if (problems.length) throw new Error(`doctor 실패: ${problems.join(' / ')}`);
  mkdirSync(evidenceRoot, { recursive: true });
  const dir = mkdtempSync(join(evidenceRoot, `${name}-`));
  const userData = mkdtempSync(join(tmpdir(), 'isshoni-verify-data-'));
  const app = await electron.launch({ args: [repo, `--user-data-dir=${userData}`], cwd: repo, env: { ...process.env, ISSHONI_FAKE_PLATFORM: '1' } });
  const errors: string[] = [];
  try {
    const stage = await app.firstWindow();
    stage.on('pageerror', (e) => errors.push(e.message));
    stage.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
    const launcher = await windowTitled(app, 'Isshoni Hatarakou');
    const shot = async (page: Page, n: string) => {
      await page.screenshot({ path: join(dir, `${n}.png`) });
      writeFileSync(join(dir, `${n}.aria.txt`), await page.locator('body').ariaSnapshot());
    };
    await body({ app, stage, launcher, dir, errors, shot });
  } finally {
    writeFileSync(join(dir, 'errors.json'), JSON.stringify(errors, null, 2));
    await app.close().catch(() => app.process().kill());
    // Electron 보조 프로세스가 종료 직전까지 파일을 쓰면 한 번에 지워지지 않는다. 본문 오류를 가리지 않게 삼킨다
    try {
      rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) {
      console.log(`데이터 폴더를 지우지 못했습니다: ${userData} (${String(e)})`);
    }
    console.log(`evidence: ${dir}`);
  }
}

/** 이 빌드를 몰아도 되는지 읽기만 해서 확인한다. 문제가 없으면 빈 배열 */
export function doctor(): string[] {
  const missing = ['main/index.js', 'preload/bridge.js', 'renderer/index.html'].filter((p) => !existsSync(join(out, p)));
  if (missing.length) return [`빌드 없음 (${missing.join(', ')}), ${BUILD}`];
  const problems: string[] = [];
  const assets = join(out, 'renderer/assets');
  const firebase = readdirSync(assets).some(
    (f) => f.endsWith('.js') && /__vite_import_meta_env__ = \{[^}]*VITE_FIREBASE_DATABASE_URL/.test(readFileSync(join(assets, f), 'utf8')),
  );
  if (firebase) problems.push(`Firebase 설정이 들어간 빌드, ${BUILD}`);
  const builtAt = statSync(join(out, 'main/index.js')).mtimeMs;
  const srcAt = Math.max(
    ...readdirSync(join(repo, 'src'), { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile())
      .map((e) => statSync(join(e.parentPath, e.name)).mtimeMs),
  );
  if (srcAt > builtAt) problems.push(`src가 빌드보다 새로움, ${BUILD}`);
  return problems;
}

if (process.argv[1] === import.meta.filename && process.argv[2] === 'doctor') {
  const problems = doctor();
  console.log(problems.length ? problems.join('\n') : 'doctor ok');
  process.exitCode = problems.length ? 1 : 0;
}
