# 런처와 실행 화면

앱을 켜면 런처 창이 뜨고 이름, 레벨, 캐릭터 슬롯, 방 상태를 보여 준다. 런처에서 시작하기를 누르면 첫 창이 실행 화면으로 바뀌어 내 캐릭터와 상태칩이 보인다. 실행 화면의 ▼ 메뉴로 기능 창을 열고 맨 아래 « 런처로를 눌러 런처로 돌아간다.

## Sub-features

- `launcher-show`는 런처가 이름, 캐릭터 슬롯, 혼자 모드 안내를 보여 주는 것이다.
- `launcher-me`는 런처 이름 옆에 레벨이 보이고 아래 줄의 `내 정보` 버튼이 내 정보 화면을 여는 것이다 (SCR-03). 친구 코드와 복사 버튼은 [내 정보](./me.md)에 있다.
- `launcher-start`는 시작하기로 실행 화면을 여는 것이다.
- `stage-menu`는 ▼ 메뉴가 기능 창 항목을 보여 주는 것이다.
- `stage-back`은 « 런처로를 눌러 런처로 돌아가는 것이다 (CHR-04).
- `stage-fit`은 캐릭터가 있는 모니터의 작업 영역이 좁거나 낮으면 좌석이 들어갈 만큼 작아지고 ▼ 메뉴와 다른 사용자 메뉴가 작업 영역 높이 안에서 스크롤하는 것이다 (NFR-08).

## How to get to it (user POV)

- 앱을 켜면 런처가 뜬다.
- 런처의 `시작하기` 버튼을 누른다.
- 실행 화면 상태칩 줄의 `▼` 버튼을 누른다. 상태칩 줄에 항상 있는 것은 상태, 방 코드(방 안에서), ▼ 셋이고 💬와 🔔과 ✉는 알릴 것이 있을 때만, ♫는 재생 중일 때만 보인다.
- ▼ 메뉴 맨 아래 `« 런처로`를 누른다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션이다.

- **런처 확인.** 런처 창은 이미 열려 있다. `await s.shot(s.launcher, 'launcher-show')`를 실행한다. ARIA에 `text: 이름 없음 Lv.1`, `button "시작하기"`, `text: 캐릭터 (1/3)`, `text: 지금은 혼자 모드입니다.`가 있다.
- **내 정보.** 런처 아래 줄의 `button "내 정보"`를 누르면 런처 창 안이 내 정보 화면으로 바뀌고 `button "뒤로"`를 누르면 돌아온다. 화면 안의 조작은 [내 정보](./me.md)에 있다.
- **시작.** `await s.launcher.getByText('시작하기').click()` 다음에 `await s.stage.locator('button[title="메뉴"]').waitFor()`를 실행한다. 실행 화면 이름표에 `이름 없음`과 `Lv.1`이 보인다. 둘은 다른 요소라서 `s.stage.getByText('이름 없음')`처럼 따로 찾는다.
- **메뉴 열기.** `await s.stage.locator('button[title="메뉴"]').click()`을 실행한다. ARIA에 `상태 고르기`부터 `« 런처로`까지 13개 버튼이 있고 구분선 아래에 `설정`이 있다.
- **런처로.** `await menu(s, '« 런처로', 'Isshoni Hatarakou')`를 실행한다. 제목이 `Isshoni Hatarakou`인 런처 창이 다시 열린다.
- **작은 작업 영역.** 모니터를 바꿀 수 없으니 메인의 `screen`을 바꿔 작업 영역이 700x450인 모니터처럼 만들고 보고에 적는다. 방 `devdev`에 들어가고 `core.ctxs.get('core').ctx.seats.addLocal`로 로컬 좌석 4개를 더해 좌석 6개 줄(`window.innerWidth`가 976)을 만든 뒤 아래를 실행한다.
  ```ts
  await s.app.evaluate(({ screen }) => {
    const d = screen.getPrimaryDisplay();
    const f = { ...d, workArea: { x: d.workArea.x, y: d.workArea.y, width: 700, height: 450 } };
    screen.getPrimaryDisplay = () => f;
    screen.getAllDisplays = () => [f];
    screen.emit('display-metrics-changed');
  });
  ```
  0.5초쯤 뒤 `window.bridge.invoke('stage.workArea', {})`가 `{ width: 700, height: 450 }`이고 `window.innerWidth`가 700 이하가 되며 좌석 칸(`core.seatViews`의 `el.offsetWidth`)이 160에서 114로 준다. `가짜 친구 쓰다듬기`를 누르면 💗가 뜬다. `button[title="메뉴"]`를 누르면 `window.innerHeight`가 450 이하이고 `설정` 버튼의 부모(메뉴)는 `scrollHeight`가 `clientHeight`보다 크다. 메뉴를 끝까지 내려 `설정`을 누르면 설정 창이 열린다. `가짜 친구 메뉴`를 누르면 `menu "가짜 친구"`의 상자가 창 안에 있다. 바꾼 `screen` 함수를 되돌리고 다시 `display-metrics-changed`를 내면 너비와 좌석 칸이 원래대로 돌아온다.
- **증거.** 단계마다 `s.shot`으로 런처와 실행 화면을 남긴다.

## Gotchas

- 런처에도 `방 만들기 / 참여하기`, `캐릭터 만들기`, `설정` 버튼이 있다. ▼ 메뉴 항목과 이름이 같으니 어느 창의 버튼을 누르는지 `s.launcher`와 `s.stage`로 구분한다.
- ▼ 버튼의 접근 가능한 이름은 `▼`이다. 찾을 때는 `button[title="메뉴"]`를 쓴다. `내 메뉴` 버튼은 내 이름표이고 같은 ▼ 메뉴를 연다. 내 캐릭터를 누르는 `내 캐릭터 쓰다듬기`는 메뉴를 열지 않는다.
- ARIA 스냅샷의 한 줄이 화면에서는 여러 요소일 수 있다. `getByText`가 못 찾으면 스냅샷 줄 전체 대신 요소 하나의 글자로 찾는다.
- 실행 화면은 `app.windows()`의 첫 창이다. 런처를 포함한 나머지 창은 제목으로 찾는다.
- 설정 창 화면 탭에서 회사원 모드를 켜면 ▼ 메뉴 항목 수가 줄고 상태칩에 ▪ 버튼이 더해진다. 상태칩 자리를 바꾸면 ▼ 버튼이 캐릭터 옆으로 간다. [설정 창](./settings.md)을 본다.
- 작업 영역을 바꾼 뒤 스테이지는 400ms 지나서 다시 놓이므로 `expect.poll`로 기다린다. 바꾼 `screen` 함수는 세션이 끝나면 앱과 함께 사라진다.
