# 달성표

하루 집중 목표를 정하면 달성표 창에 이번 주 월요일부터 일요일까지 날마다 목표를 채웠는지 보인다. 채운 날은 ✓, 못 채운 지난날은 ✗, 오늘은 점이다. 오늘 목표를 채우는 순간 실행 화면에 알림이 뜬다.

## Sub-features

- `goals-set`은 하루 목표를 정하고 바꾸고 끄는 것이다 (GRW-06).
- `goals-week`는 이번 주 요일 칸과 달성 일수가 보이는 것이다 (GRW-06).
- `goals-done`은 오늘 목표를 채우면 오늘 칸이 ✓가 되고 알림이 뜨는 것이다 (GRW-06).

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴에서 `포커스 기록`을 누르고 창 아래 `달성표`를 누른다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.

- **창 열기.** `const rec = await menu(s, '포커스 기록', '포커스 기록')`, `await rec.getByRole('button', { name: '달성표' }).click()`, `const w = await windowTitled(s.app, '달성표')`를 실행한다. `하루 집중 목표` 카드와 `0일 달성`이 보이고 요일 칸 일곱 개는 비어 있다.
- **목표 정하기.** `await w.getByRole('combobox', { name: '하루' }).selectOption('1')`과 `await w.getByRole('button', { name: '목표 정하기' }).click()`을 실행한다. 카드 제목이 `하루 목표 1시간`이 되고 `listitem "<요일>요일 오늘"` 칸에 점이 보인다.
- **오늘 목표 채우기.** 1시간은 화면에서 만들 수 없다. 같은 날 다른 기기의 오늘 기록을 메모리 서버에 쓰고 다른 기기가 가져갔다 돌아오게 한다.
  ```ts
  await s.stage.evaluate(async () => {
    type Doc = { set(k: string, v: unknown): Promise<void> };
    const core = (window as unknown as { core: { deps: { uid: string; server: { docs(ns: unknown): Doc; userPrivate: { set(u: string, p: string, v: unknown): Promise<void> } } } } }).core;
    const { uid, server } = core.deps;
    const day = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    await server.docs({ scope: 'user', module: 'focus', uid, path: ['dev'] }).set('other-pc', { v: 1, total: 3700, day, today: 3700 });
    await server.userPrivate.set(uid, 'activeDevice', { id: 'other-pc', at: Date.now() });
  });
  await s.stage.getByRole('button', { name: '여기서 계속 쓰기' }).click();
  ```
  오늘 칸이 `listitem "<요일>요일 달성"`과 ✓로 바뀌고 `1일 달성`이 보인다. 실행 화면에 `오늘 집중 목표를 채웠어요.` 알림이 한 번 뜬다. 1분을 기다리지 않아도 `devHub.read('mod/goals/u/<내 uid>/days/<날짜 키>')`의 `sec`이 3700 이상이다. 날짜 키는 `window.core.ctxs.get('goals').ctx.clock.dayKey()`로 읽는다.
- **절전 때 쓰기.** 목표를 정한 직후에는 위 기록이 없다. `s.app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'))`를 실행하면 기록이 `goal: 3600`으로 생긴다. 끝나면 `resume`을 보낸다.
- **다시 열기와 바꾸기.** 달성표 창을 닫고 다시 연다. `하루 목표 1시간`이 그대로다. `await w.getByRole('combobox', { name: '목표 바꾸기' }).selectOption('2')`를 실행하면 `하루 목표 2시간`이 되고 오늘 칸은 다시 점이다.
- **증거.** 목표를 정하기 전, 정한 뒤, 채운 뒤 달성표 창과 알림이 뜬 실행 화면을 `s.shot`으로 남긴다.

## Gotchas

- 하루는 오전 6시에 바뀐다. 위 코드의 `Date.now() + 3시간`은 한국 시간에서 6시간을 뺀 날짜 키다. 오전 0시부터 6시 사이에 돌리면 전날이 오늘 칸이 된다.
- 목표를 정한 날보다 앞선 날은 기록이 있어도 빈칸이다. 지난날의 ✓와 ✗는 새 세션에서 만들 수 없다.
- 하루 기록은 1분마다, 목표를 채우는 순간, 절전과 종료 때 서버에 쓴다. 창은 오늘 칸을 포커스 기록에서 바로 읽는다.
