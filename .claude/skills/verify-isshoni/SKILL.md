---
name: verify-isshoni
description: isshoni-hatarakou 데스크톱 앱을 실제로 켜고 사용자처럼 눌러서 기능 동작을 증명한다. 화면이나 모듈을 고친 뒤 완료를 보고하기 전, 버그 제보를 재현할 때, 어떤 기능이 지금 동작하는지 확인할 때 쓴다.
---

# isshoni-hatarakou 검증

검증은 앱을 실제로 켜고 사용자가 누르는 경로로 기능을 조작한 뒤 결과를 증거로 남기는 일이다. 단위 시험 통과나 내부 함수 호출 결과는 증거가 아니다.

실행 단위는 짧은 세션이다. `drive.ts`의 `verify()`가 실행마다 새 `--user-data-dir`, 가짜 플랫폼(`ISSHONI_FAKE_PLATFORM=1`), 메모리 서버로 앱을 따로 켜고 끝나면 그 실행이 켠 것만 정리한다. 세션끼리 상태를 나누지 않으므로 검증 여러 개를 동시에 돌려도 된다.

기능별 진입 경로와 조작 순서는 [`features/README.md`](features/README.md)에 있다. 조작하기 전에 읽는다.

## Launch

1. 저장소 맨 위에서 `npx electron-vite build --mode e2e`로 빌드한다. 3초 정도 걸린다.
2. 검증 스크립트를 저장소 바깥에 쓴다. 예를 들어 `$TMPDIR/isshoni-checks/rooms.ts`에 쓰고 같은 폴더에 `{ "type": "module" }`만 담은 `package.json`을 둔다. 저장소 안에 두면 `npm run lint`가 스크립트까지 검사한다.
3. `node rooms.ts`로 실행한다. Node가 타입 표기를 지우고 바로 돌린다.

```ts
import { expect, menu, verify } from '<저장소 절대 경로>/.claude/skills/verify-isshoni/drive.ts';

await verify('rooms', async (s) => {
  await s.launcher.getByText('시작하기').click();
  await s.stage.locator('button[title="메뉴"]').waitFor();
  const rooms = await menu(s, '방 만들기 / 참여하기', '방 만들기 / 참여하기');
  await rooms.getByPlaceholder('예: 7Q2K9M').fill('devdev');
  await rooms.getByRole('button', { name: '참여' }).click();
  await expect(s.stage.getByText('가짜 친구')).toBeVisible();
  await s.shot(s.stage, 'room-join');
});
```

준비가 끝났다는 신호는 제목이 `Isshoni Hatarakou`인 런처 창이다. `verify()`가 이 창이 열리기를 기다린 뒤 본문을 실행한다. 정리는 따로 할 일이 없다. `verify()`가 끝날 때 처리한다.

## Doctor

`node .claude/skills/verify-isshoni/drive.ts doctor`가 `doctor ok`를 출력하면 지금 빌드로 검증해도 된다. 읽기만 하는 검사이고 세 가지를 본다.

- `out/`에 main, preload, renderer 빌드가 모두 있는지
- 빌드에 Firebase 설정이 들어가지 않았는지
- `src/`의 모든 파일이 빌드보다 오래됐는지

문제가 있으면 다시 빌드하라는 줄을 출력하고 종료 코드 1로 끝난다. `verify()`도 시작할 때 같은 검사를 하고 실패하면 앱을 켜지 않는다. 조작 도중 화면이 예상과 다르면 그 세션을 버리고 새 `verify()`로 다시 시작한다.

## Drive

Playwright `_electron` API로 조작한다. `verify()` 본문이 받는 `Session`에는 이 값들이 들어 있다.

- `app`은 `ElectronApplication`이다. `app.evaluate`로 메인 프로세스를 조작한다.
- `stage`는 첫 창이다. 런처에서 `시작하기`를 누르면 캐릭터와 상태칩이 있는 실행 화면이 된다.
- `launcher`는 런처 창이다.
- `shot(page, name)`은 증거를 남긴다. Evidence 절을 본다.
- `dir`과 `errors`는 증거 폴더 경로와 스테이지 오류 목록이다.

요소는 role과 접근 가능한 이름, placeholder, label로 찾고 결과는 `expect`로 기다린다. 고정 대기는 쓰지 않는다. 기능 창은 모두 별도 창이고 창 제목이 메뉴 항목 이름과 같다. `menu(s, 항목, 창 제목)`은 실행 화면의 ▼ 메뉴에서 항목을 누르고 열린 창을 돌려준다. 메뉴를 거치지 않고 열린 창은 `windowTitled(s.app, 제목)`으로 찾는다.

사용자가 화면에서 만들 수 없는 조건은 메인 프로세스에서 만든다.

- 앞에 있는 앱과 유휴 시간은 `globalThis.fakePlatform`의 `app`(예 `win:paint.exe`)과 `idle`(초)로 바꾼다.
- 파일 고르기 대화상자는 `dialog.showOpenDialog`를 바꿔서 시험용 파일 경로를 돌려준다. `tests/e2e/boot.spec.ts`에 예가 있다.

## Evidence

- 위치는 `$TMPDIR/isshoni-verify/<이름>-<무작위 6자>/`이다. `verify()`가 끝날 때 `evidence:` 줄로 경로를 출력한다.
- `s.shot(page, name)`은 `<name>.png` 화면과 `<name>.aria.txt` ARIA 스냅샷을 함께 남긴다. 사용자 동작 직후와 결과가 보이는 시점에 각각 찍는다.
- `errors.json`에는 스테이지의 pageerror와 console.error가 들어 있다. 빈 배열일 때만 통과로 본다.

증명 기준은 이렇다.

- 사용자가 누르는 경로로 조작한다. `window.core`나 `fakePlatform`으로 상태를 바꾸는 일은 사용자가 화면에서 만들 수 없는 준비 조건에만 쓰고 보고에 무엇을 바꿨는지 적는다.
- 동작과 결과 상태를 함께 남긴다. 저장이나 등록 같은 변경은 다른 창이나 다시 연 창에서 한 번 더 읽어서 확인한다.
- 이 하네스는 메모리 서버와 가짜 플랫폼 위에서 돈다. Firebase 보안 규칙(`npm run test:emulator`), 실제 활성 창 감지, Windows 전용 동작(`docs/checklists/`)은 이 하네스로 증명할 수 없으니 확인하지 않은 항목으로 보고한다.

## Measure

`node .claude/skills/verify-isshoni/measure.ts`는 앱을 켜고 상태마다 메모리와 CPU를 잰다 (NFR-10). 빌드와 doctor 조건은 Launch와 같고 한 번 도는 데 9분쯤 걸린다. `--soak 60`처럼 소크 시간을 초로 주면 짧게 돈다.

- 재는 값은 프로세스마다 `/usr/bin/footprint`의 phys_footprint(활성 상태 보기의 메모리 열), `app.getAppMetrics()`의 workingSetSize, 스테이지의 `performance.memory`와 CDP로 GC를 한 번 돌린 뒤의 힙, `ps`의 CPU 시간 차이로 구한 15초 평균 CPU(코어 하나 기준 퍼센트, 프로세스별로도 남긴다), 열린 창, 메모리 서버 구독 수, 측정을 시작한 뒤 스테이지에 새로 생겨 아직 살아 있는 타이머 수다.
- 상태는 런처, 혼자 실행 화면, 방 2좌석과 10좌석에서 깨어 있을 때(앞 앱 clipstudiopaint.exe, 유휴 0초)와 잠들었을 때(유휴 600초), 설정과 캐릭터 만들기와 마이홈과 대화하기를 열었을 때와 닫은 뒤(1회와 3회), 플레이리스트에 유튜브 영상을 띄웠을 때와 창을 닫아 숨겼을 때, 방에서 20초마다 춤 효과를 돌리는 소크(기본 5분, 30초마다 표본)다. 10좌석은 가짜 친구 기록을 복제한 멤버 8명으로 채운다.
- 결과는 표로 찍고 증거 폴더에 `measure.json`으로 남긴다. 소크 줄은 처음 표본과 마지막 표본의 차이로 증가를 보여 준다.
- 이 하네스로 재지 못하는 것은 Windows의 private bytes와 실제 Firebase 리스너 수다. 메모리 서버 구독 수가 Firebase 빌드의 onValue 수와 같다.
- 유튜브 영상은 실제로 불러오므로 네트워크가 필요하다. 없으면 플레이어가 검게 보이고 그 두 상태의 값만 달라진다.

## Cleanup

`verify()`가 끝날 때 그 실행이 켠 앱을 닫고 임시 데이터 폴더를 지운다. 앱이 닫히지 않으면 그 실행이 띄운 프로세스만 종료한다. 사용자가 켠 개발판도 같은 Electron 프로세스 이름으로 떠 있을 수 있으니 정리는 항상 이 방식으로만 한다. 증거 폴더는 남긴다. 쌓인 증거는 사용자가 원할 때 `rm -rf $TMPDIR/isshoni-verify`로 지운다.

## Helpers

`drive.ts`가 내보내는 것

- `verify(name, body)`는 앱을 켜고 `body`를 실행한 뒤 정리한다.
- `menu(s, item, title)`은 ▼ 메뉴 항목을 눌러 열린 창을 돌려준다.
- `windowTitled(app, title)`은 제목으로 창을 찾는다. 5초 안에 없으면 예외를 던진다.
- `doctor()`는 문제 목록을 돌려준다. 빈 배열이면 정상이다.
- `measure.ts`는 내보내는 것 없이 실행만 한다. Measure 절을 본다.
- `evidenceRoot`는 증거 폴더의 상위 경로다.
- `expect`는 `@playwright/test`의 `expect`를 그대로 내보낸 것이다. 테스트 러너 밖에서도 자동 대기와 `expect.poll`, `toPass`가 동작한다.

## Gotchas

- `npm run build`나 `--mode e2e` 없는 `electron-vite build`는 `.env.production.local`을 읽어서 실제 Firebase에 붙는 빌드를 만든다. 검증용 빌드는 항상 `--mode e2e`로 만든다. Doctor가 잘못된 빌드를 잡아낸다.
- 빌드는 `out/`을 덮어쓴다. 다른 작업이 `npm run e2e`를 돌리는 중이면 끝난 뒤에 빌드한다.
- 실행하는 몇 초 동안 앱 창이 실제 화면에 뜬다.
- 기능을 더하거나 바꾸면 `/maintain-verification-skill`로 지도를 맞춘다.
