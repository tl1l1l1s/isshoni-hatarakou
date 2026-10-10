// Windows 스모크 시험 (GitHub Actions windows-latest). `npx electron-vite build --mode e2e` 뒤에 실행한다. 가짜 플랫폼과 메모리 서버로 켠다.
// 앱을 한 번 켜고 사용자가 만지는 흐름을 순서대로 지나간다. 느린 러너라 고정 대기 대신 expect로 기다리고 경로는 os.tmpdir() 아래에 둔다
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

// 렌더러의 window.core와 devHub를 시험에서 부르는 모양만 적는다
type Win = Window & {
  devHub: { write(p: string, v: unknown): void; now(): number };
  core: {
    deps: {
      uid: string;
      server: {
        docs(ns: unknown): { update(k: string, p: unknown): Promise<void> };
        userPrivate: { set(uid: string, path: string, v: unknown): Promise<void> };
      };
    };
    session: { current(): string };
  };
};

test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
/** 앱 프로세스. 끝난 뒤에는 app.process()를 부를 수 없어 켤 때 받아 둔다 */
let proc: ReturnType<ElectronApplication['process']>;
let stage: Page;
let launcher: Page;
let userData: string;
const errors: string[] = [];

/** 스테이지(첫 창)를 뺀 창 가운데 제목이 같은 창. 느린 러너라 20초까지 기다린다 */
async function windowTitled(title: string): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    for (const w of app.windows().slice(1)) if (!w.isClosed() && (await w.title().catch(() => '')) === title) return w;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${title} 창이 열리지 않았습니다`);
}

/** 실행 화면의 ▼ 메뉴에서 항목을 눌러 열린 창 */
async function menu(item: string, title: string): Promise<Page> {
  await stage.locator('button[title="메뉴"]').click();
  await stage.getByRole('button', { name: item, exact: true }).click();
  return windowTitled(title);
}

const shot = (page: Page, name: string) => page.screenshot({ path: join('test-results', `win-${name}.png`) });

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'td-win-'));
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, ISSHONI_FAKE_PLATFORM: '1' } });
  proc = app.process();
  stage = await app.firstWindow();
  stage.on('pageerror', (e) => errors.push(e.message));
  stage.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
  launcher = await windowTitled('Isshoni Hatarakou');
});

// 실패하면 열린 창을 모두 찍어 둔다 (CI 아티팩트)
test.afterEach(async () => {
  const info = test.info();
  if (info.status === info.expectedStatus) return;
  let i = 0;
  for (const w of app.windows()) if (!w.isClosed()) await w.screenshot({ path: info.outputPath(`window-${i++}.png`), timeout: 5_000 }).catch(() => undefined);
});

test.afterAll(async () => {
  if (proc && proc.exitCode === null) await app.close().catch(() => proc.kill());
});

test('런처가 뜨고 내 정보 화면을 열었다 닫는다', async () => {
  await expect(launcher.getByText('시작하기')).toBeVisible();
  await expect(launcher.getByText('이름 없음').first()).toBeVisible();
  await shot(launcher, 'launcher');
  await launcher.getByRole('button', { name: '내 정보' }).click();
  await expect(launcher.getByRole('heading', { name: '내 정보' })).toBeVisible();
  await shot(launcher, 'me');
  await launcher.getByRole('button', { name: '뒤로' }).click();
  await expect(launcher.getByText('시작하기')).toBeVisible();
});

test('시작하기로 실행 화면이 열리고 상태칩 ▼ 메뉴에 항목이 있다', async () => {
  await launcher.getByText('시작하기').click();
  const menuButton = stage.locator('button[title="메뉴"]');
  await expect(menuButton).toBeVisible();
  await expect(stage.getByText('이름 없음').first()).toBeVisible();
  await menuButton.click();
  for (const item of ['상태 고르기', '캐릭터 만들기', '설정', '« 런처로']) await expect(stage.getByRole('button', { name: item, exact: true })).toBeVisible();
  await shot(stage, 'menu');
  await menuButton.click();
  await expect(stage.getByRole('button', { name: '« 런처로', exact: true })).toBeHidden();
});

test('설정 창의 일반, 계정, 집중 앱, 화면 탭이 열린다', async () => {
  const settings = await menu('설정', '설정');
  await settings.getByRole('button', { name: '일반', exact: true }).click();
  await expect(settings.getByLabel('컴퓨터 켤 때 자동 실행')).toBeVisible();
  await settings.getByRole('button', { name: '계정', exact: true }).click();
  await expect(settings.getByLabel('닉네임')).toBeVisible();
  await settings.getByRole('button', { name: '집중 앱', exact: true }).click();
  await expect(settings.getByText('등록한 앱이 앞에 있을 때만 집중 시간이 쌓여요.')).toBeVisible();
  await settings.getByRole('button', { name: '화면', exact: true }).click();
  await expect(settings.getByLabel('회사원 모드')).toBeVisible();
  await shot(settings, 'settings');
  await settings.close();
});

test('캐릭터 만들기에서 얼굴을 한 획 그리고 저장한다', async () => {
  const wardrobe = await menu('캐릭터 만들기', '캐릭터 만들기');
  await wardrobe.getByRole('button', { name: '얼굴 그리기' }).click();
  await wardrobe.getByRole('button', { name: '파랑' }).click();
  const board = (await wardrobe.getByLabel('얼굴 그림판').boundingBox())!;
  await wardrobe.mouse.move(board.x + board.width * 0.3, board.y + board.height * 0.25);
  await wardrobe.mouse.down();
  await wardrobe.mouse.move(board.x + board.width * 0.7, board.y + board.height * 0.3, { steps: 10 });
  await wardrobe.mouse.up();
  await expect(wardrobe.getByRole('button', { name: '되돌리기' })).toBeEnabled();
  await wardrobe.getByRole('button', { name: '2 책상' }).click();
  await wardrobe.getByRole('button', { name: /나무 책상/ }).click();
  await shot(wardrobe, 'wardrobe');
  await wardrobe.getByRole('button', { name: '저장' }).click();
  await expect(stage.getByText('캐릭터를 저장했습니다')).toBeVisible();
  await expect.poll(() => wardrobe.isClosed()).toBe(true);
});

test('뽀모도로를 시작하면 창과 머리 위에 남은 시간이 보인다', async () => {
  const record = await menu('포커스 기록', '포커스 기록');
  await record.getByRole('button', { name: '뽀모도로' }).click();
  const pomodoro = await windowTitled('뽀모도로');
  await pomodoro.getByRole('button', { name: '직접' }).click();
  await pomodoro.getByRole('spinbutton', { name: '집중 (분)' }).fill('1');
  await pomodoro.getByRole('button', { name: '시작' }).click();
  await expect(pomodoro.getByText('집중 1/4')).toBeVisible();
  await expect(stage.getByText('집중 1분 남음')).toBeVisible();
  await shot(pomodoro, 'pomodoro');
  await pomodoro.getByRole('button', { name: '끝' }).click();
  await expect(pomodoro.getByRole('button', { name: '시작' })).toBeVisible();
  await pomodoro.close();
  await record.close();
});

test('devdev 방에 들어가면 가짜 친구가 보인다', async () => {
  const rooms = await menu('방 만들기 / 참여하기', '방 만들기 / 참여하기');
  await rooms.getByPlaceholder('예: 7Q2K9M').fill('devdev');
  await rooms.getByRole('button', { name: '참여' }).click();
  await expect(stage.getByText('가짜 친구')).toBeVisible();
  await shot(stage, 'room');
  await rooms.close();
});

test('상태를 고르면 머리 위 말풍선에 보인다', async () => {
  const status = await menu('상태 고르기', '상태 고르기');
  await status.getByRole('button', { name: '밥 먹는 중' }).click();
  await expect(stage.getByText('밥 먹는 중').first()).toBeVisible();
  await shot(stage, 'status');
  if (!status.isClosed()) await status.close();
});

test('대화하기에서 보낸 글이 목록과 말풍선에 보인다', async () => {
  const chat = await menu('대화하기', '대화하기');
  await chat.getByLabel('메시지').fill('안녕하세요');
  await chat.getByLabel('메시지').press('Enter');
  await expect(chat.getByText('안녕하세요').first()).toBeVisible();
  await expect(stage.getByText('안녕하세요').first()).toBeVisible();
  await shot(chat, 'chat');
  await chat.close();
});

test('내 방을 만들어 가챠 아이템을 넣고 한 시간 기록으로 한 번 뽑는다', async () => {
  // 그림 파일 고르기 대화상자는 시험용 그림을 돌려준다
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

  const rooms = await menu('방 만들기 / 참여하기', '방 만들기 / 참여하기');
  await rooms.getByRole('button', { name: '방에서 나가기' }).click();
  await rooms.getByRole('button', { name: '만들기', exact: true }).click();
  await rooms.getByRole('button', { name: '방 설정' }).click();
  const roomSettings = await windowTitled('방 설정');
  await roomSettings.getByLabel('이름', { exact: true }).fill('별');
  await roomSettings.getByRole('button', { name: '그림 고르고 넣기' }).click();
  await expect(roomSettings.getByText('아이템을 넣었습니다.')).toBeVisible();
  await roomSettings.close();
  await rooms.close();

  // 방에서 1시간 작업한 기록은 화면에서 만들 수 없어 메모리 서버에 더한다
  await stage.evaluate(async () => {
    const { core } = window as unknown as Win;
    await core.deps.server.docs({ scope: 'user', module: 'gacha', uid: core.deps.uid, path: ['r'] }).update(core.session.current(), { sec: { $inc: 3600 } });
  });
  const gacha = await menu('가챠', '가챠');
  await gacha.getByRole('button', { name: '1회 뽑기' }).click();
  await expect(gacha.getByText('NEW!')).toBeVisible();
  await expect(gacha.getByText('별').first()).toBeVisible();
  await shot(gacha, 'gacha');
  await gacha.close();
});

test('보관함에 뽑은 아이템이 보인다', async () => {
  const inventory = await menu('보관함', '보관함');
  await expect(inventory.getByText('1/1종')).toBeVisible();
  await shot(inventory, 'inventory');
  await inventory.close();
});

test('꾸미기에서 스티커를 붙여 저장한다', async () => {
  const deco = await menu('꾸미기', '꾸미기');
  await deco.getByRole('button', { name: /별/ }).first().click();
  await expect(deco.getByText('붙인 것 1개')).toBeVisible();
  await shot(deco, 'stickers');
  await deco.getByRole('button', { name: '저장' }).click();
  await expect(stage.getByText('꾸미기를 저장했습니다.')).toBeVisible();
  await expect.poll(() => deco.isClosed()).toBe(true);
});

test('우편함 글이 상태칩 ✉와 우편함 창에 보인다', async () => {
  // 선물하는 사람의 scripts/ops.ts 대신 메모리 서버에 같은 기록을 쓴다
  await stage.evaluate(() => {
    const w = window as unknown as Win;
    const now = w.devHub.now();
    w.devHub.write('mod/notice/g/posts/a1', { tag: 'notice', title: '주말 이벤트', body: '즐겁게 써 주세요.', at: now - 60_000, v: 1 });
    w.devHub.write(`mod/notice/u/${w.core.deps.uid}/mail/b1`, { tag: 'letter', title: '생일 축하해', body: '오늘도 같이 일해요.', at: now - 1000, v: 1 });
  });
  const chip = stage.getByTitle('우편함');
  await expect(chip).toHaveText('✉2');
  await chip.click();
  const mailbox = await windowTitled('우편함');
  await expect(mailbox.getByRole('button', { name: /주말 이벤트/ })).toBeVisible();
  await expect(mailbox.getByRole('button', { name: /생일 축하해/ })).toBeVisible();
  await shot(mailbox, 'mailbox');
  await mailbox.close();
});

test('마이홈 창의 탭이 모두 열린다', async () => {
  const home = await menu('마이홈', '마이홈');
  await expect(home.getByRole('button', { name: '편집' })).toBeVisible();
  await home.getByRole('button', { name: '스케줄러', exact: true }).click();
  await expect(home.getByRole('button', { name: '+ 일정 추가' })).toBeVisible();
  await home.getByRole('button', { name: 'D-day', exact: true }).click();
  await expect(home.getByRole('button', { name: '+ D-day 추가' })).toBeVisible();
  await home.getByRole('button', { name: '우편함', exact: true }).click();
  await expect(home.getByRole('button', { name: /주말 이벤트/ })).toBeVisible();
  await home.getByRole('button', { name: '버그제보', exact: true }).click();
  await expect(home.getByPlaceholder('언제 무엇을 했는데 어떻게 됐는지 적어 주세요')).toBeVisible();
  await home.getByRole('button', { name: '친구', exact: true }).click();
  await expect(home.getByRole('button', { name: '친구', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shot(home, 'home');
  await home.close();
});

test('플레이리스트에 곡을 더한다', async () => {
  const player = await menu('플레이리스트', '플레이리스트');
  await player.getByLabel('플레이리스트 음량').fill('0');
  await player.getByLabel('유튜브 링크').fill('https://youtu.be/dQw4w9WgXcQ');
  await player.getByRole('button', { name: '+ 추가' }).click();
  await expect(player.getByText('dQw4w9WgXcQ')).toBeVisible();
  await shot(player, 'playlist');
  // 플레이리스트 창은 닫기 단추로 숨기기만 한다. 메인에서 같은 동작을 한다
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === '플레이리스트')?.close());
});

test('춤추기 효과 창이 열렸다 닫힌다', async () => {
  // 레벨 80은 화면에서 만들 수 없어 sticky gate 기록을 쓴다
  await stage.evaluate(() => {
    const { core } = window as unknown as Win;
    return core.deps.server.userPrivate.set(core.deps.uid, 'gates/play:dance', 1);
  });
  await stage.locator('button[title="메뉴"]').click();
  await stage.getByRole('button', { name: '춤추기', exact: true }).click();
  const effects = await windowTitled('효과');
  await shot(effects, 'dance');
  await expect.poll(() => effects.isClosed(), { timeout: 15_000 }).toBe(true);
});

test('혼자 스티커 사진을 한 컷 찍어 PNG로 저장한다', async () => {
  // 저장하기는 OS 저장 창을 띄우므로 내려받을 자리를 먼저 정해 둔다
  const downloads = join(userData, 'downloads');
  mkdirSync(downloads);
  await app.evaluate(({ session }, prefix) => {
    session.defaultSession.on('will-download', (_e, item) => item.setSavePath(prefix + item.getFilename()));
  }, downloads + sep);

  // 방 밖에서 혼자 찍는다
  const rooms = await menu('방 만들기 / 참여하기', '방 만들기 / 참여하기');
  await rooms.getByRole('button', { name: '방에서 나가기' }).click();
  await expect(rooms.getByRole('button', { name: '만들기', exact: true })).toBeVisible();
  await rooms.close();
  const photo = await menu('스티커 사진', '스티커 사진');
  await expect(photo.getByText('함께 찍는 사람 이름 없음', { exact: true })).toBeVisible();
  await photo.getByRole('button', { name: '1컷' }).click();
  await photo.getByRole('button', { name: '촬영 시작' }).click();
  await expect(photo.getByRole('status')).toBeVisible();
  await shot(photo, 'photo-countdown');
  await expect(photo.getByRole('navigation', { name: '스티커 사진' }).getByRole('button', { name: '꾸미기' })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  await shot(photo, 'photo-sheet');
  await photo.getByRole('button', { name: '저장하기' }).click();
  await expect(photo.getByText('사진을 내려받았어요.')).toBeVisible();
  const saved = () => readdirSync(downloads).filter((f) => f.startsWith('스티커사진-') && f.endsWith('.png'));
  await expect.poll(saved, { timeout: 15_000 }).toHaveLength(1);
  const head = readFileSync(join(downloads, saved()[0]!));
  expect([head.readUInt32BE(16), head.readUInt32BE(20)]).toEqual([960, 720]);
  await photo.close();
});

test('회사원 모드를 켜면 ▪ 버튼이 생기고 끄면 사라진다', async () => {
  const settings = await menu('설정', '설정');
  await settings.getByRole('button', { name: '화면', exact: true }).click();
  await settings.getByLabel('회사원 모드').check();
  const hide = stage.locator('button[title="화면 숨기기"]');
  await expect(hide).toBeVisible();
  await stage.locator('button[title="메뉴"]').click();
  await expect(stage.getByRole('button', { name: '포커스 기록', exact: true })).toBeVisible();
  await expect(stage.getByRole('button', { name: '마이홈', exact: true })).toHaveCount(0);
  await shot(stage, 'quiet');
  await stage.locator('button[title="메뉴"]').click();
  await settings.getByLabel('회사원 모드').uncheck();
  await expect(hide).toHaveCount(0);
  await settings.close();
});

test('실행 화면에 오류가 없다', () => {
  expect(errors).toEqual([]);
});

test('종료하면 프로세스가 끝난다', async () => {
  // 트레이 메뉴 종료와 같은 길. 메인이 렌더러에 shutdown을 보내고 저장한 뒤 끝난다
  await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined);
  await expect.poll(() => proc.exitCode, { timeout: 20_000 }).not.toBeNull();
});
