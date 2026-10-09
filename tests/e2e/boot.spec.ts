// Playwright 부팅 시험 (10.10.1). `npx electron-vite build --mode e2e` 뒤에 실행한다.가짜 플랫폼과 메모리 서버로 켠다.
// 9.2의 첫 버전 흐름을 따라간다: 런처 → 시작 → 이름 → 집중 앱 등록과 시간 쌓기 → 방 → 캐릭터 저장 → 런처로
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 스테이지(첫 창)를 뺀 패널 창 가운데 제목이 같은 창 */
async function windowTitled(app: ElectronApplication, title: string): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const w of app.windows().slice(1)) if (!w.isClosed() && (await w.title()) === title) return w;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${title} 창이 열리지 않았습니다`);
}

async function menu(app: ElectronApplication, stage: Page, item: string, title: string): Promise<Page> {
  await stage.locator('button[title="메뉴"]').click();
  await stage.getByRole('button', { name: item, exact: true }).click();
  return windowTitled(app, title);
}

test('첫 버전 흐름이 처음부터 끝까지 동작한다', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'td-e2e-'));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, ISSHONI_FAKE_PLATFORM: '1' } });
  const errors: string[] = [];
  const stage = await app.firstWindow();
  stage.on('pageerror', (e) => errors.push(e.message));
  stage.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // 런처 (SCR-02)
  const launcher = await windowTitled(app, 'Isshoni Hatarakou');
  await expect(launcher.getByText('시작하기')).toBeVisible();
  await launcher.waitForTimeout(300);
  await launcher.screenshot({ path: 'test-results/launcher.png' });
  await launcher.getByText('시작하기').click();
  await expect(stage.locator('button[title="메뉴"]')).toBeVisible();

  // 닉네임 (ACC-04)
  const settings = await menu(app, stage, '설정', '설정');
  await settings.getByRole('button', { name: '계정' }).click();
  await settings.locator('input').first().fill('테스트');
  await settings.getByRole('button', { name: '저장' }).click();
  await expect(stage.getByText('테스트')).toBeVisible();

  // 집중 앱 등록과 시간 쌓기 (FOC-01, FOC-02, CHR-05)
  await app.evaluate(() => void ((globalThis as unknown as { fakePlatform: { app: string } }).fakePlatform.app = 'win:paint.exe'));
  await settings.getByRole('button', { name: '집중 앱' }).click();
  await settings.waitForTimeout(700);
  await settings.getByRole('button', { name: '직전에 쓴 앱 넣기' }).first().click();
  await settings.screenshot({ path: 'test-results/settings-apps.png' });
  const todaySec = () => stage.evaluate(() => (window as unknown as { core: { host: { api(id: string): { todaySec(): number } } } }).core.host.api('focus').todaySec());
  await expect.poll(todaySec, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await settings.close();

  // 방 (ROM-05, ROM-08): 메모리 서버 개발 방에 가짜 친구가 있다
  const rooms = await menu(app, stage, '방 만들기 / 참여하기', '방 만들기 / 참여하기');
  await rooms.getByPlaceholder('예: 7Q2K9M').fill('devdev');
  await rooms.getByRole('button', { name: '참여' }).click();
  await expect(stage.getByText('가짜 친구')).toBeVisible();
  await rooms.close();

  // 다른 사용자 메뉴 (ROM-11): 친구 이름표를 누르면 스테이지가 커지며 메뉴가 열리고 다시 누르면 닫힌다. 캐릭터 오른쪽 클릭도 같다
  const height = () => stage.evaluate(() => window.innerHeight);
  const closedH = await height();
  const friendPlate = stage.getByRole('button', { name: '가짜 친구 메뉴' });
  const friendMenu = stage.getByRole('menu', { name: '가짜 친구' });
  await friendPlate.click();
  await expect(friendMenu).toBeVisible();
  await expect.poll(height).toBeGreaterThan(closedH);
  await friendPlate.click();
  await expect(friendMenu).toBeHidden();
  const friendBody = stage.getByRole('button', { name: '가짜 친구 쓰다듬기' });
  await friendBody.click({ button: 'right' });
  await expect(friendMenu).toBeVisible();
  await friendBody.click({ button: 'right' });
  await expect(friendMenu).toBeHidden();

  // 쓰다듬기와 흔들기 (CHR-11): 캐릭터를 짧게 누르면 💗, 누른 채로 좌우로 흔들면 💫
  await friendBody.click();
  await expect(stage.getByText('💗')).toBeVisible();
  const box = (await friendBody.boundingBox())!;
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  await stage.mouse.move(cx, cy);
  await stage.mouse.down();
  for (let i = 0; i < 8; i++) await stage.mouse.move(cx + (i % 2 ? -20 : 20), cy, { steps: 2 });
  await stage.mouse.up();
  await expect(stage.getByText('💫')).toBeVisible();
  await expect(friendMenu).toBeHidden();

  // 캐릭터 만들기 (AVT-01, AVT-03, AVT-04, AVT-11): 얼굴 그림판에 한 획 그리고 기본 책상을 골라 저장한다
  const wardrobe = await menu(app, stage, '캐릭터 만들기', '캐릭터 만들기');
  await wardrobe.getByRole('button', { name: '얼굴 그리기' }).click();
  await wardrobe.getByRole('button', { name: '파랑' }).click();
  const board = (await wardrobe.getByLabel('얼굴 그림판').boundingBox())!;
  await wardrobe.mouse.move(board.x + board.width * 0.3, board.y + board.height * 0.25);
  await wardrobe.mouse.down();
  await wardrobe.mouse.move(board.x + board.width * 0.7, board.y + board.height * 0.3, { steps: 10 });
  await wardrobe.mouse.up();
  await expect(wardrobe.getByRole('button', { name: '되돌리기' })).toBeEnabled();
  await wardrobe.screenshot({ path: 'test-results/wardrobe-face.png' });
  await wardrobe.getByRole('button', { name: '2 책상' }).click();
  await wardrobe.getByRole('button', { name: /나무 책상/ }).click();
  await wardrobe.waitForTimeout(300);
  await wardrobe.screenshot({ path: 'test-results/wardrobe.png' });
  await wardrobe.getByRole('button', { name: '저장' }).click();
  await expect(stage.getByText('캐릭터를 저장했습니다')).toBeVisible();
  // 얼굴 그리기로 구운 자세 그림 세 장과 다시 고칠 편집 데이터가 저장된다
  const look = await stage.evaluate(() => (window as unknown as { core: { host: { api(id: string): { appearance(): { poses: Record<string, string | null>; bodyExt?: { face?: { open?: string } } } } } } }).core.host.api('wardrobe').appearance());
  expect(Object.values(look.poses).every(Boolean)).toBe(true);
  expect(look.bodyExt?.face?.open).toMatch(/^[0-9a-f]{64}$/);
  await stage.waitForTimeout(500);
  await stage.screenshot({ path: 'test-results/stage-room.png' });

  // 상태 고르기와 머리 위 말풍선 (CHR-10, CHR-09)
  const status = await menu(app, stage, '상태 고르기', '상태 고르기');
  await status.getByRole('button', { name: '밥 먹는 중' }).click();
  await expect(stage.getByText('밥 먹는 중').first()).toBeVisible();

  // 그림 파일 고르기 대화상자는 시험용 그림을 돌려주게 바꾼다
  const png = await stage.evaluate(async () => {
    const c = new OffscreenCanvas(64, 64);
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffcc33';
    g.beginPath();
    g.arc(32, 32, 24, 0, Math.PI * 2);
    g.fill();
    return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())];
  });
  const pngPath = join(userData, 'star.png');
  writeFileSync(pngPath, Buffer.from(png));
  await app.evaluate(({ dialog }, p) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
  }, pngPath);

  // 내 방을 만들고 방 설정에서 가챠 아이템을 넣는다 (OUR-01, OUR-02)
  const rooms2 = await menu(app, stage, '방 만들기 / 참여하기', '방 만들기 / 참여하기');
  await rooms2.getByRole('button', { name: '방에서 나가기' }).click();
  await rooms2.getByRole('button', { name: '만들기', exact: true }).click();
  await rooms2.getByRole('button', { name: '방 설정' }).click();
  const roomSettings = await windowTitled(app, '방 설정');
  await roomSettings.getByLabel('이름', { exact: true }).fill('별');
  await roomSettings.getByRole('button', { name: '그림 고르고 넣기' }).click();
  await expect(roomSettings.getByText('아이템을 넣었습니다.')).toBeVisible();
  await roomSettings.screenshot({ path: 'test-results/room-settings.png' });

  // 방에서 1시간 작업한 것으로 기록하고 한 번 뽑는다 (GCH-02, GCH-03)
  await stage.evaluate(async () => {
    const core = (window as unknown as { core: { session: { current(): string }; deps: { uid: string; server: { docs(ns: unknown): { update(k: string, p: unknown): Promise<void> } } } } }).core;
    await core.deps.server.docs({ scope: 'user', module: 'gacha', uid: core.deps.uid, path: ['r'] }).update(core.session.current(), { sec: { $inc: 3600 } });
  });
  const gacha = await menu(app, stage, '가챠', '가챠');
  await gacha.getByRole('button', { name: '1회 뽑기' }).click();
  await expect(gacha.getByText('별').first()).toBeVisible();
  await gacha.waitForTimeout(1500);
  await gacha.screenshot({ path: 'test-results/gacha.png' });

  // 보관함에 방마다 모은 종 수가 나온다 (GCH-01, GCH-06)
  const inventory = await menu(app, stage, '보관함', '보관함');
  await expect(inventory.getByText('1/1종')).toBeVisible();
  await inventory.screenshot({ path: 'test-results/inventory.png' });

  // 뽑은 아이템을 스티커로 붙인다 (AVT-05)
  const deco = await menu(app, stage, '꾸미기', '꾸미기');
  await deco.getByRole('button', { name: /별/ }).first().click();
  await deco.waitForTimeout(300);
  await deco.screenshot({ path: 'test-results/stickers.png' });
  await deco.getByRole('button', { name: '저장' }).click();
  await stage.waitForTimeout(800);
  await stage.screenshot({ path: 'test-results/stage-m2a.png' });

  // 대화하기와 말풍선 (COM-01, COM-09)
  const chat = await menu(app, stage, '대화하기', '대화하기');
  await chat.getByLabel('메시지').fill('안녕하세요');
  await chat.getByLabel('메시지').press('Enter');
  await expect(chat.getByText('안녕하세요').first()).toBeVisible();
  await expect(stage.getByText('안녕하세요').first()).toBeVisible();
  await chat.screenshot({ path: 'test-results/chat.png' });

  // 마이홈 편집 (HOM-01, HOM-02, HOM-03)
  const home = await menu(app, stage, '마이홈', '마이홈');
  await home.getByRole('button', { name: '편집' }).click();
  await home.getByPlaceholder('자기소개를 적어 보세요.').fill('그림 그리는 사람');
  await home.getByRole('button', { name: '저장' }).click();
  await expect(home.getByText('그림 그리는 사람')).toBeVisible();
  await home.screenshot({ path: 'test-results/home.png' });

  // 친구 창 (FRD-03)
  const friends = await menu(app, stage, '친구', '친구');
  await friends.screenshot({ path: 'test-results/friends.png' });

  // 플레이리스트와 백색소음 (SND-01, SND-08)
  const player = await menu(app, stage, '플레이리스트', '플레이리스트');
  await player.getByRole('button', { name: '빗소리' }).click();
  await player.screenshot({ path: 'test-results/player.png' });
  await stage.screenshot({ path: 'test-results/stage-m2b.png' });

  // 런처로 돌아가기 (CHR-04)
  await menu(app, stage, '« 런처로', 'Isshoni Hatarakou');

  expect(errors).toEqual([]);
  await app.close();
});
