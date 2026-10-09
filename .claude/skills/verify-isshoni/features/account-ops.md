# 계정과 운영

선물하는 사람이 `scripts/ops.ts`로 보낸 공지와 편지는 마이홈 우편함 탭과 상태칩 줄의 ✉에 보이고 확성기 글은 잠깐 모든 캐릭터 위에 뜬다. 업데이트한 뒤 처음 켜면 업데이트 소식 창이 한 번 뜬다. 친구는 마이홈 버그제보 탭에서 선물하는 사람에게만 가는 제보를 보내고 친구 창에서 오프라인으로 보이기를 켠다. 같은 캐릭터를 두 PC에서 다르게 바꾸면 캐릭터 맞추기 창에서 어느 쪽으로 맞출지 고른다. 서버 조정값의 기간 값은 그 기간에만 적용된다.

## Sub-features

- `mail-chip`은 읽지 않은 글이 있으면 상태칩 줄에 ✉와 수가 보이고 누르면 우편함 창이 열리는 것이다 (ACC-09).
- `mail-list`는 우편함의 전체, 공지, 업데이트, 우편 탭과 고정 글, 펼치면 읽음, 링크 열기, 전체 읽음이다 (ACC-09, OPS-01).
- `mail-home-tab`은 마이홈 우편함 탭에서 같은 목록과 읽음 표시가 보이는 것이다 (ACC-09).
- `updates-popup`은 업데이트한 뒤 처음 켤 때 업데이트 소식 창이 한 번만 뜨는 것이다 (OPS-17).
- `shout`은 확성기 글이 방의 모든 캐릭터 위에 정한 시간 동안 보이고 사라지는 것이다 (OPS-18).
- `report`는 마이홈 버그제보 탭에서 글을 보내고 진단 기록 폴더를 여는 것이다 (OPS-03).
- `offline`은 친구 창과 설정 일반 탭의 친구에게 오프라인으로 보이기, 표시를 켠 친구가 내 친구 목록에 오프라인으로 보이는 것이다 (FRD-06).
- `sync-takeover`는 다른 기기가 가져갔다가 여기서 계속 쓰기를 누르면 다른 PC에서 바꾼 캐릭터를 받는 것이다 (ACC-13).
- `conflict`는 두 PC에서 다르게 바꾼 캐릭터를 캐릭터 맞추기 창에서 고르고 고르지 않은 쪽이 이전 모습에 남는 것이다 (ACC-13, NFR-17).
- `event`는 서버 조정값의 기간 값이 기간 안에서만 레벨 보상 표에 보이는 것이다 (OPS-12).

## How to get to it (user POV)

- 실행 화면 상태칩 줄의 ✉를 누른다. 읽지 않은 글이 없으면 ✉가 없다.
- ▼ 메뉴 `마이홈`을 누르고 탭 줄의 `우편함`이나 `버그제보`를 누른다.
- 업데이트 소식 창과 캐릭터 맞추기 창은 저절로 뜬다.
- ▼ 메뉴 `친구`를 누르면 맨 위에 `친구에게 오프라인으로 보이기`가 있다. 설정 창 일반 탭의 친구 묶음에도 있다.
- 글, 확성기, 서버 조정값은 선물하는 사람이 `node scripts/ops.ts`로 쓴다. 이 하네스는 같은 기록을 메모리 서버에 쓴다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.
- 선물하는 사람이 쓰는 기록과 다른 PC, 친구의 기록은 화면에서 만들 수 없다. 개발판과 시험판의 `globalThis.devHub`로 메모리 서버에 쓰고 보고에 적는다. 내 uid는 `window.core.deps.uid`이다.
  ```ts
  type Hub = { write(p: string, v: unknown): void; read(p: string): unknown; now(): number };
  const hub = (fn: (h: Hub, uid: string) => unknown) =>
    s.stage.evaluate(`(${fn.toString()})(globalThis.devHub, window.core.deps.uid)`);
  ```
  `stage.evaluate`에 함수를 넘길 때 바깥 함수는 페이지 안에서 보이지 않는다. 필요한 계산은 넘기는 함수 안에 둔다.

- **글 받기.** `mod/notice/g/posts/a1`에 `{ tag: 'notice', title: '주말 이벤트', body: '첫 줄\n둘째 줄', link: 'https://example.com/', pin: true, at: now - 60000, v: 1 }`, `a2`에 고정하지 않은 공지, `mod/notice/u/<uid>/mail/b1`에 `tag: 'letter'` 편지를 쓴다. 상태칩 줄에 `button "우편함"`이 `✉3`으로 보인다.
- **우편함 창.** `s.stage.getByTitle('우편함')`을 누르면 `우편함` 창이 열리고 고정 글이 맨 위(`고정 공지`)에 있다. 글 머리를 누르면 본문과 `button "링크 열기"`가 보이고 ✉ 수가 하나 준다. `업데이트` 탭에는 앱에 든 `0.1.0 첫 버전`이, `우편` 탭에는 편지만 보인다. `전체 읽음`을 누르면 ✉가 사라지고 단추가 비활성이 된다.
- **마이홈 탭.** `menu(s, '마이홈', '마이홈')`에서 `button "우편함"`(exact)을 누른다. 같은 글이 보이고 `getByLabel('읽지 않음')`이 0개다.
- **업데이트 소식 창.** 새 세션에는 창이 뜨지 않고 notice의 기기 로컬 값이 `{ seenVersion: '0.1.0' }`이다. `window.core.ctxs.get('notice').ctx.local.update('device', () => ({ seenVersion: '0.0.9' }))`, `await window.core.flush()`, `window.bridge.invoke('stage.reload', {})`를 차례로 실행하면 `업데이트 소식` 창이 뜨고 `heading "0.1.0 버전으로 업데이트했어요"`와 `heading "0.1.0 첫 버전"`이 보인다. `확인`을 누르면 창이 닫히고 다시 읽어도 뜨지 않는다.
- **확성기.** `devdev` 방에 들어간 뒤 `mod/notice/g/shout`에 `{ text: '다들 힘내요', at: hub.now(), sec: 6, v: 1 }`를 쓴다. `getByText('📢 다들 힘내요')`가 2개(내 캐릭터와 가짜 친구) 보이고 6초 뒤 0개가 된다.
- **버그 제보.** 마이홈 `버그제보` 탭에서 `getByPlaceholder('언제 무엇을 했는데 어떻게 됐는지 적어 주세요')`에 적고 `보내기`를 누른다. `보냈어요. 답장은 우편함으로 와요.`가 보이고 `mod/report/u/<uid>/r` 아래에 text, ver, at, v 기록이 하나 생긴다.
- **진단 기록 폴더.** 실제 Finder가 뜨지 않게 먼저 `s.app.evaluate(({ shell }) => { globalThis.opened = []; shell.openPath = async (p) => (globalThis.opened.push(p), ''); })`를 실행한다. `진단 기록 폴더 열기`를 누르면 `opened`에 `logs`로 끝나는 경로가 하나 들어간다.
- **내 오프라인 표시.** `users/devfriend/public`에 이름, 서로의 `mod/friends/u/<uid>/list/devfriend`와 `mod/friends/u/devfriend/list/<uid>`에 `{ since: hub.now(), v: 1 }`, `users/devfriend/presence`에 `{ online: true, lastSeen: hub.now(), m: { rooms: { code: 'DEVDEV' } } }`를 쓴다. 친구 창에 `DEVDEV 방`이 보인다. `checkbox "친구에게 오프라인으로 보이기"`를 켜면 `users/<uid>/presence`가 `online: true`를 유지한 채 `m.friends.hidden`이 true가 된다.
- **오프라인으로 보이는 친구.** `users/devfriend/presence/m/friends`에 `{ hidden: true }`를 쓴다. 가짜 친구 줄이 `오프라인`이 되고 `같이 들어가기`가 비활성이 된다. 설정 일반 탭의 같은 체크 상자를 끄면 `hidden`이 false가 되고 친구 창 체크도 풀린다.
- **다른 PC 캐릭터 받기.** 캐릭터 만들기 2 책상 탭에서 `나무 책상`, 다시 열어 `하얀 책상`을 골라 저장한다. wardrobe 계정 로컬 값의 `synced[0]`이 `chars[0].mtime`과 같아진다. `users/<uid>/private/activeDevice`에 `{ id: 'otherpc', at: hub.now() }`를 쓰면 `여기서 계속 쓰기`가 보인다. 다른 PC 쪽으로 `mod/wardrobe/u/<uid>/chars/0`에 `{ appearance, mtime: hub.now(), v: 1 }`(appearance는 지금 외형에서 책상을 `wardrobe.desk.wood`로 바꾼 것, 그림 해시는 로컬 값 `desks`)를 쓰고 `여기서 계속 쓰기`를 누른다. 고르기 창 없이 로컬 슬롯 0의 책상이 나무 책상이 된다.
- **고르기 창.** 다른 PC 쪽으로 책상을 뺀 외형을 쓰고 이 PC에서 `작은 탁자`로 저장한다. `캐릭터 맞추기` 창이 뜨고 `캐릭터 1`과 이 PC, 다른 PC 미리보기가 보이며 서버 쪽은 그대로 책상이 없다. `다른 PC로 맞추기`를 누르면 창이 닫히고 로컬 슬롯 0에 책상이 없으며 캐릭터 만들기 `이전 모습` 탭에 `불러오기`가 생긴다(`mod/wardrobe/u/<uid>/trash`에 작은 탁자 외형). 다시 다른 PC 쪽으로 나무 책상을 쓰고 이 PC에서 `하얀 책상`으로 저장한 뒤 `현재 PC로 맞추기`를 누르면 서버 `chars/0`의 책상이 하얀 책상이 된다.
- **기간 이벤트.** `레벨 보상` 창에 `row "Lv.30 동물 캐릭터 만들기 29레벨 남음"`이 있다. `mod/wardrobe/g/tunables`에 `{ animalUnlockLevel: [{ value: 30 }, { value: 20, from: now - 1000, until: now + 15000 }] }`을 쓰고 창을 다시 열면 `Lv.20 ... 19레벨 남음`이 보인다. 16초 뒤 다시 열면 `Lv.30`으로 돌아와 있다.
- **증거.** 각 단계 뒤 창과 실행 화면을 `s.shot`으로 남기고 `errors.json`이 `[]`인지 본다.

## Gotchas

- 메모리 서버는 규칙을 검사하지 않는다. 글과 확성기를 앱이 쓰지 못하는 것, 제보를 다른 사람이 읽지 못하는 것, 오프라인으로 보이기를 켜도 폰 신호가 받아지는 것은 `src/modules/notice/rules.test.ts`, `src/modules/report/rules.test.ts`, `rules/tests/rules.test.ts` 에뮬레이터 시험이 맡는다.
- `stage.reload` 뒤에는 `evaluate`가 실행 문맥이 사라졌다는 오류를 낼 수 있다. `expect.poll` 안에서 `.catch(() => false)`로 감싼다.
- 탭을 누른 직후 찍은 화면은 눌림 표시가 0.15초 늦게 바뀌어 앞 탭이 눌린 것처럼 보일 수 있다. 결과는 ARIA 스냅샷으로 확인한다.
- 회사원 모드에서는 ✉와 확성기 말풍선이 보이지 않는다. 새 세션은 회사원 모드가 꺼져 있다.
- 기간 이벤트를 동물 캐릭터 만들기 단추로 확인하지 않는다. 해금 레벨에 한 번 닿으면 그 PC에서는 다시 잠기지 않는다(GRW-03).
- 실제 Firebase에서 두 PC로 고르기 창이 뜨는지는 이 하네스로 확인할 수 없다.
