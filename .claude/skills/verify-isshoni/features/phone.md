# 폰 연결

설정 창의 폰 연결 탭에서 연결 키를 만들면 QR이 보인다. 폰으로 QR을 찍어 안내 페이지를 열고 그림 앱이 열릴 때와 닫힐 때 신호를 보내는 자동화를 만들면 폰에서 그리는 동안 PC 캐릭터가 작업 자세가 되고 집중 시간이 쌓인다. 머리 위에는 폰 앱 이름이 보인다.

## Sub-features

- `phone-connect`는 연결하기, 링크 복사, 키 새로 만들기, 연결 끊기다 (FOC-09).
- `phone-qr`은 안내 페이지 주소가 정해져 있으면 QR이 보이고 그 QR이 연결 링크로 읽히는 것이다 (FOC-09).
- `phone-signal`은 열림 신호가 오면 신호를 받았어요가 3초 보이고 시간이 쌓이며 머리 위에 앱 이름이 보이는 것이다 (FOC-09). 앱 이름은 36자까지다.
- `phone-page`는 안내 페이지가 신호 주소 `sig/<키>.json`과 본문을 보여 주고 신호 보내 보기가 데이터베이스에 쓰는 것이다 (FOC-09).

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴 구분선 아래 `설정`을 누르고 `폰 연결` 탭을 누른다.
- 폰 쪽은 QR로 열린 안내 페이지(`hosting/phone/index.html`)다. 이 하네스는 폰 쪽을 다루지 않는다. 안내 페이지는 Gotchas의 방법으로 따로 연다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.
- 안내 페이지 주소(서버 조정값)와 폰 신호는 화면에서 만들 수 없다. 메모리 서버에 쓰는 함수를 둔다. 보고에 이 준비를 적는다.
  ```ts
  const write = (stage: Page, kind: 'sig' | 'oldsig' | 'tunable' | 'read', value: unknown = null) =>
    stage.evaluate(async ([k, v]) => {
      type Doc = { set(k: string, v: unknown): Promise<void>; get(k: string): Promise<unknown> };
      const core = (window as unknown as { core: { deps: { uid: string; server: { docs(ns: unknown): Doc } } } }).core;
      const { uid, server } = core.deps;
      const user = server.docs({ scope: 'user', module: 'phone', uid });
      if (k === 'tunable') return void (await server.docs({ scope: 'global', module: 'phone' }).set('tunables', v));
      if (k === 'read') return await user.get('sig');
      // 폰은 sig/<키>에 쓴다. oldsig는 지금 키가 아닌 칸이다
      const key = k === 'sig' ? await user.get('key') : 'f'.repeat(32);
      await user.set(`sig/${key as string}`, { ...(v as object), at: { '.sv': 'timestamp' } });
    }, [kind, value] as const);
  ```

- **탭 열기.** `const st = await menu(s, '설정', '설정')`과 `await st.getByRole('button', { name: '폰 연결' }).click()`을 실행한다. `아직 연결하지 않았어요.`와 `button "폰 연결하기"`가 보인다.
- **연결하기.** `폰 연결하기`를 누른다. `폰 신호를 기다리고 있어요.`와 `안내 페이지 주소가 아직 없어요.`가 보인다.
- **QR.** `await write(s.stage, 'tunable', { pageUrl: 'https://demo-isshoni.web.app/phone/' })`를 실행한다. `img "연결 QR 코드"`가 보인다. QR만 따로 찍어(`locator.screenshot`) macOS에서 읽으면 `https://demo-isshoni.web.app/phone/#<uid>.<키>`가 나온다. `링크 복사`를 누르면 클립보드(`clipboard.readText()`)에 같은 링크가 들어간다.
- **열림 신호.** 포커스 기록 창을 열어 두고 `await write(s.stage, 'sig', { open: true, app: 'Procreate' })`를 실행한다. 탭에 `신호를 받았어요.`가 3초 보인 뒤 `연결됨. 폰에서 Procreate 쓰는 중이에요.`가 된다. 실행 화면 머리 위에 `폰에서 Procreate`가 보이고 캐릭터가 깨어 있다. 등록 앱이 앞에 없어도 포커스 기록 창 `오늘`이 늘어난다.
- **긴 앱 이름.** `await write(s.stage, 'sig', { open: true, app: '가'.repeat(36) })`를 실행한다. 머리 위에 `폰에서 가가가...`가 보인다. 제어 문자 36개(`'\u0001'.repeat(36)`)처럼 128바이트를 넘는 이름을 보내면 머리 위에 `폰에서 작업 중`이 보이고 `errors.json`은 빈 배열이다.
- **닫힘 신호.** `await write(s.stage, 'sig', { open: false, app: 'Procreate' })`를 실행한다. `연결됨. 폰에서 쉬는 중이에요.`가 되고 머리 위 앱 이름이 사라진다.
- **키 새로 만들기와 연결 끊기.** `키 새로 만들기`를 누르면 `폰 신호를 기다리고 있어요.`가 되고 `await write(s.stage, 'read')`가 `null`이 된다(예전 키 칸을 지움). 이어서 `await write(s.stage, 'oldsig', { open: true, app: 'Old' })`를 실행해도 탭은 기다리는 중 그대로이고 머리 위에 `폰에서 Old`가 보이지 않는다. `연결 끊기`를 누르면 `아직 연결하지 않았어요.`로 돌아온다.
- **증거.** 주소가 없을 때의 탭, QR이 보이는 탭, QR만 찍은 그림, 신호를 받은 탭, 머리 위 앱 이름이 보이는 실행 화면, 포커스 기록 창을 `s.shot`으로 남긴다.

## Gotchas

- macOS에서 QR을 읽으려면 CoreImage 검출기를 쓰는 짧은 Swift 스크립트를 저장소 밖에 두고 `swift read.swift <png>`로 돌린다. `CIDetector(ofType: CIDetectorTypeQRCode, ...)`의 `CIQRCodeFeature.messageString`을 출력하면 된다.
- 메모리 서버는 규칙을 검사하지 않는다. 로그인하지 않은 폰 쓰기와 키 확인은 `src/modules/phone/rules.test.ts` 에뮬레이터 시험이 맡는다.
- 안내 페이지(`phone-page`)는 데이터베이스 에뮬레이터 안에서 Playwright Chromium으로 연다. `emulators:exec --only database`로 스크립트를 돌리고 스크립트가 `database.rules.json`을 관리자 토큰(`Authorization: Bearer owner`)으로 `.settings/rules.json`에 올린 뒤 `users/<uid>/public/friendCode`, `users/<uid>/presence/online: true`, `mod/phone/u/<uid>/key`를 넣는다. 페이지 파일을 작은 HTTP 서버로 내보내고 `http://127.0.0.1:<포트>/phone/?db=<에뮬레이터 주소>#<uid>.<키>`를 연다. `#url`이 `<db>/mod/phone/u/<uid>/sig/<키>.json`이고 `신호 보내 보기`를 누르면 `보냈어요. PC 화면을 확인해 주세요.`가 보인다. online을 false로 바꾸고 다시 누르면 `PC가 꺼져 있거나 연결 키가 바뀌었어요.`가 보인다.
- 신호를 받았어요 표시는 3초 동안만 보인다. 이 글을 먼저 기다리고 다음 상태 글을 기다린다.
- 실제 폰 자동화(단축어, MacroDroid)와 안내 페이지는 이 하네스로 확인할 수 없다.
