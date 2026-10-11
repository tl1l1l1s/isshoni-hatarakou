// 업그레이드 시험 (OPS-5). `npx electron-vite build --mode e2e` 뒤에 실행한다. v0.1.0 앱이 만든 데이터 폴더(tests/e2e/fixtures/userdata-v0.1.0의
// settings.json, device, accounts 아래 JSON)로 지금 앱을 켜서 읽지 못한 파일 없이 설정, 이름, 집중 앱, 캐릭터, 플레이리스트가 남는지 본다.
// 모듈 로컬 형식이나 설정 형식을 바꾸면 migration이 이 고정값을 읽어야 한다. 고정값은 바꾸지 않고 다음 출시 형식은 폴더를 새로 더한다
import { _electron as electron, expect, test } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIXTURE = join('tests', 'e2e', 'fixtures', 'userdata-v0.1.0');
const read = (p: string) => JSON.parse(readFileSync(join(FIXTURE, p), 'utf8')) as { data: unknown };
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

type Win = Window & {
  core: {
    host: { status: Array<{ id: string; on: boolean }> };
    ctxs: Map<string, { ctx: { local: { get(s: string): unknown }; settings: { get(): Record<string, unknown> } } }>;
  };
};

test('이전 형식의 데이터 폴더로 켜도 설정과 모듈 데이터가 그대로 남는다', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'td-upgrade-'));
  cpSync(FIXTURE, userData, { recursive: true });
  const uid = (JSON.parse(readFileSync(join(FIXTURE, 'device/core.json'), 'utf8')) as { deviceId: string }).deviceId;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, ISSHONI_FAKE_PLATFORM: '1' } });
  const errors: string[] = [];
  const stage = await app.firstWindow();
  stage.on('pageerror', (e) => errors.push(e.message));
  stage.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
  try {
    await stage.waitForFunction(() => 'core' in window, null, { timeout: 30_000 });
    expect(await stage.evaluate(() => (window as unknown as Win).core.host.status.filter((s) => !s.on).map((s) => s.id))).toEqual([]);

    // 읽지 못한 파일은 .bak으로 남고 이유가 메인 로그에 남는다. 알림은 4초 뒤에 사라지므로 파일과 로그로 본다
    const all = ['device', 'accounts'].flatMap((d) => walk(join(userData, d))).map((f) => f.slice(userData.length + 1).replaceAll('\\', '/'));
    expect(all.filter((f) => /\.bak(\.json)?$/.test(f))).toEqual([]);
    expect(existsSync(join(userData, 'settings.json.bak'))).toBe(false);
    const logs = readdirSync(join(userData, 'logs')).filter((f) => f.startsWith('main-')).map((f) => readFileSync(join(userData, 'logs', f), 'utf8')).join('');
    expect(logs).not.toMatch(/local (device|account):|모양이 맞지 않아/);

    // 설정 화면 값, 이름, 집중 앱, 캐릭터, 플레이리스트
    const local = (id: string, scope: string) => stage.evaluate(([i, s]) => (window as unknown as Win).core.ctxs.get(i)!.ctx.local.get(s), [id, scope] as const);
    const core = await stage.evaluate(() => (window as unknown as Win).core.ctxs.get('core')!.ctx.settings.get());
    expect(core).toMatchObject({ theme: 'dark', chips: 'right' });
    expect(await local('account', 'account')).toEqual(read(`accounts/${uid}/modules/account.json`).data);
    expect(await local('focus', 'device')).toEqual(read('device/modules/focus.json').data);
    expect(await local('wardrobe', 'account')).toEqual(read(`accounts/${uid}/modules/wardrobe.json`).data);
    expect(await local('sound', 'device')).toEqual(read('device/modules/sound.json').data);
    // 느린 러너에서는 런처 창이 늦게 열린다
    await expect.poll(async () => (await Promise.all(app.windows().slice(1).map((w) => w.title().catch(() => '')))).includes('Isshoni Hatarakou'), { timeout: 20_000 }).toBe(true);
    const launcher = (await Promise.all(app.windows().slice(1).map(async (w) => [w, await w.title()] as const))).find(([, t]) => t === 'Isshoni Hatarakou')![0];
    await expect(launcher.getByText('업그레이드')).toBeVisible();
    expect(existsSync(join(userData, 'settings.json'))).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
