# 창과 OS 연동

이미 열린 기능 창을 ▼ 메뉴로 다시 열면 그 창이 다른 창 위로 올라오고 입력란이 있는 창은 포커스를 받는다. 닫아서 숨긴 플레이리스트 창은 위치가 화면 밖이면 가운데에 다시 뜬다. 화면을 숨기면 메인 프로세스가 커서 위치를 읽지 않고 다시 보이면 함께 숨긴 창을 맨 위로 올린다. 컴퓨터 켤 때 자동 실행은 OS 로그인 항목을 기준으로 시작할 때 설정 창에 맞춘다. 대상 고르기 동안 가져온 전역 ESC는 고르기가 끝나거나 스테이지가 다시 만들어지거나 10초가 지나면 풀린다. Windows 로그오프가 시작되면 앱이 저장하고 스스로 끝난다.

## Sub-features

- `o2-reopen`은 열린 창을 다시 열면 메인이 그 창을 맨 위로 올리고 포커스를 받는 창에만 포커스를 주는 것이다.
- `m9-double`은 같은 창을 빠르게 두 번 열어도 창이 하나만 열리는 것이다.
- `o10-offscreen`은 숨긴 플레이리스트 창이 화면 밖에 있으면 다시 열 때 작업 영역 안으로 오는 것이다.
- `stage-hide`는 화면 숨기기 동안 커서 위치를 읽지 않고 다시 보일 때 함께 숨긴 창을 맨 위로 올리는 것이다 (SET-03).
- `o7-autostart`는 일반 탭 `컴퓨터 켤 때 자동 실행`이 OS 값을 따르는 것이다 (SET-01).
- `esc-release`는 대상 고르기 중 스테이지가 죽거나 10초가 지나면 전역 ESC가 풀리는 것이다.
- `m11-logoff`는 로그오프 확인 단계에서 바로 전에 바꾼 설정을 저장하고 앱이 끝나는 것이다.
- `m13-permission`은 웹 권한 요청이 거절되는 것이다.
- `o16-nogpu`는 `ISSHONI_NO_GPU=1`이나 데이터 폴더의 `no-gpu` 파일로 하드웨어 가속을 끄는 것이다.
- `panel-dpr`은 패널 창의 캐릭터 미리보기가 스테이지가 아니라 그 창이 있는 모니터의 배율로 그려지는 것이다.

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴에서 이미 열린 창 이름을 한 번 더 누른다.
- 플레이리스트 창의 닫기 단추를 누르고 ▼ 메뉴 `플레이리스트`로 다시 연다.
- 설정 창 화면 탭에서 `회사원 모드`를 켜고 상태칩의 ▪ 버튼을 누른다. 트레이 메뉴 `보이기/숨기기`나 Ctrl+Alt+H로 다시 띄운다.
- 설정 창 `일반` 탭 시스템 묶음의 `컴퓨터 켤 때 자동 실행`을 누른다.
- 대상 고르기는 대화하기 창 💣나 다른 사용자 메뉴의 폭탄 던지기로 시작한다. 레벨이 낮으면 잠겨 있다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.
- 메인의 창 메서드 호출은 화면에 보이지 않으니 `s.app.evaluate`로 `BrowserWindow.prototype`의 `moveTop`, `showInactive`, `focus`, `center`를 감싸 창 제목과 함께 `globalThis.calls`에 모은다.

- **다시 열기.** `await menu(s, '포커스 기록', '포커스 기록')`을 두 번 실행한다. 두 번째 뒤 기록은 `포커스 기록:showInactive`, `포커스 기록:moveTop`이다. `상태 고르기`로 같은 순서를 하면 끝에 `상태 고르기:focus`가 더해진다. 같은 제목의 창은 하나다.
- **두 번 열기.** 스테이지에서 `window.open`을 세는 함수로 감싼 뒤 `const w = core.registry.windows.get('status.pick')`과 `await Promise.all([core.windows.show(w.decl, w.ctx), core.windows.show(w.decl, w.ctx)])`를 실행한다. `window.open`은 한 번 불리고 `상태 고르기` 창은 하나다. 사용자가 이만큼 빠르게 누를 수 없어서 코어 함수를 직접 부른다.
- **화면 밖 플레이어.** `await menu(s, '플레이리스트', '플레이리스트')` 뒤 메인에서 그 창의 `close()`와 `setBounds({ x: -6000, y: -6000 })`을 부른다. 창은 숨겨진 채로 남는다. 메뉴로 다시 열면 기록에 `플레이리스트:center`가 있고 창이 보이며 위치가 `screen.getDisplayMatching(b).workArea` 안이다.
- **화면 숨기기.** `fakePlatform`의 `cursor`를 읽을 때마다 세는 getter로 바꾼다. 보이는 동안 0.5초에 10번쯤 읽는다. 포커스 기록과 설정 창을 열고 회사원 모드의 ▪ 버튼을 누르면 스테이지와 두 창의 `isVisible()`이 false이고 0.5초 동안 한 번도 읽지 않는다. `await s.stage.evaluate(() => window.bridge.invoke('stage.setVisible', { visible: true }))`로 다시 띄우면 세 창이 보이고 `moveTop` 기록에 `설정`과 `포커스 기록`이 있으며 다시 읽기 시작한다.
- **자동 실행.** 설정 창 `일반` 탭의 `컴퓨터 켤 때 자동 실행`을 체크하면 `fakePlatform.autoStartOn`이 true가 되고 다시 연 설정 창에서도 체크되어 있다. `fakePlatform.autoStartOn = false`로 OS에서 끈 상태를 만들고 `bridge.invoke('stage.reload', {})`로 다시 시작한 뒤 런처에서 시작하기를 누르면 체크가 풀려 있다.
- **ESC 풀기.** 방 `devdev`에 들어가 `void core.pickTarget(20_000)`으로 고르기를 시작한다. 실행 화면에 `누구에게 할지 캐릭터를 눌러 주세요`가 뜨고 `globalShortcut.isRegistered('Escape')`가 true다. 메인에서 스테이지의 `webContents.forcefullyCrashRenderer()`를 부르면 5초 안에 false가 된다. 새 세션에서 `bridge.invoke('pick.escape', { on: true })`만 부르면 10초쯤 뒤 false가 된다.
- **로그오프.** 설정 창 화면 탭의 `테마`를 `dark`로 고른다. `s.stage.evaluate(() => window.bridge.invoke('store.read', { path: 'settings.json' }))`가 `modules.core.values.theme`에 `dark`를 주면 메인이 값을 들고 있는 것이다. 이때 미리 읽어 둔 `app.getPath('userData')`의 `settings.json`에는 아직 `"dark"`가 없다. 바로 메인에서 모든 창에 `w.emit('query-session-end', { preventDefault() {}, reasons: ['logoff'] })`를 낸다. 앱 프로세스가 1초 안에 끝나고 파일에 `"dark"`가 있다. 새 세션에서 같은 순서로 테마를 고른 뒤 확인 단계 없이 첫 창에 `w.emit('session-end', { reasons: ['logoff'] })`만 내도 앱이 바로 끝나고 파일에 `"dark"`가 있다.
- **권한.** `await s.stage.evaluate(() => Notification.requestPermission())`이 `denied`다.
- **하드웨어 가속.** 스크립트에서 `process.env.ISSHONI_NO_GPU = '1'`을 정한 뒤 `verify()`를 부른다. `app.getGPUFeatureStatus().gpu_compositing`이 `enabled`로 시작하지 않고 데이터 폴더의 `logs/diagnose.txt`에 `하드웨어 가속: 꺼짐` 줄이 있으며 캐릭터가 그대로 그려진다.
- **패널 배율.** 배율이 다른 모니터가 없으니 런처 창의 배율을 CDP로 3배로 흉내 내고 보고에 적는다. 런처의 첫 `canvas`는 `width`가 `160 * devicePixelRatio`다. `const cdp = await s.app.context().newCDPSession(s.launcher)` 뒤 `await cdp.send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: 3, mobile: false })`를 실행하면 런처의 `devicePixelRatio`가 3이 되고 캔버스 `width`가 480으로 다시 그려진다. 스테이지의 `devicePixelRatio`는 그대로다.
- **증거.** 다시 연 창, 다시 연 플레이어, 숨겼다 보인 실행 화면, 고르는 중인 실행 화면, 자동 실행 체크 전과 뒤의 설정 창을 `s.shot`으로 남긴다.

## Gotchas

- 로그오프와 `session-end` 확인은 앱이 스스로 끝난다. 끝난 뒤에는 `s.app.evaluate`를 부를 수 없으니 데이터 폴더 경로를 먼저 읽어 둔다. `session-end`를 내는 `evaluate`는 앱이 끝나면서 실패하므로 `.catch`로 삼킨다.
- 설정 창, 상태 고르기, 플레이리스트는 포커스를 받는 창이다. 포커스를 받지 않는 창은 포커스 기록, 달성표, 보관함 등이다.
- 메인의 `close()`는 사용자가 닫기 단추를 누른 것과 같다. 플레이리스트는 숨기기만 하고 렌더러의 `window.close()`는 실제로 닫는다.
- Ctrl+Alt+H는 Playwright가 누를 수 없다. 메인에서 `globalShortcut.isRegistered('Control+Alt+H')`가 true인지만 본다.
- 이 하네스로 다른 앱 뒤에 창이 남는 문제, Windows 로그오프 메시지, 실제 시작 앱 값, 트레이 왼쪽 클릭은 확인할 수 없다. `docs/checklists/windows-m0.md`의 항목으로 보고한다.
- 이 Mac에서 켜면 Dock 아이콘이 없고 앱 메뉴와 편집 메뉴만 있다. `Menu.getApplicationMenu().items.map((i) => i.role)`이 `['appmenu', 'editmenu']`다.
