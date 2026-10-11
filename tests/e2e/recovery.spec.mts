import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verify, menu, windowTitled, expect, type Session } from '../../.claude/skills/verify-isshoni/drive.ts';
import type { CoreRuntime } from '../../src/renderer/core/runtime';
import type { Bridge } from '../../src/preload/api';
import type { FocusApi } from '../../src/modules/focus/api';
import type { GachaApi } from '../../src/modules/gacha/api';
import type { WardrobeApi } from '../../src/modules/wardrobe/api';

type W = Window & { core: CoreRuntime; bridge: Bridge; failWrites?: boolean };
const start = async (s: Session) => {
  await s.launcher.getByText('시작하기').click();
  await s.stage.locator('button[title="메뉴"]').waitFor();
};

// 화면에서 기다릴 수 없는 작업 시간만 플랫폼 샘플로 가속한다. 보상 기록은 직접 만들지 않는다.
async function work(s: Session, seconds: number) {
  const stage = await s.app.browserWindow(s.stage);
  await stage.evaluate((w, sec) => {
    const at = Date.now();
    for (let i = 0; i <= sec; i += 30) w.webContents.send('core:activity', { at: at + i * 1000, appKey: 'win:notepad.exe', idleSec: 0, pen: false, unknownReason: null });
  }, seconds);
  await expect.poll(() => s.stage.evaluate(() => ((window as unknown as W).core.host.api('focus') as FocusApi).totalSec())).toBeGreaterThanOrEqual(seconds);
}

test('일반 작업 앱에서 시간·보상·저장 장애 복구·꾸미기까지 이어진다', async () => {
  await verify('work-reward-recovery', async s => {
    await start(s);
    await s.app.evaluate(() => { (globalThis as unknown as { fakePlatform: { app: string } }).fakePlatform.app = 'win:notepad.exe'; });
    const settings = await menu(s, '설정', '설정');
    await settings.getByRole('button', { name: '집중 앱', exact: true }).click();
    await expect(async () => {
      await settings.getByRole('button', { name: '직전에 쓴 앱 넣기' }).first().click();
      await expect(settings.getByRole('textbox', { name: '2번 앱 이름' })).toHaveValue('notepad', { timeout: 500 });
    }).toPass();
    const rooms = await menu(s, '워킹룸', '워킹룸');
    await rooms.getByRole('button', { name: '만들기', exact: true }).click();
    await rooms.getByRole('button', { name: '방 설정', exact: true }).click();
    const rs = await windowTitled(s.app, '방 설정');
    const bytes = await s.stage.evaluate(async () => {
      const c = new OffscreenCanvas(64, 64), ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffaa00'; ctx.fillRect(8, 8, 48, 48);
      return Array.from(new Uint8Array(await (await c.convertToBlob()).arrayBuffer()));
    });
    const path = join(s.dir, 'star.png'); writeFileSync(path, new Uint8Array(bytes));
    await s.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path);
    await rs.getByRole('textbox', { name: '이름', exact: true }).fill('별');
    await rs.getByRole('button', { name: '그림 고르고 넣기' }).click();
    await expect(rs.getByText('아이템을 넣었어요.')).toBeVisible();
    const record = await menu(s, '포커스 기록', '포커스 기록');
    await record.getByRole('button', { name: '달성표', exact: true }).click();
    const goals = await windowTitled(s.app, '달성표');
    await goals.getByRole('combobox', { name: '하루', exact: true }).selectOption('1');
    await goals.getByRole('button', { name: '목표 정하기', exact: true }).click();
    await work(s, 3600);
    await expect(goals.getByText('1일 달성', { exact: true })).toBeVisible();
    await s.shot(goals, 'work-reward-goal');
    const rewards = await menu(s, '레벨 보상', '레벨 보상');
    await expect(rewards.getByRole('heading', { name: 'Lv.2', exact: true })).toBeVisible();
    const g = await menu(s, '가챠', '가챠');
    await expect(g.getByText('남은 뽑기 1회', { exact: true })).toBeVisible();
    await s.shot(g, 'work-reward-earned');
    // 서비스 장애: 저장을 거절한다. 연결 표시 변경만으로는 메모리 서버 쓰기가 실패하지 않는다.
    await s.stage.evaluate(() => {
      const w = window as unknown as W, ctx = w.core.ctxs.get('gacha')!.ctx;
      const user = ctx.server.user.bind(ctx.server); w.failWrites = true;
      ctx.server.user = path => {
        const doc = user(path);
        return { ...doc, transaction: (...args) => w.failWrites ? Promise.reject(new Error('검증용 연결 끊김')) : doc.transaction(...args) } as typeof doc;
      };
    });
    await g.getByRole('button', { name: '1회 뽑기' }).click();
    await expect(g.getByText('검증용 연결 끊김', { exact: true })).toBeVisible();
    await expect(g.getByText('남은 뽑기 1회', { exact: true })).toBeVisible();
    await s.shot(g, 'work-reward-save-failed');
    await s.stage.evaluate(() => { (window as unknown as W).failWrites = false; });
    await g.getByRole('button', { name: '1회 뽑기' }).click();
    await expect(g.getByText('NEW!', { exact: true })).toBeVisible();
    await expect(g.getByText('남은 뽑기 0회', { exact: true })).toBeVisible();
    await g.getByRole('button', { name: '보관함으로' }).click();
    const inv = await windowTitled(s.app, '보관함');
    await expect(inv.getByText('1/1종')).toBeVisible();
    await s.shot(inv, 'work-reward-inventory');
    const deco = await menu(s, '꾸미기', '꾸미기');
    await deco.getByRole('button', { name: /별/ }).first().click();
    await deco.getByRole('button', { name: '저장', exact: true }).click();
    await expect.poll(() => deco.isClosed()).toBe(true);
    const again = await menu(s, '꾸미기', '꾸미기');
    await s.shot(again, 'work-reward-decoration-reopened');
    const appearance = await s.stage.evaluate(() => ((window as unknown as W).core.host.api('wardrobe') as WardrobeApi).appearance());
    const item = await s.stage.evaluate(() => ((window as unknown as W).core.host.api('gacha') as GachaApi).inventory()[0]!.key);
    expect(appearance.slots.sticker).toHaveLength(1);
    expect(appearance.slots.sticker![0]!.item).toBe(item);
  });
});

test('저장 직후 재시작하면 캐릭터·설정·목록은 남고 핀과 재생은 꺼진다', async () => {
  await verify('restart-playlist', async s => {
    await start(s);
    const settings = await menu(s, '설정', '설정');
    await settings.getByRole('button', { name: '계정', exact: true }).click();
    await settings.locator('input').first().fill('저장 준비');
    await settings.getByRole('button', { name: '저장', exact: true }).click();
    const wardrobe = await menu(s, '캐릭터 만들기', '캐릭터 만들기');
    await wardrobe.getByRole('button', { name: '책상', exact: true }).click();
    await wardrobe.getByRole('button', { name: /나무 책상/ }).click();
    await wardrobe.getByRole('button', { name: '저장', exact: true }).click();
    await expect.poll(() => wardrobe.isClosed()).toBe(true);
    const appearance = await s.stage.evaluate(() => ((window as unknown as W).core.host.api('wardrobe') as WardrobeApi).appearance());
    const p = await menu(s, '플레이리스트', '플레이리스트');
    await s.app.context().route('**/embed/**', r => r.fulfill({ contentType: 'text/html', body: '<html>검증용 플레이어</html>' }));
    await p.getByLabel('유튜브 링크').fill('https://youtu.be/dQw4w9WgXcQ');
    await p.getByRole('button', { name: '+ 추가' }).click();
    await p.locator('button[title="재생"]').click();
    const pin = p.getByRole('button', { name: '항상 위에 고정' });
    await pin.click();
    const bw = await s.app.browserWindow(p);
    await expect.poll(() => bw.evaluate(w => w.isAlwaysOnTop())).toBe(true);
    await (await s.app.browserWindow(settings)).evaluate(w => w.focus());
    expect(await bw.evaluate(w => w.isAlwaysOnTop())).toBe(true);
    await p.getByRole('button', { name: '작게 보기' }).click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await s.shot(p, 'pin-mini');
    await bw.evaluate(w => w.close());
    await menu(s, '플레이리스트', await p.title());
    await expect(p.locator('button[title="재생"]')).toBeVisible();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await pin.click();
    await expect.poll(() => bw.evaluate(w => w.isAlwaysOnTop())).toBe(false);
    await pin.click();
    await p.locator('button[title="재생"]').click();
    await settings.getByRole('button', { name: '화면', exact: true }).click();
    await settings.getByLabel('회사원 모드', { exact: true }).check();
    await s.stage.getByRole('button', { name: '숨기기', exact: true }).click();
    await expect.poll(() => bw.evaluate(w => w.isVisible())).toBe(false);
    await s.stage.evaluate(() => (window as unknown as W).bridge.invoke('stage.setVisible', { visible: true }));
    await expect(p.locator('button[title="재생"]')).toBeVisible();
    await settings.getByLabel('회사원 모드', { exact: true }).uncheck();
    await s.shot(p, 'pin-restored-paused');
    await settings.getByRole('button', { name: '계정', exact: true }).click();
    await settings.locator('input').first().fill('재시작 확인');
    await settings.getByRole('button', { name: '저장', exact: true }).click();
    await s.restart();
    await start(s);
    await expect(s.stage.getByText('재시작 확인', { exact: true })).toBeVisible();
    const restored = await s.stage.evaluate(() => ((window as unknown as W).core.host.api('wardrobe') as WardrobeApi).appearance());
    expect(restored).toEqual(appearance);
    const p2 = await menu(s, '플레이리스트', '플레이리스트');
    await expect(p2.getByText('제목 없는 곡 (dQw4w9WgXcQ)', { exact: true })).toBeVisible();
    await expect(p2.getByRole('button', { name: '항상 위에 고정' })).toHaveAttribute('aria-pressed', 'false');
    expect(await (await s.app.browserWindow(p2)).evaluate(w => w.isAlwaysOnTop())).toBe(false);
    await expect(p2.locator('button[title="재생"]')).toBeVisible();
    await s.shot(p2, 'restart-saved-paused-unpinned');
  });
});

test('자동 진단 기록은 저장 실패 후 재연결하면 한 번만 남는다', async () => {
  await verify('report-recovery', async s => {
    await start(s);
    const st = await menu(s, '설정', '설정');
    await expect(st.getByLabel('오류가 나면 자동으로 알리기')).toBeChecked();
    await s.stage.evaluate(async () => {
      const w = window as unknown as W, ctx = w.core.ctxs.get('report')!.ctx;
      const user = ctx.server.user.bind(ctx.server); w.failWrites = true;
      ctx.server.user = path => {
        const doc = user(path);
        return { ...doc, set: (...args) => w.failWrites ? Promise.reject(new Error('검증용 저장 실패')) : doc.set(...args) };
      };
      await w.bridge.invoke('crash.report', { type: 'verify', message: '복구 확인', stack: '' });
    });
    await expect.poll(() => s.stage.evaluate(async () => (await (window as unknown as W).bridge.invoke('crash.pending', {})).length)).toBe(1);
    await s.shot(st, 'report-pending');
    await s.stage.evaluate(() => {
      const w = window as unknown as W;
      w.failWrites = false;
      const server = w.core.deps.server as typeof w.core.deps.server & { goOffline(): void; goOnline(): void };
      server.goOffline(); server.goOnline();
    });
    await expect.poll(() => s.stage.evaluate(async () => (await (window as unknown as W).bridge.invoke('crash.pending', {})).length)).toBe(0);
    const rows = await s.stage.evaluate(async () => (window as unknown as W).core.ctxs.get('report')!.ctx.server.user(['r']).list({ limit: 10 }));
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).toContain('복구 확인');
    await s.shot(st, 'report-recovered');
  });
});

test('verify는 패널 오류를 실패시키고 명시한 오류만 허용한다', async () => {
  const body = async (s: Session) => {
    await start(s);
    const st = await menu(s, '설정', '설정');
    await st.evaluate(() => console.error('검증용 패널 오류'));
    await expect.poll(() => s.errors.filter(x => x === '검증용 패널 오류').length).toBe(1);
  };
  await expect(verify('unexpected-panel-error', body)).rejects.toThrow('검증 중 오류');
  await verify('expected-panel-error', body, { expectedErrors: [{ pattern: /^검증용 패널 오류$/, count: 1 }] });
});
