// 코어 계약 부팅 시험:대상 고르기, 효과 창, 로컬 좌석과 올라타기와 벤치, 표시 모드, 한 계정 한 기기, 연결 해제.
// `npx electron-vite build --mode e2e` 뒤에 실행한다. 가짜 플랫폼과 메모리 서버로 켠다.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function windowTitled(app: ElectronApplication, title: string): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const w of app.windows().slice(1)) if (!w.isClosed() && (await w.title()) === title) return w;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${title} 창이 열리지 않았습니다`);
}

// 렌더러의 window.core를 시험에서 부르는 모양만 적는다
type Win = Window & {
  core: {
    deps: { uid: string; deviceId: string; server: { userPrivate: { set(uid: string, path: string, v: unknown): Promise<void> } } };
    session: { join(code: string): Promise<{ ok: boolean }> };
    ctxs: Map<string, { ctx: { seats: Record<string, (...a: unknown[]) => void>; mode: { set(m: string): void; get(): string } } }>;
    registry: { add(owner: string, ctx: unknown, m: unknown): void };
    effects: Map<string, unknown>;
    seatViews: Map<string, { el: HTMLElement; view: { hitRegion(): { x: number; y: number; width: number; height: number } } }>;
    away: { get(): Set<string> };
    pickTarget(ms: number): Promise<unknown>;
    playEffect(owner: string, key: string, id: string, opts: unknown): () => void;
  };
  pick?: Promise<unknown>;
  fx?: { from: { x: number; y: number }; to?: { x: number; y: number }; width: number; height: number; sprite: boolean; own: boolean; r: number };
  fxDone?: boolean;
};

test('M3 코어 계약이 앱에서 동작한다', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'td-m3-'));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, ISSHONI_FAKE_PLATFORM: '1' } });
  const errors: string[] = [];
  const stage = await app.firstWindow();
  stage.on('pageerror', (e) => errors.push(e.message));
  stage.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const launcher = await windowTitled(app, 'Isshoni Hatarakou');
  await launcher.getByText('시작하기').click();
  await expect(stage.locator('button[title="메뉴"]')).toBeVisible();
  expect(await stage.evaluate(() => (window as unknown as Win).core.session.join('DEVDEV').then((r) => r.ok))).toBe(true);
  await expect(stage.getByText('가짜 친구')).toBeVisible();
  const me = await stage.evaluate(() => `${(window as unknown as Win).core.deps.uid}_${(window as unknown as Win).core.deps.deviceId}`);
  const friend = 'devfriend_dev';

  // 대상 고르기 (ctx.ui.pickTarget): 다른 사람 좌석을 누르면 그 사람, 취소하면 null
  await stage.evaluate(() => void ((window as unknown as Win).pick = (window as unknown as Win).core.pickTarget(10_000)));
  await expect(stage.getByText('누구에게 할지 캐릭터를 눌러 주세요')).toBeVisible();
  await stage.getByRole('button', { name: '가짜 친구 고르기' }).click();
  expect(await stage.evaluate(() => (window as unknown as Win).pick)).toEqual({ uid: 'devfriend', key: friend, name: '가짜 친구' });
  await stage.evaluate(() => void ((window as unknown as Win).pick = (window as unknown as Win).core.pickTarget(10_000)));
  await stage.getByRole('button', { name: '취소' }).click();
  expect(await stage.evaluate(() => (window as unknown as Win).pick)).toBeNull();
  await expect(stage.getByText('누구에게 할지 캐릭터를 눌러 주세요')).toBeHidden();

  // 효과 창: 효과가 있는 동안만 열리고 캐릭터 몸을 좌석에서 숨긴다. from은 효과 창 기준 내 몸 가운데
  const before = app.windows().length;
  await stage.evaluate(([key, to]) => {
    const w = window as unknown as Win;
    w.core.effects.set('test.fly', {
      id: 'test.fly',
      detach: true,
      durationMs: 1500,
      run: (surface: { root: HTMLElement; canvas: HTMLCanvasElement; width: number; height: number }, args: { from: { x: number; y: number }; to?: { x: number; y: number }; sprite?: unknown; rand(): number }) => {
        w.fx = { from: args.from, to: args.to, width: surface.width, height: surface.height, sprite: !!args.sprite, own: surface.root.ownerDocument !== document, r: args.rand() };
        const g = surface.canvas.getContext('2d')!;
        g.fillStyle = '#f33';
        g.fillRect(args.from.x - 20, args.from.y - 20, 40, 40);
        return () => void (w.fxDone = true);
      },
    });
    w.core.playEffect('test', key!, 'test.fly', { toSeatKey: to, seed: 7 });
  }, [me, friend]);
  await expect.poll(() => app.windows().length).toBe(before + 1);
  const fxWin = await windowTitled(app, '효과');
  expect(await stage.evaluate((key) => [...(window as unknown as Win).core.away.get()].includes(key), me)).toBe(true);
  const fx = (await stage.evaluate(() => (window as unknown as Win).fx))!;
  expect(fx).toMatchObject({ sprite: true, own: true });
  // 같은 seed는 같은 수열을 준다 (mulberry32(7)의 첫 값)
  expect(fx.r).toBeCloseTo(0.0117047531, 8);
  const body = await stage.evaluate((key) => {
    const v = (window as unknown as Win).core.seatViews.get(key)!;
    const r = v.el.getBoundingClientRect();
    const h = v.view.hitRegion();
    return { x: r.x + h.x + h.width / 2, y: r.y + h.y + h.height / 2 };
  }, me);
  const geo = await app.evaluate(({ BrowserWindow, screen }) => {
    const ws = BrowserWindow.getAllWindows();
    const s = ws.find((w) => !w.webContents.getURL().startsWith('about:'))!;
    const fxw = ws.find((w) => w.getTitle() === '효과')!;
    return { stage: s.getBounds(), fx: fxw.getBounds(), display: screen.getDisplayMatching(s.getBounds()).bounds, focusable: fxw.isFocusable() };
  });
  // 모니터 크기로 열린다 (Mac은 메뉴 막대 아래로 내려 y가 다를 수 있다)
  expect([geo.fx.x, geo.fx.width, geo.fx.height]).toEqual([geo.display.x, geo.display.width, geo.display.height]);
  expect(geo.focusable).toBe(false);
  expect(fx.width).toBe(geo.fx.width);
  expect(Math.abs(fx.from.x - (geo.stage.x - geo.fx.x + body.x))).toBeLessThan(2);
  expect(Math.abs(fx.from.y - (geo.stage.y - geo.fx.y + body.y))).toBeLessThan(2);
  expect(fx.to!.x).toBeGreaterThan(fx.from.x);
  await fxWin.screenshot({ path: 'test-results/m3-effect.png' });
  await expect.poll(() => fxWin.isClosed(), { timeout: 5_000 }).toBe(true);
  expect(await stage.evaluate(() => (window as unknown as Win).fxDone)).toBe(true);
  expect(await stage.evaluate(() => (window as unknown as Win).core.away.get().size)).toBe(0);

  // 로컬 좌석, 올라타기, 벤치: 스테이지 크기가 좌석 배치를 따른다
  const size = () => stage.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const seats = (fn: string, ...args: unknown[]) =>
    stage.evaluate(([f, a]) => (window as unknown as Win).core.ctxs.get('core')!.ctx.seats[f as string]!(...(a as unknown[])), [fn, args] as const);
  const two = await size();
  await seats('addLocal', { key: 'core:extra', appearance: { v: 1, body: 'animal', poses: { idle: null, typing: null, sleep: null }, slots: {} }, name: '둘째' });
  await expect(stage.getByText('둘째')).toBeVisible();
  await expect.poll(async () => (await size()).w).toBeGreaterThan(two.w);
  const three = await size();
  await seats('attach', 'core:extra', friend);
  await expect(stage.locator('[class*="rider"]')).toHaveCount(1);
  await expect.poll(async () => (await size()).h).toBeGreaterThan(three.h);
  await stage.waitForTimeout(300);
  await stage.screenshot({ path: 'test-results/m3-rider.png' });
  await seats('attach', 'core:extra', null);
  await expect(stage.locator('[class*="rider"]')).toHaveCount(0);
  await seats('setBench', me, 'bench1');
  await seats('setBench', friend, 'bench1');
  await expect.poll(async () => (await size()).w).toBeLessThan(three.w);
  await seats('setBench', me, null);
  await seats('setBench', friend, null);
  await seats('removeLocal', 'core:extra');
  await expect(stage.getByText('둘째')).toBeHidden();

  // 표시 모드: quiet은 quiet 항목을 메뉴에서 빼고 hidden은 스테이지를 숨긴다
  await stage.evaluate(() => {
    const core = (window as unknown as Win).core;
    core.registry.add('test', core.ctxs.get('core')!.ctx, { contributions: [{ slot: 'menu.main', id: 'test.prank', label: '장난하기', quiet: 'hide' }] });
  });
  const mode = (m: string) => stage.evaluate((x) => (window as unknown as Win).core.ctxs.get('core')!.ctx.mode.set(x), m);
  await stage.locator('button[title="메뉴"]').click();
  await expect(stage.getByRole('button', { name: '장난하기' })).toBeVisible();
  await mode('quiet');
  await expect(stage.getByRole('button', { name: '장난하기' })).toBeHidden();
  await stage.locator('button[title="메뉴"]').click();
  const stageVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().startsWith('about:'))!.isVisible());
  await mode('hidden');
  await expect.poll(stageVisible).toBe(false);
  await mode('normal');
  await expect.poll(stageVisible).toBe(true);

  // 한 계정 한 기기 (ACC-12, SCR-08): 다른 기기가 가져가면 방에서 나오고 여기서 계속 쓰기로 되찾는다
  await stage.evaluate(() => {
    const { deps } = (window as unknown as Win).core;
    return deps.server.userPrivate.set(deps.uid, 'activeDevice', { id: 'other-pc', at: 1 });
  });
  await expect(stage.getByText('다른 기기에서 쓰는 중이에요', { exact: false })).toBeVisible();
  await expect(stage.getByText('가짜 친구')).toBeHidden();
  await stage.screenshot({ path: 'test-results/m3-elsewhere.png' });
  await stage.getByRole('button', { name: '여기서 계속 쓰기' }).click();
  await expect(stage.getByText('가짜 친구')).toBeVisible();
  await expect(stage.getByText('다른 기기에서 쓰는 중이에요', { exact: false })).toBeHidden();

  // 연결 해제 (ACC-05): 스테이지를 다시 읽어 신원 단계부터 시작한다 (메모리 서버는 개발 계정으로 바로 들어간다)
  await stage.locator('button[title="메뉴"]').click();
  await stage.getByRole('button', { name: '설정', exact: true }).click();
  const settings = await windowTitled(app, '설정');
  await settings.getByRole('button', { name: '이 PC 연결 해제' }).click();
  await settings.getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect.poll(() => settings.isClosed()).toBe(true);
  await windowTitled(app, 'Isshoni Hatarakou');
  await expect.poll(() => stage.evaluate(() => !!(window as unknown as Win).core)).toBe(true);
  expect(await stage.evaluate(() => (window as unknown as Win).fxDone)).toBeUndefined();

  expect(errors).toEqual([]);
  await app.close();
});
