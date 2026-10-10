# 마이홈

마이홈 창에서 내 마이홈을 꾸미고 친구 마이홈에 놀러 간다. 프로필 칸 맨 위에 주인의 프로필 사진이 있다. 방명록은 최근 글 30개씩 보이고 이전 글 더 보기로 30개씩 더 받는다. 편집에서 배경음악, 마이홈 색, 창 바탕 그림, 박수 이모지를 고르고 바탕화면 영역의 북마크 책장에 링크를 꽂는다. 말랑이를 불러 누르거나 끌어 올린다. [스케줄러]와 [D-day] 탭에서 일정과 카드를 더하고 실행 화면 상태칩의 🔔로 다가오는 일정을 본다. 친구 마이홈에서는 공개한 것만 보이고 박수를 보낸다.

## Sub-features

- `hom-03`은 프로필 칸 맨 위의 주인 프로필 사진이다. 친구 마이홈에서는 친구 사진이 보인다 (HOM-03).
- `hom-08`은 편집에서 붙인 스티커의 크기와 회전 손잡이다. 보이는 점은 16px이고 누르는 자리는 32px이다 (HOM-08).
- `hom-09`는 방명록이다. 처음에는 최근 30개가 보이고 이전 글 더 보기를 누르면 30개씩 늘어난다. 친구 마이홈에서는 글을 남긴다. 친구를 끊어도 그 사람이 남긴 글과 선물과 박수는 내 마이홈에 그대로 보인다 (HOM-09).
- `hom-14`는 선물함과 말랑이 선물이다. 친구가 아직 받지 않은 내 선물이 30개면 보내지 않고 안내가 뜬다 (HOM-14).
- `hom-04`는 플레이리스트 곡을 배경음악으로 고르고 누를 때만 200x200 플레이어로 재생하는 것이다 (HOM-04).
- `hom-07`은 마이홈 색과 창 바탕 그림을 고르고 저장하는 것이다 (HOM-07).
- `hom-10`은 친구 탭에서 친구 마이홈으로 가고 내 마이홈으로 돌아오는 것이다 (HOM-10).
- `hom-11`은 북마크 책장에 공개 책과 비공개 책을 꽂고 공개 책을 기본 브라우저로 여는 것이다 (HOM-11).
- `hom-13`은 말랑이를 누르면 뛰며 하트를 띄우고 다른 말랑이 머리 위로 끌어다 놓으면 올라타는 것이다 (HOM-13).
- `hom-15`는 박수 버튼이다. 주인은 이모지만 터지고 친구는 수가 오르며 하루 5번이 넘으면 안내가 뜬다 (HOM-15).
- `hom-16`은 스케줄러 달력에서 오늘 일정을 더하는 것이다 (HOM-16).
- `hom-21`은 D-day 카드를 더하는 것이다 (HOM-21).
- `hom-22`는 상태칩 🔔 배지, 다가오는 일정 창, 오늘 일정 OS 알림이다 (HOM-22). 다른 기기가 이 계정을 쓰는 중이면 알림을 보내지 않는다.

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴에서 `마이홈`을 누른다. 창 제목은 `마이홈`이다.
- 다른 사용자 캐릭터 메뉴의 `마이홈 보기`를 누른다. 친구로 등록한 사람에게만 보인다.
- 마이홈 창의 `친구` 탭에서 친구 줄의 `마이홈 보기`를 누른다.
- 7일 안에 일정이 있으면 실행 화면 내 캐릭터 상태칩에 🔔(`button[title="다가오는 일정"]`)이 보이고 누르면 `다가오는 일정` 창이 열린다. 일정이 없으면 이 칩은 없고 창은 ▼ 메뉴에서 연다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.
- 그림 고르기, 기본 브라우저 열기, OS 알림은 메인에서 바꿔 둔다. `s.app.evaluate(({ dialog, shell, Notification }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); shell.openExternal = async (u) => void (globalThis.opened = u); Notification.prototype.show = function () { (globalThis.notes ??= []).push({ title: this.title, body: this.body }); }; }, pngPath)`처럼 쓴다. 그림은 `tests/e2e/boot.spec.ts`처럼 OffscreenCanvas로 만든다.
- 배경음악을 고르려면 플레이리스트에 곡이 있어야 한다. `const player = await menu(s, '플레이리스트', '플레이리스트')`, `player.getByLabel('유튜브 링크').fill('https://youtu.be/dQw4w9WgXcQ')`, `player.getByRole('button', { name: '+ 추가' }).click()`을 실행한다.
- 친구가 남긴 방명록과 박수와 선물은 화면에서 만들 수 없다. 스테이지에서 `devHub.writeMany`로 `mod/home/u/<내 uid>/in/devfriend/<13자리 시각>`에 `{ name, text, at }`, `in/devfriend/clap`에 수, `in/devfriend/gift/<시각>`에 `{ file, msg, name, at }`를 쓴다. 선물 그림은 `c.deps.server.files.put(bytes)`로 올린 해시다. 친구 사진은 `mod/account/u/devfriend/photo`에 해시를 쓴다. 서로 친구 기록은 `mod/friends/u/devfriend/list/<내 uid>`와 내 `friends`의 `list/devfriend`다.
- 친구 마이홈은 화면에서 만들 수 없다. 스테이지에서 `window.core.deps.server`로 `identity.signIn('dev-devfriend')` 한 뒤 `profile.write('devfriend', { name: '가짜 친구' })`, `docs({ scope: 'user', module: 'friends', uid: 'devfriend' }).set('list/<내 uid>', { since, v: 1 })`, 친구의 `home`, `shelf`, `shelfPub`, `mod/scheduler`의 `ev`와 `pub`, `mod/dday`의 `cards`와 `pub`를 쓰고 `identity.signIn('dev-<내 uid>')`로 돌아와 내 `friends`의 `list/devfriend`를 쓴다. 내 uid는 `window.core.deps.uid`다.

- **편집과 저장 (hom-04, hom-07).** `const home = await menu(s, '마이홈', '마이홈')`, `home.getByRole('button', { name: '편집' }).click()`, `home.getByLabel('배경음악').selectOption('dQw4w9WgXcQ')`, `home.getByRole('button', { name: '분홍 색' }).click()`, `home.getByRole('button', { name: '창 바탕 그림' }).click()`, `home.getByLabel('박수 이모지').fill('🎉')`, `home.getByRole('button', { name: '저장' }).click()`을 실행한다. `button "🎉 박수 0"`이 보이고 창을 닫았다 다시 열어도 `[data-themed="true"][data-wall="true"]`인 보기 화면이 있고 그 배경 그림이 `blob:` 주소다.
- **프로필 사진 (hom-03).** 설정 창 `계정` 탭에서 `사진 넣기`를 누른 뒤 마이홈을 열면 `home.locator('aside').getByRole('img', { name: '프로필 사진' })`가 보인다.
- **방명록 쪽 (hom-09).** 준비로 친구 글 35개를 쓰면 `방명록` 버튼 글자가 `방명록30`이다. 누르면 패널 `li`가 30개이고 첫 줄이 가장 새 글이다. `이전 글 더 보기`를 누르면 35개가 되고 버튼이 사라진다.
- **선물함 (hom-14).** 준비로 선물을 쓰면 메인 `globalThis.notes`에 `{ title: '말랑이 선물', body: '가짜 친구님이 말랑이를 보냈어요.' }`가 생기고 `선물함` 패널에 `가짜 친구님의 선물`이 보인다.
- **친구를 끊은 뒤 (hom-09, hom-14, hom-15).** 준비로 친구 글 3개, `clap` 2, 선물 1개를 쓰면 `방명록3`, `👏 박수 2`, `선물함1`이 보이고 스테이지의 `devHub.read('mod/home/u/<내 uid>/senders')`가 `{ devfriend: true }`가 된다. `const friends = await menu(s, '친구', '친구')`에서 `끊기`를 누르고 `친구를 끊을까요?` 줄의 `끊기`를 한 번 더 누른다. 내 친구 목록에서 `devfriend`가 사라져도 열어 둔 방명록 패널 `li`는 3개이고 `👏 박수 2`와 `선물함1`이 그대로다. 마이홈 창을 닫고 다시 열어 `방명록`을 누르면 `li`가 3개이고 `선물함` 패널에 `가짜 친구님의 선물`이 있다. 방명록 배지 수는 읽지 않은 글 수라서 패널을 한 번 열면 사라진다.
- **스티커 손잡이 (hom-08).** `편집`, `+ 스티커`를 누르면 고른 스티커에 손잡이가 생긴다. `[class*="size"]` 가운데에서 오른쪽 13px을 `elementFromPoint`로 보면 그 손잡이이고 20px은 아니다. 그 13px 자리를 마우스로 끌면 스티커 `style.width`가 바뀐다. `분홍 색` 칸은 오른쪽 2px과 위 4px도 그 칸이고 오른쪽 4px은 옆 칸이다.
- **배경음악 재생 (hom-04).** 저장 전에는 `iframe`이 없다. `home.getByRole('button', { name: '배경음악 듣기' }).click()` 뒤에 `iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]`가 200x200으로 보인다. `배경음악 끄기`를 누르면 사라진다.
- **박수 미리보기 (hom-15).** 내 마이홈에서 `button "🎉 박수 0"`을 누르면 `[class*="sparks"] span`에 🎉가 나타났다가 1초 뒤 사라지고 수는 0 그대로다.
- **북마크 (hom-11).** `home.getByRole('button', { name: '북마크', exact: true }).click()`, `+ 책 꽂기`, `getByPlaceholder('책 제목 (14자)')`, `getByPlaceholder('https://')`, 공개할 책만 `getByLabel('친구에게 공개').check()`, `getByRole('button', { name: '꽂기', exact: true })`를 실행한다. 머리글이 `북마크 2 / 50, 공개 1`이 된다. 책 이름 버튼을 누르고 `열기`를 누르면 메인의 `globalThis.opened`가 그 링크다. `javascript:` 링크는 `제목과 http나 https로 시작하는 링크를 넣어 주세요.` 토스트가 실행 화면에 뜬다.
- **말랑이 (hom-13).** `말랑이 관리`, `그림 올리기`, `닫기`, `말랑이 부르기` 두 번을 실행한다. 말랑이는 `img[title^="끌어서 옮기기"]`다. 둘 다 `style.top`이 `416px`가 될 때까지 기다린 뒤 하나를 `click()`하면 `data-hop="true"`가 되고 💗 span이 나타난다. 다른 하나를 `home.mouse`로 눌러 첫 말랑이의 120px 위로 끌어 놓으면 3초 안에 두 `left` 차이가 3px 이하이고 위 말랑이 `top`이 아래보다 64px 작다.
- **스케줄러 (hom-16).** `스케줄러` 탭, `+ 일정 추가`, `getByLabel('제목')`, `getByLabel('메모')`, `getByLabel('친구에게 공개').check()`, `getByRole('button', { name: '추가', exact: true })`를 실행한다. 날짜, 제목, 메모 칸 위에 이름표가 보인다. 오른쪽 목록에 제목과 `공개`가 보이고 오늘 칸이 `button /일정 1개/ [pressed]`다. 오늘 칸(`[data-today="true"]`)은 `core.deps.server.time.serverNow()`에 9시간을 더한 날짜다.
- **D-day (hom-21).** `D-day` 탭, `+ D-day 추가`, `getByLabel('이름')`, `getByLabel('날짜').fill('YYYY-MM-DD')`, 필요하면 `getByLabel('고른 날을 1일째로 세기').check()`, `추가`를 실행한다. 사흘 뒤 날짜는 `D-3`, 99일 전 날짜를 1일째로 세면 `100일째`가 보인다. `주황 카드`를 고른 카드는 `getComputedStyle`로 본 글자색이 `rgb(29, 29, 31)`이고 날짜 `small`의 opacity가 1이다. 보라와 검정 카드는 흰 글자다.
- **자정 넘기기 (hom-16, hom-21, hom-22).** 내일 날짜의 D-day 카드를 더하면 `b[class*="label"]`이 `D-1`이고 `스케줄러` 탭의 `[data-today="true"]` 글자는 오늘 날짜의 일이다. 스테이지에서 `devHub.advance(86_400_000)`으로 서버 시각을 하루 앞당기면 창을 그대로 두어도 1분 안에 오늘 칸이 다음 날로 옮겨 가고 D-day 카드 글이 `D-day`가 된다. `expect(...).toHaveText(..., { timeout: 75_000 })`로 기다린다. 🔔 창의 첫 `li`도 `오늘`과 카드 이름을 보인다.
- **다가오는 일정 (hom-22).** 위 두 단계 뒤 실행 화면의 `button[title="다가오는 일정"]` 글자가 `🔔2`다. 누르면 `다가오는 일정` 창의 `li`가 `오늘원고 마감내 일정`, `3일 뒤시험D-day` 순서다. 메인의 `globalThis.notes`가 `[{ title: '오늘 일정', body: '원고 마감' }]` 하나뿐이다.
- **쓰지 않는 기기의 알림 (hom-22).** 새 세션에서 마이홈 창을 먼저 연다. 다른 기기가 가져가면 ▼ 메뉴가 숨는다. 스테이지에서 `window.core.deps.server.userPrivate.set(<내 uid>, 'activeDevice', { id: 'other-pc', at: Date.now() })`를 실행하면 실행 화면에 `여기서 계속 쓰기`가 뜬다. 스케줄러에 `원고 마감`을 더해도 `globalThis.notes`가 비어 있다. `여기서 계속 쓰기`를 누르고 `회의`를 더하면 🔔가 `🔔2`이고 알림은 `{ title: '오늘 일정', body: '원고 마감, 회의' }` 하나만 온다.
- **친구 마이홈 (hom-10, hom-15).** 준비 조건으로 친구가 내 마이홈에 박수 2개를 보냈다면 내 마이홈에 `👏 박수 2`가 보인다. `친구` 탭, `마이홈 보기`를 누르면 `가짜 친구님의 마이홈에 놀러 왔어요.`와 `내 마이홈으로` 버튼이 보이고 `편집`이 없다. 프로필 칸에 친구 사진이 보이고 방명록에 `getByLabel('방명록 글')`로 글을 남기면 목록에 바로 보인다. 박수 버튼을 누를 때마다 수가 1씩 오르고 다섯 번 뒤에는 `박수는 한 마이홈에 하루 5번까지 보낼 수 있어요.` 토스트가 뜬다. 북마크에는 공개 책만 있고 `+ 책 꽂기`와 `수정`이 없다. `스케줄러` 탭에는 공개 일정과 `친구가 공개한 일정만 보여요.`가 보이고 `+ 일정 추가`가 없다. `D-day` 탭에는 공개 카드만 있다. `내 마이홈으로`를 누르면 `마이홈` 탭이 눌린 상태로 돌아온다. 🔔 창에는 `가짜 친구님 일정`으로 친구 공개 일정이 나온다.
- **선물 한도 (hom-14).** 준비로 `mod/home/u/devfriend/in/<내 uid>/gift/<시각>`에 선물 30개를 쓴다. `친구` 탭, `말랑이 선물`, 말랑이 칸, `보내기`를 누르면 실행 화면에 `친구가 아직 받지 않은 선물이 30개 있어요. 친구가 선물함을 비우면 다시 보낼 수 있어요.` 토스트가 뜬다.
- **증거.** 프로필 사진, 방명록 첫 쪽과 더 본 뒤, 손잡이를 끈 뒤, 편집 화면, 저장 뒤 화면, 플레이어, 박수 이모지, 책장, 말랑이 하트와 올라탄 모습, 스케줄러, D-day, 🔔 배지와 창, 친구 마이홈과 친구 탭들을 `s.shot`으로 남긴다.

## Gotchas

- 새 세션의 이름은 빈 문자열이라 마이홈 이름 칸이 비어 있다.
- 검증 환경에서는 YouTube가 열리지 않아 플레이어가 검은 칸으로 보일 수 있다. 플레이어가 200x200으로 뜨는 것까지만 확인한다.
- 박수 이모지 칸의 이름은 `박수 이모지`이고 placeholder는 👏다. 박수 버튼 이름은 `<이모지> 박수 <수>`라서 이모지를 바꾸면 이름도 바뀐다.
- 북마크 패널, 말랑이 관리 패널은 오른쪽 위를 덮어서 말랑이를 누르기 전에 `닫기`로 닫는다.
- 말랑이는 걷고 쉬고 벽을 타서 위치가 계속 바뀐다. 끌기 직전에 위치를 다시 읽는다. 벽 타기와 밀기는 무작위라 화면 검증 대신 `src/modules/home/logic.test.ts`로 확인한다.
- 🔔 배지는 오늘부터 7일 뒤까지만 센다. 지난날을 1일째로 세는 카드는 세지 않는다.
- 같은 일정 알림은 하루에 한 번이라 세션을 새로 켜야 다시 온다.
- 방명록과 박수는 보낸 사람 칸마다 읽는다. 내 마이홈은 내 친구 목록과 기록을 남긴 사람 색인 `senders`에 있는 사람의 칸을, 친구 마이홈은 내 친구 목록과 나의 칸만 읽는다. 준비 조건으로 친구 기록을 쓸 때 친구 목록에도 색인에도 없는 uid로 쓰면 보이지 않는다.
- 친구 창의 친구 이름은 `users/devfriend/public`이 없으면 `이름 없음`이다. 끊기 확인 줄은 `/친구를 끊을까요\?/`로 찾는다.
- 서버 시각을 옮긴 뒤에는 오늘이 바뀌어 같은 세션에서 날짜 기준 검사를 다시 하지 않는다. 날짜를 옮기는 검사는 마지막에 둔다.
- 방명록 글 키는 13자리 시각이어야 한다. 다른 모양의 키는 쪽 나누기 순서가 어긋난다.
- `스케줄러`와 `D-day` 탭은 처음 누를 때 불러온다. 그동안 `불러오는 중이에요.`가 잠깐 보일 수 있으니 탭 안의 요소를 기다린 뒤 조작한다.
