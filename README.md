# isshoni-hatarakou

친구들과 같은 작업실에 있는 기분으로 각자 할 일을 하는 데스크톱 작업 메이트입니다. 바탕화면의 캐릭터와 함께 작업하고, 친구를 만나고, 나만의 공간을 꾸밀 수 있습니다.

[Windows 설치 파일 다운로드](https://github.com/tl1l1l1s/isshoni-hatarakou/releases/latest) · [설치 안내](docs/install-guide.md)

## 주요 기능

- **함께하는 작업방** — 방 하나에 최대 5명이 들어와 함께 작업합니다.
- **캐릭터와 마이홈** — 캐릭터를 꾸미고 나만의 공간을 만듭니다.
- **집중과 일정 관리** — 집중 시간을 기록하고 뽀모도로, 일정, 디데이로 할 일을 챙깁니다.
- **친구와 소통** — 친구 코드로 친구를 추가하고 채팅으로 이야기합니다.

## 설치와 시작하기

현재 배포 대상은 Windows입니다. 계정은 관리자가 미리 만들어 **설정 코드**로 전달하며, 앱 안에서 직접 가입하는 화면은 없습니다.

1. 관리자에게 설정 코드를 받습니다.
2. [Releases](https://github.com/tl1l1l1s/isshoni-hatarakou/releases/latest)에서 `isshoni-hatarakou-Setup-버전.exe`를 받아 설치합니다.
3. 앱의 설정 코드 입력 창에 받은 코드를 붙여 넣고 **시작하기**를 누릅니다.

설치 화면과 기본 사용법은 [설치 안내](docs/install-guide.md)를 참고하세요.

### 로그인과 설정 코드

- 같은 PC에서는 로그인 상태를 저장하므로 앱을 껐다 켜도 코드를 다시 입력하지 않습니다.
- **이 PC 연결 해제**를 누르거나 앱 저장 데이터를 지웠을 때, 다른 PC에서 사용할 때는 설정 코드가 다시 필요합니다. 재설치 후 로그인 유지 여부도 저장 데이터가 남아 있는지에 따라 달라집니다.
- 설정 코드는 일회용이 아니라 다시 로그인할 때 사용하는 코드입니다. 비밀번호가 들어 있으므로 안전하게 보관하고 다른 사람에게 공유하지 마세요.
- 코드를 잃었다면 관리자에게 재발급을 요청하세요. 같은 계정과 서버 기록을 유지하며, 새 코드가 발급되면 옛 코드는 사용할 수 없습니다.
- **8자리 친구 코드**는 친구 추가용입니다. 로그인에 쓰는 설정 코드와는 다릅니다.

## 개발하기

CI와 같은 Node.js 24와 npm을 사용합니다. 저장소를 내려받은 뒤 다음 명령으로 개발판을 실행합니다.

```sh
npm ci
npm run dev
```

Firebase 설정값이 없으면 메모리 서버로 실행되므로 계정 발급 없이 살펴볼 수 있습니다. 방 만들기 / 참여하기에서 방 코드 `DEVDEV`를 넣으면 가짜 친구가 있는 개발 방에 들어갑니다.

Firebase 연결, 실제 계정 발급, Windows 설치 파일 배포는 [배포·운영 가이드](docs/operations.md)를 참고하세요.

### 검사

- `npm run check` — 타입 검사, lint, 모듈 경계 검사, 단위 시험, 규칙 파일 최신 여부를 확인합니다.
- `npm run test:emulator` — Firebase 에뮬레이터로 보안 규칙과 서버 adapter 시험을 돌립니다. Java 21이 필요합니다.
- `npm run e2e` — 앱을 빌드하고 Playwright로 부팅, 코어 계약, 복구, 업그레이드, Windows 동작을 검사합니다.
- Windows 실제 기기 점검은 [점검표](docs/checklists/windows-m0.md)를 따릅니다.

### 새 기능 더하기

`src/modules/<id>/`에 모듈을 만들고 [모듈 목록](src/modules/index.ts)에 import와 `modules` 배열 항목을 추가합니다. 모듈은 `ctx`로만 바깥에 접근합니다. 계약은 [코어 타입](src/renderer/core/types.ts)과 [구조 문서의 10.5절](docs/feature-spec/10-architecture.md)에 있고, [focus](src/modules/focus/)와 [rooms](src/modules/rooms/)가 예시입니다.

## 더 자세한 문서

- [설치와 기본 사용법](docs/install-guide.md)
- [기능 명세](docs/feature-spec/README.md)
- [앱 구조](docs/feature-spec/10-architecture.md)와 [결정 기록](docs/adr/)
- [배포·운영 가이드](docs/operations.md) — Firebase 설정, 계정 발급·재발급, 출시, 백업, 계정 차단
- [함께 작업하는 경험 확장 제안](docs/proposals/README.md) — 공동 작업 세션, 함께 키우는 작업실, 작업 앨범, 작업 카드와 전시대, 캐릭터의 작은 생활을 다루는 **아직 구현되지 않은 초안**
