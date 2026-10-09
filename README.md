# isshoni-hatarakou

친구에게 선물하는 데스크톱 작업 메이트입니다. 기능 명세와 구조는 `docs/feature-spec/`에 있고 지금 코드는 10장의 M0 기반과 M1 첫 선물판 모듈입니다.

## 실행

- `npm run dev`로 개발판을 켭니다. Firebase 설정값이 없으면 메모리 서버로 켜지고 방 만들기 / 참여하기에서 방 코드 `DEVDEV`를 넣으면 가짜 친구가 있는 개발 방에 들어갑니다.
- Firebase 프로젝트를 쓰려면 저장소 맨 위에 `.env.production.local`을 만들고 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_APP_ID`를 적습니다. 배포용 빌드(`npm run build`, `npm run dist:win`)에만 들어가고 개발판과 `npm run e2e`는 메모리 서버로 켜집니다. CI는 저장소 변수의 같은 값을 씁니다.
- 친구 계정은 `GOOGLE_APPLICATION_CREDENTIALS`에 서비스 계정 파일 경로를, `FIREBASE_DATABASE_URL`에 데이터베이스 주소를 넣고 `npm run account:create -- <이름>`으로 만듭니다. 출력된 설정 코드를 친구에게 건넵니다.

## 검사

- `npm run check`는 타입 검사, lint, 모듈 경계 검사, 단위 시험, 규칙 파일 최신 여부를 확인합니다.
- `npm run test:emulator`는 Firebase 에뮬레이터로 보안 규칙과 서버 adapter 시험을 돌립니다. Java 21이 필요합니다.
- `npm run e2e`는 앱을 빌드해서 Playwright로 띄우고 부팅 시험을 돌립니다.
- Windows 실제 기기 점검은 `docs/checklists/windows-m0.md` 순서로 합니다.

## 새 기능 더하기

`src/modules/<id>/` 폴더 하나를 만들고 `src/modules/index.ts`에 import 한 줄을 더합니다. 모듈은 `ctx`로만 바깥에 접근합니다. 계약은 `src/renderer/core/types.ts`와 10.5에 있고 `src/modules/focus/`와 `src/modules/rooms/`가 예시입니다.

## 출시와 업데이트

1. `package.json`의 `version`을 올리고 `src/modules/notice/notes.ts` 맨 위에 그 버전의 바뀐 점을 적습니다. 업데이트한 뒤 처음 켤 때 이 내용이 창으로 한 번 뜹니다. 커밋한 뒤 같은 버전의 태그(`v0.1.0` 형식)를 올립니다.
2. GitHub Actions의 release가 Windows 설치 파일을 만들어 이 저장소의 GitHub Releases에 올립니다.
3. 켜져 있는 앱은 6시간 안에 새 버전을 받아 두고 스테이지의 다시 시작 버튼으로 설치합니다. 처음 설치할 때는 Releases 페이지에서 `isshoni-hatarakou-Setup-버전.exe`를 받습니다.

보안 규칙을 바꿨다면 앱보다 먼저 `GOOGLE_APPLICATION_CREDENTIALS`와 `FIREBASE_DATABASE_URL`을 넣고 `npm run rules:deploy`로 배포합니다. 친구 계정은 `npm run account:create -- 이름`으로 만들고 `-- --reset <uid>`로 설정 코드를 다시 만듭니다.

## 운영

우편함 글과 편지, 확성기, 버그 제보 읽기, 서버 조정값의 기간 이벤트는 `node scripts/ops.ts <명령>`으로 다룹니다. 명령과 옵션은 파일 맨 위 주석에 있고 환경 변수는 계정 발급과 같습니다. 예를 들어 `node scripts/ops.ts mail 제목 본문 --to 친구코드`는 편지를 보내고 `node scripts/ops.ts reports`는 받은 버그 제보를 보여 줍니다.
