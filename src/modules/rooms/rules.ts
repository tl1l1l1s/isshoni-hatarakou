// mod/rooms 규칙 조각. 방 설정 cfg는 방 주인만 쓰고 멤버가 읽는다 (OUR-01)
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => ({
  r: {
    $room: {
      cfg: {
        ...t.roomOwner(),
        '.validate': "newData.hasChildren(['cap', 'v'])",
        // 2와 10은 @shared/constants의 ROOM_CAP_MIN, ROOM_CAP_MAX (rules.test.ts가 맞춰 본다)
        cap: { '.validate': 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 2 && newData.val() <= 10' },
      },
    },
  },
});
