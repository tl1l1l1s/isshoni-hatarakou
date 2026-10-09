# isshoni-hatarakou

## 동작 확인

화면이나 모듈을 고쳤으면 완료를 보고하기 전에 `verify-isshoni` 스킬(`.claude/skills/verify-isshoni/SKILL.md`)로 앱을 실제로 켜서 확인한다. 버그 제보를 재현할 때와 어떤 기능이 지금 동작하는지 확인할 때도 이 스킬을 쓴다. 기능별 조작 순서는 `.claude/skills/verify-isshoni/features/`에 있다.

사용자에게 보이는 기능을 더하거나 바꿨으면 같은 작업 안에서 `features/`의 해당 기능 파일을 고치고 바뀐 순서를 한 번 실행해서 확인한다. 지도에 없는 기능이면 `features/README.md`의 형식대로 파일을 새로 만들고 목록에 넣는다.
