# 방

방 창에서 방 코드로 다른 사람의 방에 들어가거나 내 방을 만든다. 같은 방 사람의 캐릭터가 실행 화면에 함께 앉고 그 사람 이름표(끝에 ▾가 붙은 단추)를 누르거나 캐릭터를 오른쪽 클릭하면 메뉴가 열린다. 내 방이면 방 설정 창에서 정원과 가챠 규칙을 바꾼다. 남의 방에서 입력 없이 6시간 20분이 지나면 1분 전 안내 뒤 방에서 나가고 돌아와 입력하면 그 방에 다시 들어간다.

## Sub-features

- `room-join`은 방 코드로 다른 방에 들어가는 것이다 (ROM-05, ROM-08). 방 창은 코드로 참여하기를 새 방 만들기보다 먼저 두고 두 묶음과 방 정보에 코드를 주고받는 안내가 있다.
- `room-copy`는 방 창의 `코드 복사`로 방 코드를 복사하면 그 창 위쪽에 `방 코드를 복사했어요.`가 뜨는 것이다.
- `room-card`는 런처 워킹룸 카드가 혼자일 때 `지금은 혼자 모드예요.`, 방에 있을 때 `<코드> 방에 <n>명이 있어요. 시작하면 같이 앉아요.`를 보여 주는 것이다.
- `room-member-menu`는 다른 사용자 이름표(끝에 ▾)를 누르거나 캐릭터를 오른쪽 클릭하면 메뉴가 열리고 다시 누르면 닫히는 것이다 (ROM-11). 이름표에 마우스를 올리면 테두리가 밝아진다.
- `room-create`는 방에서 나간 뒤 내 방을 만드는 것이다.
- `room-leave-roster`는 `방에서 나가기`나 정원 초과로 스스로 나가면 그 방의 roster에서도 빠져 그 방 채팅과 사진 같은 기록을 더 읽지 못하는 것이다. 코드로 다시 들어오면 다시 읽는다. 절전, 앱 끝내기, 다른 기기로 넘기기, 자동 퇴장 뒤 돌아오기는 다시 들어가므로 영향이 없다.
- `room-settings`는 내 방의 방 설정 창을 여는 것이다 (OUR-01). 채팅 켜기가 정원 바로 아래에 있고 채팅을 끈 주인이 대화하기를 누르면 다시 켜는 곳을 알려 준다.
- `room-remove`는 방 설정 창의 `방 지우기`로 확인을 거쳐 내 방을 지우는 것이다 (OUR-01).
- `room-resume`은 절전하면 방에서 나왔다가 깨어나면 같은 방에 다시 들어가는 것이다. 자는 동안 주인이 방을 지웠으면 깨어날 때 `주인이 지운 방이에요.` 안내가 뜬다.
- `room-elsewhere`는 다른 기기가 이 계정을 가져가면 이 PC는 방에서 나오고 계정 접속 상태(친구가 보는 접속 표시와 방 코드)를 더 쓰지 않는 것이다. `여기서 계속 쓰기`를 누르면 다시 쓰고 나왔던 방에 돌아간다 (ACC-12).
- `room-auto-leave`는 자동 자리비움이 6시간 이어지면 안내 창을 띄우고 1분 뒤 방에서 나갔다가 입력이 오면 다시 들어가는 것이다 (CHR-13, ROM-14). 안내 창에서 취소하면 나가지 않고 작업 앱이 앞에 있거나 내 방이면 안내하지 않는다.

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴에서 `방 만들기 / 참여하기`를 누른다.
- 런처의 `방 만들기 / 참여하기` 버튼을 누른다.
- 방에 들어간 뒤 실행 화면의 다른 사용자 이름표(끝에 ▾)를 누르거나 캐릭터를 오른쪽 클릭한다.
- 내 방에 있을 때 방 창의 `방 설정`을 누른다.
- 절전과 깨어남, 다른 기기의 접속은 누르는 경로가 없다. PC를 재우거나 같은 계정으로 다른 PC에서 앱을 켤 때 일어난다.
- 자동 퇴장은 누르는 경로가 없다. 남의 방에서 입력 없이 6시간 19분이 지나면 `자리비움 안내` 창이 저절로 뜬다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.

- **방 창 열기.** `const rooms = await menu(s, '방 만들기 / 참여하기', '방 만들기 / 참여하기')`를 실행한다. ARIA에 `heading "코드로 참여하기"`, `친구가 알려 준 6자 코드를 넣으면 같은 방에 앉아요.`, `textbox "예: 7Q2K9M"`, `heading "새 방 만들기"`, `만들면 6자 코드가 생겨요. 그 코드를 친구에게 알려 주세요.`, `combobox "정원"`이 이 순서로 있다.
- **코드로 참여.** `await rooms.getByPlaceholder('예: 7Q2K9M').fill('devdev')`와 `await rooms.getByRole('button', { name: '참여' }).click()`을 실행한다. 실행 화면에 `가짜 친구` 이름표가 보이고 방 창에 `DEVDEV`, `친구에게 이 코드를 알려 주면 같은 방에 들어와요.`, `2명 / 정원 5명`이 보인다.
- **코드 복사.** `await rooms.getByRole('button', { name: '코드 복사' }).click()`을 실행한다. 방 창 위쪽에 `방 코드를 복사했어요.`가 뜨고 단추 이름은 `코드 복사` 그대로다. `await s.app.evaluate(({ clipboard }) => clipboard.readText())`가 `DEVDEV`다.
- **다른 사용자 메뉴 열기.** `await s.stage.getByRole('button', { name: '가짜 친구 메뉴' }).click()`을 실행한다. 이 버튼은 `가짜 친구` 이름표다. `menu "가짜 친구"`가 나타나고 그 안에 `menuitem "친구 신청"`이 있다. 누르기 전에 잰 실행 화면 높이 `h0`보다 커진다. `await expect.poll(() => s.stage.evaluate(() => window.innerHeight)).toBeGreaterThan(h0)`로 확인한다.
- **다른 사용자 메뉴 닫기.** 같은 버튼을 다시 누른다. `menu "가짜 친구"`가 사라진다.
- **오른쪽 클릭.** `await s.stage.getByRole('button', { name: '가짜 친구 쓰다듬기' }).click({ button: 'right' })`를 실행한다. 같은 메뉴가 열리고 한 번 더 오른쪽 클릭하면 닫힌다.
- **내 방 만들기.** `await rooms.getByRole('button', { name: '방에서 나가기' }).click()`과 `await rooms.getByRole('button', { name: '만들기', exact: true }).click()`을 실행한다. 방 창에 새 6자 코드, `1명 / 정원 4명`, `방 설정` 버튼이 보인다.
- **방 설정 열기.** `await rooms.getByRole('button', { name: '방 설정' }).click()` 다음에 `const st = await windowTitled(s.app, '방 설정')`을 실행한다. 창 안쪽 높이는 560이고 `<코드> 방`, `combobox "정원"`, `checkbox "채팅 켜기"`, `heading "가챠"`, `button "방 지우기"`가 이 순서로 있다. 채팅 켜기는 스크롤하지 않아도 보인다.
- **채팅을 끈 주인.** 방 설정 창에서 `await st.getByLabel('채팅 켜기').uncheck()`을 실행한 뒤 실행 화면 ▼ 메뉴의 `대화하기`를 누른다. 창이 열리지 않고 실행 화면에 `채팅을 꺼 두었어요. 방 설정에서 다시 켤 수 있어요.`가 뜬다. 주인이 아닌 방에서는 `방 주인이 채팅을 꺼 두었어요.`가 뜬다. `DEVDEV`에서 주인이 끈 것처럼 `devHub.write('mod/chat/r/DEVDEV/cfg', { on: false, v: 1 })`를 쓰고 같은 메뉴를 누르면 볼 수 있다. 끝나면 `{ on: true, v: 1 }`로 되돌린다.
- **방 지우기.** 방 설정 창의 `방 지우기`를 누른다. `되돌릴 수 없고 모두 방에서 나가요.`가 한 줄로 보이고 `지우기`와 `취소`가 생긴다. `await st.getByRole('button', { name: '지우기', exact: true }).click()`을 실행하면 방 설정 창이 닫히고 실행 화면에 `방을 지웠어요.` 알림 하나만 뜨며(`core.toasts.get()`이 그 글 하나) 방 코드 칩이 사라진다.
- **나가면 roster에서 빠짐.** `devdev`에 들어간 뒤 `devHub.read('rooms/DEVDEV/roster/<내 uid>')`가 숫자다. 방 창에서 `방에서 나가기`를 누르면 가짜 친구가 사라지고 같은 읽기가 null이다. 다시 `devdev`로 참여하면 숫자가 생긴다. 메모리 서버는 읽기 규칙을 흉내 내지 않아서 읽지 못하게 되는 것은 `npm run test:emulator`의 규칙 시험이 본다.
- **런처 카드.** 시작하기를 누르기 전 런처에 `지금은 혼자 모드예요.`가 보인다. 런처의 `방 만들기 / 참여하기`로 연 방 창에서 `devdev`로 참여하면 런처 카드가 `DEVDEV 방에 2명이 있어요. 시작하면 같이 앉아요.`로 바뀌고 버튼 이름이 `방 정보`가 된다.
- **증거.** 참여 직후 실행 화면, 복사 알림이 뜬 방 창, 메뉴가 열린 실행 화면, 내 방 상태의 방 창, 방 설정 창, 지우기 확인과 지운 뒤 실행 화면을 `s.shot`으로 남긴다.

절전과 깨어남(`room-resume`)은 화면에서 만들 수 없어서 메인이 스테이지에 lifecycle 이벤트를 보낸다. `const lifecycle = (type: 'suspend' | 'resume') => s.app.evaluate(({ BrowserWindow }, t) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().startsWith('about:'))!.webContents.send('core:lifecycle', { type: t }), type)`를 만들어 쓴다. `devdev`에 참여한 상태에서 시작한다.

- **절전과 깨어남.** `await lifecycle('suspend')`를 실행하면 `가짜 친구`가 사라지고 `await lifecycle('resume')`을 실행하면 다시 보인다.
- **지운 방.** 다시 `await lifecycle('suspend')`를 실행하고 `await s.stage.evaluate(() => devHub.write('rooms/DEVDEV/meta/deletedAt', Date.now()))`로 방을 지운 뒤 `await lifecycle('resume')`을 실행한다. 실행 화면에 `주인이 지운 방입니다.`가 뜨고 `DEVDEV` 칩이 없다. 끝나면 같은 경로에 `null`을 써서 되돌린다.

다른 기기(`room-elsewhere`)도 `devdev`에 참여한 상태에서 시작한다. 계정 접속 상태는 `const presence = () => s.stage.evaluate(() => devHub.read('users/' + core.deps.uid + '/presence'))`로 읽는다.

- **다른 기기가 가져감.** `await core.deps.server.userPrivate.set(core.deps.uid, 'activeDevice', { id: 'other-pc', at: Date.now() })`와 다른 PC가 쓰는 것처럼 `devHub.write('users/' + uid + '/presence', { online: true, lastSeen: devHub.now(), m: { rooms: { code: 'OTHER1' } } })`를 실행한다. 실행 화면에 `다른 기기에서 쓰는 중이에요`와 `button "여기서 계속 쓰기"`가 보이고 `presence()`의 방 코드는 계속 `OTHER1`이다.
- **이 PC가 끊김.** `core.deps.server.goOffline()` 뒤에도 `presence()`의 `online`이 `true`다. `goOnline()`으로 되돌린다.
- **되찾기.** `여기서 계속 쓰기`를 누른다. `가짜 친구`가 다시 보이고 `presence()`가 `{ online: true, m: { rooms: { code: 'DEVDEV' } } }`가 된다. 이제 `goOffline()`을 하면 `online`이 `false`가 된다.

자동 퇴장(`room-auto-leave`)은 `devdev`에 참여한 상태에서 시작한다. 유휴 시간은 메인에서 바꾼다. `const fake = (p: { idle?: number; app?: string | null; pen?: string }) => s.app.evaluate((_, q) => { const f = (globalThis as any).fakePlatform; if (q.idle !== undefined) f.idle = q.idle; if (q.app !== undefined) f.app = q.app; if (q.pen) f.pens.add(q.pen); }, p)`를 만들어 쓰고 `const LEAVE = 22_800`(6시간 20분)으로 둔다.

- **안내 띄우기.** `await fake({ idle: LEAVE - 30 })`과 `const popup = await windowTitled(s.app, '자리비움 안내')`를 실행한다. 창에 `자리를 오래 비워서 1분 뒤에 방에서 나가요.`, 한 줄 안내 `다시 입력하면 그 방에 돌아가요.`, `button "취소"`가 있고 실행 화면 내 좌석 위에 `자리비움` 말풍선이 보인다.
- **취소.** `await popup.getByRole('button', { name: '취소' }).click()`을 실행한다. 안내 창이 닫히고 `자리비움` 말풍선이 사라지며 `가짜 친구`가 그대로 보인다.
- **나가기.** `await fake({ idle: 0 })` 뒤에 앱이 유휴 0초 샘플을 받을 때까지 기다리고(Gotchas) `await fake({ idle: LEAVE - 30 })`로 안내를 다시 띄운 뒤 누르지 않는다. 1분 안에 `await expect(s.stage.getByText('자리를 오래 비워서 방에서 나왔어요.')).toBeVisible({ timeout: 75_000 })`이 통과하고 `가짜 친구`와 `DEVDEV` 칩이 사라지며 안내 창도 닫힌다.
- **돌아오기.** `await fake({ idle: 0 })`을 실행한다. `가짜 친구`와 `DEVDEV` 칩이 다시 보인다.
- **작업 앱.** `await fake({ app: 'win:clipstudiopaint.exe', pen: 'win:clipstudiopaint.exe', idle: LEAVE })`를 실행한다. `자리비움` 말풍선은 뜨지만 안내 창은 열리지 않는다.
- **내 방.** 방 창에서 `방에서 나가기`와 `만들기`로 내 방을 만든 뒤 `await fake({ app: null, idle: LEAVE })`를 실행한다. `자리비움` 말풍선은 뜨지만 안내 창은 열리지 않는다.
- **증거.** 안내 창, 취소 뒤 실행 화면, 나간 뒤 실행 화면, 다시 들어간 실행 화면, 작업 앱과 내 방에서 안내가 없는 실행 화면을 `s.shot`으로 남긴다.

## Gotchas

- 캐릭터를 왼쪽 버튼으로 짧게 누르면 메뉴가 열리지 않고 쓰다듬기가 된다([놀이](./play.md)).
- 방 창은 혼자일 때 참여 양식과 만들기 양식을 이 순서로 보여 주고 방에 들어가 있을 때 현재 방 정보를 보여 준다. 같은 창이라 내용만 바뀐다. 창 제목은 런처에서 `방 정보`로 열어도 `방 만들기 / 참여하기`다.
- 코드 복사 알림은 마지막으로 누른 창에 뜬다. 방 창의 `코드 복사`를 눌렀으면 실행 화면이 아니라 방 창에서 찾는다.
- 방 세션의 안내는 해요체다. `없는 방 코드예요. 코드를 다시 확인해 주세요.`, `주인이 지운 방이에요.`, `방에 들어가지 못했어요. 연결을 확인하고 다시 해 주세요.`, `앱을 새 버전으로 업데이트해야 방에 들어갈 수 있어요.`로 찾는다.
- 방 설정 창의 가챠 `아이템 넣기`는 접혀 있어서 아이템이 몇 개 없으면 `방 지우기`가 스크롤하지 않아도 보인다. 아이템이 늘거나 양식을 펼치면 스크롤해야 보이고 Playwright `click()`은 알아서 스크롤한다.
- `방 설정` 버튼은 내 방에 있을 때만 보인다. 개발 방 `DEVDEV`에서는 보이지 않는다.
- 내 방 코드는 실행마다 무작위로 바뀐다. 코드 값 대신 6자 코드가 보이는지로 확인한다.
- 앱은 유휴 시간을 500ms마다 받는다. `fakePlatform.idle`을 0으로 돌린 직후 바로 높은 값을 넣으면 앱이 0초 샘플을 받지 못해서 취소할 때 정한 기준이 그대로 남고 안내가 다시 뜨지 않는다. `await expect.poll(() => s.stage.evaluate(() => (window as any).core.ctxs.get('status').ctx.activity.last()?.idleSec)).toBe(0)`으로 기다린다.
- 가짜 플랫폼의 유휴 시간은 저절로 늘지 않는다. 취소 버튼을 눌러도 `fakePlatform.idle`은 그대로라서 실제 PC처럼 0이 되지 않는다. 앱은 취소한 때의 유휴 시간을 기준으로 다시 세므로 안내가 다시 뜨지 않는 것이 맞다.
- 안내가 열리지 않는 것을 보는 부정 확인은 `자리비움` 말풍선이 뜬 뒤 2초쯤 기다리고 열린 창 제목에 `자리비움 안내`가 없는지 본다.
- `가짜 친구`가 보인 직후에 찍은 실행 화면은 창 크기가 아직 한 좌석 폭이라 친구 좌석이 잘려 보일 수 있다. 기본 크기에서 좌석 두 개면 실행 화면 폭이 CSS 336px이다. `await expect.poll(() => s.stage.evaluate(() => innerWidth)).toBeGreaterThan(300)`으로 기다린 뒤 찍는다.
- 깨어난 뒤 다시 들어가기는 연결이 돌아올 때까지 기다린다. 들어가는 중에 다른 입장이나 나가기, 절전이 오면 그 입장은 안내 없이 취소된다.
- 정원이 찬 방으로 돌아오는 경우는 가짜 친구 한 명뿐인 개발 방에서 만들 수 없다. `src/modules/status/sim.test.ts`가 다룬다.
