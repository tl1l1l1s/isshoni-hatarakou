# 자리비움과 자리비움 그림

입력 없이 20분이 지나면 내 좌석이 자리비움이 되고 머리 위에 `자리비움` 말풍선이 뜬다. 설정 창의 자리비움 그림 탭에 그림을 등록해 두면 자리비움인 동안 캐릭터 몸 대신 그 그림이 서고 같은 방 사람 화면에도 보인다. 입력이 다시 오면 캐릭터로 돌아온다. 자리비움이 6시간 이어질 때의 자동 퇴장은 [방](./rooms.md)에 있다.

## Sub-features

- `away-auto`는 입력 없이 20분이 지나면 자리비움 말풍선이 뜨고 입력이 오면 사라지는 것이다 (CHR-06).
- `away-pic`은 자리비움 그림을 등록하고 크기를 고르면 자리비움인 동안 캐릭터 대신 그림이 서는 것이다 (CHR-07).

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴 구분선 아래 `설정`을 누르고 `자리비움 그림` 탭을 누른다.
- 자리비움은 누르는 경로가 없다. 키보드와 마우스를 20분 동안 쓰지 않으면 저절로 된다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.
- 파일 고르기 대화상자가 시험용 그림을 돌려주도록 바꿔 둔다. 스테이지에서 `OffscreenCanvas`로 투명 배경 PNG를 만들어 `s.dir` 아래에 쓰고 `await s.app.evaluate(({ dialog }, p) => { (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, pngPath)`를 실행한다. `tests/e2e/boot.spec.ts`에 같은 예가 있다.

- **탭 열기.** `const st = await menu(s, '설정', '설정')`과 `await st.getByRole('button', { name: '자리비움 그림' }).click()`을 실행한다. `자리비움이면 캐릭터 대신 이 그림이 서요. 방 사람들에게도 보여요.` 안내, `그림 없음` 미리보기, `button "그림 등록"`, 흐린 `button "기본으로"`, `combobox "크기"`(기본 `80px`)가 보인다.
- **그림 등록.** `await st.getByRole('button', { name: '그림 등록' }).click()`을 실행한다. `그림을 등록했습니다.`가 뜨고 체크무늬 위에 `img "등록한 자리비움 그림"`이 보이며 `기본으로`가 눌린다.
- **크기 고르기.** `await st.getByLabel('크기').selectOption('100')`을 실행한다. 설정 창을 닫고 다시 열어 같은 탭을 누르면 그림과 `100px`이 그대로다.
- **자리비움 만들기.** `await s.app.evaluate(() => void ((globalThis as any).fakePlatform.idle = 1300))`을 실행한다. 실행 화면에 `자리비움` 말풍선이 뜨고 캐릭터 몸 대신 `img` 하나가 이름표 위에 선다. 크기 배율 100%에서 그림 상자는 100x100이다.
- **돌아오기.** `fakePlatform.idle`을 0으로 바꾼다. `img`와 `자리비움` 말풍선이 사라지고 캐릭터가 돌아온다.
- **방 사람 화면.** `devdev`에 참여한 뒤 가짜 친구를 자리비움 그림을 단 자리비움 상태로 만든다(Gotchas). `가짜 친구` 이름표 위에 그림이 서고 `자리비움` 말풍선이 뜬다. 그림을 오른쪽 클릭하면 `menu "가짜 친구"`가 열린다.
- **증거.** 등록 뒤 설정 창, 다시 연 설정 창, 자리비움 전과 뒤의 실행 화면, 가짜 친구 그림이 선 실행 화면을 `s.shot`으로 남긴다.

## Gotchas

- 가짜 친구 기록은 메모리 서버 권한상 내 앱이 쓸 수 없다. 사용자가 만들 수 없는 준비 조건이라 렌더러 세션의 기록을 바꾼다. `const file = core.ctxs.get('awaypic').ctx.local.get('account').file`로 내가 올린 그림을 쓰고 `core.session.raw = { ...core.session.raw, devfriend_dev: { ...core.session.raw.devfriend_dev, state: 'away', m: { awaypic: { pic: { file, size: 60 } } } } }` 다음에 `core.session.refresh()`를 부른다. 보고에 이 조작을 적는다.
- 그림은 Blob으로 늦게 읽혀서 `img`가 생긴 직후 찍으면 빈 상자가 찍힐 수 있다. `img` 개수를 확인한 뒤 찍는다.
- 회사원 모드에서는 그림을 숨긴다. 켜는 경로는 [설정 창](./settings.md)에 있고 그림이 숨는 것은 `src/modules/status/sim.test.ts`가 다룬다.
- 등록한 그림은 64KB(base64) 파일 한도에 맞춰 긴 변 500px부터 줄여서 저장한다. 사진처럼 복잡한 그림은 300px까지 줄여도 넘으면 등록을 거절하고 그 이유를 탭에 보여 준다.
