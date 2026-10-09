// mod/wardrobe 규칙 조각. 캐릭터 슬롯, 이전 모습, 동물 해금 기록은 본인만 읽고 쓴다 (AVT-15, ACC-08, GRW-03)
import type { RuleNode, Templates } from '../../../rules/core.ts';

const V = "newData.child('v').isNumber() && newData.child('v').val() <= 1";

export default (t: Templates): RuleNode => ({
  u: {
    $uid: {
      ...t.owner(),
      chars: { $slot: { '.validate': `$slot.matches(/^[0-2]$/) && newData.hasChildren(['appearance', 'mtime', 'v']) && newData.child('mtime').isNumber() && ${V}` } },
      trash: { $key: { '.validate': `newData.hasChildren(['appearance', 'mtime', 'slot', 'at', 'v']) && newData.child('at').isNumber() && ${V}` } },
      unlock: { '.validate': `newData.hasChildren(['at', 'v']) && newData.child('at').isNumber() && ${V}` },
      $other: { '.validate': false },
    },
  },
});
