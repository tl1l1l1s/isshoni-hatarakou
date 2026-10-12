# 배포·운영 가이드

관리자가 Firebase를 연결하고 계정을 발급하며 앱을 배포·운영할 때 참고하는 문서입니다. 개발 실행과 검사 명령은 [README](../README.md)에 있습니다.

## Firebase 설정과 계정 발급

- Firebase 프로젝트를 쓰려면 저장소 맨 위에 `.env.production.local`을 만들고 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_APP_ID`를 적습니다. 배포용 빌드(`npm run build`, `npm run dist:win`)에만 들어가고 개발판과 `npm run e2e`는 메모리 서버로 켜집니다. CI는 저장소 변수의 같은 값을 씁니다.
- 계정은 `GOOGLE_APPLICATION_CREDENTIALS`에 서비스 계정 파일 경로를, `FIREBASE_DATABASE_URL`에 데이터베이스 주소를 넣고 `npm run account:create -- <이름>`으로 만듭니다. 출력된 설정 코드를 [설치 안내](install-guide.md)와 함께 건넵니다.

## 출시와 업데이트

1. `package.json`의 `version`을 올리고 `src/modules/notice/notes.ts` 맨 위에 그 버전의 바뀐 점을 적습니다. 업데이트한 뒤 처음 켤 때 이 내용이 창으로 한 번 뜹니다.
2. main을 올리고 CI가 통과하는지 봅니다.
3. 보안 규칙을 바꿨다면 태그보다 먼저 `GOOGLE_APPLICATION_CREDENTIALS`와 `FIREBASE_DATABASE_URL`을 넣고 `npm run rules:deploy`로 배포합니다. 이 명령은 origin/main의 규칙만 배포하고 덮어쓰기 전의 운영 규칙을 `~/isshoni-hatarakou-backups/rules`에 남깁니다. 되돌릴 때는 그 파일 내용을 Firebase 콘솔의 규칙 편집기에 붙여 넣습니다.
4. 같은 버전의 태그(`v0.1.0` 형식)를 올립니다. GitHub Actions의 release가 태그 커밋의 CI 통과를 확인한 뒤 Windows 설치 파일을 만들어 이 저장소의 GitHub Releases에 올립니다. 릴리스 본문은 `.github/release-notes.md`의 설치 방법입니다.
5. 켜져 있는 앱은 6시간 안에 새 버전을 받아 두고 실행 화면의 다시 시작 버튼으로 설치합니다. 처음 설치하는 사람은 [설치 안내](install-guide.md)를 따라 Releases 페이지에서 `isshoni-hatarakou-Setup-버전.exe`를 받습니다.

## 운영

우편함 글과 편지, 확성기, 버그 제보 읽기, 서버 조정값의 기간 이벤트, 기기별 앱 버전 보기는 `node scripts/ops.ts <명령>`으로 다룹니다. 명령과 옵션은 파일 맨 위 주석에 있고 환경 변수는 계정 발급과 같습니다. 예를 들어 `node scripts/ops.ts mail 제목 본문 --to 친구코드`는 편지를 보내고 `node scripts/ops.ts reports`는 받은 버그 제보를 보여 줍니다.

- 데이터베이스 백업은 `node scripts/backup.ts`입니다. 날짜별 JSON을 `~/isshoni-hatarakou-backups`에 남기고 최근 7개만 둡니다. 하루 한 번 예약 작업으로 실행합니다.
- 설정 코드를 잃은 사람은 `npm run account:create -- --reset <uid>`로 새 설정 코드를 받습니다. 옛 코드는 더 쓸 수 없습니다.
- 계정을 막을 때는 Firebase 콘솔에서 `users/{uid}/public/friendCode`, `codes/{친구 코드}`, `users/{uid}/presence`를 지웁니다. 규칙이 friendCode 없는 계정을 모든 경로에서 막습니다(ADR 0040).
