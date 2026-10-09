// mod/account 규칙 조각. 프로필 사진은 본인이 쓰고 본인과 친구가 읽는다 (SCR-03, 10.14의 16번)
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => ({
  u: {
    $uid: {
      // 사진 파일(files/{hash})의 해시
      photo: { ...t.friendsRead(), '.validate': 'newData.isString() && newData.val().matches(/^[0-9a-f]{64}$/)' },
      $other: { '.validate': false },
    },
  },
});
