# 올라타기와 동물탑, 벤치

방 안에서 동물 캐릭터가 다른 사람 머리 위에 올라타고 여러 층으로 쌓인다. 캐릭터 만들기에서 2인 벤치나 3인 벤치 책상을 고른 사람 옆에는 다른 사람이 같이 앉아 벤치 하나를 함께 쓴다. 올라탄 상태와 같이 앉은 상태는 방의 모든 PC에 똑같이 보이고 상태칩 줄의 `내려오기`와 `일어나기`로 푼다. 이름표는 제자리에 남으므로 올라탄 캐릭터 몸 오른쪽에 이름이 붙는다. 벤치에 겹쳐 앉은 사람들의 말풍선과 이름표는 이웃 것을 덮지 않게 좌석 간격만큼 좁아진다.

## Sub-features

- `ride`는 동물 캐릭터가 다른 사용자 메뉴의 `머리 위에 올라타기`로 그 사람 머리 위에 올라타는 것이다 (COM-16).
- `ride-hidden-human`은 사람 캐릭터일 때 `머리 위에 올라타기`가 메뉴에 없는 것이다.
- `ride-hidden-bare`는 동물 캐릭터라도 얼굴 그리기의 `전부 지우기`로 몸을 빼고 저장하면 `머리 위에 올라타기`가 메뉴에 없고 올라타 있었으면 내려오는 것이다 (COM-16).
- `seat-menu-order`는 `머리 위에 올라타기`와 `벤치에 같이 앉기`가 친구 항목과 놀이 항목 뒤 메뉴 맨 아래에 오는 것이다.
- `tower`는 이미 탑이 있는 사람을 고르면 맨 위에 올라타 층이 쌓이는 것이다 (HOM-17).
- `tower-names`는 올라탄 캐릭터마다 몸 오른쪽 가운데에 그 사람 이름이 붙어 탑에서 누가 누구인지 보이는 것이다.
- `tower-drop`은 맨 아래 사람이 방을 나가면 탑이 한 칸 내려오는 것이다 (COM-16, HOM-17).
- `ride-resume`은 절전에 들어갔다 깨어나 같은 방에 다시 들어가도 올라탄 상태와 벤치가 그대로인 것이다. 다른 방에 들어갈 때만 푼다.
- `bench-desk-pick`은 캐릭터 만들기 `책상` 단계에서 `2인 벤치`나 `3인 벤치`를 고르는 것이다 (AVT-21).
- `bench-friend-joins`는 다른 사람이 내 벤치에 앉으면 두 좌석이 겹쳐 앉고 내 벤치 그림이 이어지는 것이다.
- `bench-sit`은 벤치 책상을 쓰는 사람의 메뉴에서 `벤치에 같이 앉기`를 눌러 옆에 앉고 `일어나기`로 돌아오는 것이다.
- `bench-plates`는 벤치에 겹쳐 앉은 좌석의 이름표가 좌석 간격보다 6px 좁아(크기 100%에서 90px) 서로 덮지 않고 다른 사람 이름표의 ▾가 보이는 것이다. 좁은 이름표에는 상태 점, 줄임표로 줄인 이름, ▾만 있고 바쁨과 자리비움 글과 레벨 배지는 빠진다. 상태는 점 모양으로 보이고 전체 이름은 이름표 title에 있다 (AVT-21).
- `bench-bubbles`는 벤치에 겹쳐 앉은 좌석의 말풍선이 좌석 간격보다 6px 좁아(크기 100%에서 90px) 서로 겹치지 않고 긴 글은 두 줄에서 줄임표로 끝나는 것이다.

## How to get to it (user POV)

- 방에 들어간 뒤 실행 화면의 다른 사용자 이름표(끝에 ▾)를 누르거나 캐릭터를 오른쪽 클릭하면 메뉴에 `머리 위에 올라타기`(내가 동물일 때)와 `벤치에 같이 앉기`(그 사람 책상이 벤치일 때)가 있다.
- 올라타 있거나 벤치에 앉아 있으면 내 상태칩 줄에 `내려오기`나 `일어나기`가 생긴다.
- 벤치 책상은 ▼ 메뉴 `캐릭터 만들기`의 `책상` 단계에서 고른다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 누르고 방 창에서 `devdev`로 참여해 `가짜 친구`가 보인다.
- 동물 캐릭터는 30레벨에 열린다. 화면에서 바로 열 수 없으니 `await s.stage.evaluate(() => window.core.ctxs.get('wardrobe').ctx.local.update('account', (l) => ({ ...l, unlockedAt: 1 })))`로 해금 시각을 넣고 보고에 적는다.
- 가짜 친구의 상태는 메모리 서버에 직접 쓴다. 개발판과 시험판은 `globalThis.devHub`에 메모리 서버를 둔다. 예를 들어 `await s.stage.evaluate(() => devHub.write('rooms/DEVDEV/members/devfriend_dev/m/seating', { bench: '<내 uid>' }))`로 친구를 내 벤치에 앉힌다. 내 uid는 `window.core.deps.uid`이다.

- **사람일 때 숨김.** `await s.stage.getByRole('button', { name: '가짜 친구 메뉴' }).click()`을 실행한다. `menu "가짜 친구"`에 `menuitem "친구 신청"`은 있고 `머리 위에 올라타기`와 `벤치에 같이 앉기`는 없다.
- **동물과 벤치 고르기.** 해금 시각을 넣고 `const w = await menu(s, '캐릭터 만들기', '캐릭터 만들기')`, `w.getByRole('button', { name: '동물' }).click()`, `w.getByRole('button', { name: '책상', exact: true }).click()`, `w.getByRole('button', { name: /2인 벤치/ }).click()`, `w.getByRole('button', { name: '저장' }).click()`을 차례로 실행한다. 실행 화면에 `캐릭터를 저장했어요.`가 뜨고 내 멤버 기록 `devHub.read('rooms/DEVDEV/members/<내 key>').m.seating.cap`이 2가 된다.
- **메뉴 순서.** 동물이 된 뒤 친구 seating에 `{ cap: 3 }`을 쓰고 `가짜 친구 메뉴`를 연다. `menuitem` 이름이 `친구 신청`, `쓰다듬기`, `때리기`, `머리 위에 올라타기`, `벤치에 같이 앉기` 순서다. `devHub.write('mod/friends/u/<내 uid>/list/devfriend', { since: devHub.now(), v: 1 })`로 친구가 되면 첫 항목이 `마이홈 보기`로 바뀌고 나머지 순서는 같다. 메뉴를 닫고 친구 seating을 `{}`로 되돌린다.
- **친구가 내 벤치에 앉기.** 친구 seating에 `{ bench: '<내 uid>' }`를 쓴다. 실행 화면 너비 `window.innerWidth`가 줄고 두 캐릭터가 한 벤치 판 위에 겹쳐 앉는다. `{}`를 쓰면 너비가 돌아온다.
- **친구 벤치에 같이 앉기.** 친구 `look`을 내 멤버 기록의 `look`으로 바꾸고 seating에 `{ cap: 3 }`을 쓴다. `가짜 친구 메뉴`를 열고 `menuitem "벤치에 같이 앉기"`를 누른다. 상태칩 줄에 `button "일어나기"`가 생기고 내 seating.bench가 `devfriend`가 된다. 친구가 왼쪽 맨 앞에 앉는다. `일어나기`를 누르면 단추가 사라지고 너비가 돌아온다.
- **올라타기.** 친구 seating을 `{}`로 두고 `가짜 친구 메뉴`에서 `menuitem "머리 위에 올라타기"`를 누른다. `[class*="rider"]`가 1개가 되고 `button "내려오기"`가 생기며 실행 화면 높이가 커진다. 내 seating.on이 `devfriend`가 된다. `내려오기`를 누르면 rider가 0개가 된다.
- **절전 뒤에도 올라탄 채로.** 올라탄 상태에서 `s.app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'))`를 실행하면 내 멤버 기록이 사라진다. `resume`을 보내면 기록이 다시 생긴다. seating.on은 `devfriend` 그대로이고 rider가 1개이며 `내려오기`가 보인다.
- **몸을 빼면 내려오기 (ride-hidden-bare).** 올라탄 상태에서 `const w = await menu(s, '캐릭터 만들기', '캐릭터 만들기')`, `w.getByRole('button', { name: '전부 지우기' }).click()`, `w.getByRole('button', { name: '저장', exact: true }).click()`을 차례로 실행한다. rider가 0개가 되고 `내려오기`가 사라지며 내 seating.on은 null이다. `가짜 친구 메뉴`를 열면 `머리 위에 올라타기`가 없다. 메뉴를 닫고 창을 다시 열어 `동물`을 누르고 저장하면 `가짜 친구 메뉴`에 `머리 위에 올라타기`가 다시 있다.
- **동물탑.** 메모리 서버에 둘째 멤버를 더한다. `rooms/DEVDEV/roster/devfriend2`에 `devHub.now()`, `rooms/DEVDEV/members/devfriend2_dev`에 가짜 친구 기록을 복사해 uid `devfriend2`, 이름 `둘째 친구`, `m: { seating: { on: 'devfriend' } }`로 쓴다. 둘째 친구가 가짜 친구 머리 위에 올라간다(rider 1개). `가짜 친구 메뉴`에서 `머리 위에 올라타기`를 누르면 내 seating.on이 `devfriend2`가 되고 rider가 2개가 된다. `둘째 친구 메뉴`에는 `머리 위에 올라타기`가 없다.
- **탑 이름.** 둘째층(uid `qa2`, 이름 `둘째층`, `m: { seating: { on: 'devfriend' } }`)과 셋째층(uid `qa3`, 이름 `셋째층`, `m: { seating: { on: 'qa2' } }`)을 위와 같이 더한다. `[class*="towerName"]` 두 개의 글이 `둘째층`, `셋째층`이고 각자 그 층 캐릭터 몸의 오른쪽 가운데에 있다. 이름표는 전처럼 제자리(빈 책상 아래)에 있다.
- **벤치 말풍선.** 가짜 친구 seating을 `{ cap: 3 }`, 둘째층과 셋째층 seating을 `{ bench: 'devfriend' }`로 쓰고 셋 모두 `m.status.text`에 20자 안팎의 상태글을 넣는다. 말풍선(`div[class*="bubble"]`에서 `bubbleText`를 뺀 것) 세 개의 `getBoundingClientRect()` 폭이 90이고 x 범위가 서로 겹치지 않는다. 벤치가 아닌 내 좌석 말풍선은 최대 150px 그대로다.
- **벤치 이름표 (bench-plates).** 벤치 말풍선 단계와 같은 셋에서 이름표(`button[class*="nameplate"]`) 세 개의 폭이 90 이하이고 x 범위가 서로 겹치지 않는다. 다른 사람 이름표마다 ▾ 가운데 점의 `document.elementFromPoint`가 그 이름표 안이다. 20자 이름은 줄임표로 줄고 title에 전체 이름이 있다. 가짜 친구 `state`를 `busy`, 둘째층을 `away`로 쓰면 두 이름표에 `바쁨`, `자리비움` 글은 없고 점 모양만 바뀐다. 레벨이 있는 사람(`m.growth`가 `{ lv: 12, xp: 40, rd: 1 }`)도 벤치에서는 레벨 배지가 없다. 내가 `벤치에 같이 앉기`로 함께 앉아도 내 이름표가 이웃 이름표를 덮지 않는다. 다섯이 있을 때(벤치 셋과 따로 앉은 둘) 벤치 밖 이름표는 레벨 배지까지 그대로다. 글자 간격을 넓힌 스타일에서도 같다.
- **탑 내려오기.** `devHub.write('rooms/DEVDEV/members/devfriend_dev', null)`로 가짜 친구를 내보낸다. 둘째 친구는 제자리에 앉고 나는 둘째 친구 위에 남아 rider가 1개가 된다.
- **증거.** 각 단계 뒤의 실행 화면을 `s.shot`으로 남기고 `errors.json`이 `[]`인지 본다.

## Gotchas

- 가짜 친구의 seating은 화면에서 바꿀 수 없다. 메모리 서버에 쓴 값은 보고에 적는다.
- 서버는 null을 쓴 필드를 지워서 내려온 뒤 seating.on은 `undefined`로 읽힌다. `?? null`로 비교한다.
- 위에 올라탄 층마다 실행 화면이 좌석 높이만큼 커진다. 한 탑에는 3명까지 올라탄다.
- 다른 창이 실행 화면을 덮고 있으면 좌석 그림이 늦게 바뀐다. 실행 화면을 찍기 전에 워킹룸 같은 창을 닫고 좌석 canvas가 새 그림이 될 때까지 기다린다.
