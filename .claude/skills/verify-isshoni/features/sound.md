# 플레이리스트와 소리

플레이리스트 창에서 유튜브 곡을 프리셋 세 개에 나눠 담고 소개글을 적는다. 맨 위 프로필 줄에는 프로필 사진과 마이홈 공개 체크박스가 있다. 창을 작게 줄여 플레이어 줄만 남길 수 있고 물결 버튼으로 친구의 플리를 듣는다. 대화하기 창이 닫혀 있을 때 친구가 채팅을 보내면 알림음이 울리고 회사원 모드에서는 알림음과 백색소음이 나지 않는다.

## Sub-features

- `snd-05-profile`은 창 맨 위 프로필 줄에 프로필 사진, 이름, 레벨, 마이홈 공개 체크박스가 보이고 소개글을 적는 것이다 (SND-05).
- `snd-05-home`은 친구가 마이홈 공개를 켰으면 친구 플리 화면의 사진과 이름을 눌러 그 마이홈으로 가고 껐으면 버튼이 없는 것이다 (SND-05, HOM-10).
- `snd-03-preset`은 프리셋을 바꾸면 목록과 창 제목이 바뀌고 이름을 붙이는 것이다 (SND-03).
- `snd-04-mini`는 작게 보기로 창을 플레이어 줄만 남기고 크게 보기로 되돌리는 것이다. 재생 중인 플레이어는 그대로 남는다 (SND-04).
- `snd-07-pick`은 물결 버튼을 우클릭해 친구를 고르면 그 친구의 플리가 보이고 첫 곡부터 재생하는 것이다 (SND-07).
- `snd-06-surf`는 물결 버튼을 누르면 잠그지 않은 친구의 플리로 넘어가는 것이고 `snd-06-locked`는 잠근 플리가 나오지 않는 것이다 (SND-06).
- `com-03-heard`는 대화하기 창이 닫혀 있을 때 남의 메시지에 알림음이 울리는 것이다. 창이 열려 있거나 내가 보낸 메시지면 울리지 않는다 (COM-03).
- `com-03-setting`은 설정 창 일반 탭의 채팅 알림음에서 소리를 고르면 한 번 들려주는 것이다.
- `snd-08-quiet`는 회사원 모드에서 백색소음과 알림음이 나지 않는 것이다 (SND-08, COM-03).
- `snd-idle`은 소리가 없을 때 AudioContext가 멈춰 있는 것이다. 알림음은 울린 뒤 멈추고 백색소음은 음량이 0이면 깨우지 않으며 0으로 내리면 줄어든 뒤 멈춘다 (SND-08, COM-03).

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴에서 `플레이리스트`를 누른다.
- 재생 중이면 실행 화면 상태칩에 `♫`가 보이고 누르면 열린다. 재생 중이 아니면 이 칩은 없다.
- 친구 플리 화면에서 친구 사진이나 이름 버튼을 누르면 그 친구의 마이홈이 열린다. 친구가 마이홈 공개를 껐으면 버튼이 없다.
- 프로필 사진은 런처 [내 정보](./me.md)의 계정 탭이나 설정 창 `계정` 탭의 `사진 넣기`로 넣는다.
- 알림음은 실행 화면 ▼ 메뉴 구분선 아래 `설정`을 누르고 일반 탭의 `소리` 묶음에서 고른다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.
- 친구 플리와 알림음은 가짜 친구가 쓴 기록이 필요하다. 사용자가 화면에서 만들 수 없는 조건이라 스테이지에서 만든다. 메모리 서버의 쓰기는 부르는 순간 동기로 실행되므로 로그인을 가짜 친구로 바꿔 쓰고 같은 동기 구간에서 되돌린다.
  ```ts
  const asFriend = (writes: Array<{ ns: object; key: string; value: unknown } | { profile: object }>) =>
    s.stage.evaluate(async (ws) => {
      const c = (window as any).core;
      const sv = c.deps.server;
      void sv.identity.signIn('dev-devfriend');
      const done = ws.map((w: any) => ('profile' in w ? sv.profile.write('devfriend', w.profile) : sv.docs(w.ns).set(w.key, w.value)));
      void sv.identity.signIn(`dev-${c.deps.uid}`);
      await Promise.all(done);
    }, writes);
  ```
  내 친구 목록에 가짜 친구를 넣는 쓰기는 내 이름으로 한다. `s.stage.evaluate(() => { const c = (window as any).core; return c.deps.server.docs({ scope: 'user', module: 'friends', uid: c.deps.uid, path: ['list'] }).set('devfriend', { since: 1, v: 1 }); })`
- 친구 플리는 `asFriend([{ profile: { name: '가짜 친구', 'm/growth': { level: 7 } } }, { ns: { scope: 'user', module: 'sound', uid: 'devfriend' }, key: 'share', value: { p0: { name: '' }, p1: { name: '친구 작업곡', tracks: [{ v: 'dQw4w9WgXcQ', title: '친구 노래 하나' }] }, p2: { name: '' }, cur: 0, bio: '가짜 친구의 한마디', locked: false, v: 1 } }])`로 만든다. `home`을 빼면 마이홈 공개가 켜진 것으로 읽는다.
- 친구 프로필 사진은 스테이지에서 PNG 바이트를 만들어 `const hash = await c.deps.server.files.put(bytes)`로 올리고 `asFriend([{ ns: { scope: 'user', module: 'account', uid: 'devfriend' }, key: 'photo', value: hash }])`로 쓴다.
- 알림음 확인은 [방](./rooms.md)의 코드로 참여 순서대로 `DEVDEV` 방에 들어간 뒤에 한다. 가짜 친구의 메시지는 아래처럼 쓴다. `t`는 `Date.now()`이고 메시지마다 달라야 한다.
  ```ts
  const key = `${String(t).padStart(15, '0')}_devfriend`;
  await asFriend([{ ns: { scope: 'room', module: 'chat', room: 'DEVDEV', path: ['msgs'] }, key, value: { uid: 'devfriend', name: '가짜 친구', text, at: t, v: 1 } }]);
  ```

- **창 열기와 음량 0.** `const p = await menu(s, '플레이리스트', '플레이리스트')`와 `await p.getByLabel('플레이리스트 음량').fill('0')`을 실행한다. 맨 위에 `이름 없음`과 `Lv.1`, `checkbox "마이홈 공개" [checked]`, `textbox "소개글"`, `combobox "프리셋"`, `button "프리셋 이름 바꾸기"`, `button "파도타기 잠금"`이 있다. 사진을 넣은 뒤라면 이름 왼쪽에 `img "프로필 사진"`이 있다.
- **마이홈 공개.** `await p.getByRole('checkbox', { name: '마이홈 공개' }).uncheck()`를 실행하면 1초 뒤 서버 사본이 `{ home: false }`를 담는다. 아래 사본 확인과 같은 방법으로 본다.
- **소개글과 곡 추가.** `await p.getByLabel('소개글').fill('오늘도 같이 일해요')`, `await p.getByLabel('유튜브 링크').fill('https://youtu.be/dQw4w9WgXcQ')`, `await p.getByRole('button', { name: '+ 추가' }).click()`을 실행한다. 목록에 `dQw4w9WgXcQ`가 있고 `1/20`이 보인다.
- **프리셋 바꾸기.** `await p.getByLabel('프리셋', { exact: true }).selectOption({ label: '프리셋 2' })`를 실행한다. `await expect.poll(() => p.title()).toBe('프리셋 2')`이고 `0/20`이 보인다. 프리셋 1로 돌아가면 창 제목이 `플레이리스트`이고 `1/20`이다.
- **프리셋 이름.** `프리셋 이름 바꾸기`를 누르고 `await p.getByLabel('프리셋 이름').fill('Lofi')`와 `press('Enter')`를 실행한다. 창 제목과 고르기 칸이 `Lofi`가 된다.
- **잠금.** `await p.getByRole('button', { name: '파도타기 잠금' }).click()`을 실행한다. 버튼이 `aria-pressed="true"`이고 🔒로 바뀐다.
- **친구가 읽는 사본.** 바꾸고 1초 뒤 서버에 올라간다. `await expect.poll(() => s.stage.evaluate(() => { const c = (window as any).core; return c.deps.server.docs({ scope: 'user', module: 'sound', uid: c.deps.uid }).get('share'); })).toMatchObject({ bio: '오늘도 같이 일해요', locked: true })`로 확인한다.
- **축소 플레이어.** `await p.getByText('dQw4w9WgXcQ').dblclick()`으로 플레이어를 띄우고 `iframe`에 표시를 남긴 뒤 `await p.getByRole('button', { name: '작게 보기' }).click()`을 실행한다. `p.evaluate(() => innerHeight)`가 200 넘게 줄고 소개글 칸이 사라지며 표시한 `iframe`이 그대로 있다. `크게 보기`를 누르면 높이와 소개글이 돌아온다.
- **친구 골라 듣기.** `await p.getByRole('button', { name: '파도타기', exact: true }).click({ button: 'right' })`를 실행한다. `누구의 플리를 들을까요?`와 `button "가짜 친구"`가 보인다. 누르면 창 제목이 `가짜 친구님의 플리`이고 `Lv.7`, `가짜 친구의 한마디`, 친구 곡이 보이며 유튜브 링크 칸은 없다. 친구 사진을 썼으면 `button "마이홈 보기"` 안에 `img "프로필 사진"`이 보인다.
- **친구 마이홈.** 프로필 줄의 `button "마이홈 보기"`(사진)나 `getByRole('button', { name: '가짜 친구', exact: true })`(이름)를 누르면 `await windowTitled(s.app, '마이홈')`이 열리고 `가짜 친구님의 마이홈에 놀러 왔어요.`가 보인다.
- **친구가 마이홈 공개를 끔.** 가짜 친구 사본을 `home: false`로 다시 쓰고 `내 플리로`를 누른 뒤 친구를 다시 고른다. 사진과 이름은 보이지만 `button "마이홈 보기"`와 이름 버튼이 없다.
- **파도타기.** `내 플리로`를 누른 뒤 `파도타기`를 누른다. 창 제목이 다시 `가짜 친구님의 플리`가 된다. 가짜 친구 사본을 `locked: true`로 다시 쓰고 내 플리로 돌아가 `파도타기`를 누르면 `들을 수 있는 친구 플리가 없어요`가 보인다.
- **닫았다 다시 열기.** `await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === '플레이리스트')?.close())`로 제목 줄 ×와 같은 동작을 한다. 상태칩 `♫`를 누르면 같은 창이 다시 보이고 소개글이 남아 있다.
- **알림음 세기.** 소리는 화면에 남지 않으므로 스테이지의 `OscillatorNode`와 `AudioBufferSourceNode`를 만들 때마다 수를 세는 하위 클래스로 바꿔 둔다. 알림음 1은 음 하나, 알림음 2는 둘, 알림음 3은 셋을 만든다.
- **알림음.** 대화하기 창을 닫은 채 가짜 친구 메시지를 쓰면 실행 화면 말풍선이 뜨고 `OscillatorNode`가 1 늘어난다. `menu(s, '대화하기', '대화하기')`로 창을 연 동안의 친구 메시지와 내가 보낸 메시지에는 늘지 않는다.
- **알림음 고르기.** `설정` 창 일반 탭에서 `await settings.getByLabel('채팅 알림음').selectOption({ label: '알림음 3' })`을 실행하면 3 늘어난다. `끄기`로 두면 메시지가 와도 늘지 않는다.
- **회사원 모드.** 설정 창 `화면` 탭의 `회사원 모드`를 체크한다([설정 창](./settings.md)). 친구 메시지에 `OscillatorNode`가 늘지 않고 설정 창 `combobox "백색소음"`을 `빗소리`로 바꿔도 `AudioBufferSourceNode`가 0이다. 체크를 풀면 빗소리가 시작되어 1 이상이 된다.
- **소리 쉬기 (snd-idle).** 소리는 화면에 남지 않으므로 스테이지의 `window.AudioContext`를 만든 것을 배열에 모으는 하위 클래스로 바꿔 둔다. 설정 창 일반 탭에서 `채팅 알림음`을 `알림음 3`으로 고르면 배열의 상태가 `['suspended']`가 된다. `백색소음 음량`을 0으로 두고 `combobox "백색소음"`을 `빗소리`로 고른 뒤 메인 `fakePlatform.idle`을 0으로 두어 타이핑 중이 되어도 배열은 그대로 `['suspended']`다. 음량을 40으로 올리면 `['suspended', 'running']`, 다시 0으로 내리면 5초 안에 `['suspended', 'suspended']`가 된다.
- **증거.** 프로필 줄, 마이홈 공개를 끈 친구 플리, 프리셋, 축소 플레이어, 친구 고르기, 친구 플리, 친구 마이홈, 잠근 뒤 파도타기 안내, 알림음 뒤 실행 화면, 설정 창을 `s.shot`으로 남긴다.

## Gotchas

- 친구 플리 화면의 사진 버튼 이름은 `마이홈 보기`이고 이름 버튼 이름은 친구 이름이다. 친구 고르기 목록에도 같은 이름 버튼이 있으니 `exact: true`로 찾는다.
- 아이콘 버튼의 이름은 `aria-label`이다. `파도타기`는 `파도타기 잠금`과 겹치므로 `exact: true`로 찾는다. `이전 곡` 같은 예전 버튼은 이름이 ⏮ 같은 기호다.
- 창 제목이 고른 프리셋 이름이나 친구 이름으로 바뀐다. 프리셋을 바꾼 뒤 `windowTitled(s.app, '플레이리스트')`는 찾지 못하니 처음 받은 `Page`를 계속 쓴다.
- 유튜브 영상은 실제로 불러온다. 소리가 나지 않게 곡을 틀기 전에 음량을 0으로 둔다. 네트워크가 없으면 플레이어가 검게 보이지만 검증 순서에는 영향이 없다.
- 설정 창의 `combobox "백색소음"`은 `getByLabel('백색소음')`으로 찾으면 `백색소음 음량`과 겹친다. `getByRole('combobox', { name: '백색소음', exact: true })`로 찾는다.
- 친구 사본을 다른 사용자 이름으로 쓰면 메모리 서버가 `PERMISSION_DENIED`로 막는다. 위의 `asFriend`처럼 로그인을 잠깐 바꿔 쓴다.
- 축소 플레이어 크기 바꾸기와 실제 소리 출력은 Windows에서 확인하지 않았다.
