# 설정 코드와 오프라인 시작

처음 켠 PC는 설정 코드 입력 창을 띄운다. 코드를 넣고 시작하기를 누르면 창이 열린 채로 확인 중 표시가 뜨고 로그인되면 창이 닫히며 런처가 뜬다. 실패하면 코드 형식, 인터넷 연결, 맞지 않는 코드 가운데 실제 이유를 창 안에 띄운다. 창을 닫으면 다시 열린다. 로그인한 PC는 인터넷이 끊겨 있어도 3초쯤 뒤에 런처와 실행 화면을 띄운다. 그동안은 이 PC에서 마지막으로 쓴 이름을 보이고 연결되면 서버의 이름으로 맞춘다. 다른 PC에서 바꾼 이름이 있으면 그 이름이 이기고 연결되기 전에 이 PC에서 정한 이름이 있으면 그 이름이 남는다.

## Sub-features

- `setup-open`은 첫 실행에서 `설정 코드 입력` 창이 뜨는 것이다 (10.7.2 신원).
- `setup-error`는 실패 이유를 창 안의 안내로 띄우고 창을 열어 둔 채 다시 넣게 하는 것이다.
- `setup-pending`은 확인하는 동안 입력 칸과 버튼이 잠기고 버튼 글이 `확인하는 중이에요`로 바뀌는 것이다.
- `setup-reopen`은 창을 닫아도 앱이 멈춘 채로 남지 않고 창이 다시 열리는 것이다. 앱 끝내기는 트레이 메뉴에 있다.
- `offline-start`는 로그인한 PC가 오프라인으로 켜져도 3초쯤 뒤에 런처와 실행 화면이 뜨는 것이다.
- `offline-name`은 오프라인으로 켠 PC가 마지막으로 쓴 이름을 보이고 그 이름을 서버에 쓰지 않는 것이다.

## How to get to it (user POV)

- 설정 코드로 로그인한 적이 없는 PC에서 앱을 켠다.
- 설정 일반 탭의 연결 해제 뒤 앱이 다시 시작될 때도 뜬다.
- 오프라인 시작은 로그인한 PC를 인터넷 없이 켤 때 일어난다.

## Driving it with drive.ts

Preconditions:

- 메모리 서버 빌드는 설정 코드 없이 개발 계정으로 들어가서 이 창이 뜨지 않는다. 가짜 Firebase 설정으로 빌드한다. `VITE_FIREBASE_DATABASE_URL=https://demo-isshoni-verify.firebaseio.com VITE_FIREBASE_API_KEY=fake-key VITE_FIREBASE_PROJECT_ID=demo-isshoni-verify npx electron-vite build --mode e2e`
- `verify()`는 Firebase 설정이 든 빌드를 거부하므로 `drive.ts`의 `verify()`와 같은 방식(새 `--user-data-dir`, `ISSHONI_FAKE_PLATFORM=1`)으로 `_electron.launch`를 직접 부른다. 끝나면 `npx electron-vite build --mode e2e`로 다시 빌드해서 `doctor ok`를 확인한다.
- Google 서버에는 가지 않는다. 메인에서 `app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['wss://*.firebaseio.com/*', 'https://*.firebaseio.com/*'] }, (_d, cb) => cb({ cancel: true })))`로 데이터베이스 연결을 막아 둔다.
- 올바른 형식의 코드는 `src/renderer/server/firebase/setup-code.ts`의 `encodeSetupCode('friend@example.invalid', 'pw-123456')`로 만든다.

- **창 열림.** 제목이 `설정 코드 입력`인 창이 뜬다. `textbox "설정 코드"`와 `button "시작하기"`가 있다.
- **형식 오류.** `abc`를 넣고 시작하기를 누른다. 창이 열린 채로 `alert`에 `설정 코드 형식이 맞지 않습니다. 받은 코드를 그대로 붙여 넣어 주세요.`가 뜬다.
- **확인 중과 연결 오류.** 메인에서 `https://*.googleapis.com/*` 요청을 `setTimeout(() => cb({ cancel: true }), 2500)`으로 붙잡는다. 올바른 형식의 코드를 넣고 누르면 `button "확인하는 중이에요"`가 잠긴 채로 보이고 2.5초 뒤 `alert`에 `인터넷 연결을 확인한 뒤 다시 시도해 주세요.`가 뜨며 `시작하기`가 다시 눌린다.
- **닫으면 다시 열림.** 메인에서 `BrowserWindow.getAllWindows().find((w) => w.getTitle() === '설정 코드 입력')?.close()`를 실행한다. 창이 닫힌 뒤 빈 `설정 코드 입력` 창이 새로 뜬다.
- **오프라인 시작.** 메인에서 `session.defaultSession.protocol.handle('https', ...)`로 `googleapis.com` 요청에 가짜 로그인 응답(`accounts:signInWithPassword`는 `idToken`이 든 응답, `accounts:lookup`은 `users` 하나, `OPTIONS`는 CORS 머리글만)을 주고 나머지는 `net.fetch(req, { bypassCustomProtocolHandlers: true })`로 넘긴다. `idToken`은 `exp`와 `iat`가 든 서명 없는 JWT면 된다. 코드를 넣고 누르면 창이 닫히고 3초쯤 뒤 런처가 뜬다. 시작하기를 누르면 실행 화면에 `이름 없음 Lv.1`과 ▼ 버튼이 보이고 `core.deps.server.connection.online()`은 `false`다.
- **오프라인 이름.** 오프라인 시작 뒤 설정 창 계정 탭에서 닉네임을 `토끼`로 저장하고 앱을 닫는다. 같은 `--user-data-dir`로 다시 켜면 설정 코드 창 없이 3초쯤 뒤 런처가 뜨고 런처와 실행 화면에 `토끼`가 보인다. `core.deps.profile`은 `undefined`이고 `core.self.get().name`은 `토끼`다. 서버에 쓰지 않는 것과 연결된 뒤 서버 이름으로 바뀌는 것은 가짜 서버가 없어서 `src/modules/account/account.test.ts`가 맡는다.
- **증거.** 단계마다 창과 실행 화면을 찍는다. 스크립트가 끊은 요청 때문에 `errors.json`에 `net::ERR_BLOCKED_BY_CLIENT`와 `WebSocket connection to 'wss://demo-isshoni-verify.firebaseio.com/.ws?v=5' failed`가 남는다. 이 두 종류만 있으면 통과로 본다. `.lp`를 막았다는 CSP 오류가 있으면 웹소켓 고정이 깨진 것이다.

## Gotchas

- 이 빌드는 `out/`을 덮어쓴다. 다른 검증을 돌리기 전에 꼭 `--mode e2e`로 다시 빌드한다. `doctor`가 가짜 설정이 남은 빌드를 잡는다.
- 연결 오류 안내는 로그인 요청이 끊겼을 때만 뜬다. 가짜 응답 없이 실제 Google 서버로 가면 키가 가짜라 `설정 코드로 로그인하지 못했습니다.`가 뜬다. 이 검증에서는 실제 서버로 보내지 않는다.
- 연결된 뒤 이름을 채우는 동작은 가짜 서버가 없어서 이 방법으로 볼 수 없다.
