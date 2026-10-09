# 레벨과 레벨 보상

이름표에 레벨과 경험치 바가 보이고 레벨 보상 창에 레벨로 여는 보상과 남은 레벨이 보인다. 999레벨분을 넘기면 회차가 넘어가 Lv. 대신 ☆가 붙고 레벨이 1부터 다시 보인다. 레벨이 높아질수록 이름표의 레벨 표시 모양이 단계별로 바뀐다.

## Sub-features

- `grw-rewards`는 레벨 보상 창에 보상 표가 보이고 보상이 열리면 알림이 뜨는 것이다 (GRW-02).
- `grw-round`는 999레벨분을 넘기면 이름표가 ☆N으로 바뀌고 회차 알림이 뜨는 것이다 (GRW-04).
- `grw-tier`는 평생 레벨에 따라 이름표 레벨 표시에 테두리, 반전, 빛이 붙는 것이다 (GRW-07).
- `grw-still`은 티어 5와 6의 광택이 잠들었거나 자리를 비웠거나 화면을 숨긴 동안 멈추는 것이다 (GRW-07).

## How to get to it (user POV)

- 실행 화면 ▼ 메뉴에서 `레벨 보상`을 누른다.
- 실행 화면 내 캐릭터 이름표 오른쪽의 레벨 표시를 본다. 마우스를 올리면 다음 레벨까지 남은 비율과 회차가 보인다.

## Driving it with drive.ts

Preconditions:

- 새 `verify()` 세션에서 시작하기를 눌러 실행 화면에 있다.
- 수백 시간은 화면에서 만들 수 없다. 다른 기기 누적 기록을 메모리 서버에 쓰고 다른 기기가 가져갔다 돌아오는 순서로 다시 읽게 하는 함수를 둔다. 보고에 이 준비를 적는다.
  ```ts
  async function otherDevice(stage: Page, hours: number) {
    await stage.evaluate(async (h) => {
      type Doc = { set(k: string, v: unknown): Promise<void> };
      const core = (window as unknown as { core: { deps: { uid: string; server: { docs(ns: unknown): Doc; userPrivate: { set(u: string, p: string, v: unknown): Promise<void> } } } } }).core;
      const { uid, server } = core.deps;
      await server.docs({ scope: 'user', module: 'focus', uid, path: ['dev'] }).set('other-pc', { v: 1, total: Math.round(h * 3600), day: '', today: 0 });
      await server.userPrivate.set(uid, 'activeDevice', { id: 'other-pc', at: Date.now() });
    }, hours);
    await stage.getByRole('button', { name: '여기서 계속 쓰기' }).click();
  }
  ```

- **보상 창 열기.** `const rw = await menu(s, '레벨 보상', '레벨 보상')`을 실행한다. `heading "Lv.1"`과 `row "Lv.30 동물 캐릭터 만들기 29레벨 남음"`이 보인다. 다른 묶음이 gate를 더했으면 행이 더 있다.
- **보상 열기.** `await otherDevice(s.stage, 120.5)`를 실행한다. 이름표에 `Lv.121`이 보이고 `[data-tier="2"]` 표시(테두리)가 생긴다. 몇 초 안에 실행 화면에 `새 보상이 열렸어요. 동물 캐릭터 만들기` 알림이 뜨고 보상 창 행이 `Lv.30 동물 캐릭터 만들기 열림`으로 바뀐다.
- **회차 넘기기.** `await otherDevice(s.stage, 1003.5)`를 실행한다. 이름표가 `☆5`가 되고 `[data-tier="6"]` 표시(반전과 빛)가 생기며 `2회차가 시작됐어요` 알림이 뜬다. 보상 창 제목은 `☆5 2회차`이고 열린 보상은 그대로 `열림`이다.
- **광택 멈춤 (grw-still).** 회차 넘기기 뒤 새 세션 캐릭터는 잠들어 있어서 `[data-tier="6"]`가 `data-still="true"`이고 그 안 첫 `span`의 `getComputedStyle(...).animationName`이 `none`이다. 메인에서 `fakePlatform`을 `{ app: 'win:clipstudiopaint.exe', idle: 0 }`으로 바꾸면 10초 안에 `data-still="false"`가 되고 animationName이 `none`이 아니다.
- **증거.** 처음 보상 창, 보상이 열린 보상 창, 티어 2와 티어 6 이름표가 보이는 실행 화면을 `s.shot`으로 남긴다.

## Gotchas

- `Lv.121` 같은 글은 레벨 오름 알림에도 들어 있다. 이름표는 `getByText('Lv.121', { exact: true })`로 찾는다.
- gate는 5초마다 다시 확인하므로 보상 열림 알림과 보상 창 행은 몇 초 늦게 바뀐다. 10초 정도 기다린다.
- 티어 모양은 CSS라서 ARIA 스냅샷에 나오지 않는다. `data-tier` 속성과 화면으로 확인한다.
- 광택은 5초에 한 번 지나가서 화면 사진으로는 멈췄는지 알기 어렵다. `data-still`과 animationName으로 확인한다.
