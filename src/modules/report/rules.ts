// mod/report 규칙 조각 (OPS-03). 본인이 만들기만 하고 고치거나 지우지 못한다. 선물하는 사람은 관리 SDK로 읽고 지운다
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => ({
  u: {
    $uid: {
      r: t.appendOnly(t.owner(), {
        '.validate': "newData.hasChildren(['text', 'ver', 'at', 'v'])",
        // 1000은 ui/ReportTab.tsx의 TEXT_MAX
        text: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 1000' },
        ver: { '.validate': 'newData.isString() && newData.val().length <= 20' },
        at: { '.validate': 'newData.val() === now' },
        v: { '.validate': 'newData.val() === 1' },
        $other: { '.validate': false },
      }),
    },
  },
});
