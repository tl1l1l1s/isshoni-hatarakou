# 집중 앱과 시간

설정 창의 집중 앱 탭에 앱을 등록하면 그 앱이 앞에 있는 동안 집중 시간이 쌓인다. 쌓인 시간은 포커스 기록 창에서 오늘, 누적, 앱별로 보인다. 포커스 기록 창은 작게 보기로 기록 미니 창이 되고 아래 서랍에 뽀모도로와 달성표 단추가 있다. 다른 기기가 이 계정을 가져가면 이 PC는 시간을 세지 않는다.

## Sub-features

- `focus-register`는 직전에 쓴 앱을 집중 앱 목록에 넣는 것이다. 넣기 단추는 첫 빈 칸에만 있고 나머지 빈 칸은 `비어 있음`이다. 안내 알림은 설정 창 위쪽에 뜬다 (FOC-01).
- `focus-hint`는 한 번도 시간이 쌓이지 않은 캐릭터가 잠들어 있으면 내 머리 위에 말풍선이 뜨는 것이다. 집중 앱이 하나도 없으면 `집중 앱을 넣으면 시간이 쌓여요`이고 포커스 기록 창에 `설정의 집중 앱 탭에서 앱을 넣어 주세요.`가 보인다. 앱을 넣으면 첫 앱 이름으로 `paint 쓰면 일어나요`가 뜨고 포커스 기록 창에 `집중 앱을 쓰면 깨어나고 시간이 쌓여요.`가 보인다 (CHR-05, FOC-03). 말풍선은 내 화면에만 뜨고 시간이 한 번 쌓이면 다시 뜨지 않는다.
- `focus-accumulate`는 등록한 앱이 앞에 있을 때 오늘 시간과 앱별 시간이 늘어나는 것이다 (FOC-02, CHR-05).
- `focus-drawer`는 포커스 기록 창 아래에 `뽀모도로`와 `달성표` 단추가 보이는 것이다. 단추 뒤는 [뽀모도로](./pomodoro.md)와 [달성표](./goals.md)에 있다.
- `focus-mini`는 작게 보기로 기록 미니 창이 되고 크게 보기로 돌아오는 것이다 (FOC-04).
- `focus-elsewhere`는 다른 기기에서 쓰는 중이면 시간이 멈추고 여기서 계속 쓰기를 누르면 다시 쌓이며 그 뒤에 다른 기기가 늦게 올린 마지막 기록도 더해지는 것이다 (FOC-08, ACC-12).
- `focus-save`는 시간이 쌓일 때마다 누적이 바로 메인과 이 PC의 파일에 남아 로그오프 직전의 시간도 사라지지 않는 것이다 (FOC-02).

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴 구분선 아래 `설정`을 누르고 `집중 앱` 탭을 누른다.
- 실행 화면 ▼ 메뉴에서 `포커스 기록`을 누른다.
- 포커스 기록 창의 `작게 보기`를 누른다. 기록 미니 창의 `크게 보기`를 누른다.
- 같은 계정으로 다른 PC에서 앱을 켜면 이 PC 실행 화면에 다른 PC에서 쓰는 중이라는 안내와 `여기서 계속 쓰기`가 뜬다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.

- **앞에 있는 앱 정하기.** 사용자가 작업 앱을 쓰다 돌아온 상황을 만든다. `await s.app.evaluate(() => void ((globalThis as unknown as { fakePlatform: { app: string } }).fakePlatform.app = 'win:paint.exe'))`를 실행한다. 화면 변화는 없다.
- **집중 앱 탭 열기.** `const st = await menu(s, '설정', '설정')`과 `await st.getByRole('button', { name: '집중 앱' }).click()`을 실행한다. 탭 맨 위에 `집중 앱이 앞에 있을 때만 집중 시간이 쌓여요.`가 있다. 새로 설치하면 목록이 비어 있어서 1번 칸은 `직전에 쓴 앱 넣기` 버튼, 2번부터 8번은 `비어 있음`이다. 앞에 있는 앱을 정하기 전에 단추를 누르면 설정 창 위쪽에 `넣을 앱을 먼저 잠깐 쓰고 이 창으로 돌아와 다시 눌러 주세요.`가 뜨고 `s.stage.getByText`로는 찾을 수 없다.
- **앱 등록.** 버튼을 눌러 1번 칸에 앱이 들어갈 때까지 되풀이한다.
  ```ts
  await expect(async () => {
    await st.getByRole('button', { name: '직전에 쓴 앱 넣기' }).first().click();
    await expect(st.getByRole('textbox', { name: '1번 앱 이름' })).toHaveValue('paint', { timeout: 500 });
  }).toPass({ timeout: 5000 });
  ```
  목록 1번 칸에 `textbox "1번 앱 이름"`이 생기고 값은 `paint`이다. 넣기 단추는 2번 칸으로 옮겨 간다. 같은 앱으로 한 번 더 누르면 설정 창 위쪽에 `이미 들어 있는 앱이에요.`가 뜬다.
- **시간 확인.** `const rec = await menu(s, '포커스 기록', '포커스 기록')`과 `await expect(rec.getByRole('row', { name: /^paint 00:00:0[1-9]/ })).toBeVisible({ timeout: 10_000 })`을 실행한다. 창 맨 위에 `지금 이어서 집중한 시간`과 `작게 보기`가 있다. 표에 `오늘` 행과 `paint` 행이 1초 이상으로 보인다. 포커스 기록 창은 1초마다 다시 그려진다. 표 아래에 `button "뽀모도로"`와 `button "달성표"`가 있다.
- **작게 보기.** `await rec.getByRole('button', { name: '작게 보기' }).click()`과 `const mini = await windowTitled(s.app, '기록')`을 실행한다. 미니 창에 `row "현재 00:00:0N"`, `row "오늘 00:00:0N"`, `button "크게 보기"`가 있고 포커스 기록 창은 닫힌다. `크게 보기`를 누르면 `포커스 기록` 창이 다시 열리고 미니 창이 닫힌다.
- **다른 기기가 가져감.** 화면에서 만들 수 없으니 메모리 서버에 다른 기기 id를 쓴다.
  ```ts
  await s.stage.evaluate(async () => {
    const core = (window as unknown as { core: { deps: { uid: string; server: { userPrivate: { set(u: string, p: string, v: unknown): Promise<void> } } } } }).core;
    await core.deps.server.userPrivate.set(core.deps.uid, 'activeDevice', { id: 'other-pc', at: Date.now() });
  });
  ```
  실행 화면에 `다른 PC에서 쓰는 중이에요`와 `button "여기서 계속 쓰기"`가 보인다. 열어 둔 포커스 기록 창의 `오늘` 칸이 3초 넘게 그대로다.
- **다시 가져오기.** `await s.stage.getByRole('button', { name: '여기서 계속 쓰기' }).click()`을 실행한다. 몇 초 안에 `오늘` 칸이 다시 늘어난다.
- **늦게 올린 다른 기기 기록.** 다시 가져온 뒤 다른 기기가 마지막 기록을 올린 것처럼 `server.docs({ scope: 'user', module: 'focus', uid, path: ['dev'] }).set('other-pc', { v: 1, total: 600, day: <오늘 날짜 키>, today: 600 })`를 쓴다. 포커스 기록 창의 `오늘`이 10분 늘고 레벨 보상 창의 남은 시간도 그만큼 준다. 이 PC는 기기별 기록을 구독하므로 가져온 뒤에 올라온 기록도 더한다 (F1).
- **바로 저장.** 새 세션에서 위의 앱 등록으로 `paint`를 넣고 `fakePlatform.app`을 `win:paint.exe`로 둔 채 `core.host.api('focus').todaySec()`이 2 이상이 되기를 기다린다. `window.bridge.invoke('store.read', { path: 'accounts/<uid>/modules/focus.json' })`의 `data.todaySec`이 그 값과 1초 안으로 같다. `app.getPath('userData')` 아래 같은 경로의 파일도 1초 안에 같은 값으로 내려가고 2.5초 뒤 다시 읽으면 늘어 있다. uid는 `window.core.deps.uid`이다.
- **처음 잠든 까닭 (focus-hint).** 새 세션에서 시작하기를 누르면 내 머리 위에 `집중 앱을 넣으면 시간이 쌓여요`가 보이고 포커스 기록 창 큰 숫자 아래에 `설정의 집중 앱 탭에서 앱을 넣어 주세요.`가 보인다. 말풍선 글은 `집중 앱을 넣으면`과 `시간이 쌓여요` 두 줄로 고르게 나뉘어 가운데에 놓인다. 글자 간격을 넓힌 스타일에서도 같다. 깨지 않은 채 앱을 넣으려면 `fakePlatform.app`을 `win:paint.exe`로 두고 `core.ctxs.get('core').ctx.activity.lastForeignApp()`이 `win:paint.exe`가 될 때까지 기다린 뒤 `fakePlatform.app`을 `null`로 바꾼다. 그다음 `직전에 쓴 앱 넣기`를 한 번 누르면 1번 칸에 `paint`가 들어가고 말풍선이 `paint 쓰면 일어나요`로 바뀌며 포커스 기록 창 안내가 `집중 앱을 쓰면 깨어나고 시간이 쌓여요.`로 바뀐다. `fakePlatform.app`을 다시 `win:paint.exe`로 바꾸면 10초 안에 둘 다 사라진다. 다시 `win:explorer.exe`로 바꿔 잠들면 안내 줄은 돌아오고 말풍선은 뜨지 않는다.
- **증거.** 등록 뒤 설정 창, 알림이 뜬 설정 창, 말풍선이 뜬 실행 화면, 포커스 기록 창, 미니 창, 다른 기기 안내가 뜬 실행 화면, 멈춘 포커스 기록 창을 `s.shot`으로 남긴다.

## Gotchas

- 직전에 쓴 앱은 메인 프로세스가 500ms마다 보내는 활동 샘플로 알게 된다. `fakePlatform.app`을 바꾼 직후에는 샘플이 아직 오지 않아서 버튼을 눌러도 `넣을 앱을 먼저 잠깐 쓰고` 안내만 뜨고 칸이 비어 있다. 그래서 앱 등록은 `toPass`로 되풀이한다. 고정 대기는 부하가 걸리면 모자랄 수 있다.
- `fakePlatform.idle`을 크게 두어 잠든 채 앱을 넣으려 하면 자리비움이 되고 자리비움 말풍선이 focus-hint 말풍선보다 먼저 뜬다. 그래서 focus-hint는 앞 앱을 `null`로 바꿔서 확인한다.
- 설정 창 일반 탭 `펜 입력 보호 앱` 묶음에는 `직전에 쓴 앱을 펜 입력 보호 목록에 넣기`라는 다른 버튼도 있다. 집중 앱 등록 버튼은 `직전에 쓴 앱 넣기`이다.
- 앱 키 `win:paint.exe`는 목록과 포커스 기록에 `paint`로 표시된다.
- 다른 기기 안내가 떠 있는 동안 실행 화면에는 좌석과 ▼ 메뉴가 없다. 이 동안 열 창은 안내를 띄우기 전에 열어 둔다.
- 시간이 멈춰 있는지는 기다려 봐야 알 수 있어서 이 확인만 `waitForTimeout(3000)`을 쓴다.
- 미니 창 제목은 `기록`이다. `windowTitled(s.app, '포커스 기록')`으로 찾으면 미니 창이 아니라 큰 창을 찾는다.
- 이 하네스는 실제 활성 창 감지를 거치지 않는다. 실제 OS에서 앱을 알아보는 동작과 두 PC 사이의 기기 바꾸기는 확인하지 않은 항목으로 보고한다.
