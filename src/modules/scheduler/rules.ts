// mod/scheduler 규칙 조각. 일정 ev는 본인만 읽고 쓰며 공개 일정 pub는 친구도 읽는다 (HOM-16, 10.14의 16번)
import type { RuleNode, Templates } from '../../../rules/core.ts';

// 수치는 logic.ts와 같다 (rules.test.ts가 맞춰 본다)
export default (t: Templates): RuleNode => {
  const plan: RuleNode = {
    $id: {
      // 키는 일정 날짜로 시작한다 (키 순서가 날짜 순서)
      '.validate': "newData.hasChildren(['date', 'title', 'memo', 'pub', 'v'])",
      date: { '.validate': "newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && $id.beginsWith(newData.val() + '_')" },
      title: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 40' },
      memo: { '.validate': 'newData.isString() && newData.val().length <= 200' },
      pub: { '.validate': 'newData.isBoolean()' },
      v: { '.validate': 'newData.val() === 1' },
      $other: { '.validate': false },
    },
  };
  return {
    u: {
      $uid: {
        ev: { ...t.owner(), ...plan },
        pub: { ...t.friendsRead(), ...plan },
        $other: { '.validate': false },
      },
    },
  };
};
