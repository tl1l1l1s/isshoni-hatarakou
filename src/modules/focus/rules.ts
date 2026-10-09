// mod/focus 규칙 조각 (10.7.2). 기기별 기록은 본인만 읽고 쓰며 누적은 줄지 않는다. 지우기도 막는다
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => {
  const own = t.owner();
  return {
    u: {
      $uid: {
        dev: {
          '.read': own['.read'] as string,
          $dev: {
            '.write': `${own['.write'] as string} && newData.exists() && (!data.exists() || newData.child('total').val() >= data.child('total').val())`,
            '.validate': "newData.hasChildren(['v', 'total', 'day', 'today']) && newData.child('total').isNumber()",
          },
        },
      },
    },
  };
};
