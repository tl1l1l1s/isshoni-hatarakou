// mod/friends 규칙 조각 (FRD-02, FRD-04). 친구 목록은 본인만 읽고 쓰고 받은 기록은 inbox 템플릿을 쓴다.
// rules/core.ts의 IS_FRIEND가 mod/friends/u/$uid/list/auth.uid를 읽으므로 list 경로와 키(친구 uid)는 바꾸지 않는다
import type { RuleNode, Templates } from '../../../rules/core.ts';

// 받은 사람은 칸 전체뿐 아니라 항목 하나도 지운다 (초대만 지우기)
const DROP = 'auth != null && auth.uid === $uid && !newData.exists()';
const NO: RuleNode = { '.validate': false };
const AT: RuleNode = { '.validate': 'newData.isNumber()' };
// 20은 @shared/constants의 NAME_MAX_LENGTH, 방 코드 식은 CODE_ALPHABET과 ROOM_CODE_LENGTH (rules.test.ts가 맞춰 본다)
const NAME: RuleNode = { '.validate': 'newData.isString() && newData.val().length <= 20' };
const ROOM: RuleNode = { '.validate': 'newData.isString() && newData.val().matches(/^[2-9A-HJ-NP-Z]{6}$/)' };

export default (t: Templates): RuleNode => ({
  u: {
    $uid: {
      list: {
        ...t.owner(),
        $friend: {
          '.validate': "newData.hasChildren(['since', 'v']) && $friend !== $uid",
          since: AT,
          v: { '.validate': 'newData.val() === 1' },
          $other: NO,
        },
      },
      in: t.inbox({
        req: { '.write': DROP, '.validate': "newData.hasChildren(['name', 'at'])", name: NAME, at: AT, $other: NO },
        ok: { '.write': DROP, '.validate': "newData.hasChildren(['at'])", at: AT, $other: NO },
        // 초대는 받는 사람 목록에 든 사람만 보낸다
        inv: {
          '.write': DROP,
          '.validate': "newData.hasChildren(['room', 'name', 'at']) && root.child('mod/friends/u/' + $uid + '/list/' + $sender).exists()",
          room: ROOM,
          name: NAME,
          at: AT,
          $other: NO,
        },
        $other: NO,
      }),
    },
  },
});
