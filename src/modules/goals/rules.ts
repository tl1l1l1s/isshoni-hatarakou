// mod/goals 규칙 조각 (GRW-06). 본인만 읽고 쓰며 하루 기록의 sec는 줄지 않는다
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => {
  const int = (max: number) => ({ '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= ${max}` });
  const v1 = { '.validate': 'newData.val() === 1' };
  const no = { '.validate': false };
  // 12시간은 logic.ts의 GOAL_HOURS 끝값
  const GOAL_MAX = 12 * 3600;
  return {
    u: {
      $uid: {
        ...t.owner(),
        cfg: {
          '.validate': "newData.hasChildren(['goal', 'since', 'v'])",
          goal: int(GOAL_MAX),
          since: { '.validate': 'newData.isString() && newData.val().length <= 10' },
          v: v1,
          $other: no,
        },
        days: {
          $day: {
            '.validate': "newData.hasChildren(['sec', 'goal', 'v']) && $day.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)",
            sec: { '.validate': 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && (!data.exists() || newData.val() >= data.val())' },
            goal: int(GOAL_MAX),
            v: v1,
            $other: no,
          },
        },
        $other: no,
      },
    },
  };
};
