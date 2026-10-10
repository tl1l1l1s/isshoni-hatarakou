// OS 수준 클릭 검사 (macOS). Playwright 클릭은 OS를 거치지 않아 클릭 통과를 증명하지 못하므로 CGEvent로 실제 화면 좌표를 누른다.
// 준비: 시스템 설정의 손쉬운 사용에 이 터미널을 켠다. 실행: node .claude/skills/verify-isshoni/osclick.ts
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, menu, verify, windowTitled } from './drive.ts';

const bin = join(process.env.TMPDIR ?? '/tmp', 'isshoni-osclick');
if (!existsSync(bin)) execFileSync('swiftc', ['-O', join(import.meta.dirname, 'click.swift'), '-o', bin]);
const osClick = (x: number, y: number, mode: 'move' | 'instant' | 'hover' = 'move') => execFileSync(bin, [String(Math.round(x)), String(Math.round(y)), mode]);
const frontmost = () => execFileSync('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true']).toString().trim();
type Box = { x: number; y: number; width: number; height: number };

await verify('osclick', async (s) => {
  // 가짜 플랫폼의 커서는 고정값이라 클릭 통과 판단이 실제 커서를 보지 못한다. 이 검사에서만 실제 커서를 돌려준다
  await s.app.evaluate(({ screen }) => {
    Object.defineProperty((globalThis as unknown as { fakePlatform: object }).fakePlatform, 'cursor', { get: () => screen.getCursorScreenPoint(), configurable: true });
  });
  await s.launcher.getByText('시작하기').click();
  await s.stage.locator('button[title="메뉴"]').waitFor();
  const rooms = await menu(s, '방 만들기 / 참여하기', '방 만들기 / 참여하기');
  await rooms.getByPlaceholder('예: 7Q2K9M').fill('devdev');
  await rooms.getByRole('button', { name: '참여' }).click();
  await expect(s.stage.getByText('가짜 친구')).toBeVisible();
  await rooms.close();
  await s.stage.waitForTimeout(800);

  const bw = await s.app.browserWindow(s.stage);
  const now = () => bw.evaluate((w) => w.getBounds());
  const b0 = await now();
  // 창 안 상자의 화면 좌표. 메뉴가 열리면 창이 위로 커지므로 누를 때마다 창 위치를 다시 읽는다
  const pt = async (box: Box, fx = 0.5, fy = 0.5) => { const b = await now(); return [b.x + box.x + box.width * fx, b.y + box.y + box.height * fy] as const; };
  const emptySpot = async () => { const b = await now(); return [b.x + b.width - 14, b.y + 14] as const; };
  const box = async (name: string) => (await s.stage.getByRole('button', { name, exact: true }).boundingBox())!;
  const chipBox = async () => (await s.stage.locator('button[title="메뉴"]').boundingBox())!;

  // 스테이지 아래에 클릭을 기록하는 창을 깔고 스테이지를 실제 플랫폼처럼 맨 위 층에 둔다. 통과한 클릭은 이 창에 닿는다
  await s.app.evaluate(async ({ BrowserWindow }, b) => {
    const w = new BrowserWindow({ x: b.x - 120, y: b.y + b.height - 900, width: b.width + 160, height: 900, frame: false, show: false, focusable: false, backgroundColor: '#ffe066', webPreferences: { sandbox: true } });
    await w.loadURL('about:blank');
    await w.webContents.executeJavaScript(`document.title='probe';document.addEventListener('mousedown',(e)=>{document.title='HIT '+e.clientX+','+e.clientY;});0`);
    w.showInactive();
    (globalThis as unknown as { probe: Electron.BrowserWindow }).probe = w;
  }, b0);
  await bw.evaluate((w) => { w.setAlwaysOnTop(true, 'screen-saver'); w.moveTop(); });
  await s.stage.waitForTimeout(300);
  const probe = () => s.app.evaluate(() => (globalThis as unknown as { probe: Electron.BrowserWindow }).probe.getTitle());
  const stageHits = () => s.stage.evaluate(() => { const w = window as unknown as { hits?: string[] }; const h = w.hits ?? []; w.hits = []; return h; });
  await s.stage.evaluate(() => { const w = window as unknown as { hits: string[] }; w.hits = []; for (const t of ['pointerdown', 'click']) document.addEventListener(t, () => w.hits.push(t), true); });
  const results: Record<string, boolean> = {};

  // 1) 빈 자리: 스테이지를 통과해 아래 창에 닿는다 (마우스를 옮겨 누르기, 바로 찍기)
  osClick(...(await emptySpot()));
  await s.stage.waitForTimeout(400);
  results['빈 자리 통과 (옮겨 누르기)'] = (await probe()).startsWith('HIT');
  const t0 = await probe();
  osClick(...(await emptySpot()), 'instant');
  await s.stage.waitForTimeout(400);
  results['빈 자리 통과 (바로 찍기)'] = (await probe()) !== t0 || (await probe()).startsWith('HIT');

  // 2) 내 캐릭터 몸: 쓰다듬기 반응이 뜨고 아래 창에는 닿지 않으며 앞 앱이 바뀌지 않는다
  const front = frontmost();
  const t1 = await probe();
  await stageHits();
  osClick(...(await pt(await box('내 캐릭터 쓰다듬기'), 0.5, 0.6)));
  await s.stage.waitForTimeout(700);
  results['캐릭터 클릭이 스테이지에 닿음'] = (await stageHits()).includes('click');
  results['캐릭터 클릭 쓰다듬기 반응'] = (await s.stage.getByText('💗').count()) > 0;
  results['캐릭터 클릭이 아래로 새지 않음'] = (await probe()) === t1;
  results['캐릭터 클릭이 앞 앱을 바꾸지 않음'] = frontmost() === front;
  await s.shot(s.stage, 'os-body-click');

  // 3) ▼ 칩과 메뉴 항목: 메뉴가 열리고 항목을 누르면 창이 열린다
  osClick(...(await pt(await chipBox())));
  await expect(s.stage.getByRole('button', { name: '설정', exact: true })).toBeVisible({ timeout: 3000 });
  await s.stage.waitForTimeout(400);
  await s.shot(s.stage, 'os-menu');
  osClick(...(await pt(await box('상태 고르기'))));
  const pick = await windowTitled(s.app, '상태 고르기');
  results['메뉴 항목 클릭으로 창 열림'] = (await pick.title()) === '상태 고르기';

  // 4) 메뉴가 닫혀 창이 줄어든 직후 친구 이름표: 클릭 영역이 새 크기로 갱신되어 바로 눌린다
  await s.stage.waitForTimeout(700);
  await stageHits();
  osClick(...(await pt(await box('가짜 친구 메뉴'))));
  await s.stage.waitForTimeout(800);
  results['창이 줄어든 뒤 이름표 클릭'] = (await s.stage.getByRole('menu', { name: '가짜 친구' }).count()) === 1;
  await s.shot(s.stage, 'os-friend-menu');

  // 5) 멀리서 캐릭터 위로 바로 찍기 (펜을 들었다 찍는 흐름). 폴링이 따라오지 못하면 통과한다. 결과만 적는다
  osClick(b0.x - 60, b0.y + 40, 'hover');
  await s.stage.waitForTimeout(500);
  const t2 = await probe();
  await stageHits();
  osClick(...(await pt(await box('내 캐릭터 쓰다듬기'), 0.5, 0.6)), 'instant');
  await s.stage.waitForTimeout(600);
  results['멀리서 바로 찍기 (참고)'] = (await stageHits()).includes('click') && (await probe()) === t2;

  for (const [k, v] of Object.entries(results)) console.log(v ? 'ok  ' : 'FAIL', k);
  if (Object.entries(results).some(([k, v]) => !v && !k.includes('참고'))) throw new Error('OS 클릭 검사 실패');
});
