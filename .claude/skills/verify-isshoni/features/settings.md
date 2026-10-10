# 설정 창의 화면 탭과 일반 탭

설정 창 화면 탭에서 회사원 모드, 테마, 캐릭터 크기, 레벨 배지와 말풍선 보이기, 상태칩 자리, 도트 그림, 영상 겹침 우회, 전체 화면 앱 위에서 숨기기를 바꾸고 `위치 초기화`로 캐릭터와 창 자리를 처음으로 되돌린다. 회사원 모드를 켜면 머리 위 말풍선과 마이홈과 스티커 사진이 잠기고 상태칩의 `숨기기` 칩으로 실행 화면과 열린 창을 한 번에 숨긴다. 탭은 일반, 화면, 계정, 집중 앱, 폰 연결, 자리비움 그림, 자리 추가 순서로 한 줄에 있다. 일반 탭 시스템 묶음 아래에는 버전과 개인정보 처리방침이 있고 모듈 설정 묶음에는 대화하기 글자 크기가 있다.

## Sub-features

- `set03-quiet`는 회사원 모드를 켜면 머리 위 말풍선이 숨고 메뉴에서 마이홈과 스티커 사진이 빠지며 상태칩에 `숨기기` 칩이 생기는 것이다 (SET-03).
- `set03-hide`는 `숨기기` 칩을 누르면 실행 화면과 열린 창이 함께 숨고 다시 띄우면 함께 돌아오는 것이다 (SET-03).
- `set04-video`는 영상 겹침 우회 체크가 다시 연 설정 창에도 남는 것이다 (SET-04).
- `nfr04-cover`는 그림 앱이 아닌 앱의 창이 캐릭터 모니터를 꽉 채우면 실행 화면이 숨고 끝나면 돌아오며 `전체 화면 앱 위에서 숨기기`를 끄면 숨지 않는 것이다 (NFR-04). 사용자가 숨긴 화면과는 따로 둔다.
- `set05-theme`는 테마를 어둡게나 밝게로 고르면 창 밝기가 바로 바뀌는 것이다 (SET-05).
- `set12-privacy`는 일반 탭에 버전이 보이고 개인정보 처리방침을 펼치면 저장하는 것과 볼 수 있는 사람이 보이는 것이다 (SET-12).
- `set13-pixel`은 도트 그림으로 보기를 켜면 캐릭터가 큰 점으로 그려지는 것이다 (SET-13).
- `set15-chips`는 상태칩 자리를 캐릭터 오른쪽이나 왼쪽으로 고르면 상태칩이 캐릭터 옆에 세로로 서는 것이다 (SET-15).
- `set16-reset`은 화면 탭 맨 아래 `위치 초기화`가 끌어 옮긴 캐릭터를 아래 가운데로 되돌리고 열린 창을 가운데로 옮기며 설정 창 위쪽에 `위치를 처음으로 되돌렸어요`가 뜨는 것이다 (SET-16).
- `set-guard`는 계정 탭에 저장하지 않은 닉네임이 있으면 ESC, 다른 탭, 창 닫기 단추(제목 표시줄 ×)에서 설정 창 안에 묻고 `닫기`를 눌러야 떠나는 것이다.

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴 구분선 아래 `설정`을 누르고 `화면` 탭을 누른다.
- 런처의 `설정` 버튼을 누르고 `화면` 탭을 누른다.
- 개인정보 처리방침은 설정 창 `일반` 탭 맨 아래 `버전` 줄 밑에 있다.
- 숨긴 화면은 Ctrl+Alt+H나 트레이 메뉴 `보이기/숨기기`로 다시 띄운다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.
- 말풍선을 보려면 ▼ 메뉴 `상태 고르기` 창의 `직접 적는 상태`에 글을 적고 `적용`을 누른다.

- **탭 열기.** `const st = await menu(s, '설정', '설정')`과 `await st.getByRole('button', { name: '화면', exact: true }).click()`을 실행한다. ARIA에 `checkbox "회사원 모드"`, `combobox "테마"`, `combobox "상태칩 자리"`, `checkbox "도트 그림으로 보기"`, `checkbox "영상 겹침 우회"`, 체크된 `checkbox "전체 화면 앱 위에서 숨기기"`가 있다.
- **회사원 모드.** `await st.getByLabel('회사원 모드').check()`를 실행한다. 상태 글 말풍선이 사라지고 상태칩에 글자가 `숨기기`인 `button[title="화면 숨기기"]`가 생긴다. 메뉴에 `포커스 기록`은 있고 `마이홈`과 `스티커 사진`은 없다.
- **화면 숨기기.** `await s.stage.locator('button[title="화면 숨기기"]').click()`을 실행한다. `s.app.evaluate`로 본 스테이지 창과 제목이 `설정`인 창의 `isVisible()`이 모두 false다. Gotchas의 방법으로 다시 띄우면 두 창이 모두 보이고 `회사원 모드`는 체크된 그대로다. 체크를 풀면 말풍선이 돌아오고 `숨기기` 칩이 사라진다.
- **테마.** `await st.emulateMedia({ colorScheme: null })` 다음에 `await st.getByLabel('테마').selectOption('dark')`를 실행한다. `st.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)`가 true가 되고 창 바탕이 어두워진다. `light`를 고르면 false가 된다.
- **상태칩 자리.** `await st.getByLabel('상태칩 자리').selectOption('right')`를 실행한다. `button[title="메뉴"]`(▼)의 상자가 내 캐릭터 클릭 영역 `[aria-label="내 캐릭터 쓰다듬기"]` 상자보다 오른쪽에 있고 첫 `canvas` 상자가 그 클릭 영역 상자를 감싼다. `left`면 ▼가 왼쪽에 있고 `below`면 ▼가 클릭 영역 아래에 있다.
- **도트 그림.** `await st.getByLabel('도트 그림으로 보기').check()`를 실행한다. 크기 배율 100%에서 첫 `canvas`의 `width`와 `height`가 53과 67이고 `style.imageRendering`이 `pixelated`다. 실행 화면 캐릭터가 큰 점과 체크무늬 디더링으로 보인다.
- **전체 화면 앱 위에서 숨기기.** 사용자가 만들 수 없는 앞 창을 메인에서 정한다. `const bw = await s.app.browserWindow(s.stage)`로 스테이지 창을 잡고 `const d = await s.app.evaluate(({ screen }, b) => screen.getDisplayMatching(b).bounds, await bw.evaluate((w) => w.getBounds()))`로 모니터 영역을 읽는다. `fakePlatform.app = 'win:vlc.exe'`와 `fakePlatform.bounds = d`를 넣으면 1초 안에 `bw.evaluate((w) => w.isVisible())`이 false가 되고 `core.displayMode.get()`이 `hidden`이다. `fakePlatform.bounds = null`이면 다시 true가 되고 표시 모드가 돌아온다. 앞 앱을 `fakePlatform.pens`에 넣은 그림 앱으로 두거나 영역을 모니터보다 8px씩 크게(최대화 창) 두면 숨지 않는다. 숨은 동안 메인에서 `app.emit('second-instance')`(다시 실행, 트레이 보이기와 같은 길)를 부르면 그 전체 화면이 끝날 때까지 보인다. 체크를 풀면 전체 화면 영역이어도 보이고 다시 체크하면 바로 숨는다. `stage.setVisible`로 사용자가 숨긴 화면은 전체 화면이 끝나도 숨은 채다.
- **위치 초기화.** 화면 탭 맨 아래 `위치 초기화`를 누르면 설정 창 위쪽에 `위치를 처음으로 되돌렸어요`가 뜬다. 끌어 옮긴 캐릭터가 돌아오는 것은 `osclick.ts` 6번 항목이 본다.
- **저장하지 않은 닉네임.** 창에 `st.on('dialog', () => {})`를 먼저 붙인다(Gotchas). 계정 탭에서 닉네임을 바꾸고 ESC를 누르면 `alertdialog "닉네임을 저장하지 않았어요. 닫을까요?"`가 뜬다. `계속하기`를 누르고 `화면` 탭을 누르면 다시 묻고 `계속하기`를 누르면 계정 탭에 남는다. 메인에서 `BrowserWindow.getAllWindows().find((w) => w.getTitle() === '설정')?.close()`를 실행하면(제목 표시줄 ×와 같다) 창이 닫히지 않고 같은 물음이 뜨며 `닫기`를 누르면 닫힌다. `저장`을 누른 뒤에는 같은 닫기로 묻지 않고 닫힌다.
- **다시 열기.** `await st.close()` 뒤에 설정 창을 다시 열고 화면 탭을 누른다. 고른 테마, `도트 그림으로 보기`, `영상 겹침 우회` 값이 그대로다.
- **개인정보 처리방침.** `일반` 탭을 누르면 `버전 0.1.0` 같은 줄이 보인다. `await st.getByText('개인정보 처리방침').click()`으로 펼치면 `Google Firebase Realtime Database`가 들어간 문장과 `기록을 지우고 싶으면 앱을 선물한 사람에게 말해 주세요.`가 보인다.
- **증거.** 회사원 모드 메뉴, 어둡고 밝은 설정 창, 상태칩 오른쪽과 왼쪽, 도트 그림 전과 뒤, 다시 연 설정 창, 펼친 처리방침을 `s.shot`으로 남기고 `errors.json`이 `[]`인지 본다.

## Gotchas

- Playwright는 창마다 밝은 화면을 흉내 낸다. 테마를 확인하기 전에 그 창에서 `emulateMedia({ colorScheme: null })`을 불러야 앱이 고른 밝기가 보인다. 새로 연 창마다 다시 부른다.
- 어둡게로 바꾼 직후 0.15초 동안 단추 바탕이 바뀐다. 화면을 찍기 전에 선택된 탭 단추의 `backgroundColor`가 `rgb(58, 58, 60)`이 되기를 기다린다.
- 제목 표시줄 닫기를 막으면 CDP가 beforeunload 대화상자를 알리고 Playwright가 대신 닫으려다 `No dialog is showing` 예외로 스크립트가 끝난다. 앱은 대화상자를 띄우지 않으니 그 창에 `page.on('dialog', () => {})`를 붙여 듣기만 한다.
- Ctrl+Alt+H는 OS 전역 단축키라 Playwright가 누를 수 없다. 트레이 메뉴와 같은 메인 처리를 부르려면 `await s.stage.evaluate(() => (window as any).bridge.invoke('stage.setVisible', { visible: true }))`를 실행하고 보고에 적는다.
- 상태칩 알약에도 상태 글이 보인다. 말풍선은 `s.stage.locator('div[class*="bubble"]', { hasText: 글 })`로 찾는다.
- 영상 겹침 우회는 가짜 플랫폼에서 불투명도를 바꾸지 않는다. 화면 변화는 Windows에서만 볼 수 있다.
- 전체 화면 숨기기는 500ms 활동 샘플로 앞 창을 보므로 바꾼 뒤 결과를 `expect.poll`로 기다린다. 패널을 연 뒤에는 `BrowserWindow.getAllWindows()[0]`이 스테이지가 아닐 수 있으니 스테이지는 `s.app.browserWindow(s.stage)`로 잡는다. 실제 영상, 게임, 클립 스튜디오 전체 화면은 Windows 점검표로 본다.
- 일반 탭의 대화하기 묶음에 있는 `채팅 글자 크기`는 [대화하기](./chat.md)에서 다룬다.
