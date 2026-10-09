## 10. 확장 가능한 구조 설계

이 장은 Isshoni Hatarakou의 구조, 기능 모듈 계약, 데이터와 서버, 품질과 배포, 단계별 구현 순서를 다룹니다. 구조는 관리형 서버 Firebase를 쓰는 안을 바탕으로 작은 서버를 직접 만드는 안에서 나은 생각을 가져왔고 두 안이 다른 곳에는 해당 절에 고른 쪽과 이유를 적었습니다.

### 10.1 설계 목표

Isshoni Hatarakou는 한 사람이 AI 도구와 함께 만들고 친구 몇 명이 쓰는 앱입니다. 그래도 명세의 기능 215개와 명세에 없는 새 기능을 계속 더해 가므로 구조는 아래 목표를 따릅니다.

1. **기능 하나를 모듈 하나로 더하고 뺍니다** 명세 기능과 아직 정하지 않은 새 기능 대부분을 `src/modules/<id>/` 폴더 하나와 등록 줄 하나로 더합니다. 코어를 고칠 때는 기능 이름이 없는 범용 기능과 신원 기능만 더합니다(10.6).
2. **혼자 만들고 고치기 쉬워야 합니다** 모듈 계약에서 필수는 `id`와 `setup` 둘이고 나머지 계약 부분은 처음 쓰는 단계에서 만듭니다. 결정은 `docs/adr/`에 짧게 남기고 수치와 import 경계는 CI가 확인해서 문서와 코드가 어긋나지 않게 합니다.
3. **서버 비용이 갑자기 늘지 않아야 합니다** 2명에서 10명 규모에서 Firebase Spark 요금제 한도의 10분의 1 아래로 쓰고 한도를 넘으면 요금 대신 멈춥니다(10.7.5, 10.7.6).
4. **작업을 방해하지 않아야 합니다** 캐릭터 창은 포커스를 받지 않고 좌석 영역만 덮습니다. 작업 프로그램의 키보드 입력, 그림 앱의 펜 선, 캐릭터 아래의 영상을 끊거나 가리지 않습니다(10.8).
5. **친구의 데이터를 잃지 않아야 합니다** 저장하거나 주고받는 형식에는 첫 출시부터 버전을 두고 migration 전에 백업합니다. 모든 데이터는 선물하는 사람이 발급한 계정의 uid 하나로 저장합니다(10.7).
6. **OS, 서버, 그리기 방식에 묶이지 않아야 합니다** 세 가지를 각각 platform adapter, `ServerPort`, `CharacterView` 뒤에 두어 구현을 바꿔도 모듈은 그대로입니다(10.3의 6번).
7. **시험으로 확인합니다** 순수 로직은 Electron과 Firebase 없이 시험하고 여러 PC가 한 방에 있는 상황은 다중 클라이언트 시뮬레이터로 재현합니다. 보안 규칙은 Firebase 에뮬레이터에서 시험합니다(10.10).

| 영역 | 구성 |
|---|---|
| 프로세스 | 기능 로직이 없는 메인 프로세스, 좌석 영역 크기의 스테이지 창, 스테이지가 여는 패널 창, 연출 동안만 여는 효과 창 |
| 렌더러 | 모듈 호스트와 기능 모듈, `ctx` 주입, Canvas 2D 그리기 |
| 데이터 계층 | `ServerPort`(firebase, memory), 모듈 namespace, 계정 폴더 `accounts/<uid>/` |
| 서버 | Firebase Realtime Database와 Authentication(Spark 요금제), 서버 함수 없음 |
| 시험 | Vitest 단위 시험과 적합성 시험, 다중 클라이언트 시뮬레이터, 에뮬레이터 규칙 시험, Playwright 부팅 시험 |
| 배포 | 태그로 시작하는 GitHub Actions, 공개 저장소의 GitHub Releases, Windows 자동 업데이트 |

### 10.2 이 설계가 피하는 문제

아래 표는 투명 창을 띄우는 데스크톱 앱과 Firebase 앱에서 생기기 쉬운 문제와 이 설계가 그 문제를 피하는 방식입니다.

| 피하는 문제 | 이 설계의 방식 |
|---|---|
| 기능 대부분을 전역 범위의 큰 파일 하나에 두면 선언 순서 때문에 초기화 전 변수를 읽는 오류가 나고 새 기능이 큰 파일 여기저기에 흩어진 수정으로 들어감 | 기능마다 `src/modules/<id>/` 폴더 하나와 ES 모듈 import를 쓰고 모듈 사이 직접 import는 lint 오류로 처리(10.3, 10.5) |
| 창을 만드는 함수가 IPC 처리 함수를 등록하면 창을 다시 만들 때 같은 처리 함수가 두 번 등록됨 | 메인 프로세스가 IPC를 모듈 범위에서 한 번만 등록하고 창 만들기 함수는 아무것도 등록하지 않음(10.4) |
| 버전 없는 preload 브리지는 앱 버전 사이에 어긋나고 구독 해제 함수가 없으면 리스너가 남음 | 부팅 때 `BRIDGE_VERSION`을 확인하고 구독은 해제 함수를 돌려주며 브리지에 기능별 메서드를 두지 않음 |
| 전역 가변 상태와 고정 지연으로 시작 순서를 맞추면 카탈로그가 캐릭터보다 늦게 오는 것처럼 순서가 어긋남 | 모듈별 상태와 `ctx` 주입, 신원 확인 다음 카탈로그 다음 모듈 다음 방 순서의 부팅 단계(10.4) |
| 창 하나를 더할 때 화면 정의, ESC 순서, 겹침 순서, 위치 저장 키, 클릭 통과 목록, 바깥 클릭 목록을 여러 곳에서 고치면 한 곳을 빠뜨려 눌리지 않는 팝업이나 닫히지 않는 창이 생김 | 모듈은 `ui.windows`에 창을 선언만 하고 나머지는 창 관리자가 처리(10.5) |
| 모니터 전체를 덮는 투명 창과 마우스 움직임 전달은 영상을 검게 가리고 그림 앱의 펜 선을 직선으로 만들며 클릭 통과가 꺼진 채 남을 수 있음 | 좌석 영역 크기의 창, 메인 프로세스의 커서 위치 확인, 마우스 움직임 전달(`forward`) 미사용, 효과 창은 연출 동안만(10.8) |
| 형식과 권한과 제한값을 규칙 파일과 앱에 따로 적으면 둘이 어긋나 쓰기가 조용히 실패함 | 모듈마다 템플릿으로 규칙 조각을 쓰고 합치는 스크립트가 namespace를 검사하며 CI에서 에뮬레이터 규칙 시험을 실행. 같은 검사가 여러 모듈에 반복되면 zod schema에서 형식 검사를 만듦(10.7) |
| 앱이 만든 사용자 코드로 저장하다가 로그인을 나중에 붙이면 여러 ID를 서로 바꿔야 하고 계정을 옮긴 뒤 친구 코드가 옛 ID를 가리킴 | 처음부터 선물하는 사람이 발급한 로그인 계정의 uid로 저장하고 친구 코드는 별칭 표로 둠(10.7) |
| 공개본을 따로 쓰면 그 쓰기만 실패했을 때 공개본이 낡은 채 남음 | 모듈 데이터는 기본 비공개이고 공개할 부분은 `pub` 아래에 두어 한 번의 다중 경로 쓰기로 함께 씀 |
| 캐릭터 전체를 나중에 쓴 쪽이 이기는 방식으로 맞추면 편집이 사라지고 나중에 형식을 옮기는 일이 위험함 | 처음부터 항목별 기록에 `v`, 수정 시각, 삭제 표시를 두고 namespace마다 migration과 v1 고정 자료 시험을 둠 |
| 방 생존 기준이 여러 개이고 하트비트를 방 사람 모두가 구독하는 곳에 따로 쓰면 유령 캐릭터가 남고 내려받기 비용이 커짐 | 생존 모델 하나(연결이 끊길 때의 삭제 예약, 1분 갱신에 합친 하트비트, 150초 기준 상수 하나)(10.7) |
| 멤버 순서와 채팅 순서에 PC 시계를 쓰고 하루 경계가 기능마다 다르면 엉뚱한 사람이 방에서 밀려나고 채팅 순서가 바뀌며 횟수 초기화 시각이 헷갈림 | 순서는 서버 시각과 서버가 정한 키로 정하고 하루 경계는 서버 시각 기준 한국 시간 오전 6시 함수 하나(`dayKey`) |
| 시험이 소스 파일을 글자로 읽어 확인하면 주석과 맞아도 통과하고 이름만 바꿔도 깨짐 | Vitest가 모듈을 import해 시험하고 메모리 서버와 에뮬레이터에 같은 계약 시험을 실행하며 다중 클라이언트 시뮬레이터를 첫날부터 둠(10.10) |
| 관리 도구가 사용자 앱 안에 있으면 번들이 커지고 모든 설치 파일에 운영 기능이 들어감 | 친구 설치 파일에 관리 코드를 넣지 않고 선물하는 사람 PC의 Node 스크립트로 처리 |
| 그림과 소리를 base64 JavaScript 변수로 넣으면 에셋을 바꿀 때마다 앱을 다시 배포함 | 에셋은 모듈 폴더의 파일과 출처와 이용 조건을 적은 목록 파일로 두고 필요할 때 읽음 |
| 화면마다 그리기 장면을 따로 만들면 크기 맞춤 규칙을 여러 곳에서 손으로 맞춰야 함 | `CharacterView` 하나와 `renderScene` 함수 하나를 바탕화면, 미리보기, 썸네일, 사진에 함께 씀(10.8) |
| 미리 빌드한 바이너리가 없는 네이티브 모듈과 전역 마우스 훅은 OS별 빌드를 불안정하게 하고 활성 창 감지를 망가뜨릴 수 있음 | Electron 기본 기능을 먼저 쓰고 활성 창 모듈은 adapter 뒤에 두며 M0에서 빌드를 확인 |
| 저장한 설정 값이 새 기본값을 덮으면 고친 기본값이 기존 설치에 전달되지 않음 | 사용자가 바꾼 값만 저장하고 설정에 schema 버전을 둠 |
| OS 표시 없는 실행 파일 이름을 동기화 데이터에 저장하면 다른 OS에서 등록 앱과 기록이 맞지 않아 집중 시간이 0으로 계산될 수 있음 | 처음부터 `win:`과 `mac:` 접두어 키를 쓰고 등록 앱 목록은 기기 범위에 저장 |
| 로그아웃할 때 손으로 관리하는 저장 키 목록을 지우면 키 하나를 빠뜨려 다른 계정에 데이터가 남음 | 계정 데이터를 `accounts/<uid>/` 폴더에 두고 계정을 바꾸면 폴더만 바꿈 |
| 쓰지 않는 기능을 빈 함수와 끄는 상수로 남기면 죽은 코드가 쌓임 | 모든 기능에 같은 계약을 적용하고 기능을 없앨 때는 폴더를 지움 |
| 기능에 정리 단계가 없으면 기능을 닫아도 타이머와 리스너가 남음 | `ctx`로 만든 구독, 리스너, 타이머를 코어가 기록했다가 해제할 때 모두 정리(10.5) |
| 내려받은 양으로 요금을 매기는 데이터베이스에서 목록 전체를 구독하면 내려받기가 크게 늘어남 | 좁은 구독과 목록 limit 필수, 루트 구독 금지, 한도를 넘으면 멈추는 요금제, 개발판의 namespace별 바이트 측정(10.7) |

아래 방식도 처음부터 넣었습니다.

| 방식 | 이 설계에서 쓰는 곳 |
|---|---|
| 카탈로그 버전 번호만 구독하고 내용은 로컬에 캐시 | 코어 카탈로그 서비스(10.7) |
| 방 입장 최소 버전을 서버 설정에 두고 사용자가 업데이트한 뒤에 올림 | `config/minProtocol`(10.10) |
| 연결이 끊기면 서버가 대신 지우도록 미리 등록하는 삭제(onDisconnect) | RoomSession(10.7) |
| 서버 규칙으로 세는 하루 횟수 한도 | 규칙 템플릿 `dailyQuota` |
| 시드 값 하나로 모든 화면에 같은 움직임 | 방 이벤트의 `seed`와 효과 등록부 |
| 우선순위 순서로 조건을 확인하는 순수 상태 함수 | `characterStates` |
| 마지막으로 보낸 값과 비교해 바뀐 필드만 보내는 방 정보 | `ctx.room.setMine` |
| 표시를 먼저 쓰고 보상을 주는 지급 방식, 저장하지 않고 계산하는 뽑기 횟수 | 가챠 모듈의 `grantTickets`와 `tickets` |
| 캔버스 위에 DOM으로 그리는 이름표와 말풍선 | `seat.labels` 슬롯 |
| 준비 대기열과 콜백별 오류 처리가 있는 등록부 | 모듈 계약 전체(10.5) |
| 의존성을 인자로 받는 팩토리 모듈 | `ctx` 주입 |
| 시작할 때 한 번 고르는 OS별 구현 | platform adapter(10.8) |
| 저장 ID, 지문, 같은 크기, 주 모니터 순서로 모니터 찾기 | 모니터 처리(10.8) |
| 지금 값과 같으면 건너뛰는 창 상태 적용 | 창 관리자 |
| 빌드 표시로 나눈 개발 서버와 운영 서버, 개발판 전용 데이터 폴더 | 환경 표시와 출시 점검(10.10) |
| 태그로 시작하는 출시 절차 | 출시 절차(10.10) |
| 진단 기록 폴더 열기 버튼 | 진단 요약(NFR-21) |
| 한글 입력 조합 중 Enter를 한 곳에서 막는 전역 키 처리 | 코어 단축키 처리 |

### 10.3 설계 원칙

1. **기능 하나는 폴더 하나** 기능 하나는 `src/modules/<id>/` 폴더 하나와 `src/modules/index.ts`의 import 한 줄로 앱에 들어옵니다. 그 줄을 지우면 기능의 창, 메뉴 항목, 상태칩 버튼, 단축키, 구독, 타이머가 함께 사라집니다. 기능을 없앨 때는 끄는 상수를 두지 않고 폴더를 지웁니다.
2. **모듈은 ctx로만 바깥에 접근합니다** 모듈은 setup에서 받은 `ctx`만 씁니다. Electron, Firebase SDK, 그리기 라이브러리, OS 코드, 다른 모듈의 내부 파일을 import하면 lint 오류입니다. 다른 모듈의 기능은 `requires`에 적은 뒤 `ctx.modules.get(id)`로 받은 공개 API로만 부릅니다.
3. **연결하지 않고 선언합니다** 창, 메뉴와 상태칩 항목, 단축키, 명령, 설정, presence 필드, 규칙 조각, 에셋은 manifest 데이터이고 코어가 이 데이터를 읽어 동작을 만듭니다. 같은 목록을 여러 파일에 손으로 맞춰 둘 일이 없습니다.
4. **순수 로직과 주입한 부수 효과** 규칙, 한도, 병합, 보상, 하루 경계 계산은 현재 시각과 입력을 인자로 받는 순수 함수로 씁니다. 시계와 저장소와 네트워크는 `ctx`에서 받으므로 시험 대부분은 Electron과 Firebase 없이 밀리초 단위로 끝납니다.
5. **관심사마다 구현 하나** presence 모델, 하루 경계 함수(`dayKey`), 창 관리자, 설정 저장소, 상수 모듈은 하나씩만 둡니다. 화면에 보이는 값 하나는 저장 경로도 하나입니다.
6. **교체 지점은 셋이고 처음부터 구현이 둘** 코어가 구현을 바꿀 수 있는 곳은 `ServerPort`(Firebase와 메모리), `CharacterView`(시험용 사각형과 Canvas 2D), platform adapter(Windows와 시험용 가짜, Mac은 나중) 세 곳뿐입니다. 셋 모두 첫날부터 구현이 둘이라서 인터페이스가 한 구현에만 맞춘 모양이 되지 않습니다. 다른 인터페이스는 두 번째 구현이 생길 때 만듭니다.
7. **저장하거나 주고받는 것에는 버전을 둡니다** 로컬 파일, 서버 기록, 방 프로토콜(`PROTO`), preload 브리지(`BRIDGE_VERSION`), 설정, 카탈로그 항목에 첫 출시부터 버전 번호를 둡니다.
8. **비용을 설계 조건으로 둡니다** 구독은 좁게 잡고 목록 구독에는 항상 limit을 둡니다. 컬렉션 루트는 구독하지 않습니다. 카탈로그는 버전 번호로 캐시하고 방 멤버 기록은 1KB 아래로 둡니다. 한도를 넘으면 요금을 받지 않고 멈추는 Spark 요금제에서 시작합니다(10.7).
9. **가장 작은 인프라** 서버 코드 없이 Firebase 규칙으로 시작하고 관리 앱은 만들지 않고 선물하는 사람 PC의 Node 스크립트를 씁니다. 첫 선물에는 자동 업데이트를 넣지 않습니다.
10. **데이터는 기본 비공개** 모듈 서버 데이터는 모듈이 공개 부분을 선언하지 않는 한 본인만 읽습니다. 입력 내용, 창 제목, 앱 이름은 PC 밖으로 보내지 않습니다(NFR-18).
11. **계약은 필요할 때 넓힙니다** 모듈 계약에서 필수는 `id`와 `setup` 둘이고 나머지는 모두 선택입니다. 10.5에 적은 계약 부분은 명세 기능 둘 이상이 쓰는지 확인했고 처음 쓰는 단계에서 만듭니다. 10.5에 없는 새 부분은 그 부분을 쓰는 모듈이 둘 있을 때 더하고 짧은 ADR을 남깁니다.
12. **고치기 전에 잽니다** 플랫폼 문제는 측정한 뒤에 고치고 결정은 코드 주석 대신 `docs/adr/`에 짧은 기록으로 남깁니다. 기록에는 측정한 값과 측정하지 않은 값을 나눠 적습니다.

### 10.4 전체 구성

프로그램은 Electron 메인 프로세스, 캐릭터를 그리는 스테이지 렌더러, 스테이지가 여는 패널 창, 관리형 서버 Firebase, 선물하는 사람 PC의 운영 스크립트, CI로 이루어집니다.

```
친구 PC
  Electron 메인 프로세스 (기능 로직 없음)
    생명주기, 창 관리자, platform adapter, 활동 샘플링(500ms),
    원자적 파일 저장, 로그와 진단, 트레이, 업데이트
        |  preload 브리지 (BRIDGE_VERSION, namespace, 해제 함수 반환)
        v
  스테이지 렌더러 = 캐릭터 창 (투명, 좌석 영역 크기, 포커스 받지 않음)
    모듈 호스트 ── modules/* (focus, rooms, gacha, ...)
    코어 서비스: bus, 명령, 슬롯, 단축키, RoomSession, 카탈로그, 시계, 로컬 저장
    ServerPort ── firebase | memory
    CharacterView ── canvas2d | debug | three3d(나중)
        |  window.open + React portal (같은 프로세스, 같은 JS 힙)
        v
  패널 창 (설정, 꾸미기, 가챠, 채팅 ...)   키보드 입력이 필요한 창만 포커스 받음
  효과 창 (P2 연출 동안만, 화면 전체, 클릭 통과)
        |
        |  Firebase JS SDK (TLS)
        v
Firebase: Realtime Database (asia-southeast1), Authentication
        ^
        |  firebase-admin, firebase-tools
선물하는 사람 PC: scripts/ (계정 발급, 카탈로그 배포, 최소 버전, 규칙 배포, 백업)
GitHub Actions: lint, 타입 검사, 시험, 에뮬레이터 규칙 시험, 설치 파일 빌드
```

| 구성 요소 | 하는 일 | 통신 상대 |
|---|---|---|
| Electron 메인 프로세스 | 생명주기(단일 실행, 절전과 복귀, 화면 잠금, 모니터 변경, 렌더러 충돌 뒤 재시작, 로그오프 때 빠른 종료), 창 관리자, platform adapter, 500밀리초 활동 샘플링, 원자적 파일 저장, 로그와 진단, 트레이, 화면 숨기기 단축키, 업데이트를 처리합니다. 기능 로직은 두지 않습니다. | 스테이지 렌더러(preload 브리지), OS |
| 스테이지 렌더러 | 투명하고 좌석 영역 크기이며 포커스를 받지 않는 캐릭터 창입니다. 모듈 호스트, 모든 모듈 로직과 상태, Firebase 연결 하나, RoomSession, 카탈로그, CharacterView, 좌석과 이름표와 상태칩이 여기서 실행됩니다. 창을 숨겨도 Chromium이 타이머 간격을 늘리지 않도록 `backgroundThrottling: false`로 만들고 그리기 fps는 코어가 직접 0으로 낮춥니다. | 메인 프로세스, Firebase, 패널 창 |
| 패널 창 | 스테이지가 `window.open`으로 연 창에 React portal로 모듈 화면을 그립니다. 같은 렌더러 프로세스와 JavaScript 힙을 쓰고 키보드 입력이 필요한 창만 포커스를 받습니다(`ui.windows`의 포커스 여부 기본값은 끔). | 스테이지 렌더러, 메인 프로세스의 창 관리자 |
| 효과 창(P2) | 화면을 가로지르는 연출 동안만 여는 화면 전체 크기의 클릭 통과 창입니다. 다른 사람을 겨누는 동안만 `ctx.ui.pickTarget()`이 몇 초 동안 클릭을 받는 상태로 바꿉니다(10.8.2). | 스테이지 렌더러 |
| Firebase | Realtime Database(`asia-southeast1`)와 Authentication입니다. 서버 함수는 필요한 모듈이 생길 때까지 두지 않습니다. | 스테이지 렌더러, 운영 스크립트 |
| 운영 스크립트 | 선물하는 사람 PC에서 실행하는 Node 명령입니다. 계정 발급, 카탈로그 배포, 최소 버전 올리기, 규칙 배포, 백업, 서버 migration을 처리합니다. | Firebase(firebase-admin, firebase-tools) |
| CI | GitHub Actions에서 lint, 타입 검사, 시험, 에뮬레이터 규칙 시험, 설치 파일 빌드를 실행합니다. | 업데이트 파일 저장소, Firebase 에뮬레이터 |

**모듈을 실행하는 곳** 두 안은 모듈 로직을 실행하는 프로세스가 달랐습니다. 직접 서버안은 메인 프로세스에 커널을 두고 창을 화면만 그리는 뷰로 두는데 이 방식은 모듈 상태가 바뀔 때마다 IPC로 창에 전달하는 장치가 따로 필요합니다. 이 장은 모듈과 상태와 서버 연결을 스테이지 렌더러 하나에 두고 패널 창을 `window.open`으로 열어 같은 JavaScript 힙에서 React portal로 그리는 쪽을 고릅니다. 상태를 복사하지 않으니 코드가 적고 Firebase 웹 SDK를 원래 쓰는 환경에서 쓰며 패널 창이 렌더러 프로세스를 따로 만들지 않아 NFR-10의 메모리 목표 400MB에도 유리합니다. 대신 스테이지가 멈추면 패널도 함께 멈추므로 이미지 크기 조절, PNG 인코딩, 큰 JSON 처리는 Web Worker에서 하고 NFR-05의 응답 없음 감시가 스테이지를 다시 만듭니다. M0에서 portal 방식의 포커스와 한글 입력과 스타일 복사를 먼저 시험하고 실패하면 패널마다 렌더러를 따로 두고 MessagePort로 모듈 상태를 받는 방식으로 바꿉니다. 모듈은 `ctx.ui.open`만 부르므로 이 전환에서 모듈 코드는 바뀌지 않습니다.

**페이지 출처와 CSP** electron-vite 기본 구성은 운영 빌드에서 `file://`로 페이지를 엽니다. 페이지 출처는 `window.open` 자식 창에 접근할 수 있는지, IndexedDB 범위, 외부 iframe에 보내는 Referer에 영향을 주므로 M0에서 `protocol.handle`로 등록한 앱 전용 scheme(예를 들어 `app://`)으로 페이지를 열지 정합니다. YouTube IFrame 플레이어는 2025년부터 Referer가 없는 삽입을 오류로 막는 것으로 알고 있고 `file://` 페이지는 Referer를 보내지 않습니다. 이 동작은 확인하지 않았으므로 M0에서 패키징한 앱의 패널에 YouTube 플레이어를 띄워 보고 막히면 M2b 전에 SND-01과 SND-02의 재생 방식을 다시 정합니다. CSP는 코어가 기본 정책과 모듈 manifest의 `externalOrigins`를 합쳐 만듭니다.

| 계층 | 하는 일 | 의존해도 되는 것 |
|---|---|---|
| shared(`src/shared/`) | 모든 프로세스와 도구가 쓰는 순수 TypeScript입니다. zod schema, 상수와 한도, `dayKey`와 서버 시각 계산, `PROTO`, `BRIDGE_VERSION`, 친구 코드와 방 코드 생성, `win:`과 `mac:` 앱 키 정규화를 둡니다. | zod |
| platform(`src/main/platform/`) | OS마다 동작이 다른 adapter 쌍과 시험용 `FakePlatform`입니다. 이 폴더의 `index.ts`만 `process.platform`을 읽습니다. | shared, Electron, 활성 창 모듈 |
| main-core(`src/main/`) | 생명주기, 창 관리자, IPC 라우터, 원자적 파일 저장, 로그, 트레이, 업데이트입니다. | shared, platform |
| preload 브리지(`src/preload/`) | 버전 번호와 namespace가 있는 브리지 하나입니다. 기능별 메서드는 없습니다. | shared |
| server adapter(`src/renderer/server/`) | `ServerPort`와 firebase 구현과 memory 구현입니다. | shared, Firebase SDK(firebase 구현만) |
| render adapter(`src/renderer/render/`) | `CharacterView`와 debug, canvas2d, three3d(나중) 구현입니다. | shared, three.js(three3d 구현만) |
| renderer core(`src/renderer/core/`) | 모듈 호스트, `ctx`, bus, 명령, 단축키, 슬롯, 창 클라이언트, RoomSession, 카탈로그, 시계, 로컬 저장, 에셋과 소리, gate, 설정 화면 생성, 좌석과 이름표, 부팅입니다. | shared, 브리지 타입, `ServerPort`, `CharacterView` |
| modules(`src/modules/`) | 명세 기능과 새 기능입니다. | shared, `ctx` 타입, `requires`에 적은 모듈의 공개 API 타입 |
| tooling(`rules/`, `scripts/`, `tests/`) | 규칙 빌드 스크립트, 운영 스크립트, 계약 시험, 시뮬레이터, CI 설정입니다. | shared, 모듈 manifest, firebase-admin, firebase-tools |

**부팅 순서** 부팅은 단계마다 앞 단계가 끝난 뒤 다음 단계를 시작하고 고정 지연은 쓰지 않습니다.

1. 메인 프로세스는 단일 실행 잠금(`app.requestSingleInstanceLock`)을 요청하고 설정을 읽은 뒤 스테이지 창을 만듭니다.
2. 스테이지는 브리지의 `BRIDGE_VERSION`을 확인하고 앱과 다르면 오류 화면을 띄웁니다.
3. 신원 단계에서 Firebase SDK가 남긴 로그인 상태를 되살리고 로그인 상태가 없거나 풀렸으면 설정 코드 입력 창을 띄웁니다. 이 단계가 끝나기 전에는 어떤 타이머도 시작하지 않습니다. 신원 단계는 모듈 단계보다 먼저 끝나므로 한 계정 한 기기(ACC-12)처럼 이 단계를 바꾸는 기능은 코어 신원 기능으로 둡니다(10.7.2).
4. 카탈로그 단계에서 앱에 든 기본 카탈로그와 로컬 캐시를 합치고 서버 버전 번호가 다르면 새로 받습니다. 오프라인이면 캐시로 시작합니다.
5. 모듈 단계에서 `requires` 순서대로 setup을 부릅니다. setup에서 예외가 나면 그 모듈과 그 모듈을 필요로 하는 모듈만 끄고 진단 요약에 이유를 적습니다.
6. 방 단계에서 자동 재입장 설정이 켜져 있으면 마지막 방 코드로 다시 들어갑니다. 자동 재입장도 직접 들어갈 때와 같은 `room.beforeJoin` 확인을 거칩니다.

### 10.5 기능 모듈 계약

모듈은 `src/modules/<id>/index.ts`에서 manifest 하나를 내보내고 manifest의 `setup(ctx)`는 공개 API를 돌려줄 수 있습니다. 필수 항목은 `id`와 `setup`뿐이고 나머지는 쓰는 모듈만 적습니다. 아래 예시는 계약의 모양만 보이려고 줄인 코드입니다.

```ts
// src/modules/focus/index.ts (모양만 보인 예시)
export default defineModule({
  id: 'focus',
  title: '집중 기록',
  version: '1.0.0',
  specIds: ['FOC-01', 'FOC-02', 'FOC-03', 'FOC-05', 'CHR-05', 'SET-02'],   // SET-02는 M2a
  uses: ['platform.activity'],
  settings: { version: 1, scope: 'account', schema: FocusSettings },   // 규칙, 피규어 모드
  local: {
    device: { version: 1, schema: FocusApps },                // 등록 앱 8칸 (OS별 키)
    account: { version: 1, schema: FocusToday },              // 오늘과 누적 (30초마다 저장)
  },
  server: {
    version: 1,
    collections: {
      dev: { scope: 'user', schema: FocusDevice, template: 'owner', merge: 'sumByDevice' },
    },
  },
  presence: {                                                 // m.focus.*, 합쳐 128바이트 이하
    todayMin: { schema: z.number().int(), sync: 'batch' },
    awake: { schema: z.boolean(), sync: 'onChange', minIntervalMs: 3_000 },
  },
  characterStates: [{ id: 'sleep', priority: 50, when: (seat) => seat.m.focus?.awake === false }],
  ui: {
    windows: [{ id: 'focus.record', component: () => import('./ui/RecordWindow') }],
    contributions: [{ slot: 'menu.main', id: 'focus.open', label: '포커스 기록', command: 'focus.open' }],
  },
  commands: [{ id: 'focus.open', run: (ctx) => ctx.ui.open('focus.record') }],
  emits: { 'focus.tick': FocusTick, 'focus.awakeChanged': AwakeChanged },
  // FocusTick = { sec, dayKey, appKey, source }. appKey는 PC 밖으로 보내지 않습니다(규칙 8).
  extensionPoints: { 'focus.drawer': DrawerContribution, 'focus.sources': FocusSource },
  setup(ctx) {
    // ctx.activity 구독, ctx.timers.every(30_000, save)
    return { todaySec: () => state.today.sec, todayByApp: () => state.today.byApp };
  },
});
```

| 부분 | 담는 내용 | 코어가 하는 일 |
|---|---|---|
| `id`, `title`, `version`, `specIds` | kebab-case 고유 id와 구현한 기능 ID 목록입니다. id는 이벤트, 명령, 설정 키, 로컬 파일, 서버 namespace(`mod/<id>/`), 창 id의 접두어로 씁니다. | 부팅 때 중복을 검사하고 `scripts/coverage`가 `specIds`를 9.4 우선순위 표와 9.3의 OUR 기능 목록과 비교해 구현 범위를 보여 줍니다. |
| `requires`, `optionalRequires` | 의존하는 모듈 id입니다. | 의존 순서로 setup을 부릅니다. 필수 의존 모듈이 없으면 그 모듈을 끄고 진단에 이유를 적고 선택 의존 모듈이 없으면 `undefined`를 줍니다. |
| `uses` | 모듈이 쓰는 OS 기능(`platform.activity`, `platform.files` 등)입니다. 대부분의 모듈은 비워 둡니다. | 선언한 기능만 `ctx.platform`에 넣고 시험 harness는 이 목록대로 가짜 구현을 준비합니다. |
| `settings` | zod schema와 기본값, 화면 힌트(이름, 구역, 위젯, 최솟값과 최댓값), 버전, 범위(`device` 또는 `account`)입니다. | 사용자가 바꾼 값만 저장하고 설정 화면 구역을 자동으로 만들며 `settings.changed`를 보냅니다. 기기 범위 값은 `settings.json`에 두고 계정 범위 값은 `accounts/<uid>/settings.json`에 두어 계정을 바꾸면 함께 바뀝니다. migration은 옛 기본값과 같은 값만 고칩니다. |
| `local` | 계정 범위와 기기 범위 가운데 하나나 둘의 버전, schema, migration 함수입니다. | `accounts/<uid>/modules/<id>.json`이나 `device/modules/<id>.json`에 원자적으로 저장합니다. 불러올 때 migration을 차례로 실행하고 schema로 검사하며 실패하면 `.bak` 파일을 남기고 기본값으로 시작한 뒤 알림을 띄웁니다. 로컬 데이터는 그 PC에만 남고 다른 PC와 맞출 값은 `server` 컬렉션에 둡니다. |
| `server` | 컬렉션마다 범위(`user`, `user.pub`, `user.inbox`, `room`, `global`), schema, 규칙 템플릿, 하루 한도, 충돌 처리 정책(`merge`), 쓰기 속도(`rate: { perSec, burst }`), 모듈 데이터 버전, migration입니다. 파일을 올리는 모듈은 파일 종류마다 `maxBytes`를 적고 방 범위 컬렉션은 규칙 템플릿으로 방 멤버 쓰기(`roomMember`)와 방 주인만 쓰기(`roomOwner`) 가운데 고르고 지우는 시점을 `roomRetention`에 적습니다. 값은 방이 비면 지우는 `deleteOnEmpty`, 방 주인이 방을 지울 때 함께 지우는 `deleteWithRoom`, 방을 지운 뒤에도 남기는 `keep`입니다. | `ctx.server`가 `mod/<id>/u/{uid}`, `mod/<id>/u/{uid}/pub`, `mod/<id>/u/{uid}/in/{senderUid}`, `mod/<id>/r/{roomId}`, `mod/<id>/g` 안으로 한정한 handle만 줍니다. 다른 사용자의 공개 부분은 읽기 전용 `ctx.server.user(uid).pub(name)`으로 읽습니다(HOM-10, SND-07). 충돌 처리 정책은 코어가 구현한 다섯 가지 가운데 이름으로 고릅니다(10.7.3). 목록 구독에는 limit이 필요하고 모든 기록에 `v`를 붙입니다. 마지막 사람이 방을 나가면 코어가 `deleteOnEmpty` 컬렉션을 지우고 방 주인이 방을 지우면 주인의 앱이 `deleteWithRoom` 컬렉션을 지웁니다(10.7.2). |
| `presence` | 내 방 멤버 기록의 `m.<id>` 아래에 더할 필드마다 schema, 쓰는 방식(`sync`의 `batch`나 `onChange`), 최소 간격(`minIntervalMs`)입니다. 필드를 합쳐 기본 128바이트 이하입니다. | `ctx.room.setMine`이 `batch` 필드는 바뀐 것만 모아 1분 갱신에 함께 쓰고 `onChange` 필드는 바뀔 때 바로 쓰되 `minIntervalMs`보다 자주 쓰지 않습니다. `ctx.room.members()`가 다른 사람의 필드를 타입과 함께 주고 개발판은 필드별 내려받기 바이트를 기록합니다. |
| `profile`, `accountPresence` | 공개 프로필 `users/{uid}/public/m/<id>`와 계정 접속 기록 `users/{uid}/presence/m/<id>`에 더할 필드 schema입니다. | 담당 모듈이 `ctx.self`로 직접 씁니다. 레벨(growth), 지금 있는 방 코드(rooms), 오프라인으로 보이기(friends)가 여기에 들어갑니다(10.7.2). |
| `roomEvents` | 잠깐 쓰는 방 이벤트 종류, payload schema, 분당 한도입니다. | `ctx.room.emit`이 서버 시각과 함께 `rooms/{roomId}/ev`에 붙이고 보낸 앱이 60초 뒤에 지우며 연결이 끊길 때도 지우도록 삭제를 등록합니다. 받는 쪽은 입장 시각의 push 키부터 `limitToLast(50)`으로 구독하고 60초 넘은 이벤트를 버리며 중복을 거릅니다. |
| `ui.windows` | 창 id, 컴포넌트(지연 import), 크기와 최소 크기, 포커스 여부(기본 끔), 하나만 열기, 위치 기억, ESC로 닫기, 층(`panel` 또는 `popup`), `keepAlive`(닫으면 숨기고 컴포넌트는 남김)입니다. | 창 관리자가 겹침 순서, ESC 순서, 위치 저장과 초기화, 테마, 바깥 클릭 닫기, 클릭 영역을 처리합니다. `keepAlive` 창은 닫아도 재생이 이어집니다(SND-04). |
| `externalOrigins` | 모듈이 패널에 넣는 외부 출처 목록입니다(예를 들어 `https://www.youtube.com`). | 코어가 CSP의 `frame-src`에 합칩니다(10.4). |
| `ui.contributions` | 슬롯에 넣을 항목입니다(슬롯, id, 이름, 아이콘, 순서, 표시 조건, 명령이나 컴포넌트, 표시 모드 `quiet`에서 숨길지 정하는 `quiet: 'hide'`). | 슬롯을 연 쪽의 schema로 검사하고 화면에 넣습니다. 표시 모드가 `quiet`이면 `quiet: 'hide'` 항목을 숨깁니다. |
| `commands` | `<id>.<동사>` 이름, 인자 schema, 실행 함수, 실행할 수 없을 때 이유를 돌려주는 `enabledWhen`, 표시 모드 `quiet`에서 막을지 정하는 `quiet: 'block'`입니다. | 메뉴, 상태칩, 트레이, 단축키, 채팅 명령, 다른 모듈, 시험이 모두 이 등록부로 부릅니다. 실행할 수 없는 명령은 이유를 화면에 보여 주고 `quiet: 'block'` 명령은 표시 모드가 `quiet`일 때 코어가 쓸 수 없다는 이유를 돌려줍니다. |
| `shortcuts` | 명령, 물리 키 코드(`KeyT`), 보조 키, 범위(`panel` 또는 `global`)입니다. | 한글 입력 중에도 물리 키 코드로 맞추고 조합 중 Enter는 전역 처리 한 곳에서 막습니다. `global` 범위는 보조 키가 꼭 있어야 합니다. 부팅 때 충돌을 찾고 두 단축키가 충돌하면 둘 다 끄며 OS 등록이 실패한 단축키도 끈 뒤 설정 화면과 진단 요약에 표시합니다. 사용자가 바꾼 키는 기기 범위에 둡니다. 화면 숨기기와 다시 띄우기는 스테이지가 멈춰도 동작해야 하므로 메인 프로세스가 처리하는 코어 단축키이고 이 등록부와 따로 둡니다(NFR-05, SET-03). |
| `emits`, `on` | 내보내는 이벤트 이름과 payload 타입(`EventMap` 확장), 받을 이벤트와 처리 함수입니다. | 같은 프로세스 안의 bus로 전달하고 처리 함수마다 오류를 따로 잡아 한 모듈의 예외가 다른 모듈을 멈추지 않게 합니다. |
| 공개 API | `setup`이 돌려주는 객체이고 타입은 `ModuleApis` 확장으로 선언합니다. | `requires`에 적은 모듈에게만 `ctx.modules.get(id)`로 줍니다. |
| `characterStates` | 자세 id, 우선순위, 조건 함수입니다. 조건 함수가 받는 `seat`에는 코어 필드(`name`, `state`, `look`)와 presence 필드 `m.<id>`가 있습니다. | 매 프레임 높은 순서부터 평가하고 남의 좌석도 같은 `seat` 값으로 평가합니다. 렌더링 backend에 정의되지 않은 id는 기본 자세로 그립니다. |
| `effects` | 효과 id, 한 번 또는 반복, 시드 사용 여부, 렌더링 backend별 구현입니다. 구현은 `(surface, { from, to, seed, appearance }) => Dispose` 모양이고 `surface`는 효과 창의 canvas와 DOM 루트입니다. | `ctx.render.playEffect(seatId, id, seed)`로 실행합니다. 캐릭터가 좌석을 떠나는 효과는 `CharacterView.detach()`로 좌석 그림을 숨기고 효과 창에 같은 외형을 그린 뒤 `reattach()`로 되돌립니다. 표시 모드가 `quiet`이면 실행을 건너뛰고 지금 backend에 구현이 없으면 로그만 남깁니다. |
| `catalog` | 모듈이 정하는 카탈로그 종류와 다른 종류의 항목에 붙일 `ext` 필드 schema입니다. | 앱에 든 기본값과 서버 값을 합쳐 버전 번호로 캐시하고 앱보다 새 schema 번호의 항목은 건너뜁니다. |
| `gates` | 잠금 해제 조건과 계정에 남길지 여부(`sticky`)입니다. 조건은 `{ module: 'growth', key: 'level', gte: tunable('animalUnlockLevel') }`처럼 데이터로 적습니다. | 코어는 gate를 선언한 모듈의 `requires`에 있는 모듈의 공개 API만 읽어 조건을 평가하고 슬롯, 명령, 창의 표시 조건에서 참조합니다. `sticky`이면 `users/{uid}/private/gates/{gateId}`에 해금 시각을 남겨 PC를 바꿔도 열려 있습니다(GRW-03). 방 이벤트는 보낸 쪽만 gate를 확인하고 받는 쪽은 다시 확인하지 않아서 버전이 다른 앱 사이에서도 연출이 어긋나지 않습니다. 구매로 여는 기능은 두지 않습니다(9.1 결정 5). |
| `tunables` | 서버 조정값의 zod schema와 기본값입니다. | 값을 `mod/<id>/g/tunables`에 두고 카탈로그처럼 버전 번호로 캐시합니다. 값마다 `{ value, from, until }` 목록을 받아 기간 한정 조정(OPS-12, GRW-03 행사)을 앱 배포 없이 처리하고 `ctx.tunables.get(key)`가 지금 적용할 값을 줍니다. |
| `assets` | 모듈 `assets/` 폴더의 파일 목록(id, 경로, 이용 조건, 출처)입니다. | `ctx.assets.url(id)`로 필요할 때 읽고 `ctx.audio.play(id, { group })`로 음량 그룹별로 재생합니다. 이용 조건이 없는 항목은 CI를 실패시킵니다. |
| `diagnose` | 상태 몇 줄을 돌려주는 함수입니다. | 로그 폴더의 진단 요약에 붙입니다. |
| `extensionPoints` | 이 모듈이 다른 모듈에 여는 슬롯이나 등록부와 그 schema입니다. | 다른 모듈의 항목을 검사해 확장 지점을 연 모듈에 전달합니다. |
| `setup`과 해제 | `setup(ctx)`와 선택적 공개 API입니다. | `ctx`로 만든 구독, 리스너, 타이머, 창을 기록했다가 해제할 때 모두 정리합니다. |
| 선택 부분 `main.ts`, `functions.ts` | 메인 프로세스 코드와 Cloud Functions입니다. | 드물게 씁니다. `main.ts`는 `mod:<id>:*` IPC 채널을 받고 preload는 범용 `invoke(moduleId, method, args)`만 두므로 브리지는 바뀌지 않습니다. P0과 P1 기능은 두 부분을 쓰지 않습니다. |
| 시험 | 같은 폴더의 `*.test.ts`와 `fixtures/v1.json`입니다. | 등록한 모든 모듈에 적합성 시험을 자동으로 실행합니다(10.10). |

**코어가 모듈에 주는 것**

| ctx 항목 | 주는 것 |
|---|---|
| `ctx.settings` | 타입이 있는 설정 읽기와 쓰기, 변경 구독 |
| `ctx.local` | 계정 범위와 기기 범위 로컬 데이터 읽기와 갱신(쓰기는 모아서 저장) |
| `ctx.server` | 모듈 namespace로 한정한 서버 데이터 handle(읽기, 쓰기, limit 있는 목록, 구독, transaction)과 다른 사용자의 공개 부분을 읽는 `user(uid).pub(name)`(읽기 전용) |
| `ctx.room` | 방 입장과 퇴장 상태, `setMine`, `members`, `emit`, `onEvent`, 입장 전 확인을 등록하는 `beforeJoin`, 방 만들기 `create`, 주인만 부르는 방 지우기 `remove`, 방 주인 uid를 주는 `owner`(10.6의 방 주인 권한) |
| `ctx.self` | 내 기록의 코어 필드 쓰기. `setAppearance(appearance)`는 wardrobe가 부르고 `setName(name)`은 account가 부르며 `setStatus(sourceId, value, priority)`는 상태를 내는 모든 모듈이 부릅니다. manifest의 `profile`과 `accountPresence` 필드도 여기서 씁니다(10.7.2). |
| `ctx.seats` | 좌석 목록과 anchor 읽기, 로컬 좌석 더하기와 빼기, 순서와 간격 힌트, 한 좌석을 다른 좌석의 anchor에 붙이고 떼기, 책상 하나에 좌석 여러 개 두기(10.8.2) |
| `ctx.mode` | 표시 모드 `get()`과 `on(change)`. 값은 `normal`, `quiet`, `hidden`이고 SET-03 모듈이 켜고 끕니다. `quiet`이면 코어가 `ctx.audio` 전체 음량을 0으로 두고 효과 실행을 건너뛰며 `quiet` 표시가 있는 슬롯 항목과 명령을 숨기거나 막습니다. 열린 창을 닫는 일처럼 모듈마다 다른 동작은 `on(change)`로 처리합니다. |
| `ctx.bus`, `ctx.commands`, `ctx.modules` | 이벤트, 명령 실행, 의존 모듈의 공개 API |
| `ctx.ui` | `open`, `close`, `toast`, `confirm`, `prompt`(앱 안 대화상자), `pickTarget`(효과 창에서 몇 초 동안 대상 고르기) |
| `ctx.clock`, `ctx.timers` | `now`, `serverNow`, `dayKey`, `weekKey(boundary)`(정산 요일과 시각을 인자로 받음), `season`과 해제가 자동인 `every`, `at`, `debounce` |
| `ctx.tunables` | manifest `tunables` 값 가운데 지금 적용할 값 |
| `ctx.activity` | 500밀리초 활동 샘플(앞에 있는 앱 키, 유휴 초, 펜 앱 여부, 알 수 없을 때 이유)과 직전에 쓴 앱. `uses`에 `platform.activity`를 적은 모듈만 받습니다. |
| `ctx.platform` | `uses`에 적은 그 밖의 OS 기능만 |
| `ctx.render` | `createView`, `renderScene`, `playEffect` |
| `ctx.catalog`, `ctx.assets`, `ctx.audio` | 합친 카탈로그, 에셋 주소, 음량 그룹별 재생, 외부 플레이어 음량을 그룹에 넣는 `registerExternal(group, setVolume)` |
| `ctx.files` | `saveToDisk`(저장 대화상자), `openImage`(이미지 열기), `openFile({ accept })`(캐릭터 JSON 같은 파일 열기, AVT-17), `upload(bytes, { maxBytes })`와 `get(hash)`(서버 `files/{sha256}`, OUR-02, OUR-03, HOM-06, HOM-12, COM-18) |
| `ctx.shell` | `openExternal(url)`(http와 https 주소만 받음, NFR-18), `openLogFolder()`(SET-11, OPS-03) |
| `ctx.app` | `version`(SET-12, OPS-17), 런처 화면과 실행 화면을 바꾸는 `setMode('launcher')`와 `setMode('run')`(SCR-02, CHR-04) |
| `ctx.notify` | OS 알림(M2b에서 채팅 안 읽음 알림과 함께 추가) |
| `ctx.gates`, `ctx.log`, `ctx.lifecycle` | 잠금 확인, 모듈 이름이 붙은 로그, 절전과 복귀와 종료와 연결 상태 이벤트 |

**만드는 시점** M0는 M1 모듈이 쓰는 계약 부분과 저장하거나 주고받는 형식이 걸린 부분만 만듭니다. 형식이 걸린 부분은 멤버 기록의 키와 코어 필드(`mods`, `seenAt` 포함), presence의 `sync`, `Appearance` v1, 방 기록의 `owner`와 `roster`이고 나중에 바꾸면 migration을 쓰거나 `PROTO`를 올려야 합니다. `effects`, `roomEvents`, `gates`, `shortcuts`의 `global` 범위, `main.ts`, `functions.ts`, `ctx.seats`의 로컬 좌석과 붙이기, `ctx.mode`, `ctx.shell`, `ctx.ui.pickTarget`은 M0에 타입만 두고 처음 쓰는 단계에서 구현합니다(10.3의 11번).

**코어 설정** 자동 실행(SET-01), 모니터 선택(SET-06), 화면 확대와 크기(SET-07, SET-17), 진단 기록 폴더 열기(SET-11), 머리 위 표시 끄기(SET-14), 창 위치 초기화(SET-16), 영상 겹침 우회(SET-04), 테마(SET-05), 저해상도 도트 렌더(SET-13), 상태칩 배치(SET-15)는 스테이지 창, `CharacterView`, 창 관리자, OverlayWindow가 쓰는 코어 값이라서 모듈이 아니라 코어 설정으로 둡니다. 코어 설정 탭은 코어가 그리고 이 기능들의 `specIds`는 `src/renderer/core/manifest.ts`에 적어 `scripts/coverage` 표에 함께 셉니다. 각 항목은 그 기능이 들어가는 단계에서 구현합니다.

**모듈이 지킬 규칙**

1. 바깥 접근은 `ctx`로만 합니다. 모듈 밖으로 나가는 import는 경로 별칭(`@shared`, `@core/types`, `@modules/<id>/api`)으로만 씁니다. ESLint `no-restricted-imports`는 import 문자열만 비교해서 같은 모듈의 `../model/state`와 다른 모듈의 `../gacha/logic`을 나누지 못하므로 `scripts/check-imports`가 import 경로를 해석해 모듈 경계를 확인합니다.
2. 타이머는 `ctx.timers`로만 만들고 `setInterval`을 직접 쓰면 lint 오류입니다.
3. 서버 경로를 문자열로 만들지 않고 `ctx.server` handle만 씁니다. 목록 구독에는 limit을 둡니다.
4. 저장하는 기록에는 `v`를 넣고 schema를 바꾸면 migration 함수와 고정 자료를 함께 더합니다.
5. presence 필드는 128바이트 이하로 두고 필드를 더하기만 하며 기존 필드의 뜻을 바꾸지 않습니다. 방 이벤트 형식을 호환되지 않게 바꿀 때는 새 이벤트 이름(`photo.pose2`)을 씁니다. 옛 앱은 처리 함수가 없는 이름을 무시하므로 `PROTO`를 올리지 않아도 됩니다. 상대 앱에 모듈이 있는지는 멤버 기록의 `mods`로 확인합니다(10.10.4).
6. 글 입력과 패널 범위 단축키는 포커스를 받는 패널 창에서만 받습니다.
7. 50밀리초 넘게 걸릴 수 있는 작업(이미지 처리, 큰 JSON 처리)은 Web Worker에서 합니다.
8. 입력 내용, 창 제목, 앱 이름은 서버에 보내지 않습니다.
9. 관리 기능은 모듈에 넣지 않고 `scripts/`에 둡니다.
10. 에셋은 이용 조건과 출처를 적은 목록과 함께 둡니다.
11. 이벤트, 명령, 설정 키, 창 id에는 모듈 id 접두어를 씁니다.
12. 기능을 없앨 때는 폴더와 import 줄을 지우고 서버 데이터는 `scripts/drop-namespace <id>`로 정리합니다.
13. 순수 로직 시험, v1 고정 자료, `diagnose`를 함께 둡니다.

### 10.6 확장 지점

| 확장 지점 | 담당 | 모듈이 할 수 있는 일 | 쓰는 기능 예 |
|---|---|---|---|
| 모듈 등록부 `src/modules/index.ts` | 코어 | import 한 줄로 기능을 넣고 뺍니다. | 모든 기능 |
| 명령 등록부 | 코어 | 이름 있는 동작을 메뉴, 상태칩, 트레이, 단축키, 채팅, 시험에서 부르게 합니다. | CHR-04, COM-14 |
| 슬롯 `chip.buttons` | 코어 | 상태칩에 버튼과 배지를 더합니다. | CHR-03, COM-02, HOM-22 |
| 슬롯 `menu.main` | 코어 | ▼ 메뉴에 항목을 더합니다. | CHR-04, FOC-03 |
| 슬롯 `tray` | 코어 | 트레이 메뉴에 항목을 더합니다. | NFR-03, SET-16 |
| 슬롯 `launcher.cards` | 코어 | 런처에 카드를 더합니다. | SCR-02, ROM-05, AVT-15 |
| 슬롯 `settings.tabs` | 코어 | 설정 탭을 더하거나 schema로 만든 구역을 씁니다. | SCR-04, SCR-06, FOC-01 |
| 슬롯 `seat.labels` | 코어 | 내 좌석과 남의 좌석 머리 위에 표시를 더합니다. | CHR-02, CHR-09, FOC-06 |
| 슬롯 `member.menu` | 코어 | 다른 사용자 메뉴에 항목을 더합니다. | ROM-11, FRD-02 |
| 창 선언 `ui.windows` | 코어 | 패널과 팝업 창을 얻습니다. | SCR-07 |
| 단축키 | 코어 | 한글 입력 중에도 동작하는 물리 키 단축키를 명령에 연결합니다. | GCH-01, COM-15 |
| 이벤트 bus | 코어 | 도메인 이벤트를 보내고 받습니다. | GRW-01(`focus.tick` 수신), GCH-02 |
| 모듈 공개 API | 코어 | 의존 모듈의 함수를 타입과 함께 부릅니다. | TDO-01이 `gacha.grantTickets` 호출 |
| presence 필드 | 코어 | 방 멤버 기록에 작은 필드를 더합니다. | CHR-05, FOC-06, SND-09 |
| 좌석 `ctx.seats` | 코어 | 좌석 목록과 anchor를 읽고 로컬 좌석을 더하거나 빼며 순서와 간격 힌트를 줍니다. 좌석을 다른 좌석의 anchor에 붙이고 책상 하나에 좌석 여러 개를 둡니다. | AVT-21, AVT-22, COM-16, HOM-17 |
| 표시 모드 `ctx.mode` | 코어 | 표시 모드를 바꾸고 바뀔 때 알림을 받습니다. 슬롯 항목과 명령은 선언 한 줄로 모드를 따릅니다. | SET-03 |
| 상태 출처 `ctx.self.setStatus` | 코어 | 우선순위가 있는 상태 값을 냅니다. 코어가 가장 높은 값을 멤버 기록의 `state`로 씁니다. | CHR-06, CHR-10 |
| 방 이벤트 | 코어 | 서버 시각과 시드가 있는 잠깐 이벤트를 보냅니다. | COM-10, COM-11, CHR-11 |
| 서버 컬렉션과 규칙 조각 | 코어 | 사용자, 공개, 방, 전체 범위 데이터와 하루 한도를 둡니다. 방 범위 데이터는 방 멤버가 쓰는 `roomMember`와 방 주인만 쓰는 `roomOwner` 가운데 고릅니다. | HOM-09, COM-15, OUR-01, OUR-02 |
| 로컬 데이터 | 코어 | 계정 범위나 기기 범위 파일을 둡니다. | FOC-01, SET-06 |
| 카탈로그 종류와 `ext` | 코어 | 새 콘텐츠 종류를 만들거나 다른 종류 항목에 필드를 더합니다. | AVT-11, AVT-13, COM-18 |
| 자세 상태 | 코어 | 우선순위가 있는 자세 조건을 더합니다. | CHR-05, CHR-06, COM-10 |
| 효과 | 코어 | backend별 연출을 등록합니다. | COM-05, COM-13, HOM-17 |
| gate | 코어 | 잠금 해제 조건을 정합니다. | GRW-03, AVT-02 |
| 에셋과 소리 | 코어 | 이용 조건을 적은 그림과 소리를 넣습니다. | SND-08, NFR-23 |
| 진단 | 코어 | 진단 요약에 상태 줄을 더합니다. | NFR-21 |
| `home.tabs`, `home.desktopFolder`(방문 hook 포함) | home 모듈 | 마이홈 탭과 바탕화면 폴더를 더하고 방문 모드에서 읽기 전용으로 보여 줍니다. | HOM-11, HOM-12, HOM-16, ACC-10 |
| `focus.drawer` | focus 모듈 | 포커스 기록 창에 서랍을 더합니다. | FOC-07, GRW-06 |
| `focus.sources` | focus 모듈 | 집중 신호 출처(출처 id, 깨어 있음 여부, 앱 표시 이름, 최대 4시간 인정)를 더합니다. | FOC-09 |
| `chat.commands`, `chat.toolbar` | chat 모듈 | 채팅 명령과 채팅 도구 버튼을 더합니다. | COM-14, COM-15, COM-18 |
| `rooms.settings` | rooms 모듈 | 방 주인에게 보이는 방 설정 창에 구역을 더합니다. | OUR-02(가챠 설정) |
| `ctx.room.beforeRemove` | 코어 | 방 주인이 방을 지울 때 먼저 부를 처리 함수를 더합니다. 코어는 처리 함수를 차례로 기다린 뒤 방을 지움 표시로 바꿉니다. 물어볼 것은 모듈이 방 설정 창에 미리 두는 설정으로 받습니다. | OUR-02(뽑은 아이템 남기기와 함께 지우기) |
| `wardrobe.itemSources` | wardrobe 모듈 | 아이템 보유와 해금 정보를 꾸미기 창에 알립니다. 방별 가챠의 보관함이 스티커로 붙일 아이템을 여기로 넘깁니다. | OUR-02, GCH-01, AVT-05 |
| `ServerPort`, `CharacterView`, platform adapter | 코어 전용 | 모듈은 쓰지 않습니다. 코어가 서버, 그리기 방식, OS 구현을 바꿀 때 모듈을 그대로 두는 경계입니다. | 10.7, 10.8 |

코어를 고쳐야 하는 경우는 세 가지입니다. 첫째는 새 OS 기능이 필요할 때이고 adapter 메서드 하나를 Windows 구현과 `FakePlatform`에 구현한 뒤 `ctx.platform`에 메서드 하나를 더합니다. Mac 구현은 Mac판을 만들 때 더합니다. 둘째는 두 모듈 이상이 같은 새 계약 부분을 필요로 할 때이고 ADR을 남깁니다. 앞의 두 경우에는 특정 기능의 이름이 코어에 들어가지 않습니다. 셋째는 신원 단계나 계정 폴더를 바꾸는 코어 신원 기능(ACC-05, ACC-12, SCR-08)을 넣을 때이고 이때도 ADR을 남깁니다(10.7.2).

보상 지급은 두 안이 다르게 풀었습니다. 직접 서버안은 성장 모듈에 `growth.rewardSource` 등록부를 두고 다른 모듈이 보상 공급자를 등록하게 했고 관리형 서버안은 가챠 모듈의 공개 API `grantTickets(n, tag)` 하나를 두었습니다. 보상을 주는 모듈이 가챠를 `requires`에 적고 함수 하나를 부르면 끝나므로 이 장은 공개 API 쪽을 고르고 등록부를 하나 줄입니다. `tag`를 먼저 기록하고 지급하므로 같은 보상을 두 번 주지 않습니다. 9.3의 방별 가챠(OUR-02)는 뽑기 횟수를 방마다 따로 두므로 이 API는 `grantTickets(roomId, n, tag)`로 받을 방을 함께 받고 레벨은 뽑기 횟수를 주지 않습니다.

**방 주인 권한(9.3 OUR-01)** 원래 계약의 방 범위 데이터는 방 멤버가 쓰는 것 하나였습니다. 9.3의 주인이 있는 방에서는 방 주인만 바꾸는 방 데이터가 생기고 rooms 모듈(정원 설정)과 gacha 모듈(가챠 설정과 삭제 표시) 두 모듈이 이 데이터를 씁니다. 그래서 10.3의 11번에 따라 규칙 템플릿 `roomOwner`, `roomRetention`의 `deleteWithRoom`, `ctx.room`의 `create`와 `remove`와 `owner`를 계약에 더하고 ADR을 남깁니다. 셋 모두 기능 이름이 없는 범용 기능이고 코어가 방 주인을 확인하는 곳은 `rooms/{roomId}/meta`의 `owner` 하나입니다(10.7.2). 방을 지울 때 모듈마다 할 일(가챠의 남기기와 함께 지우기)은 코어의 `ctx.room.beforeRemove`로 받고 무엇을 할지는 모듈이 방 설정 창에 둔 설정으로 미리 정합니다. 멤버가 만들고 주인이 고치거나 지우는 가챠 아이템처럼 두 쓰기 권한이 섞이는 데이터는 모듈의 규칙 조각이 두 템플릿을 조건으로 묶어 씁니다.

### 10.7 데이터 계층과 서버

모든 데이터는 코어 서비스로만 읽고 씁니다. 저장소는 친구 PC의 로컬 저장과 Firebase 두 곳입니다.

#### 10.7.1 로컬 저장

```
userData/                              (설치 폴더 밖이라 업데이트와 재설치에도 남음)
  settings.json                        기기 범위 설정(코어와 모듈). 사용자가 바꾼 값과 schemaVersion만
  accounts/<uid>/settings.json         계정 범위 설정. 사용자가 바꾼 값과 schemaVersion만
  accounts/<uid>/modules/<id>.json     계정 범위 모듈 데이터 {v, data}
  device/modules/<id>.json             기기 범위 데이터 (등록 앱 키, 창 위치, 고른 모니터)
  IndexedDB/                           Firebase JS SDK가 남긴 로그인 상태 (SDK가 관리)
  cache/catalog/<kind>.json            합친 카탈로그와 버전 번호
  cache/files/<sha256>.png             자세 그림과 아이템 그림 같은 파일 (내용 해시가 파일 이름)
  backups/<시각>/                       migration 전에 복사한 계정 폴더 (최근 5개)
  logs/                                electron-log 회전 로그와 진단 요약
```

메인 프로세스가 모든 파일을 임시 파일에 먼저 쓴 뒤 이름을 바꾸는 방식으로 저장합니다. 파일마다 쓰기 요청을 모았다가 저장하고 종료, 절전, 로그오프 때는 바로 씁니다. 집중 시간은 메모리에 모았다가 30초마다 저장합니다. 계정을 바꾸면 `accounts/<uid>/` 폴더만 바꾸므로 지울 키 목록이 없습니다. 그림 파일 이름에 캐릭터 ID나 슬롯 번호 대신 내용 해시를 쓰면 캐릭터를 복사하거나 끼워 넣어도 그림이 다른 캐릭터에 연결되지 않습니다(NFR-16의 텍스처 밀림).

#### 10.7.2 서버 데이터와 namespace

```
users/{uid}/public              이름, 친구 코드, 외형 해시, m.{moduleId} (로그인한 사용자가 읽음)
users/{uid}/presence            online, lastSeen, m.{moduleId} (연결이 끊길 때 offline을 씀)
users/{uid}/private             본인만 읽고 씀 (gates/{gateId}의 해금 시각 포함)
codes/{friendCode}              uid (한 번만 만듦, 친구 코드는 별칭)
mod/{id}/u/{uid}                모듈 사용자 데이터 (기본 본인만)
mod/{id}/u/{uid}/pub            모듈이 선언한 공개 부분 (비공개 부분과 한 번에 씀)
mod/{id}/u/{uid}/in/{senderUid} 받은 기록 (보낸 사람이 자기 uid 키로 만들고 받은 사람이 읽고 지움)
mod/{id}/r/{roomId}             방 범위 모듈 데이터 (방 멤버가 읽음, 쓰기는 roomMember나 roomOwner, roomRetention에 따라 지움)
mod/{id}/g                      모듈 전체 범위 데이터 (하루 한도, tunables 등)
rooms/{roomId}/meta             kind, owner, createdAt, deletedAt (owner는 만들 때 한 번 씀, 주인이 지우면 deletedAt만 더함)
rooms/{roomId}/roster/{uid}     처음 들어온 시각 (한 번이라도 들어온 사람, 규칙이 방 멤버를 이 목록으로 확인)
rooms/{roomId}/members/{uid}_{deviceId}
                                name, look, state, proto, mods, joinedAt, seenAt, m.{moduleId}
rooms/{roomId}/ev/{pushId}      잠깐 쓰는 방 이벤트 (서버 시각, 보낸 앱이 60초 뒤 지움)
catalog/{kind}                  선물하는 사람이 배포하는 콘텐츠
catalogVersion/{kind}           버전 번호 (앱은 이것만 구독)
config                          minProtocol
files/{sha256}                  base64로 바꾼 뒤 64KB 이하인 파일 (Spark 요금제일 때)
```

`files/{sha256}`의 64KB는 base64로 바꾼 뒤 크기입니다. base64는 원래 크기보다 약 33% 커지므로 원래 파일로는 약 48KB까지 담습니다.

**신원** 신원은 선물하는 사람이 `scripts/create-account <이름>`으로 만든 Firebase Authentication 계정입니다. 스크립트는 임의 이메일 주소와 24자 비밀번호로 계정을 만들고 친구 코드와 `users/{uid}/public`을 쓴 뒤 설정 코드 한 줄을 출력합니다. 친구는 첫 실행 때 설정 코드를 넣고 로그인 상태는 Firebase JS SDK가 렌더러의 IndexedDB에 남깁니다. userData는 재설치에도 남으므로 SDK 저장만으로 재시작과 재설치 뒤에도 로그인이 유지되고 로그인이 풀리면 앱은 설정 코드 입력 창을 다시 띄웁니다. 앱은 로그인 정보를 따로 암호화해 두지 않습니다. `safeStorage`를 쓰면 서명하지 않은 Mac 앱에서 키체인 항목 때문에 업데이트 뒤 키체인 암호를 묻는 창이 뜰 수 있는데 이 동작은 확인하지 않았습니다. 코드를 잃으면 선물하는 사람이 스크립트로 비밀번호를 새로 만듭니다(ACC-04, ACC-08). 비밀번호를 새로 만들면 기존 로그인이 끊기는 것으로 알고 있어 옛 코드도 함께 무효가 됩니다. 앱이 첫 실행 때 스스로 계정을 만드는 익명 로그인은 새 PC로 옮기거나 데이터 폴더를 지우면 uid를 잃고 그 uid에 저장한 레벨과 캐릭터를 다시 찾을 방법이 없어서 발급 방식을 씁니다(7장 ACC-04, 10.14의 2번).

**코어 신원 기능** 기기 연동 해제(ACC-05), 한 계정 한 기기(ACC-12, SCR-08)는 모듈 단계보다 먼저 끝나는 신원 단계나 계정 폴더 `accounts/<uid>/`를 바꾸므로 코어 신원 기능으로 표시하고 M3에서 ADR과 함께 코어에 더합니다. 계정은 선물하는 사람의 스크립트만 만들기 때문에 앱이 초대 코드로 계정을 만들려면 Cloud Function이나 익명 로그인 뒤 연결하는 흐름이 필요하고 Spark에서 서버 코드 없이 만들 방법은 아직 없습니다. 10월 8일에 초대 코드 가입(ACC-01)은 만들지 않기로 정했습니다(10.14의 14번).

**규칙** 규칙 파일은 `rules/build.ts`가 코어 규칙과 모듈마다의 `rules.ts` 조각을 합쳐 만듭니다. 조각은 템플릿 함수를 부르는 짧은 코드이고 M0의 `build.ts`는 조각을 합치다가 조각이 자기 namespace 밖 경로를 쓰거나 읽으면 실패합니다. 150초 같은 공통 상수와 시각 순서 구독에 필요한 `.indexOn`도 `build.ts`가 넣습니다. zod schema에서 문자열 길이, 숫자 범위, 열거값, 정의하지 않은 키 거부 검사를 만드는 부분은 같은 검사가 여러 모듈에 반복될 때 더합니다. 이 규칙이 서버 쪽 권한 검사 전부이고(NFR-18) 에뮬레이터 시험이 소유자, 방 주인, 방 멤버, 다른 사용자, 로그인하지 않은 사용자로 허용과 거부를 확인합니다. 한 사용자가 다른 사용자에게 쓰는 기록(친구 신청, 방명록)은 보낸 사람을 앱이 적은 값이 아니라 규칙의 로그인 uid로 확인합니다.

| 템플릿 | 허용하는 읽기와 쓰기 | 쓰는 기능 예 |
|---|---|---|
| `owner` | 본인만 읽고 씀 | FOC-02, GCH-07 |
| `ownerWritePublicRead` | 본인이 쓰고 로그인한 사용자가 읽음 | HOM-10, SND-07 |
| `roomMember` | 방 멤버(`roster`에 있는 사람)만 읽고 씀 | COM-15, TDO-01 |
| `roomOwner` | 방 주인(`meta/owner`)만 쓰고 방 멤버가 읽음. 지운 방에는 쓰지 못함 | OUR-01, OUR-02 |
| `appendOnly` | 만들기만 하고 고치거나 지우지 못함 | COM-01 |
| `dailyQuota` | `scope`(`user`, `pair`, `room`, `global`)와 `dayKey`마다 정한 횟수까지만 1씩 올림 | COM-15 |
| `inbox` | 보낸 사람이 받는 사람의 `in/{senderUid}` 아래에 자기 uid 키로 만들기만 하고 받는 사람이 읽고 지움. 방명록처럼 방문자에게 보여야 하면 읽기 범위를 로그인한 사용자로 넓힘 | FRD-02, FRD-04, HOM-09, HOM-14 |
| `counter` | 다른 사용자가 1씩 올리기만 함 | HOM-15 |
| `globalOwnKey` | 전체 범위에서 자기 uid 키만 씀 | SND-06 |
| `keyedWrite` | 로그인하지 않은 쓰기를 키 해시와 PC 실행 중 표시가 맞을 때만 받음 | FOC-09 |

친구 사이 장난 횟수처럼 비용과 관계없는 한도는 규칙 없이 앱만 셉니다(COM-11의 하루 30회, HOM-15의 방문자 한 사람당 하루 5회). 다른 모듈 경로는 읽기 참조도 막고 예외는 `friendsRead` 하나만 둡니다. `friendsRead`는 friends 모듈의 친구 목록 경로를 읽기로만 참조해 친구에게만 보이는 데이터(HOM-10의 친구 공개, 친구에게만 보이는 방 코드)를 만듭니다. 10월 8일에 친구에게만 보이게 하기로 정해서 이 예외를 씁니다(10.14의 16번).

**방 주인과 방 보존(9.3 OUR-01)** 방을 만든 사람의 uid를 `meta/owner`에 한 번만 쓰고 방은 주인이 지울 때까지 남습니다. 방 설정은 기능 이름이 코어에 들어가지 않도록 설정을 쓰는 모듈의 namespace에 두므로 방 메타는 아래 세 곳에 나눠 둡니다. `{code}`는 방 코드이고 위 목록의 `{roomId}`와 같습니다.

```
rooms/{code}/meta                  kind, owner, createdAt, deletedAt             코어
mod/rooms/r/{code}/cfg             cap(2부터 10), v                              roomOwner, deleteWithRoom
mod/gacha/r/{code}/cfg             adders(owner 또는 members), secPerTicket(기본 3600), v
                                                                                 roomOwner, deleteWithRoom
```

- `meta`는 없을 때만 만들고 `owner`는 로그인 uid와 같아야 합니다. 그 뒤에는 주인만 `deletedAt`을 한 번 쓰고 `meta` 자체는 지우지 않으므로 지운 방의 코드로 방을 다시 만들 수 없습니다.
- `roster/{uid}`는 본인 uid 키로만 만들고 `deletedAt`이 없는 방에서만 만듭니다. 멤버 기록(`members`)도 `roster`에 있는 사람만 씁니다.
- `roomOwner`는 `meta/owner`가 로그인 uid이고 `deletedAt`이 없을 때만 쓰기를 받고 읽기는 `roster`에 있는 사람에게 엽니다.
- 주인이 방을 지우면 주인의 앱이 `ctx.room.beforeRemove` 처리(10.6)를 마친 뒤 `deletedAt`을 쓰고 `members`, `ev`, 모듈의 `deleteWithRoom` 컬렉션을 지웁니다. `meta`, `roster`, `keep` 컬렉션은 남아서 멤버 앱이 다음 동기화 때 삭제 표시를 읽습니다. 주인은 넘기지 않습니다(10.14의 17번).

**방별 가챠 데이터(9.3 OUR-02)** 아이템 목록과 삭제 표시는 방 범위에 두고 횟수와 보관함은 사용자 범위에 둡니다.

```
mod/gacha/r/{code}/items/{itemId}        name, file(sha256), w(1부터 100), by(넣은 uid), st(on 또는 off), at, v
                                                                                 deleteWithRoom
mod/gacha/r/{code}/tomb/{itemId}         mode(keep 또는 revoke), at (방 전체는 itemId 자리에 _room)
                                                                                 roomOwner, keep
mod/gacha/u/{uid}/r/{code}               sec, spent, bonus, tags/{tag}, v       owner(본인만)
mod/gacha/u/{uid}/r/{code}/got/{itemId}  n, name, file, at (보관함 항목)
```

`sec`는 그 방에 들어가 있는 동안 쌓인 포커스 초이고 다른 멤버가 없어도 더합니다. 앱은 60초마다 서버의 더하기 연산(`increment`)으로 쓰므로 한 계정의 두 PC가 서로 덮지 않고 다른 사람이 이 기록을 구독하지 않아 내려받기도 늘지 않습니다. 보관함 항목은 경로로 출처 방 코드와 아이템 id를 기록하고 뽑을 때의 이름과 그림 해시를 복사해 둡니다. 그래서 아이템이나 방이 지워져도 남기기를 고른 아이템은 그대로 보이고 다른 방에서도 스티커로 씁니다. 보관함 항목을 횟수 기록 아래에 두었기 때문에 뽑기 한 번이 이 기록 하나의 transaction으로 끝납니다.

- `items`는 주인이 만들고 고치고 지웁니다. 멤버는 같은 방 `cfg/adders`가 `members`일 때 `by`가 자기 uid인 항목을 만들기만 하고 고치거나 지우지 못합니다. `w`는 1부터 100까지의 정수이고 `file`은 64자 해시입니다. 항목을 지우는 쓰기는 같은 다중 경로 쓰기 안에 `tomb/{itemId}`가 있어야 받습니다.
- `tomb`는 주인만 만들고 한 번 만든 뒤에는 고치거나 지우지 못합니다.
- 사용자 기록은 본인만 쓰고 `sec`, `spent`, `bonus`, `got/{itemId}/n`은 줄지 않습니다. `spent`가 늘 때는 `(spent - bonus) * secPerTicket <= sec`가 참이고 방에 `deletedAt`이 없어야 합니다. 이 식은 남은 횟수 `floor(sec / secPerTicket) + bonus - spent`가 0 아래로 내려가지 않는다는 뜻입니다.
- `got/{itemId}`는 그 아이템이 `st`가 `on`인 채 방 목록에 있을 때만 만들고 개수는 같은 쓰기에서 늘어난 `spent`보다 많이 늘지 않습니다. `got/{itemId}`를 지우는 쓰기는 `tomb/{itemId}`나 `tomb/_room`의 `mode`가 `revoke`일 때만 받습니다.
- 어느 아이템이 나올지는 앱이 정하므로 규칙은 횟수와 출처만 지키고 고친 앱이 원하는 아이템을 고르는 것까지 막지는 못합니다. 친구 사이에는 이 정도로 충분하다고 보고 10.14의 7번에서 이 방식으로 정했습니다.

삭제 표시는 지우지 않고 남깁니다. 각 앱은 부팅할 때와 보관함 창을 열 때 자기 `mod/gacha/u/{uid}/r` 목록(limit 50)의 방마다 `tomb`를 읽고 `revoke` 항목을 보관함과 캐릭터 스티커에서 뺀 뒤 서버의 `got` 항목을 지웁니다. 그래서 오래 앱을 켜지 않은 멤버에게도 함께 지우기가 전달됩니다. 아이템 그림과 자세 그림(OUR-03)은 앱이 Web Worker에서 256px 정도의 PNG로 줄여 `files/{sha256}`에 올리고 base64로 64KB(원래 파일 약 48KB)를 넘으면 받지 않고 안내하므로 Spark 요금제 안에서 처리합니다. 함께 지우기를 골라도 `files/{sha256}`는 지우지 않습니다. 같은 그림을 다른 아이템이나 남기기로 남은 보관함 항목이 쓸 수 있고 파일 하나가 64KB 이하라 저장 한도 1GB에 주는 영향이 작습니다.

**방 접속 상태** 방에 들어가기 전에 RoomSession은 `room.beforeJoin`에 등록한 확인을 모두 부릅니다. 모듈은 비동기로 거부 이유를 돌려주고 코어는 그 이유를 화면에 보이며 자동 재입장도 같은 확인을 거칩니다. 확인을 통과하면 RoomSession은 처음 들어오는 방이면 `roster/{uid}`를 먼저 쓰고 `rooms/{roomId}/members/{uid}_{deviceId}`에 코어 필드와 모듈 필드(`m.<id>`)를 한 번에 씁니다. 기록 키에 기기 id가 있어서 한 계정으로 두 PC가 같은 방에 들어가도 한쪽 연결이 끊길 때 등록한 삭제가 다른 쪽 기록을 지우지 않고 화면에는 같은 uid 가운데 가장 최근 기록만 그립니다. 연결이 끊길 때 이 기록을 지우는 삭제를 서버에 미리 등록하고 다시 연결될 때마다 다시 등록합니다. `seenAt`은 60초마다 `batch` 모듈 필드(오늘 집중 시간 등)와 함께 한 번에 쓰므로 따로 하트비트를 보내지 않습니다. `state`와 `onChange` 모듈 필드는 바뀔 때 바로 쓰므로 CHR-10에서 고른 상태가 친구 화면에 바로 나타납니다(ROM-08). 다른 앱은 서버 시각 기준으로 `seenAt`이 150초 넘게 바뀌지 않은 멤버를 화면에서 빼고 규칙은 150초 넘은 기록을 방 멤버 누구나 지울 수 있게 합니다. 150초는 `src/shared/constants.ts`의 상수 하나이고 앱의 거름 조건과 `rules/build.ts`가 같은 값을 씁니다. 절전에 들어가면 코어가 상태 출처 `core.sleep`으로 자리비움을 내고 깨어나면 바로 다시 들어갑니다. 마지막으로 나가는 앱은 `ev`와 `deleteOnEmpty` 컬렉션만 지우고 `meta`와 `roster`는 주인이 방을 지울 때까지 남깁니다(9.3 OUR-01).

코어 멤버 필드마다 쓰는 쪽은 하나입니다.

| 코어 멤버 필드 | 쓰는 쪽 | 내용 |
|---|---|---|
| `name` | account 모듈이 `ctx.self.setName`으로 씀 | 닉네임 |
| `look` | wardrobe 모듈이 `ctx.self.setAppearance`로 씀 | 지금 쓰는 슬롯(AVT-15)의 `Appearance` JSON을 `files/{sha256}`에 올린 해시 |
| `state` | 코어가 계산 | `ctx.self.setStatus(sourceId, value, priority)`로 받은 값 가운데 우선순위가 가장 높은 값입니다. 열거값은 코어가 정하고 우선순위가 같으면 나중에 낸 값을 씁니다. 예를 들어 CHR-10의 밥 먹는 중과 게임 중은 CHR-06의 자동 자리비움보다 높은 우선순위로 냅니다. |
| `proto`, `mods` | 코어 | 방 프로토콜 번호, 모듈 id와 데이터 버전의 짧은 목록(10.10.4) |
| `joinedAt`, `seenAt` | 코어 | 들어온 시각과 마지막 갱신 시각(서버 시각) |

깨어 있음 여부는 코어 필드가 아니라 focus 모듈의 presence 필드 `m.focus.awake`이고 다른 모듈은 `characterStates`가 받는 `seat.m.focus`로 읽습니다.

**계정 접속 상태** 방 밖에서도 보이는 접속 여부는 `users/{uid}/presence`에 둡니다. 코어가 online과 lastSeen을 쓰고 연결이 끊길 때 offline을 쓰도록 미리 등록합니다. 모듈은 manifest의 `accountPresence`로 필드를 더합니다. 예를 들어 rooms 모듈은 지금 있는 방 코드를 더하고 friends 모듈은 오프라인으로 보이기 표시를 더합니다(FRD-03, FRD-05, FRD-06). 오프라인으로 보이기가 켜져 있으면 코어는 다시 연결되어도 online을 쓰지 않습니다. 방 코드는 `friendsRead` 템플릿으로 친구에게만 보입니다(10.14의 16번).

생존 확인은 60초 갱신과 150초 기준입니다(10.14의 5번). Realtime Database에서는 하트비트가 방 멤버 모두가 구독하는 기록에 쓰이므로 15초 간격이면 10명 방의 내려받기가 60초 간격의 4배인 한 달 약 1.6GB가 됩니다(아래 계산). 정상 종료와 앱 충돌은 연결이 끊길 때의 삭제가 바로 처리하고 150초 기준은 네트워크가 갑자기 끊긴 경우를 위한 대비입니다. 갑자기 끊긴 연결을 Firebase 서버가 몇 초 만에 정리하는지는 확인하지 못했으므로 M0에서 랜선을 뽑아 잽니다. 친구들이 150초를 길다고 느끼면 20초 갱신과 60초 기준으로 줄일 수 있고 이때 비용은 60초 간격의 3배(10명 기준 한 달 약 1.2GB)입니다.

**순서와 시각** 채팅과 이벤트는 서버가 정하는 push 키와 서버 시각으로 정렬합니다. `dayKey`는 `.info/serverTimeOffset`으로 구한 서버 시각에 9시간을 더하고 6시간을 뺀 날짜이고 모든 하루 한도와 하루 기록이 이 함수 하나를 씁니다(FOC-05, NFR-15).

#### 10.7.3 schema 버전과 migration

버전 번호는 네 종류이고 종류마다 관리하는 곳이 하나입니다.

1. **로컬 모듈 데이터** manifest의 `local` 버전과 n에서 n+1로 가는 migration 함수입니다. 코어는 migration을 실행하기 전에 계정 폴더를 `backups/<시각>/`에 복사하고 최근 5개만 남깁니다. migration이나 schema 검사가 실패하면 원래 파일을 `.bak`으로 남기고 기본값으로 시작한 뒤 알림을 띄웁니다.
2. **서버 기록** 모든 기록에 `v`를 붙입니다. 기록을 쓴 계정의 앱은 읽을 때 새 형식으로 바꾸고 다음 저장 때 새 형식으로 씁니다. 남의 공개 데이터를 읽는 모듈은 옛 형식을 메모리에서만 바꾸고 앱보다 새 형식은 아는 필드만 읽습니다. 규칙은 지금 버전까지의 `v`를 받습니다. 한꺼번에 바꿔야 할 때는 `scripts/migrations/`의 스크립트를 쓰고 이 스크립트는 기본으로 미리 보기만 하며 다시 실행해도 같은 결과를 내고 일부를 읽지 못하면 쓰지 않습니다. 옛 형식을 지우기 전에 남은 옛 기록 수를 세는 스크립트를 먼저 실행합니다.
3. **방 프로토콜** `PROTO`는 `src/shared/proto.ts`의 정수이고 멤버 기록에 함께 씁니다. 앱은 방에 들어가기 전에 `config/minProtocol`과 비교하고 규칙도 멤버 기록을 쓸 때 같은 비교를 합니다. `PROTO`는 코어 멤버 필드가 호환되지 않게 바뀔 때만 올리고 모듈 presence 필드와 새 이벤트 이름은 올리지 않습니다.
4. **설정, 브리지, 카탈로그** 설정은 사용자가 바꾼 값만 `schemaVersion`과 함께 저장하므로 고친 기본값이 기존 설치에 그대로 전달됩니다. 설정 migration은 옛 기본값과 같은 값만 고쳐 사용자가 일부러 고른 값을 덮지 않습니다. 렌더러는 부팅 때 `BRIDGE_VERSION`을 확인하고 카탈로그 항목에는 `schema` 번호가 있어 앱은 자기보다 새 번호의 항목을 건너뜁니다.

적합성 시험은 모듈 namespace마다 v1 고정 자료를 두고 migration을 차례로 실행해 지금 schema 검사를 통과하는지 확인합니다.

**충돌 처리 정책** 여러 PC가 같은 서버 기록을 바꿀 때의 처리는 코어가 다섯 가지로 구현하고 모듈은 컬렉션의 `merge`에 이름만 적습니다. 정책마다 시뮬레이터 시나리오를 하나씩 둡니다.

| 정책 | 처리 | 쓰는 곳 |
|---|---|---|
| `sumByDevice` | 기기마다 자기 기록만 쓰고 읽을 때 더함 | focus 누적 시간 |
| `perItemMtime` | 항목별 수정 시각이 늦은 쪽을 쓰고 삭제는 삭제 표시로 남김. 덮어쓴 옛 값은 `trash`에 둠 | 캐릭터(M2a부터) |
| `max` | 큰 값을 남김 | 줄지 않는 누적 값 |
| `transaction` | 서버 transaction으로 한 번에 바꿈 | 가챠 |
| `askUser` | 두 쪽이 모두 바뀐 항목은 사용자가 고름 | 캐릭터(ACC-13) |

친구가 다시 설치한 PC에서 캐릭터를 되찾는 M2a 완료 조건 때문에 캐릭터는 M2a부터 `perItemMtime`으로 서버에 둡니다. 휴지통(`trash`)은 그 계정의 앱이 다음 부팅 때 10일 지난 항목을 지우므로 서버 함수 없이 Spark에 남습니다.

#### 10.7.4 서버 adapter

`ServerPort`는 Realtime Database의 경로가 아니라 이 앱의 말로 정의합니다. 이 점은 직접 서버안의 Backend 인터페이스에서 가져왔습니다.

```ts
interface ServerPort {
  identity: { signIn(setupCode: string): Promise<Uid>; current(): Uid | null };
  docs(ns: Namespace): DocHandle;      // get, set, update, list({ limit }), watch, transaction
  room: RoomTransport;                 // join, leave, writeMine, watchMembers, emit, watchEvents
  files: { put(bytes: Uint8Array): Promise<Sha256>; get(hash: Sha256): Promise<Blob> };
  time: { serverNow(): number; offset(): number };
  connection: { online(): boolean; onChange(fn: (online: boolean) => void): Dispose };
}
```

Realtime Database에만 있는 기능(연결이 끊길 때의 삭제 예약, 첫 호출에 빈 값을 주는 transaction, 다중 경로 쓰기)은 `src/renderer/server/firebase/` 안에서만 다루고 모듈 코드에는 나오지 않습니다. 그래서 나중에 직접 만든 서버로 옮길 때 `server/` 아래 구현 하나와 규칙 빌드 스크립트만 바꿉니다. 메모리 구현은 시험, 오프라인 개발, 가짜 친구가 있는 시험용 방에 쓰고 adapter 계약 시험(10.10)이 두 구현의 결과가 같은지 확인합니다. 개발판 adapter는 namespace별 하루 바이트와 쓰기 횟수를 기록하고 limit 없는 목록 구독과 컬렉션 루트 구독을 거부합니다. 운영판에도 쓰기 상한을 두어 반복문 버그가 쓰기를 끝없이 보내지 못하게 합니다. 상한은 컬렉션마다 manifest에 적은 `rate: { perSec, burst }`와 전체 상한(예를 들어 초당 20회) 가운데 작은 값입니다. COM-15 자세 정보는 초당 최대 10번이고 채팅은 초당 2줄에 한꺼번에 8줄까지 보내므로 하나의 상한으로 모든 컬렉션을 다루지 않습니다.

#### 10.7.5 서버 선택지와 비용

아래 가격은 일반 지식과 8장의 확인하지 않은 수치를 바탕으로 했고 2026년 10월 기준 요금표는 확인하지 않았습니다. 원화는 1달러를 1,400원으로 계산했습니다.

| 선택지 | 장점 | 단점 | 월 비용(2명, 10명) |
|---|---|---|---|
| Firebase Spark 요금제(Realtime Database, Authentication) | 연결 끊김 처리, 재연결, 오프라인 캐시, 서버 시각, transaction, 규칙 권한 검사를 서버 코드 없이 씁니다. 이 서비스에서 생기기 쉬운 문제와 피하는 방식은 10.2에 있습니다. 한도를 넘으면 요금 대신 멈춥니다. | 규칙 언어를 다뤄야 해서 조각을 합치는 스크립트가 필요합니다. Cloud Functions를 쓸 수 없고 새 Storage 버킷도 Blaze에서만 만들 수 있는 것으로 알고 있습니다. 가장 가까운 지역이 싱가포르입니다. | 0원. 예상 내려받기 2명 약 0.03GB, 10명 약 0.4GB(SND-09 제외, 아래 계산), Spark 한도 10GB |
| Firebase Blaze 요금제(위에 Storage와 Cloud Functions를 더함) | 큰 파일과 서버 함수를 쓸 수 있습니다. | 카드를 등록해야 하고 요금 상한 없이 예산 알림만 있습니다. | 예상 0원, 한도를 넘으면 내려받기 1GB에 약 1달러 |
| 직접 만든 서버(Node.js, ws, SQLite)를 서울이나 도쿄 지역의 작은 가상 서버에 둠 | 데이터 모델, 권한 검사, 서버 로직이 앱과 같은 TypeScript이고 같은 서버 코드를 시험 안에서 실행합니다. 월 요금이 고정이라 버그가 요금을 늘리지 못합니다. | 인증, 접속 상태, 동기화, 검증 코드를 직접 쓰고 OS 업데이트, TLS, 백업, 감시를 직접 합니다. 한 달 1시간에서 2시간 관리가 필요합니다. | 약 5달러에서 8달러(약 7,000원에서 11,000원). 가상 서버 4달러에서 6달러, 도메인 약 1달러 |
| 같은 직접 서버를 요금이 없는 가상 서버나 집 PC에서 터널로 실행 | 비용이 거의 없고 코드는 그대로입니다. | 요금이 없는 서버는 정책이 바뀌거나 회수될 수 있고 집 PC는 잠들고 주소가 바뀝니다. | 0달러에서 1달러 |
| Supabase(Postgres, Realtime, Auth, Storage) | SQL과 행 단위 권한 정책을 쓰고 서울 지역이 있습니다. | Free 요금제 프로젝트는 일주일쯤 쓰지 않으면 멈추고 클라이언트 SDK에 오프라인 캐시가 없습니다. | 0원(멈춤 위험) 또는 25달러 |
| Cloudflare Workers와 Durable Objects | 방 하나를 객체 하나로 두어 순서와 멤버를 한 곳에서 정합니다. Free 요금제는 한도를 넘으면 요금 대신 오류를 냅니다. | 서버 코드를 직접 쓰고 런타임과 도구가 다릅니다. | 0달러 또는 5달러 |

**내려받기 계산** 10명이 한 방에 하루 8시간 있을 때 멤버 기록 갱신은 사람마다 1분에 한 번이라 방 전체로 하루 4,800번이고 다른 9명에게 전달되어 43,200번 내려받습니다. 한 번에 300바이트(내용 150바이트에 통신 부담을 같은 양으로 더함)로 잡으면 하루 약 13MB이고 30일이면 약 0.4GB입니다. 상태 변경, 채팅 하루 200건, 자세 그림 교체, 카탈로그 갱신을 더해도 한 달 1GB 아래로 예상하고 Spark 한도 10GB의 10분의 1입니다. 2명이면 같은 계산으로 한 달 약 0.01GB이고 다른 데이터를 더해도 약 0.03GB입니다. SND-09는 상대가 지금 타이핑하는지를 받아야 하므로 따로 셉니다. 타이핑 여부를 1초마다 쓰면 10명 방은 초당 90번 내려받고 같은 300바이트로 하루 8시간씩 30일이면 약 23GB라서 Spark 한도를 넘고 2명이면 약 0.5GB입니다. 그래서 타이핑 여부는 바뀔 때만 쓰고 최소 간격을 3초로 둡니다(`onChange`, `minIntervalMs`). 이때 최악값은 10명 방이 약 7.8GB이고 2명이 약 0.2GB입니다. 최악값은 모두가 3초마다 타이핑과 멈춤을 바꾸는 경우이고 실제 값은 M2b에서 개발판의 presence 필드별 바이트로 확인합니다. `scripts/backup`이 관리 SDK로 받는 양도 내려받기 한도에 들어갑니다. 저장 용량을 30MB로 잡고 날마다 전체를 받으면 한 달 약 0.9GB가 더해지므로 `files/`처럼 해시로 이름 붙인 바뀌지 않는 데이터는 처음 한 번만 받고 나머지 경로만 날마다 받습니다(10.10.3). 이 수치는 저장 용량 가정으로 계산한 값입니다. 동시 연결은 10명이어도 PC당 하나라 Spark 한도 100개에 한참 못 미치고 저장 용량도 1GB 한도에 비해 수십 MB 수준입니다. 개발판의 바이트 측정으로 이 계산을 M1 동안 실제 값과 맞춰 봅니다.

#### 10.7.6 시작 요금제와 옮기는 시점

Firebase Spark 요금제로 시작했습니다(10.14의 1번). 2명에서 10명 규모에서 예상 사용량이 Spark 한도의 10분의 1 아래이고 한도를 넘어도 요금이 나가지 않고 멈추므로 하루 서버비가 갑자기 크게 오르는 사고가 생기지 않습니다. 서버 코드를 쓰지 않으니 M0와 M1에 들일 시간을 앱에 쓸 수 있습니다. 자세 그림과 가챠 아이템 그림처럼 작은 파일은 내용 해시를 키로 `files/{sha256}`에 base64로 저장하고 앱은 해시로 캐시해서 같은 그림을 두 번 받지 않습니다. 파일 하나는 base64로 바꾼 뒤 64KB까지만 받고 원래 파일로는 약 48KB입니다. 모듈은 파일 종류마다 manifest에 `maxBytes`를 적고 CI가 64KB를 넘는 선언을 찾아 아래 Blaze 전환 목록과 비교해서 누락을 막습니다.

Blaze 요금제로 올리는 시점은 모듈이 64KB 넘는 파일(HOM-06 마이홈 배경, CHR-07 자리비움 그림, AVT-09 파츠 직접 그리기, HOM-11 북마크 표지, OUR-03의 움직이는 자세 그림)이나 Cloud Function(서버 쪽 가챠 판정)을 필요로 할 때입니다. 휴지통 정리는 계정의 앱이 부팅할 때 하므로 예약 작업이 필요 없습니다(10.7.3). 올릴 때 예산 알림을 1달러와 5달러에 둡니다. HOM-06 마이홈 배경은 긴 변 960px부터 줄이고 품질을 낮춰 64KB 안에 넣기로 정해서(10.14의 13번) Blaze 없이 M2b에 넣었습니다.

직접 만든 서버로 옮기는 시점은 아래 가운데 하나가 생길 때입니다.

1. Blaze 요금이 두 달 연속 월 5달러를 넘을 때(작은 가상 서버 값)
2. Spark 요금제의 Realtime Database 한도나 정책이 바뀌어 요금 없이 쓸 수 없을 때
3. 규칙으로 쓰기 어려운 서버 판정이 모듈 둘 이상에서 필요할 때(예를 들어 입장 순간에 정원을 정확히 지켜야 하는 ROM-09와 서버가 사진 진행자를 정하는 COM-15). 10월 8일에 정원을 넘은 사람이 스스로 나가는 방식으로 정해서 ROM-09는 여기에 들지 않습니다(10.14의 15번).
4. 생성한 규칙 파일이 사람이 읽기 어려울 만큼 커질 때(예를 들어 1,500줄)

옮길 때는 직접 서버안의 구조를 씁니다. 서버 로직은 전송 방식과 상관없는 TypeScript(`server/core/`)로 쓰고 시험에서는 같은 코드를 프로세스 안에서 메모리로 실행하며 운영에서는 ws와 SQLite 위에서 실행합니다. 권한 검사는 컬렉션 범위마다 한 번 구현하고 모듈의 같은 zod schema로 쓰기를 검사합니다. 모듈은 `ServerPort`만 쓰므로 `src/renderer/server/ws/` 구현을 더하고 데이터 내보내기 스크립트로 옮기면 모듈 코드는 바뀌지 않습니다.

### 10.8 플랫폼과 렌더링 어댑터

#### 10.8.1 platform adapter

adapter 쌍은 OS마다 동작이 다른 곳에만 둡니다. 유휴 시간, 커서 위치, 모니터 정보, 절전 이벤트, 트레이, 알림, 파일 대화상자, 단일 실행 잠금, 외부 링크 열기는 Electron이 두 OS에서 같은 API로 주므로 main-core가 직접 부르고 시험용 `FakePlatform`이 이 기능들의 가짜 구현까지 함께 제공합니다. 모듈은 외부 링크 열기와 로그 폴더 열기를 `ctx.shell`로 부르고 파일 대화상자를 `ctx.files`로 부릅니다. 관리형 서버안은 이 기능들도 모두 port로 두었지만 구현이 하나뿐인 인터페이스는 만들지 않는다는 원칙(10.3의 6번)에 따라 직접 서버안처럼 줄였습니다. `src/main/platform/index.ts`만 `process.platform`을 읽고 시작할 때 한 번 구현을 고릅니다. 친구 PC가 Windows라서(9.1 결정 2) M0와 M1은 아래 표의 Windows 열과 `FakePlatform`만 구현하고 Mac 열은 Mac판을 만들 때 구현합니다.

| adapter | Windows | Mac | 관련 기능 |
|---|---|---|---|
| OverlayWindow | 테두리 없는 투명 창, `screen-saver` 단계의 항상 위, 작업 표시줄에서 숨김, 불투명도 252 우회 설정(기본 꺼짐) | `type: 'panel'` 창과 `screen-saver` 단계, Retina 배율. M0에서 캐릭터를 눌러도 작업 앱이 활성 상태로 남는지 확인하고 `setVisibleOnAllWorkspaces`는 대안으로 둠 | NFR-03, NFR-04, NFR-07 |
| ActiveWindow | 실행 파일 이름을 소문자로 바꿔 `win:` 접두어를 붙임. 관리자 권한 창은 프로세스 이름으로 찾고 실패하면 이유가 있는 알 수 없음 | 번들 ID에 `mac:` 접두어(Electron 앱은 실행 파일 이름이 모두 Electron이라서) | FOC-01, FOC-02, NFR-09 |
| PenApps | 실행 파일 이름 목록과 사용자 추가 | 번들 ID와 앱 이름 목록과 사용자 추가 | CHR-12, NFR-25 |
| AutoStart | 읽기와 쓰기에 같은 옵션 객체(경로와 인자가 정확히 같아야 켜짐으로 읽힘) | 로그인 항목 | SET-01 |
| Permissions | 관리자 권한 앱 앞에서는 키보드와 마우스를 나눠 보여 주는 기능(InputHooks)이 동작하지 않는다는 안내 | ActiveWindow는 창 제목을 읽지 않으므로 권한 없음. InputHooks를 켤 때만 손쉬운 사용과 입력 모니터링 확인, 설정 창 바로가기, 다시 보지 않기 | NFR-09 |
| Updater | electron-updater | 서명하면 zip 결과물을 더해 electron-updater, 서명하지 않으면 새 버전 안내와 내려받기 페이지 열기 | NFR-19, OPS-13 |
| InputHooks(선택) | uiohook-napi | uiohook-napi와 입력 모니터링 권한 | CHR-08에서 키보드와 마우스를 나눠 보여 줄 때만 |

Mac에서는 `focusable: false` 창을 눌러도 Electron 앱이 활성 앱이 되어 작업 프로그램이 키 입력을 잃을 수 있습니다. macOS는 보통 창을 누르면 그 앱을 앞으로 가져오므로 이를 막으려면 활성화하지 않는 패널 형식이 필요합니다. Electron은 Mac에서 `type: 'panel'` 옵션으로 이 형식을 주고 문서에 이 창이 전체 화면 앱 위와 모든 데스크톱 공간에 보인다고 적혀 있는 것으로 알고 있습니다. 이 동작은 확인하지 않았습니다. AutoStart의 숨겨서 열기(`openAsHidden`)는 Electron 문서에 macOS 13 이상에서 쓸 수 없다고 적힌 옵션으로 알고 있고 오버레이 앱은 로그인 때 숨길 이유도 없어 쓰지 않습니다. 관리자 권한 앱 앞에서 막히는 것은 전역 입력 훅이고 유휴 시간은 영향을 받지 않는 것으로 알고 있습니다.

**활동 샘플링** 메인 프로세스는 500밀리초마다 ActiveWindow와 유휴 시간을 읽어 앞에 있는 앱 키, 유휴 초, 펜 앱 여부, 알 수 없을 때의 이유를 담은 샘플을 스테이지에 보내고 코어가 `ctx.activity`로 모듈에 전달합니다. 창 제목은 읽지 않습니다. 알 수 없는 앱(관리자 권한 게임 등)은 집중 시간을 쌓지 않고 진단 요약에 이유를 적습니다. 활성 창 모듈은 `get-windows`를 우선 후보로 두고 두 OS의 미리 빌드한 바이너리가 있는지는 확인하지 못했으므로 M0에서 CI로 확인합니다. 없으면 OS마다 작은 도우미 실행 파일(Mac은 Swift 명령, Windows는 작은 Win32 실행 파일)을 같은 adapter 뒤에 둡니다. `get-windows`는 Mac에서 창 제목을 읽을 때 화면 기록 권한을 묻고 주소를 읽을 때 손쉬운 사용 권한을 묻는 것으로 알고 있어 두 권한 확인을 끄는 옵션을 M0에서 확인합니다. Mac 구현은 호출할 때마다 도우미 실행 파일을 띄우는 것으로 알고 있어 500밀리초 호출의 CPU 사용과 asar 압축에서 빼는 설정(`asarUnpack`)도 같은 단계에서 봅니다.

**클릭 통과** 렌더러는 좌석의 클릭 영역과 `data-interactive` 표시가 있는 DOM 영역을 바뀔 때만 메인 프로세스에 보냅니다. 메인 프로세스는 항상 초당 약 20번 커서 위치(`screen.getCursorScreenPoint`)를 읽고 커서가 스테이지 창에서 40픽셀보다 멀면 영역 비교를 건너뜁니다. 커서가 가까우면 클릭 영역과 비교해 클릭 통과를 켜고 끕니다. 바깥에서 읽는 주기가 길면 커서를 빠르게 캐릭터 위로 옮겨 바로 누른 클릭이 클릭 통과가 켜진 상태라 아래 창으로 넘어가고 그림 앱이 아래에 있으면 캔버스에 점이 하나 그려집니다. `screen.getCursorScreenPoint`는 가벼운 호출이라 항상 읽고 CPU 사용은 NFR-10 점검에서 함께 잽니다. 마우스 움직임 전달(`forward`)은 쓰지 않습니다. 전달한 움직임은 중간에 끊기거나 그림 앱의 펜 선을 직선으로 만들 수 있습니다. 메인 프로세스의 보호 동작은 클릭 통과를 켜는 쪽으로만 바꿀 수 있어 판단이 틀려도 클릭이 계속 캐릭터 창으로 가는 일이 없습니다(한 방향 안전 규칙). 창 크기와 항상 위 설정은 지금 값과 같으면 다시 적용하지 않습니다.

**모니터와 절전** 모니터는 저장한 ID, 해상도와 위치와 회전과 배율로 만든 지문, 같은 크기의 모니터, 주 모니터 순서로 찾습니다. 모든 좌표는 DIP 단위로 계산하고 배율이나 해상도 변경은 마지막 변경 뒤 0.4초가 지나면 한 번에 처리하며 고른 모니터가 빠지면 주 모니터로 옮깁니다. 절전과 화면 잠금은 자리비움으로 쓰고 복귀하면 바로 방에 다시 들어갑니다. Windows 로그오프 때는 타이머를 멈추고 창을 닫은 뒤 바로 끝냅니다. 값은 바뀔 때마다 저장하므로 종료 때 따로 저장할 것이 없습니다.

**시험용 가짜** `FakePlatform`은 앞에 있는 앱의 시간표, 유휴 초, 절전과 복귀, 모니터 구성을 시험 코드에서 정할 수 있는 구현입니다. 다중 클라이언트 harness와 Playwright 부팅 시험이 이 구현을 씁니다.

#### 10.8.2 렌더링

모듈은 그리기 라이브러리를 부르지 않고 캐릭터를 데이터로만 넘깁니다. 외형은 `Appearance`이고 자세는 `characterStates`의 id이며 효과는 효과 등록부의 id와 시드입니다.

**`Appearance` v1** M0에서 정하는 모양은 `{ body, bodyExt, poses: { idle, typing, sleep }, slots: Record<slotId, Equip[]> }`입니다. `poses`는 친구가 넣은 자세 그림 세 장의 해시입니다(9.3 OUR-03). `Equip`은 아이템 id, 그림 해시, 색, 위치와 크기와 회전을 담고 9.3 OUR-02의 아이템을 붙인 스티커는 `sticker` 슬롯의 목록입니다. 스티커 `Equip`의 아이템 id는 출처 방 코드와 아이템 id를 합친 값이고 그림 해시가 함께 있어서 그 방에 들어가지 않은 사람도 스티커를 그립니다. 슬롯 값이 처음부터 목록이라서 같은 파츠를 여러 개 입는 다중 파츠 착용(AVT-19)을 더해도 저장 형식이 바뀌지 않습니다(AVT-19). `body`는 인간과 동물을 나누는 종류 값이고 두 종류 모두 같은 `poses` 세 장을 씁니다(AVT-02). 종류별로 더 필요한 값은 열린 칸 `bodyExt` 하나로 받으므로 코어 타입을 고치지 않고 담습니다. 카탈로그 항목에는 `hides`(숨길 부위 목록, AVT-20)와 `occupies`(차지하는 슬롯 목록)를 두어 모자를 쓰면 머리카락을 감추거나 양손 파츠가 두 손 칸을 비우는 규칙(AVT-06)을 그리는 쪽이 이 값만 읽어 처리합니다. 책상(AVT-11)과 책상 소품(AVT-13)은 `desk`와 `desk.items` 슬롯으로 넣고 바닥 오브제(AVT-14)는 `floor` 슬롯으로 넣어 모두 `Appearance`에 담습니다. 좌석 계층은 이 슬롯을 책상 위 anchor와 발 anchor에 붙여 그립니다. 이 모양을 나중에 바꾸면 코어 타입, `look` 데이터, 저장한 캐릭터의 migration을 함께 고쳐야 하므로 AVT-20이 들어가는 M2a 전에 정합니다.

`CharacterView` port는 `createView(container, { mode })`로 만들고 `setAppearance`, `setState`, `setPosition`, `setFacing`, `playEffect(effectId, seed)`, `anchors()`, `hitRegion()`, `detach()`, `reattach()`, `setFrameBudget(fps)`, `dispose()`를 둡니다. `anchors()`는 머리, 말풍선, 이름표, 책상 위, 발 위치를 CSS 픽셀로 돌려주고 DOM 이름표와 경험치 바와 상태칩이 이 위치에 붙습니다. `renderScene(sceneSpec, size)`는 미리보기, 슬롯 썸네일, 런처, 스티커 사진(COM-15)에 쓰는 `ImageBitmap`을 돌려주고 얼굴, 상반신, 전신 구도를 받습니다.

**좌석 계층** 코어 좌석 계층은 방 멤버마다 `CharacterView`를 하나씩 만들어 한 줄로 놓고 `ctx.seats`로 모듈에 좌석 목록과 anchor를 줍니다. 좌석 구성을 바꾸는 기능은 기능 이름 없는 같은 API로 들어옵니다. 혼자 모드 자리 추가(AVT-22)는 내 다른 슬롯 캐릭터를 4석까지 로컬 좌석으로 더하고 사용자가 끌어서 바꾼 순서를 순서 힌트로 넘깁니다. 2인승과 3인승 벤치(AVT-21)는 책상 하나에 좌석 여러 개를 둡니다. 올라타기와 동물탑(COM-16, HOM-17)은 좌석 하나를 다른 좌석의 머리 anchor에 붙입니다. 붙은 좌석은 아래 좌석을 따라 움직이고 아래 좌석이 효과로 자리를 떠나거나 방을 나가면 위 좌석이 한 칸 내려옵니다. 붙임 상태는 담당 모듈의 presence 필드로 보냅니다.

| backend | 쓰는 곳 | 내용 |
|---|---|---|
| debug | 시험, 첫날부터의 두 번째 구현 | 좌석마다 색 사각형을 그리고 anchor와 클릭 영역을 계산합니다. |
| canvas2d | M0부터 기본 | 라이브러리 없이 Canvas 2D로 그립니다. 자세마다 친구가 넣은 그림 한 장(움직이는 그림은 M1 측정 뒤에 정함), 슬롯마다 정한 층 순서, 스티커의 위치와 크기와 회전, 색조 필터 결과를 화면 밖 캔버스에 색마다 캐시, 기본 자세 그림의 투명하지 않은 영역으로 anchor와 클릭 영역 계산, `imageSmoothingEnabled`를 꺼서 또렷한 픽셀 표현 |
| three3d | M4(9.1 결정 3은 2D로 정했고 3D가 다시 필요해질 때만) | three.js로 GLB 몸과 파츠를 그리고 조명 설정과 view 생성 함수를 하나만 둡니다. 친구가 넣은 2D 자세 그림을 3D에서 어떻게 쓸지는 이때 정합니다. |

두 안은 2D 그리기 도구가 달랐습니다(관리형 서버안은 PixiJS, 직접 서버안은 Canvas 2D). 이 장은 Canvas 2D로 시작하는 쪽을 고릅니다. 좌석 10개에 층 10장이면 프레임마다 그림 100장을 그리고 이 정도는 Canvas 2D의 `drawImage`로 충분하다고 보았습니다. 측정 전 판단이므로 M0에서 친구 PC로 10좌석 30fps 장면의 CPU를 재고 NFR-10 목표(깨어 있을 때 5% 이하)를 넘으면 같은 port 뒤에 PixiJS backend를 더합니다. 이 경우에도 모듈은 바뀌지 않습니다.

그리기는 깨어 있을 때 최대 30fps, 잠들거나 자리비움일 때 5fps, 창을 숨기면 0fps이고 배터리로 동작할 때 더 낮춥니다(NFR-05, NFR-10). 창을 숨겨도 타이머와 60초 `seenAt` 갱신이 늦어지지 않도록 `backgroundThrottling: false`로 둡니다. 숨긴 동안 갱신이 늦어지면 다른 PC에서 150초 기준에 걸려 좌석이 사라질 수 있는데 이 영향은 측정하지 않았으므로 M0 완료 조건에서 확인합니다. 자세 그림 줄은 초당 12장이면 충분하므로 바뀐 것이 없는 프레임은 다시 그리지 않습니다. 스테이지 창은 좌석들을 감싸는 사각형 크기로 잡고 화면 전체 크기의 효과 창은 COM-05, COM-13, HOM-17 같은 연출 동안만 엽니다. 효과 구현은 효과 창의 canvas와 DOM 루트를 받으므로 채팅 날리기(COM-05) 글자도 DOM으로 그립니다. 폭탄(COM-13)과 러시안룰렛(COM-14)에서 캐릭터가 의자에서 튀어 나가면 코어가 `detach()`로 좌석 그림을 숨기고 효과 창에 같은 외형을 그렸다가 돌아오면 `reattach()`를 부릅니다. 폭탄(COM-13)은 다른 사람을 겨눠 날리는데 효과 창은 클릭 통과 창이라서 `ctx.ui.pickTarget()`이 효과 창을 몇 초 동안만 클릭을 받는 상태로 바꾸고 시간이 지나면 클릭 통과로 되돌립니다. 이 방식은 10.8.1의 한 방향 안전 규칙과도 맞고 M3 놀이 묶음 전에 확인합니다. 카탈로그 항목에는 backend별 에셋(`assets.canvas2d`의 자세별 층 그림과 층 순서와 anchor와 색칠 영역, `assets.three3d`의 GLB와 붙일 뼈와 색 그룹)과 backend별 위치 조정이 따로 있습니다. 지금 backend용 에셋이 없는 항목은 숨기고 로그를 남깁니다. 3D로 바꿀 때의 완료 조건은 모든 모듈 시험과 Playwright 부팅 시험이 `renderer=three3d`에서 그대로 통과하는 것입니다.

### 10.9 새 기능을 추가하는 절차

1. 기능 ID를 확인합니다. 명세에 없는 기능은 새 접두어로 ID를 붙여 명세에 먼저 적습니다(예를 들어 할 일 목록은 TDO-01).
2. `npm run new-module <id>`로 manifest, 시험, 규칙 조각, v1 고정 자료가 든 폴더를 만듭니다.
3. manifest에 `specIds`, `requires`, 설정, 데이터, presence 필드, 창, 슬롯 항목, 명령을 적습니다.
4. `logic.ts`에 순수 로직을 쓰고 표 형태 시험을 먼저 씁니다.
5. 서버 컬렉션과 규칙 조각을 더하고 에뮬레이터 규칙 시험을 씁니다.
6. `ui/*.tsx`에 화면을 씁니다.
7. `src/modules/index.ts`에 import 한 줄을 더합니다.
8. 적합성 시험, 시뮬레이터 시나리오, Playwright 부팅 시험을 통과시킵니다.
9. 코어 변경이 필요하면 ADR을 먼저 쓰고 기능 이름이 없는 범용 기능으로 Windows와 시험용 가짜에 구현합니다. Mac 구현은 Mac판을 만들 때 더합니다.
10. 출시할 때 규칙을 앱보다 먼저 배포하고 `PROTO`를 올린 경우에만 친구가 업데이트한 뒤 최소 버전을 올립니다.

아래 여덟 사례는 이 절차를 실제 기능에 적용한 것입니다. 9.3의 OUR-01과 OUR-03은 짧게 적었고 가챠 사례는 OUR-02의 방별 가챠로 다시 썼습니다. 마지막 사례는 명세에 없는 기능입니다.

#### FOC-02 집중 시간 규칙(FOC-01, FOC-03, FOC-05, CHR-05와 함께 focus 모듈, SET-02는 M2a에서 더함)

- **만드는 것** `src/modules/focus/`에 manifest, `logic.ts`, `ui/RecordWindow.tsx`, `ui/AppsTab.tsx`, `rules.ts`, `logic.test.ts`를 두고 등록 줄 하나를 더합니다. `uses`에는 `platform.activity`를 적습니다.
- **설정과 데이터** 설정은 시간 규칙(`foreground`, `foregroundUntilIdle20m`, `foregroundWithInput` 가운데 하나로 9.1 결정 4를 설정으로 남김)과 피규어 모드입니다. 등록 앱 8칸(`win:` 또는 `mac:` 키와 표시 이름)은 기기 범위 로컬 데이터라서 다른 OS로 동기화하지 않습니다. 오늘과 누적 시간은 계정 범위 로컬 데이터로 30초마다 저장합니다. 서버에는 `mod/focus/u/{uid}/dev/{deviceId}`에 기기별 누적과 오늘 기록을 60초마다 쓰고 누적 시간은 기기별 값을 더해 계산합니다. 기기마다 자기 기록만 쓰므로 두 PC가 서로 덮지 않고 NFR-17을 나중에 넣어도 이 데이터는 migration이 필요 없습니다(직접 서버안의 더하기 정책). 규칙 조각은 본인만 쓰고 누적 값이 줄지 않게 합니다.
- **로직** `step(prev, sample, settings)`는 순수 함수이고 더할 초와 깨어 있음 여부를 돌려줍니다. 샘플 사이 간격이 30초를 넘으면 절전으로 보고 버립니다. 알 수 없는 앱은 집중하지 않은 것으로 보고 이유를 남깁니다. 하루는 `ctx.clock.dayKey`로 나누고 피규어 모드는 잠든 자세만 끄고 시간은 규칙대로만 쌓습니다.
- **화면과 연결** `characterStates`에 잠든 자세(우선순위 50, 조건은 presence 필드 `m.focus.awake`)를 더하고 `focus.tick`(`{ sec, dayKey, appKey, source }`)과 `focus.awakeChanged`를 보냅니다. 오전 6시를 걸친 tick은 6시에서 둘로 나눠 보냅니다(FOC-05). `appKey`는 bus 안에서만 쓰고 PC 밖으로 보내지 않습니다(규칙 8). 포커스 기록 창(FOC-03)은 `menu.main` 항목으로 열고 등록 칸은 `settings.tabs`에 둡니다. 등록 칸의 직전에 쓴 앱 넣기 버튼은 `ctx.activity.lastForeignApp()`을 부릅니다. 뽀모도로(FOC-07)와 달성표(GRW-06)를 위해 `focus.drawer` 확장 지점을 열고 폰 연동(FOC-09)을 위해 `focus.sources` 확장 지점을 엽니다. 공개 API는 `todaySec()`과 앱별 오늘 시간 `todayByApp()`입니다. presence 필드 `m.focus.todayMin`은 FOC-06을 위해 미리 둡니다.
- **다른 기능과의 연결** 달성표(GRW-06)는 고른 앱에서 쌓은 시간으로 집중 목표를 판정하므로 `todayByApp()`과 tick의 `appKey`를 쓰고 한 주는 월요일부터 일요일까지이고 하루는 `dayKey`처럼 오전 6시에 바뀝니다. 폰 연동(FOC-09)은 focus 안이 아니라 별도 모듈로 두고 `focus.sources`에 출처를 등록합니다. 폰 신호가 켜져 있으면 focus는 PC 입력 확인을 건너뛰고 자동 자리비움(CHR-06)도 폰 신호를 활동으로 셉니다. 달성표는 tick의 `source`로 폰 시간을 빼고 셉니다. 휴대폰 자동화 앱은 로그인 없이 HTTP 요청을 보내므로 폰 연동 모듈은 규칙 템플릿 `keyedWrite`를 쓰고 QR 안내 페이지를 둘 곳은 10.14 8번의 Hosting 결정과 함께 정합니다.
- **시험** 등록 앱, 다른 앱, 알 수 없는 앱, 유휴, 펜 앱, 30초 넘는 간격, 05시 59분에서 06시 01분, 피규어 모드를 표로 시험합니다. harness에서 가짜 플랫폼으로 등록 그림 앱 10분을 재생해 600초가 쌓이고 growth 모듈의 레벨이 바뀌는지 확인합니다. 에뮬레이터 규칙 시험은 누적 값을 줄이는 쓰기를 거부하는지 확인합니다.
- **코어 변경** 없습니다. `ctx.activity`와 `ctx.clock.dayKey`는 focus, 캐릭터 상태, 자동 자리비움, 백색소음이 모두 쓰므로 M0 코어 서비스입니다. 성장 모듈(GRW-01)은 `focus.tick`을 받아 레벨을 계산하므로 focus 모듈은 성장 모듈을 import하지 않습니다.

#### ROM-01 워킹룸(ROM-04, ROM-05, ROM-06, ROM-08과 함께 rooms 모듈)

- **만드는 것** `src/modules/rooms/`와 등록 줄 하나입니다. 설정은 마지막 방 코드와 자동 재입장입니다. 9.1 결정 1을 방 코드 방식으로 정했고 모든 방이 주인이 지울 때까지 남으므로(OUR-01) 고정 방 코드 설정은 두지 않습니다.
- **방 코드** `src/shared/codes.ts`가 0, 1, I, O를 뺀 32자에서 6자를 뽑습니다. 가짓수는 약 10억 7천만(32의 6제곱)이라 추측하기 어렵습니다(NFR-18). 방 만들기는 `ctx.room.create`가 `rooms/{code}/meta`가 없을 때만 성공하는 transaction으로 주인 uid를 쓰고 성공하면 `ctx.room.join(code)`를 부릅니다. `meta`는 주인이 방을 지운 뒤에도 남으므로 한 번 쓴 코드는 다시 나오지 않습니다(OUR-01).
- **입장** 코어 RoomSession이 `config/minProtocol`을 확인하고 코어 필드와 모든 모듈의 presence 필드를 합친 멤버 기록을 쓰며 연결이 끊길 때의 삭제와 60초 `seenAt`과 150초 거름을 처리하고 `room.memberJoined`, `room.memberLeft`, `room.memberUpdated`를 보냅니다(10.7.2). 혼자 모드(ROM-04)는 방에 들어가지 않은 상태입니다.
- **화면** 런처의 `launcher.cards`에 워킹룸 카드를 더하고 코드 입력은 포커스를 받는 패널 창 `rooms.join`에서 받습니다(ROM-05). 상태칩의 `chip.buttons` 항목이 방 코드 보기와 복사와 나가기를 처리합니다(ROM-06). 친구 좌석은 코어 좌석 계층이 멤버마다 `CharacterView`를 만들고 자세 등록부가 presence 상태를 자세로 바꿔 보여 줍니다(ROM-08). 좌석 구성을 바꾸는 기능(AVT-21, AVT-22, COM-16, HOM-17)은 `ctx.seats`로 좌석 계층에 들어갑니다(10.8.2).
- **시험** 메모리 adapter 위 시뮬레이터로 입장, 퇴장, 앱 충돌, 절전으로 멈춘 `seenAt`, 재연결, 한 계정 두 기기, 옛 `PROTO` 거부, 두 클라이언트가 같은 코드로 방을 동시에 만드는 경우를 시험합니다. 에뮬레이터 규칙 시험은 남의 멤버 기록 쓰기와 150초가 지나지 않은 기록 삭제를 거부하는지 확인합니다.
- **코어 변경** 없습니다. RoomSession, 좌석 계층, 버전 확인은 여러 모듈이 presence 필드를 더하므로 M0 기반입니다. 정원 확인은 OUR-01과 함께 M1에서 rooms 모듈이 `room.beforeJoin`에 더합니다(아래 OUR-01). 한 계정 한 기기(ACC-12)와 다른 기기 사용 중 화면(SCR-08)도 같은 `beforeJoin` 등록부를 씁니다.

#### OUR-01 주인이 있는 방(9.3, rooms 모듈, M1)

- **만드는 것** rooms 모듈에 방 만들기 창의 정원 고르기, 주인에게만 보이는 방 설정 창(포커스를 받는 패널), 방 지우기 명령 `rooms.remove`를 더합니다. `rooms.remove`의 `enabledWhen`은 주인이 아니면 이유를 돌려줍니다. 방 설정 창은 확장 지점 `rooms.settings`를 열어 다른 모듈이 구역을 넣게 하고 방 지우기는 코어의 `ctx.room.beforeRemove`로 모듈이 지우기 전에 할 일을 넣게 합니다.
- **데이터** 코어 `rooms/{code}/meta`의 `owner`와 `roster/{uid}`, rooms 모듈의 `mod/rooms/r/{code}/cfg`(정원 `cap`, `roomOwner`, `deleteWithRoom`)입니다(10.7.2).
- **정원** 정원은 동시에 방에 있는 사람 수입니다. `room.beforeJoin`이 150초 안에 갱신된 멤버 기록의 uid 수를 `cap`과 비교하고 주인도 이 수에 들어갑니다. 거의 동시에 들어와 정원을 넘으면 `joinedAt`이 늦은 쪽이 스스로 나가고 안내를 띄웁니다.
- **보존과 지우기** 마지막 사람이 나가도 방은 남습니다. 주인이 지우면 `ctx.room.beforeRemove` 처리 함수를 차례로 부른 뒤 `deletedAt`을 쓰고 `deleteWithRoom` 컬렉션을 지웁니다. 멤버 앱은 다음 입장 시도나 부팅 때 `deletedAt`을 보고 최근 방 목록에서 그 방을 뺍니다.
- **시험** 주인이 아닌 멤버의 `cfg`와 `deletedAt` 쓰기 거부, 지운 방 코드로 다시 만들기와 들어가기 거부, `roster`에 없는 사람의 방 데이터 읽기 거부를 규칙 시험으로 확인하고 정원 3명인 방에 네 클라이언트가 거의 동시에 들어오는 시뮬레이터 시나리오를 둡니다.
- **코어 변경** `meta/owner`, `roster`, 규칙 템플릿 `roomOwner`, `roomRetention`의 `deleteWithRoom`, `ctx.room`의 `create`와 `remove`와 `owner`입니다. rooms(M1)와 gacha(M2a) 두 모듈이 쓰는 기능 이름 없는 범용 기능이라 10.3의 11번에 따라 ADR과 함께 M1에서 더합니다(10.6의 방 주인 권한). 주인은 넘기지 않습니다(10.14의 17번).

#### OUR-03 직접 넣는 2D 캐릭터 그림(9.3, 캐릭터 모듈, M1)

- **만드는 것** 캐릭터 만들기 창(AVT-01)을 자세 그림 세 장 넣기와 책상 고르기(AVT-11) 두 단계로 만듭니다. wardrobe 모듈이 `ctx.files.openImage`로 투명 PNG를 받고 Web Worker에서 256px 정도로 줄인 뒤 `ctx.files.upload(bytes, { maxBytes })`로 올리고 해시를 `Appearance`의 `poses`에 넣어 `ctx.self.setAppearance`로 씁니다.
- **얼굴 그리기(M2a)** 10월 9일에 AVT-03과 AVT-04를 다시 넣기로 정했습니다. wardrobe 모듈이 코드로 그린 기본 몸(사람, 동물)과 몸 색을 받고 512px 그림판 두 장(표정, 감은눈)을 기본 몸의 얼굴 자리에 합쳐 자세 그림 세 장을 만든 뒤 위와 같은 경로로 올립니다. 다시 고칠 수 있도록 몸 종류와 색과 두 얼굴 그림의 해시를 `Appearance.bodyExt.face`에 둡니다. 직접 넣은 자세 그림이 있으면 그 자세는 넣은 그림이 앞섭니다.
- **그리기** canvas2d backend는 `characterStates`의 자세 id에 맞는 `poses` 그림을 그리고 그림이 없는 자세는 기본 자세 그림으로 그립니다. 머리, 이름표, 책상 위, 발 anchor와 클릭 영역은 기본 자세 그림의 투명하지 않은 영역에서 계산하므로 친구 그림의 크기와 여백이 달라도 이름표가 그림 가까이에 붙습니다.
- **스티커(M2a)** AVT-05, AVT-06, AVT-08은 OUR-02와 함께 M2a에서 `sticker` 슬롯의 `Equip` 목록으로 넣습니다. 꾸미기 창에서 스티커를 끌어 위치와 크기와 회전을 맞추고 색조는 AVT-08의 필터로 바꿉니다. 붙일 아이템 목록은 gacha가 `wardrobe.itemSources`로 넘깁니다.
- **시험** 렌더러 적합성 시험에 여백이 큰 그림과 여백이 없는 그림을 넣어 anchor와 클릭 영역을 확인하고 64KB를 넘는 그림을 넣을 때의 안내를 시험합니다.
- **코어 변경** 없습니다. `Appearance` v1의 `poses`는 M0 전에 정하는 형식이라 migration이 없습니다(10.8.2). 움직이는 GIF나 WebP를 받을지는 M1에서 64KB 안에 들어가는지 재 보고 정합니다.

#### GCH-01부터 GCH-08까지 방별 가챠(9.3 OUR-02, M2a, GCH-04와 GCH-05는 M3, GCH-06은 제외)

- **만드는 것** `src/modules/gacha/`이고 `requires`는 rooms와 wardrobe입니다. `on`으로 focus 모듈의 `focus.tick`을 받고 growth는 쓰지 않습니다. rooms 모듈의 확장 지점 `rooms.settings`에 가챠 설정 구역(방을 지울 때 뽑은 아이템을 남길지 함께 지울지 포함)을 넣고 코어의 `ctx.room.beforeRemove`로 방을 지우기 전 처리를 넣으며 `wardrobe.itemSources`에 보관함을 넘깁니다.
- **방 설정** 아이템을 넣을 수 있는 사람(`adders`)과 뽑기 1회에 필요한 초(`secPerTicket`, 기본 3600)를 `mod/gacha/r/{code}/cfg`에 두고 방 주인만 바꿉니다(`roomOwner`).
- **아이템 넣기** 투명 PNG를 고르면 Web Worker가 256px 정도로 줄이고 `ctx.files.upload`로 올린 뒤 `items/{pushId}`에 이름, 그림 해시, 가중치, 넣은 사람, `st: 'on'`을 씁니다. 주인은 `st`로 아이템을 뽑기 대상에서 잠시 빼고 다시 넣습니다.
- **횟수** `focus.tick`이 올 때 방에 들어가 있으면 그 방 코드의 초에 더하고 60초마다 `increment`로 `mod/gacha/u/{uid}/r/{code}/sec`에 씁니다. 다른 멤버가 함께 있는지는 보지 않습니다(9.3에서 정함). 공개 API `grantTickets(roomId, n, tag)`는 태그를 먼저 쓰고 그 방의 `bonus`를 더하므로 다시 시도해도 두 번 주지 않습니다.
- **로직** `tickets(sec, secPerTicket, bonus, spent)`는 `max(0, floor(sec / secPerTicket) + bonus - spent)`이고 저장하지 않고 계산합니다. `pool(items, now)`는 `st`가 `on`이고 GCH-04의 기간 안에 있는 아이템이고 `odds(pool)`은 아이템마다 가중치를 가중치 합으로 나눈 값입니다. `draw(pool, rnd)`는 주입한 난수로 가중치 누적합에서 하나를 고릅니다(GCH-08). 가중치가 10, 10, 10, 1이면 마지막 아이템의 확률은 31분의 1입니다.
- **뽑기와 저장** 뽑기는 `mod/gacha/u/{uid}/r/{code}` 기록의 transaction입니다. 남은 횟수를 다시 계산해 `spent`를 1 올리고 `got/{itemId}`의 개수를 1 올리며 처음 뽑은 아이템이면 이름과 그림 해시를 복사합니다. 두 기기가 같은 횟수를 두 번 쓰지 못하고(GCH-07) 규칙이 횟수와 출처를 확인합니다(10.7.2). 주인이 나중에 아이템 그림을 바꿔도 이미 뽑은 복사본은 뽑을 때의 그림으로 남습니다.
- **지우기와 동기화** 주인이 아이템을 지우면 남기기와 함께 지우기 가운데 고르고 `items/{itemId}` 삭제와 `tomb/{itemId}` 쓰기를 다중 경로 쓰기 한 번으로 보냅니다. 방을 지울 때는 주인이 방 설정 창의 방을 지울 때 뽑은 아이템에서 미리 고른 값대로 `ctx.room.beforeRemove`에서 `tomb/_room`을 씁니다. 각 앱은 부팅할 때와 보관함 창을 열 때 보관함에 있는 방마다 `tomb`를 읽고 `revoke` 항목을 보관함과 캐릭터 스티커에서 뺀 뒤 서버의 `got` 항목을 지웁니다.
- **화면** 방 가챠 창(GCH-03, 아이템 목록과 확률, 남은 횟수, 다음 1회까지 남은 작업 시간, 약 1초 캡슐 연출)과 보관함 창(GCH-01, 방별 묶음과 개수)은 패널 안의 DOM과 CSS로 그립니다. 방 가챠 창은 방에 들어가 있을 때만 열리고 보관함 창은 혼자 모드에서도 열립니다. `menu.main`과 `chip.buttons` 항목, 패널 범위 `KeyT` 단축키와 선택적 `Ctrl+Alt+T` 전역 단축키를 둡니다. `KeyT`는 두 창이 포커스를 받았을 때만 동작하므로 두 창은 포커스를 받는 패널로 선언합니다. 남은 횟수가 0이거나 뽑을 아이템이 없으면 명령의 `enabledWhen`이 이유를 돌려주고 버튼이 꺼집니다. 캡슐 소리는 이용 조건과 함께 에셋 목록에 둡니다.
- **migration 예시** M2a의 v1 보관함 항목은 개수 `n`과 이름과 그림 해시를 저장하고 GCH-05(P2)의 v2는 색 해금 표시 `hueOpen`을 더합니다. migration 함수는 `n`이 4 이상인 항목의 `hueOpen`을 참으로 채웁니다.
- **시험** `tickets`, `pool`, `odds`, `draw` 표 시험(31분의 1 예시, `secPerTicket`을 바꾼 뒤의 횟수, 계산값이 음수인 경우), 기간 경계, 가짜 transaction으로 두 기기 동시 뽑기(첫 호출은 빈 값, 다시 시도하면 서버 값), 보너스 태그 중복, 오래 꺼 둔 클라이언트가 `revoke` 삭제 표시를 받는 시뮬레이터 시나리오, v1에서 v2 고정 자료를 둡니다. 규칙 시험은 멤버의 `cfg` 쓰기, `adders`가 `owner`일 때 멤버의 아이템 만들기, 1부터 100 밖의 가중치, 남은 횟수보다 많이 쓰기, 횟수를 쓰지 않고 `got` 늘리기, 삭제 표시 없는 `got` 지우기, 지운 방에서 뽑기를 거부하는지 확인합니다.
- **코어 변경** 없습니다. 방 주인 권한과 `deleteWithRoom`은 OUR-01에서 더한 범용 기능이고 확장 지점은 rooms와 wardrobe 모듈의 것입니다. 10.14에서 가챠 판정을 서버에서 하기로 정하면 모듈에 `functions.ts`를 더하고 Blaze 요금제가 필요합니다.

#### COM-15 스티커 사진(P2, M3 놀이 묶음)

- **만드는 것** `src/modules/photo/`이고 `requires`는 rooms, `optionalRequires`는 chat입니다. 방에 있을 때만 보이는 `menu.main`과 `chip.buttons` 항목, 채팅이 있으면 `chat.toolbar` 버튼, 방 이벤트 `photo.invite`를 둡니다.
- **데이터** `mod/photo/r/{roomId}`의 `slots/0`부터 `slots/3`까지는 transaction으로 잡는 자리이고 같은 uid이거나 15분이 지난 자리만 덮을 수 있습니다. 진행자는 접속 중인 가장 작은 번호의 자리이고 진행자만 촬영 설정(배치, 컷 수, 배경, 필터, 진행 상태, 서버 시각 기준 촬영 시각)을 씁니다. 자세 정보는 `p/{slot}`에 초당 최대 10번(컬렉션의 `rate: { perSec: 10 }`) 정수로 줄여 보내고 멤버 기록과 따로 두어 멤버 기록을 구독하는 모든 앱이 자세 정보까지 받지 않게 합니다. 연결이 끊길 때 자기 자리와 자세를 지우는 삭제를 등록하고 마지막으로 나가는 사람이 세션을 지웁니다.
- **비용 상한** 하루 촬영 한도는 `mod/photo/g/quota/{dayKey}`의 transaction으로 촬영 시작 때 셉니다. 한도 `photoDailyCap`은 photo 모듈의 tunable(`mod/photo/g/tunables`)이고 친구 두세 명이면 기본 0(끔)으로 둡니다. `dailyQuota` 템플릿은 `scope: 'global'`로 씁니다.
- **그리기와 저장** 컷마다 `ctx.render.renderScene`에 멤버들의 외형과 자세와 배경과 구도를 넘깁니다. 미리보기와 저장에 같은 함수를 배율만 바꿔 써서 화면과 저장 결과가 같습니다. 꾸미기 창은 포커스를 받는 패널이고 모듈이 정한 `photoStickers` 카탈로그 종류의 스티커, 펜, 되돌리기, 사용자 PNG 틀을 씁니다. 저장은 `ctx.files.saveToDisk`이고 서버에 올리지 않습니다. 촬영 키(A, D, W, S, Q, E, Space)는 패널 범위 단축키라서 촬영 창도 포커스를 받는 패널로 선언합니다. 상대 앱의 `mods`에 photo가 없으면 코어가 초대 항목을 끄고 이유를 보여 줍니다(10.10.4).
- **시험** 가짜 클라이언트 4개 시뮬레이터에서 진행자가 카운트다운 중 끊기면 다음 자리 주인이 진행자가 되는지 확인합니다. 하루가 바뀔 때의 한도 계산, 배치 계산, 진행자만 설정을 쓰는 규칙도 시험합니다.
- **코어 변경** `renderScene`은 런처와 슬롯 썸네일과 꾸미기 미리보기가 쓰므로 M0 render port에 들어 있고 `ctx.files.saveToDisk`도 M0 플랫폼 기능입니다. 연결이 끊기면 자리와 자세를 지우는 예약에는 기능 이름이 없는 `DocHandle.removeOnDisconnect(key, on)`을 ADR 0019와 함께 더했습니다.

#### HOM-16 스케줄러(P2, M3 마이홈 묶음, HOM-21과 HOM-22는 형제 모듈)

- **만드는 것** `src/modules/scheduler/`이고 `requires`는 home, `optionalRequires`는 friends입니다. home 모듈의 확장 지점 `home.tabs`에 스케줄러 탭을 더합니다. home은 주인 uid와 방문 여부를 넘기고 같은 화면이 친구 방문 때는 읽기 전용으로 동작합니다(HOM-10). 방문 대상이 바뀐 뒤 늦게 도착한 결과는 버립니다.
- **데이터** `mod/scheduler/u/{uid}/ev/{id}`에 날짜(YYYY-MM-DD 달력 날짜, 오전 6시 기준이 아님), 제목(40자 이하), 메모(200자 이하), 공개 여부를 둡니다. 공개 일정은 같은 다중 경로 쓰기로 `pub/{id}`에도 써서 공개본이 어긋나지 않습니다. 목록 구독은 날짜 순서와 limit을 씁니다.
- **화면** 월 달력은 일반 DOM으로 그리고 날짜 입력은 `<input type=date>`를 써서 달력 라이브러리를 더하지 않습니다. 설정은 한 주 시작 요일과 시작 때 알림입니다. 다가오는 일정 알림(HOM-22)은 `seat.labels`의 말풍선이나 `ctx.notify`로 보냅니다. `scheduler.changed`를 보내 나중의 D-day 모듈이 받을 수 있게 합니다.
- **시험** 날짜 경계와 공개와 비공개 다중 경로 쓰기가 한 번에 처리되는지를 시험합니다. 방문 모드가 비공개 경로를 읽지 않는지와 방문자가 `ev`는 못 읽고 `pub`는 읽는지는 규칙 시험으로 확인합니다.
- **코어 변경** 없습니다. `home.tabs`와 방문 hook은 home 모듈(M2b)에 있고 `ctx.notify`는 M2b에서 채팅 안 읽음 알림을 위해 더하는 범용 OS 알림 기능입니다.

#### TDO-01 함께 쓰는 할 일 목록(명세에 없는 새 기능, 가칭)

- **만드는 것** `src/modules/todo/`이고 `requires`는 rooms, `optionalRequires`는 chat과 gacha입니다.
- **데이터** `mod/todo/r/{roomId}/items/{pushId}`에 내용(80자 이하), 만든 사람, 완료 여부, 완료한 사람, 서버 시각을 두고 마지막 100개만 구독합니다. 규칙 조각은 `roomMember` 템플릿을 써서 방 멤버만 항목을 만들고 완료를 바꾸며 만든 사람만 지웁니다. 글자 수 검사는 zod schema에서 생성합니다.
- **화면** 포커스를 받는 패널 창 `todo.list`(한글 입력), 남은 개수 배지가 있는 `chip.buttons` 항목, `menu.main` 항목을 둡니다. chat 모듈이 있으면 `chat.commands`에 `/todo <내용>` 명령을 더합니다. presence 필드 `m.todo.doneToday`를 `seat.labels` 배지로 친구 머리 위에 보여 줍니다. 방 이벤트 `todo.cheer`는 시드가 있는 꽃가루 효과를 canvas2d 구현으로 재생하고 three3d 구현은 나중에 더할 수 있습니다.
- **보상** 완료하면 `todo.completed`를 보냅니다. gacha가 있으면 `grantTickets(roomId, 1, 'todo:<id>')`로 그 방 가챠의 횟수를 주는 보상 규칙을 todo 안이나 별도 모듈에 둘 수 있고 어느 쪽이든 가챠 모듈은 바뀌지 않습니다.
- **시험** 완료 전환 순수 로직, 에뮬레이터 규칙, 두 클라이언트가 같은 항목을 동시에 바꾸는 시뮬레이터 시나리오를 둡니다. 기능을 지울 때는 폴더와 import 줄을 지우고 원하면 `scripts/drop-namespace todo`로 서버 데이터를 지웁니다.
- **코어 변경** 없습니다. 방 데이터, presence 필드, 방 이벤트, 효과, 슬롯, chat의 확장 지점은 모두 이미 있는 계약 부분입니다. 명세에 없던 기능을 코어, preload 브리지, 창 관리자, 메인 프로세스, 다른 모듈의 규칙을 고치지 않고 더할 수 있다는 것이 이 사례로 확인하려는 점입니다.

### 10.10 품질과 배포

#### 10.10.1 시험

1. **단위 시험(Vitest)** 모듈과 코어의 순수 로직(집중 시간 계산, `dayKey`, 뽑기 횟수와 대상, 병합, 한도, 코드 생성, presence 차이 계산, 자세 순위)을 표 형태로 시험합니다. 가짜 시계는 타이머를 손으로 실행해 지연 저장과 `seenAt` 갱신을 결정적으로 시험합니다.
2. **적합성 시험** 등록부의 모든 모듈에 자동으로 실행합니다. manifest 검사, id와 namespace와 명령과 단축키 중복, `requires` 확인, 설정 기본값 검사, v1 고정 자료에서 지금 schema까지의 migration, presence 필드 바이트 한도, 규칙 조각의 namespace, 에셋 이용 조건, setup 뒤 해제했을 때 남은 구독과 타이머가 0개인지를 확인합니다.
3. **다중 클라이언트 시뮬레이터(첫날부터)** `createHarness({ modules, clients: n })`가 클라이언트마다 진짜 모듈 호스트를 만들고 가짜 시계, `FakePlatform`, 메모리 서버를 공유시킵니다(직접 서버안의 harness). 시나리오는 입장과 퇴장, 앱 충돌, 절전과 복귀, 네트워크 끊김과 재연결, 옛 `PROTO`, 시계가 5분 틀린 클라이언트, 한 계정 두 기기, 가챠 동시 뽑기, 사진 진행자 끊김, 할 일 동시 변경입니다.
4. **adapter 계약 시험** 같은 시험을 메모리 `ServerPort`와 Firebase 에뮬레이터에 실행해 가짜 구현이 실제와 같게 동작하는지(쓴 값을 바로 읽음, 없는 값은 진짜 빈 값, transaction 첫 호출은 빈 값, 다중 경로 쓰기는 전부 아니면 전무) 확인합니다.
5. **규칙 시험** 에뮬레이터에서 소유자, 방 주인, 방 멤버, 다른 사용자, 로그인하지 않은 사용자로 읽기, 쓰기, 삭제, 다중 경로 쓰기의 허용과 거부를 확인합니다.
6. **렌더러 적합성 시험** debug와 canvas2d(나중에 three3d)에 같은 시험을 Chromium에서 실행해 anchor 위치, 클릭 영역, `renderScene` 결과 크기, 해제 뒤 캔버스 정리를 확인합니다.
7. **Playwright Electron 부팅 시험** 메모리 서버와 `FakePlatform`으로 앱을 켜고 선언한 창을 모두 열고 인자 없이 실행해도 되는 명령을 모두 실행한 뒤 콘솔 오류가 0개인지 확인합니다.
8. **되돌림 규칙** 버그를 고치며 더한 시험은 고치기 전 커밋에서 실패하는 것을 한 번 확인합니다. PR 양식에 확인 칸을 둡니다.
9. **OS별 수동 점검표** 친구 그림 앱에서 펜 30분, 캐릭터 아래 1080p 60fps 영상 30분, 절전과 복귀, 모니터 분리, 125%와 150% 배율, 관리자 권한 앱을 출시마다 확인하고 측정함과 측정하지 않음을 나눠 적습니다.
10. **8시간 연속 실행 시험** 메모리 증가 1.5배 미만, CPU 깨어 있을 때 5% 이하와 잠들었을 때 2% 이하, 내려받기가 namespace별 예상 범위 안인지 확인합니다.

#### 10.10.2 CI

PR마다 ubuntu 실행기에서 타입 검사, lint(import 경계 포함), 단위 시험, 적합성 시험, 시뮬레이터, 에뮬레이터 규칙 시험과 adapter 계약 시험, 렌더러 적합성 시험, Playwright 부팅 시험(xvfb)을 실행합니다. 에뮬레이터 시험은 첫날부터 CI에 둡니다. Windows 실행기는 태그를 달 때와 일주일에 한 번 실행해 패키징과 기본 모듈 로드를 확인하고 Mac은 M0에서 네이티브 모듈을 빌드하고 로드하는 단계별 점검으로만 확인하다가 Mac판을 만들 때 태그 점검에 더합니다. 직접 서버안은 모든 push마다 Windows, Mac, ubuntu에서 실행하는 방식이었지만 비공개 저장소의 GitHub Actions 포함 시간은 한 달 2,000분이고 Windows는 2배, Mac은 10배로 계산하는 것으로 알고 있어(2026년 10월 기준 확인하지 않음) Mac 빌드 15분이 150분으로 계산됩니다. 그래서 OS별 실행은 태그와 주간 점검에만 둡니다. 파일 하나가 600줄을 넘으면 lint가 경고합니다.

#### 10.10.3 출시와 업데이트

- **첫 선물(M1)** 선물하는 사람이 Windows 설치 파일과 한 쪽짜리 설치 안내를 직접 건넵니다(NFR-02). 서명하지 않은 Windows 설치 파일은 SmartScreen 경고를 띄우는 것으로 알고 있어 설치 안내에 경고 창의 추가 정보와 실행을 누르는 단계를 넣고 M1 전에 친구 PC와 같은 Windows 버전에서 직접 설치해 봅니다. 이 경고 화면은 확인하지 않았습니다. 서명하지 않은 Mac dmg는 손상되었다는 경고를 띄울 수 있고 이 경고는 우클릭 열기로 넘길 수 없으며 macOS 15부터는 다른 경고의 우클릭 열기 우회도 없어져 시스템 설정에서 열기를 허용해야 하는 것으로 알고 있습니다. 그래서 Mac판을 만들 때 설치 안내에 macOS 버전에 맞춘 열기 단계와 손상 경고가 뜰 때 격리 속성을 지우는 명령을 넣습니다. 첫 선물에도 `PROTO`와 `minProtocol` 확인과 `BRIDGE_VERSION` 확인은 이미 들어 있습니다(NFR-20).
- **태그 출시 절차** 버전 태그를 올리면 GitHub Actions의 release가 태그와 `package.json` 버전이 같은지 확인하고 타입 검사와 단위 시험을 다시 실행합니다. 운영 Firebase 주소가 저장소 변수에 있는지 확인한 뒤 빌드하고 electron-builder로 Windows x64 NSIS 설치 파일을 만듭니다(Mac판을 만든 뒤에는 Mac dmg도 같은 커밋에서). 모두 통과하면 설치 파일과 업데이트 정보(`latest.yml`, blockmap)를 공개 저장소의 GitHub Releases에 한 번에 올립니다(10.14의 8번). 같은 태그의 릴리스가 이미 있으면 올리기가 실패하므로 이미 낸 버전은 덮어쓰지 않습니다.
- **자동 업데이트(M2a, OPS-13, NFR-19)** 설치한 Windows판은 electron-updater가 시작할 때와 6시간마다 공개 저장소의 GitHub Releases를 확인하고 자동으로 받은 뒤 사용자가 스테이지의 다시 시작을 누를 때 설치합니다(10.14의 8번). 개발판과 Mac에서는 업데이트를 확인하지 않습니다. Mac 자동 업데이트에는 Apple 서명과 공증(1년 99달러)이 필요하고 electron-updater가 Mac에서 쓰는 zip 결과물을 dmg와 함께 올려야 하므로 서명할 때 출시 절차에 zip을 더합니다(10.14의 9번).
- **개발과 운영** 개발용과 운영용 Firebase 프로젝트를 따로 두고 개발판은 다른 데이터 폴더를 쓰며 사전 출시 채널로 내서 친구 앱이 자동 업데이트로 받지 않게 합니다(NFR-14).
- **서버 변경 먼저** `npm run deploy:rules`가 규칙 시험을 실행하고 개발 프로젝트에 배포한 뒤 확인을 받고 운영 프로젝트에 배포합니다. 규칙 변경은 따로 커밋하고 앱보다 먼저 배포합니다.
- **콘텐츠** 새 아이템, 스티커, 시즌 가챠는 `scripts/publish-catalog`로 올리고 앱은 `catalogVersion` 버전 번호가 바뀌면 다시 받으므로 앱 출시가 필요 없습니다.
- **백업** `scripts/backup`이 Realtime Database를 JSON으로 받아 날짜를 붙여 저장하고 최근 7개를 남깁니다(ACC-08). 선물하는 사람 PC의 예약 작업으로 하루 한 번 실행합니다. 관리 SDK가 받는 양도 내려받기 한도에 들어가므로 `files/`는 처음 한 번 받은 뒤 새 해시만 받고 나머지 경로만 날마다 받습니다(10.7.5).

#### 10.10.4 버전 확인

- 앱은 방에 들어가기 전에 `config/minProtocol`을 읽고 자기 `PROTO`가 낮으면 업데이트 안내를 띄우며 다시 시도하지 않습니다. 규칙도 `proto`가 최소 버전보다 낮은 멤버 기록을 거부합니다.
- `scripts/set-min-protocol`은 이미 출시한 버전으로만 올리고 선물하는 사람은 친구가 업데이트한 것을 확인한 뒤에 실행합니다. 업데이트 때 방을 모두 닫을 필요는 없습니다.
- 모듈 하나의 방 이벤트만 바뀌면 `PROTO` 대신 새 이벤트 이름을 씁니다. 직접 서버안은 모듈마다 프로토콜 번호를 두고 서버가 맞지 않는 모듈만 끄는 방식이었는데 2명에서 10명 규모에서는 이름을 바꾸는 쪽이 코드가 적습니다.
- 모듈 하나를 새로 더한 앱과 그 모듈이 없는 옛 앱이 같은 방에 있으면 옛 앱은 새 이벤트를 조용히 무시하므로 상대 앱이 어떤 모듈을 가졌는지 알려야 합니다. 멤버 기록 코어 필드 `mods`에 모듈 id와 데이터 버전의 짧은 목록(예를 들어 `focus:1,photo:2`)을 씁니다. 코어는 `member.menu` 항목과 명령의 `enabledWhen`에서 상대 앱에 필요한 모듈이 없으면 항목을 끄고 이유를 보여 줘서 COM-15 사진 초대처럼 상대가 응답해야 하는 기능에서 보낸 사람이 응답을 기다리기만 하는 일을 막습니다. 한 사람에 100바이트 안쪽이라 10명 방에서도 비용 영향이 작고 코어 멤버 필드라서 M0에 넣어야 나중에 `PROTO`를 올리지 않습니다.
- 서버 기록의 `v`, 카탈로그 항목의 `schema`, 설정의 `schemaVersion`, 브리지의 `BRIDGE_VERSION`을 다루는 규칙은 10.7.3에 적었습니다.

### 10.11 기술 스택과 폴더 구조

| 영역 | 선택 | 이유 |
|---|---|---|
| 언어 | TypeScript strict(모든 프로세스, 모듈, 스크립트, 규칙 빌드 스크립트) | 모듈 계약, 이벤트 payload, presence 필드, `ctx`를 컴파일러가 확인합니다. 같은 타입을 메인과 렌더러와 스크립트와 규칙 빌드 스크립트가 함께 써서 제한값을 여러 곳에 따로 적지 않습니다(10.14의 3번). |
| 데스크톱 | Electron(시작할 때 안정 버전에 고정) | 투명 창, 클릭 통과, 유휴 시간, 절전 이벤트, 로그인 항목, 화면 배율, 두 OS 자동 업데이트를 기본으로 줍니다(NFR-24). |
| 빌드와 패키징 | electron-vite, electron-builder(NSIS, dmg), npm과 `package.json` 하나 | 널리 쓰는 조합이고 작업 공간을 나누지 않아 움직이는 부분이 적습니다. |
| UI | React, CSS Modules, CSS 변수 디자인 토큰(팔레트 층이 의미 층에 값을 주는 구조) | 사람과 AI 도구가 모두 익숙하고 portal로 자식 창에 그릴 수 있습니다. 범위가 있는 스타일로 전역 CSS 충돌을 피하고 테마는 팔레트 층과 의미 층의 두 층으로 둡니다. |
| 상태 | 라이브러리 없음. 코어가 모듈마다 만든 작은 store와 `useSyncExternalStore` | 구독 하나면 충분해서 의존성을 더하지 않습니다(직접 서버안). |
| schema | zod | 설정, 로컬 파일, 서버 기록, presence 필드, 카탈로그 종류의 타입과 실행 중 검사를 한 정의에서 얻습니다. 같은 검사가 여러 모듈에 반복되면 규칙의 형식 검사도 이 정의에서 만듭니다. |
| 2D 그리기 | Canvas 2D(라이브러리 없음). 측정해서 부족하면 PixiJS | 10.8.2 |
| 3D 그리기(나중) | three.js | 3D가 다시 필요해질 때만 두 번째 backend로 더합니다(9.1 결정 3). |
| 서버 SDK와 도구 | Firebase JS SDK(모듈식)를 스테이지 렌더러에, firebase-admin을 스크립트에, Firebase Emulator Suite를 시험에 | 연결은 모든 모듈이 있는 렌더러 하나에만 있고 에뮬레이터가 실제 규칙을 CI에서 실행합니다. |
| 활성 창 감지 | `get-windows`를 ActiveWindow adapter 뒤에(M0에서 두 OS 미리 빌드 확인) | adapter 뒤에 두어 다른 구현으로 바꿔도 모듈은 그대로입니다. |
| 입력 감지 | `powerMonitor.getSystemIdleTime()`, `uiohook-napi`는 선택 | 키 내용을 읽지 않고 네이티브 의존성이 없습니다. 타이핑 자세 기준은 1.5초 대신 1초나 2초입니다(NFR-09). |
| 로그 | electron-log. 파일 이름 함수를 날짜별로 바꾸고 시작할 때 7일 지난 파일을 지움 | 비동기 쓰기를 코드 없이 씁니다. 기본 회전은 크기 기준인 것으로 알고 있어 NFR-21의 하루 단위 7일 보관에 맞춰 파일 이름 함수만 바꿉니다. |
| 시험 | Vitest, `@firebase/rules-unit-testing`, Playwright(`_electron`) | 시험별 결과를 내는 표준 실행기입니다. |
| lint와 형식 | ESLint(typescript-eslint, 경로 별칭을 강제하는 `no-restricted-imports`), Prettier, `scripts/check-imports` | `no-restricted-imports`는 import 문자열만 비교해서 모듈 경계를 확인하지 못하므로 짧은 CI 스크립트가 import 경로를 해석해 계층과 모듈 경계를 확인합니다. 플러그인은 더하지 않습니다. |
| CI와 출시 | GitHub Actions | 이 규모에서 요금이 없고 태그로 시작하는 출시 절차를 둡니다. |

```
isshoni-hatarakou/
  package.json, electron.vite.config.ts, electron-builder.yml, firebase.json
  .github/workflows/      ci.yml, release.yml
  docs/adr/               결정마다 짧은 기록 하나
  docs/checklists/        OS별 수동 점검표
  src/shared/             schemas.ts, constants.ts, time.ts(dayKey, 서버 시각), proto.ts, codes.ts, appkey.ts
  src/main/               index.ts(생명주기), windows/(관리자, 스테이지, 패널, 효과), ipc.ts, store.ts(원자적 저장),
                          log.ts, tray.ts, updater.ts
  src/main/platform/      ports.ts, index.ts(process.platform을 읽는 유일한 파일), win/, mac/, fake/
  src/preload/            bridge.ts(BRIDGE_VERSION, namespace, 해제 함수)
  src/renderer/core/      host.ts(등록, 검사, setup과 해제), ctx.ts, bus.ts, commands.ts, shortcuts.ts, slots.ts,
                          ui/(창 클라이언트, portal, 설정 화면 생성, 알림), room/(RoomSession, 좌석), mode.ts,
                          catalog.ts, clock.ts, local.ts, assets.ts, audio.ts, gates.ts, tunables.ts, boot.ts,
                          manifest.ts(코어 설정과 코어 신원 기능의 specIds)
  src/renderer/server/    port.ts, firebase/, memory/
  src/renderer/render/    port.ts, debug/, canvas2d/, three3d/(나중)
  src/modules/index.ts    유일한 등록 목록 (모듈마다 import 한 줄)
  src/modules/<id>/       index.ts(manifest), logic.ts, ui/*.tsx, rules.ts, assets/, assets.json,
                          fixtures/v1.json, *.test.ts, 선택 main.ts와 functions.ts
  rules/                  core.ts(템플릿, 코어 경로), build.ts(합치기, namespace 검사, 공통 상수, .indexOn), tests/
  scripts/                new-module.ts, create-account.ts, publish-catalog.ts, set-min-protocol.ts,
                          deploy-rules.ts, backup.ts, migrations/, check-assets.ts, check-imports.ts, coverage.ts,
                          drop-namespace.ts
  tests/                  conformance/, adapter-contract/, sim/(다중 클라이언트), e2e/(Playwright Electron)
  assets/                 공통 에셋과 이용 조건 목록
```

### 10.12 단계별 구현 순서

첫 선물은 M0와 M1입니다. 그 뒤의 기능은 대부분 독립 모듈이라 어느 단계에서 멈춰도 그때까지의 앱이 완성된 상태로 남습니다. 단계나 묶음 사이에 의존이 있는 곳은 해당 항목에 적었습니다.

#### M0 기반(사용자 기능 없음)

- **포함** 계약 부분 가운데 M1 모듈이 쓰는 것과 저장하거나 주고받는 형식이 걸린 것만 만들고 나머지는 타입만 둡니다(10.5의 만드는 시점).
  - **도구** 저장소, strict TypeScript와 경로 별칭, electron-vite, electron-builder, ESLint와 `scripts/check-imports`, Vitest, GitHub Actions, ADR 폴더
  - **shared** schema, 상수, `dayKey`, `PROTO`, `BRIDGE_VERSION`, 코드 생성기, 앱 키, `Appearance` v1
  - **main-core** 단일 실행, 절전과 복귀와 잠금, 모니터 변경, 렌더러 충돌 뒤 재시작, 창 관리자, 원자적 파일 저장, 로그와 진단 폴더, 보이기와 숨기기와 위치 초기화와 종료가 있는 트레이, 메인 프로세스가 처리하는 화면 숨기기 단축키, 앱 전용 scheme과 CSP
  - **platform adapter** Windows의 좌석 크기 오버레이 창, 커서 확인 클릭 통과, 펜 앱, 창 제목을 읽지 않는 활성 창 감지, 유휴 시간, 자동 실행, 저장 대화상자, `FakePlatform`, Mac 네이티브 모듈 빌드 점검(Mac adapter는 Mac판을 만들 때)
  - **renderer core** 모듈 호스트, M1이 쓰는 `ctx` 항목(`ctx.self`, `ctx.tunables`, `ctx.files.upload`, `ctx.app` 포함), bus, 명령, 단축키, 슬롯, portal 창 클라이언트, 설정 화면 생성, 좌석과 이름표, `backgroundThrottling: false`인 스테이지 창
  - **서버** `ServerPort`의 firebase와 memory 구현, 계정 발급 스크립트와 설정 코드 로그인, RoomSession(`{uid}_{deviceId}` 기록 키, `mods`, `seenAt`, `beforeJoin`, `state` 우선순위 계산), 손으로 쓴 규칙 조각을 합치는 `rules/build.ts`와 에뮬레이터 시험
  - **그리기** `CharacterView`의 debug와 canvas2d(임시 자세 그림 세 장으로 그린 기본과 타이핑과 잠든 자세, 층, 색칠, 그림의 투명하지 않은 영역으로 계산한 anchor, fps 상한)와 `renderScene`
  - **시험** 적합성 시험, 시뮬레이터, Playwright 부팅 시험, M0에서 만든 계약 부분을 모두 쓰는 버릴 모듈 `hello`
- **NFR** NFR-01, NFR-02, NFR-03, NFR-05, NFR-06, NFR-07, NFR-09, NFR-10, NFR-11, NFR-12, NFR-13, NFR-14, NFR-15, NFR-16, NFR-18, NFR-20, NFR-23, NFR-24의 기반을 이 단계에 만들고 M1에서 실제 기기로 확인합니다.
- **완료 조건** Windows PC에서 `hello` 모듈이 코어를 고치지 않고 패널 창, 상태칩 항목, 단축키, presence 필드, 서버 namespace를 더하고 import 줄을 지우면 모두 사라집니다. 두 PC가 개발 방에서 서로의 임시 캐릭터를 봅니다. 한 PC의 랜선을 뽑거나 절전하면 다른 PC에서 150초 안에 좌석이 사라지고 복귀하면 다시 들어오며 실제로 걸린 시간을 ADR에 적습니다. 트레이로 스테이지 창을 10분 숨겨도 다른 PC에서 좌석이 남습니다. 옛 `PROTO` 앱은 안내와 함께 입장을 거부당합니다. 캐릭터 아래 1080p 60fps 전체 화면 영상 30분과 친구 그림 앱 펜 입력 30분 동안 화면이 검어지거나 멈추거나 선이 직선이 되지 않습니다. 커서를 빠르게 캐릭터로 옮겨 바로 눌러도 클릭이 아래 창으로 넘어가지 않습니다. 10좌석 장면에서 CPU가 깨어 있을 때 5% 이하, 잠들었을 때 2% 이하이고 메모리가 400MB 이하입니다. portal 패널에서 한글 입력이 동작하고 패키징한 앱의 패널에서 YouTube 플레이어가 재생되는지 확인해 결과를 ADR에 적습니다. CI가 통과합니다.

#### M1 P0 첫 선물판(P0 41개 가운데 기능 23개, NFR 18개는 M0 기반을 실제 기기에서 확인, 9.3의 OUR-01과 OUR-03)

- **포함** 런처와 설정 화면 모듈(SCR-02, SCR-04, SCR-05, SCR-06, SCR-07), 캐릭터 모듈(CHR-01, CHR-02, CHR-03, CHR-04), focus 모듈(CHR-05, FOC-01, FOC-02, FOC-03, FOC-05), growth 모듈(GRW-01, `secondsPerLevel` tunable, 레벨은 `profile` 필드로 공개), 캐릭터 만들기와 wardrobe 모듈(AVT-01, AVT-11의 기본 책상과 친구가 넣은 책상 그림, OUR-03의 자세 그림 세 장, wardrobe는 `ctx.self.setAppearance`로 `look`을 씀), rooms 모듈(ROM-01, ROM-04, ROM-05, ROM-06, ROM-08, OUR-01의 방 주인과 정원과 방 보존), account 모듈(ACC-04, 설정 코드와 친구 코드 별칭, `ctx.self.setName`), 이용 조건을 적은 첫 2D 에셋 묶음(기본 자세 그림과 책상), 직접 건네는 Windows 설치 파일입니다. AVT-03과 AVT-04(얼굴 그리기)는 M2a에서 넣고 AVT-05, AVT-06, AVT-08은 OUR-02 아이템을 붙이는 스티커로 바뀌어 OUR-02와 함께 M2a로 옮겼습니다.
- **완료 조건** 9.2의 흐름이 친구 PC에서 일주일 동안 동작합니다. 9.2의 5행 꾸미기는 M2a에 들어가므로 확인에서 뺍니다. 친구가 그린 자세 그림 세 장을 넣은 캐릭터를 만들고 작업 앱을 등록하면 집중 시간과 레벨이 오르고 오전 6시 경계가 맞으며 선물하는 사람과 친구가 워킹룸에서 서로 깨어 있음과 잠듦을 봅니다. 방 주인이 정한 정원을 넘는 입장이 막히고 모두 나간 뒤 다시 들어가도 방이 남아 있습니다. 1시간 동안 잰 집중 시간이 스톱워치와 1% 안에서 맞습니다. 다시 시작해도 데이터가 남습니다. Firebase 사용량 화면의 한 달 내려받기가 1GB 아래입니다. M1에서 코어를 고친 곳이 M0에 없던 범용 기능뿐이고 고친 곳마다 ADR이 있습니다.

#### M2a P1 매일 쓰는 기능(42개와 9.3의 OUR-02)

- **포함** SET-01, SET-02, SET-06, SET-07, SET-11, SET-14, SET-16, SET-17, CHR-06, CHR-08, CHR-09, CHR-10, CHR-12, FOC-06, GRW-03, AVT-02, AVT-03, AVT-04, AVT-05, AVT-06, AVT-07, AVT-08, AVT-12, AVT-13, AVT-15, AVT-17, AVT-18, AVT-20, GCH-01, GCH-02, GCH-03, GCH-07, GCH-08, ROM-10, ACC-08, OPS-13, NFR-04, NFR-08, NFR-19, NFR-21, NFR-22, NFR-25, OUR-02
- **범위 메모** SET-01, SET-06, SET-07, SET-11, SET-14, SET-16, SET-17은 코어 설정이고 SET-02는 focus 모듈에 더합니다(10.5의 코어 설정). AVT-02의 동물 종류는 AVT-18의 그림 넣기 화면과 함께 넣고 GRW-03의 30레벨 해금은 코어 `gates`를 이 단계에서 구현해 `sticky`로 계정에 남깁니다(10.14의 12번). GCH-01, GCH-02, GCH-03, GCH-07, GCH-08은 OUR-02의 방별 가챠로 만들고(10.9) AVT-05, AVT-06, AVT-08은 OUR-03에 따라 OUR-02 아이템을 붙이는 스티커 창과 스티커 층과 색조로 만듭니다. wardrobe의 `itemSources`도 이때 만듭니다. OUR-02는 뽑기 횟수를 레벨이 아니라 방에서 작업한 시간으로 주므로 GRW-02의 5레벨마다 뽑기 1회는 넣지 않습니다. GRW-02의 나머지 레벨 보상 가운데 동물 캐릭터는 GRW-03으로 이 단계에 넣고 춤, 폭탄, 채팅 날리기 글자 색은 그 보상이 여는 M3 기능과 함께 gate로 넣으므로 M2a에서 GRW-02로 만들 것이 거의 없습니다. 그래서 3장에서 GRW-02를 P2로 옮겼고 M3 성장과 기록 묶음에서 그 보상이 여는 기능과 함께 넣습니다. 캐릭터는 이 단계부터 `perItemMtime` 정책으로 서버에 둡니다(10.7.3).
- **완료 조건** 항목마다 모듈 하나, 기존 모듈의 기여, 코어 설정 가운데 하나로 들어가고 코어 변경은 ADR이 있는 범용 기능뿐입니다. 자동 실행, 모니터 선택, 확대와 축소, 자리비움, 펜 앱 보호, 방에서 작업한 시간으로 뽑는 방별 가챠, 뽑은 아이템을 다른 방에서도 붙이는 스티커가 동작합니다. 방 주인이 아이템을 함께 지우기로 지우면 다른 멤버 앱이 다음 동기화 때 보관함과 스티커에서 그 아이템을 뺍니다. 30레벨에 이른 사람은 동물 캐릭터를 만들고 PC를 바꿔도 동물 캐릭터가 열려 있습니다. 친구가 다시 설치한 PC에서 설정 코드로 레벨과 캐릭터를 되찾습니다. Windows 업데이트가 다시 시작 버튼으로 설치됩니다.

#### M2b P1 함께 쓰는 기능(25개)

- **포함** ROM-02, ROM-11, COM-01, COM-02, COM-08, COM-09(chat이 `chat.commands`와 `chat.toolbar`를 열고 코어가 `ctx.notify`를 더함), FRD-01, FRD-02, FRD-03, FRD-04, FRD-05, HOM-01, HOM-02, HOM-03, HOM-05, HOM-06(배경은 가로 960px 정도로 줄여 64KB 안에 넣음, 10.14의 13번), HOM-08, HOM-09, HOM-10(마이홈 데이터는 `friendsRead` 템플릿으로 친구에게만 읽기를 엶, 10.14의 16번), HOM-12, HOM-14(home이 `home.tabs`와 방문 hook을 엶), SND-01, SND-02, SND-08, SND-09(공식 YouTube 플레이어를 `keepAlive` 패널 안에 두고 `externalOrigins`로 CSP에 더하며 음량은 `ctx.audio.registerExternal`로 그룹에 넣음. 백색소음 종류와 타이핑 여부는 presence 필드로 공유하고 타이핑 여부는 최소 3초 간격으로 씀)
- **완료 조건** 두 PC 사이에서 한글 입력이 되는 채팅, 친구 신청과 초대, 친구 마이홈 읽기 전용 방문, 방에서 함께 듣는 백색소음이 동작합니다. 다른 사용자에게 쓰는 모든 기록에 보낸 사람을 로그인 uid로 확인하는 규칙 시험이 있습니다.

#### M3 P2 묶음(67개, 친구가 좋아하는 묶음부터, 묶음끼리 대부분 독립)

- **놀이 묶음** COM-05, COM-10, COM-11, COM-13, COM-14, COM-15, COM-16, COM-17, COM-18, CHR-11, AVT-21, HOM-17(연출 동안만 여는 효과 창 포함). COM-16과 HOM-17은 동물 캐릭터만 남의 머리에 올라타므로 M2a의 AVT-18이 있어야 합니다.
- **마이홈 묶음** HOM-04, HOM-07, HOM-11, HOM-13, HOM-15, HOM-16, HOM-21, HOM-22
- **성장과 기록 묶음** GRW-02(레벨 보상 표와 gate), GRW-04, GRW-06, GRW-07, GCH-04, GCH-05, FOC-04, FOC-07, FOC-08, FOC-09
- **자리비움과 방 관리 묶음** CHR-07, CHR-13, ROM-14
- **꾸미기와 화면 묶음** SCR-03, SET-03(코어 표시 모드 `ctx.mode`를 켜고 끄는 화면), SET-04, SET-05, SET-08, SET-12, SET-13, SET-15, AVT-09, AVT-10, AVT-14, AVT-19, AVT-22, COM-04. SET-04, SET-05, SET-13, SET-15는 코어 설정입니다(10.5).
- **소리 묶음** SND-03, SND-04, SND-05, SND-06, SND-07, COM-03
- **계정과 운영 묶음** SCR-08, ACC-05, ACC-09, ACC-10, ACC-12, ACC-13, NFR-17, OPS-01, OPS-03, OPS-12, OPS-17, OPS-18, OPS-21(관리 화면이 아니라 스크립트), FRD-06. SCR-08, ACC-05, ACC-12는 코어 신원 기능이라 ADR과 함께 코어에 더합니다(10.7.2).
- **완료 조건** 묶음마다 적합성 시험과 자기 시뮬레이터 시나리오를 통과합니다. 코어 변경은 ADR이 있는 범용 기능과 코어 신원 기능뿐입니다. 제외로 정한 40개는 만들지 않고 gate 계약이 나중에 다시 넣을 자리를 남깁니다. 64KB 넘는 파일이 필요한 CHR-07, AVT-09, HOM-11을 넣을 때 10.7.6의 기준으로 Blaze 전환을 정합니다.

#### M4 3D 그리기(선택, 9.1 결정 3은 2D로 정했고 3D가 다시 필요해질 때만)

- **포함** three3d `CharacterView` backend(GLB 몸과 파츠, 뼈에 맞춰 붙이는 파츠와 고정해 붙이는 파츠, 조명 설정 하나, `renderScene`), 카탈로그 항목의 `assets.three3d`와 위치 조정, 중요한 효과의 three3d 구현, 설치마다 바꾸는 렌더러 설정
- **완료 조건** `renderer=three3d`에서 모든 모듈 시험과 Playwright 부팅 시험이 그대로 통과하고 `src/modules/` 아래 파일이 하나도 바뀌지 않습니다. 친구 PC에서 NFR-10의 fps와 CPU 목표를 지킵니다.

#### M5 명세 밖 새 기능

- **포함** TDO-01 할 일 목록부터 시작해 만드는 사람이 더할 기능
- **완료 조건** 새 기능이 폴더 하나와 등록 줄 하나로 들어갑니다. 코어 변경은 예외이고 ADR로 남깁니다.

### 10.13 위험과 대응

| 위험 | 대응 |
|---|---|
| Firebase 요금이나 정책이 바뀌거나 버그가 쓰기를 반복해 요금이 나감 | Spark 요금제로 시작해 한도를 넘으면 요금 대신 멈춥니다. Blaze로 올리면 예산 알림을 1달러와 5달러에 둡니다. adapter가 루트 구독과 limit 없는 목록을 거부하고 컬렉션별 쓰기 상한을 둡니다. `ServerPort` 뒤에 있으므로 옮길 때는 `server/` 구현과 규칙 빌드 스크립트만 바꿉니다(10.7.6). |
| 활성 창 모듈의 미리 빌드한 바이너리가 없거나 Mac 권한이 필요하거나 관리자 권한 앱의 경로를 읽지 못함 | M0 CI 점검, 이유가 있는 알 수 없음 상태와 진단 줄, 프로세스 이름이나 번들 ID만 사용, 등록 화면 안내, OS별 작은 도우미 실행 파일로 대체 |
| 투명 창이 친구 PC에서 GPU, 영상, 펜 문제를 일으킴 | 좌석 크기 창, fps 상한, `forward` 미사용, 우회 설정은 기본 꺼짐과 진단 줄, 출시 전 30분 영상과 펜 점검 |
| portal 패널의 포커스, 한글 입력, 스타일 복사에 문제가 있음 | M0에서 먼저 시험하고 실패하면 패널마다 렌더러와 MessagePort로 바꿉니다. 모듈은 `ctx.ui.open`만 부르므로 바뀌지 않습니다. |
| 스테이지 렌더러가 멈추면 패널도 함께 멈춤 | 무거운 작업은 Web Worker, 응답 없음 감시와 렌더러 충돌 뒤 재시작, 트레이는 메인 프로세스가 처리하므로 계속 동작 |
| 모듈 계약이 혼자 만들기에 무거움 | 필수는 `id`와 `setup`뿐, `npm run new-module` 생성기, M0에서 만든 계약 부분을 모두 쓰는 `hello` 모듈 예시, M0는 M1이 쓰는 계약 부분만 만들고 나머지는 처음 쓰는 단계에서 만듦, 규칙은 손으로 쓴 조각을 합치는 스크립트로 시작, 10.5에 없는 부분은 두 번째 사용 전에 더하지 않음 |
| 2D에서 3D로 바꿀 때 2D 전제가 드러남(anchor, 클릭 영역, 사진, 색칠) | debug와 canvas2d 두 구현과 공통 렌더러 적합성 시험, 렌더러 중립 데이터, backend별 에셋과 위치 조정, 없는 효과는 로그만 |
| 설정 코드가 새거나 사라짐 | 앱은 설정 코드를 따로 저장하지 않고 Firebase SDK의 로그인 유지에 맡김, 선물하는 사람이 비밀번호를 새로 만들어 기존 로그인과 옛 코드를 무효로 만듦, 규칙상 각 계정은 자기 데이터만 씀 |
| 포커스를 받지 않는 캐릭터 창에서는 맨 글자 단축키(T, TAB, F1 같은 키)가 바탕화면에서 동작하지 않음 | 패널 범위 단축키, 보조 키가 있는 전역 단축키, 모든 명령에 상태칩과 메뉴 항목, 사용자가 바꿀 수 있는 키, 충돌하거나 OS 등록에 실패한 단축키는 끄고 표시, 메인 프로세스가 처리하는 화면 숨기기 단축키, 캐릭터 창 포커스 정책은 10.14에서 결정 |
| 서명하지 않은 설치 파일의 경고(Windows SmartScreen, Mac 손상 경고)와 Mac 자동 업데이트 없음 | Windows 먼저(9.1 결정 2), 경고 창을 넘기는 단계가 든 설치 안내, M1 전에 친구 PC와 같은 Windows 버전에서 직접 설치, Mac판을 만들 때 macOS 버전에 맞춘 열기 단계와 격리 속성을 지우는 명령, Mac 자동 업데이트가 필요할 때만 1년 99달러 서명과 zip 결과물 |
| 버전이 다른 앱이 같은 방에 있음 | `PROTO`는 깨지는 변경에만 올리고 presence 필드는 더하기만 하며 이벤트는 새 이름을 쓰고 최소 버전은 친구 업데이트 뒤에 올림, 옛 앱과 새 앱 시뮬레이터 시나리오 |
| migration 실패나 실수로 데이터를 잃음 | migration 전 계정 폴더 백업 5개, 서버 백업 스크립트 7개, 파일 이름은 내용 해시, M2a부터 캐릭터 항목별 수정 시각과 휴지통 10일(계정의 앱이 부팅할 때 정리), 캐릭터 충돌 선택은 ACC-13과 함께 |
| 215개 기능이 혼자 만들기에 많음 | 첫 선물은 M0와 M1뿐이고 이후 기능은 대부분 독립 모듈이라 어느 단계에서 멈춰도 앱이 완성된 상태로 남음 |
| AI 도구와 혼자 만들며 문서와 코드가 어긋남 | 절차마다 문서 하나, 결정은 ADR, 수치는 CI가 생성, import 경계는 lint가 확인 |

### 10.14 먼저 정할 것

이 장의 구조를 만들며 정한 결정 17가지입니다. 함께 쓸 사람 수, 운영체제, 2D와 3D, 집중 시간 기준, 유료 기능, 성장 속도, 그림과 이름 결정은 9.1에 있습니다. Mac 서명(9번)을 뺀 결정은 모두 2026년 10월 8일에 정했고 8번은 10월 9일에 바꿨습니다. 뽑기 횟수를 세는 시간은 그 방에 들어가 있는 동안 쌓인 포커스 시간이고 다른 멤버가 없어도 셉니다(9.3 OUR-02, 10.7.2).

1. **서버 시작점** 선물하는 사람이 직접 만든 Firebase 프로젝트의 Spark 요금제로 시작합니다. 요금은 0원이고 한도를 넘으면 요금 대신 멈춥니다. Blaze로 올리는 시점은 10.7.6을 따르고 올릴 때 누가 요금을 내고 한 달 상한을 얼마로 둘지 함께 정합니다(NFR-13).
2. **계정 만드는 방식** 선물하는 사람이 스크립트로 계정을 만들고 설정 코드를 건넵니다. 다시 설치해도 같은 계정을 씁니다. 앱이 첫 실행 때 익명 계정을 만들면 새 PC로 옮기거나 데이터 폴더를 지울 때 데이터를 잃어서 쓰지 않습니다.
3. **개발 언어** TypeScript strict로 씁니다.
4. **2D 그리기 도구** 의존성이 없는 Canvas 2D로 시작하고 M0 측정에서 CPU 목표를 넘을 때만 PixiJS를 더합니다.
5. **생존 확인 간격** 60초 갱신과 150초 기준입니다. 10명 기준 한 달 내려받기는 약 0.4GB입니다. 20초 갱신과 60초 기준은 좌석이 더 빨리 사라지지만 약 1.2GB라서 M0 측정에서 문제가 보일 때만 다시 봅니다.
6. **캐릭터 창 포커스** 캐릭터 창은 포커스를 받지 않습니다(NFR-03). 한글 입력과 작업 프로그램의 입력 커서를 지키고 맨 글자 단축키는 패널 안에서만 동작합니다.
7. **가챠 판정 위치** 앱이 transaction으로 뽑고 규칙이 횟수를 확인합니다(9.3 OUR-02). 친구 사이에는 이 정도로 충분하고 서버 함수가 필요 없습니다. Cloud Function이 뽑게 하려면 Blaze가 필요합니다.
8. **업데이트 파일을 둘 곳** 공개 GitHub 저장소의 Releases에 설치 파일과 업데이트 정보를 올립니다. 10월 8일에는 Firebase Hosting으로 정했지만 Spark 요금제의 Hosting은 실행 파일(.exe)을 받지 않아서 10월 9일에 코드 저장소를 공개로 바꾸고 Releases로 옮겼습니다. FOC-09의 QR 안내 페이지는 Firebase Hosting(`hosting/phone/`)에 둡니다.
9. **Mac 서명** 1년 99달러로 서명과 공증을 해서 경고 없이 설치하고 자동 업데이트를 받을지는 Mac판을 만들 때 정합니다. 친구 PC가 Windows라서 Windows판을 먼저 만듭니다(9.1 결정 2).
10. **방 코드 길이** 6자(약 10억 7천만 가지)이고 접두어는 쓰지 않습니다. 방과 코드가 주인이 지울 때까지 남고 지운 방의 코드도 다시 쓰지 않으므로 가짓수가 넉넉한 길이를 골랐습니다(9.3 OUR-01).
11. **M0 범위** M0는 M1 모듈이 쓰는 계약 부분과 손으로 쓴 규칙 조각을 합치는 스크립트만 만듭니다. 10.5의 나머지 계약 부분과 zod schema에서 규칙을 만드는 생성기는 처음 쓰는 단계에서 만듭니다. 혼자 만들면서 첫 선물을 더 빨리 건네려고 이렇게 정했습니다.
12. **동물 캐릭터를 줄 시점** 동물 종류를 따로 두고(AVT-02) 30레벨에 엽니다(9.1 결정 6). 2D에서는 동물도 자세 그림 세 장을 쓰므로 AVT-18은 캐릭터 만들기 화면에 종류 선택을 더하는 작업이고 GRW-03과 함께 M2a에 넣었습니다. 30레벨은 포커스 30시간이라 하루 4시간 작업하면 8일쯤 걸려서 M3까지 미루면 기능보다 레벨이 먼저 찹니다.
13. **마이홈 배경 파일** 배경 그림은 앱이 긴 변 960px부터 줄여 가며 PNG나 WebP로 바꾸고 base64로 64KB 안에 드는 결과를 저장합니다(10.7.6). P1까지는 배경 말고 Blaze가 필요한 기능이 없어서 이 방식으로 카드 등록을 미룹니다. 사진처럼 세밀한 그림이 너무 흐려지면 Blaze와 Storage로 옮깁니다.
14. **초대 코드 가입(ACC-01)** 만들지 않습니다. Spark에서는 앱이 서버 코드 없이 초대 코드로 계정을 만들 방법이 없고 친구를 더 부를 때도 선물하는 사람이 스크립트로 계정을 만들면 충분합니다. ACC-01은 제외입니다.
15. **방 정원(OUR-01, ROM-09)** 방 주인이 2명부터 10명까지 정하는 정원을 rooms 모듈이 입장할 때 세어 확인하고 거의 동시에 들어와 정원을 넘으면 늦게 들어온 사람의 앱이 스스로 나갑니다. 정원을 정확히 지키는 서버 판정(10.7.6의 3번)은 만들지 않고 ROM-09는 제외입니다.
16. **친구에게만 보이는 데이터** 마이홈과 친구 창의 지금 있는 방 코드는 친구로 등록한 사람에게만 보입니다(HOM-10, FRD-03). 규칙은 `friendsRead` 템플릿으로 친구에게만 읽기를 엽니다.
17. **방 주인 넘기기(9.3 OUR-01)** 넘기지 않습니다. 규칙은 방을 만들 때 `meta/owner`를 한 번만 쓰고 그 뒤로는 고치지 못하게 합니다. 방을 넘기는 화면과 자동으로 이어받는 처리는 만들지 않습니다.

9.1의 일곱 가지 결정은 이 구조에서 아래 자리에 들어갑니다.

| 9.1 결정 | 이 구조에서 들어가는 자리 |
|---|---|
| 1 함께 쓸 사람 수 | 방 코드 방식. rooms 모듈의 방 만들기와 방 설정(방 주인, 정원 2명부터 10명, 방 보존, 9.3 OUR-01). 모든 방이 남으므로 고정 방 코드 설정은 두지 않음 |
| 2 운영체제 | Windows 먼저. M0에서 Windows platform adapter와 Windows 실제 기기 점검표를 만들고 Mac adapter와 Mac 서명(9번)은 Mac판을 만들 때 |
| 3 2D와 3D | 2D. `CharacterView` canvas2d backend가 친구가 넣은 자세 그림 세 장을 그림(9.3 OUR-03). 3D는 다시 필요해질 때만 M4 |
| 4 집중 시간 기준 | focus 모듈 설정의 기본값 `foregroundUntilIdle20m`. 키보드와 마우스를 나눠 보여 주려면 InputHooks adapter |
| 5 유료 기능 | 구매 없음. 레벨 보상 같은 gate만 두고 채팅도 방 사람 모두가 씀 |
| 6 성장 속도 | growth의 `secondsPerLevel` 3600초와 동물 캐릭터 gate의 `animalUnlockLevel` 30. 두 값 모두 tunable(`mod/<id>/g/tunables`)이라 출시 뒤에도 앱 배포 없이 바꾸고 기간 한정 값도 담음. 뽑기 1회에 필요한 시간은 방 주인이 정하는 방 가챠 설정 `secPerTicket`이라 이 결정에서 빠짐(9.3 OUR-02) |
| 7 그림과 이름 | 친구가 넣는 그림, 코드로 그린 기본 책상과 기본 몸, WebAudio로 만드는 소리. 모듈별 에셋 목록에 출처와 이용 조건을 적고 프로그램 이름과 아이콘은 임시 |

**이 구조가 고른 방식** 아래 표는 플랫폼과 계정 기능 가운데 이 구조가 구현 방식을 정한 곳입니다. 생존 확인 간격(NFR-06)은 위 5번에서 60초 갱신과 150초 기준으로 정했습니다.

| 기능 | 고른 방식 | 이유 |
|---|---|---|
| NFR-12, NFR-24 | Firebase Spark 요금제 | 서버 코드 없이 연결 끊김 처리와 규칙 권한 검사를 쓰고 한도를 넘으면 요금 대신 멈춤(10.7.6) |
| NFR-06 | `seenAt`을 방 사람 모두가 구독하는 멤버 기록에 1분마다 씀 | Realtime Database에는 신호만 받는 서버 코드가 없고 1분 갱신에 합쳐 따로 신호를 보내지 않음(10.7.2) |
| NFR-16 | 그림 파일 이름에 내용 해시 | 캐릭터를 복사하거나 끼워 넣어도 그림이 다른 캐릭터에 연결되지 않음(10.7.1) |
| NFR-18 | 선물하는 사람이 발급한 비밀번호 계정과 설정 코드 | Firebase Authentication이 비밀번호를 맡고 재설치해도 같은 uid(10.7.2) |
| NFR-21 | electron-log의 파일 이름 함수를 날짜별로 바꾸고 시작할 때 7일 지난 파일을 지움 | electron-log 기본 회전은 크기 기준이라 하루 단위 7일 보관에 맞춤(10.11) |
| NFR-03 | 캐릭터와 책상 영역 크기의 투명 창 | 화면 전체를 덮는 창은 영상과 펜 입력을 방해하므로 연출 동안만 엶(9.2 3행, 10.8) |
