// mod/dday 규칙 조각. 카드는 본인만 읽고 쓰며 공개 카드 pub는 친구도 읽는다 (HOM-21, 10.14의 16번)
import type { RuleNode, Templates } from '../../../rules/core.ts';

// 수치는 logic.ts와 같다 (rules.test.ts가 맞춰 본다)
export default (t: Templates): RuleNode => {
  const bool = { '.validate': 'newData.isBoolean()' };
  const card: RuleNode = {
    $id: {
      '.validate': "newData.hasChildren(['name', 'date', 'fromOne', 'color', 'notify', 'pub', 'v'])",
      name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 20' },
      date: { '.validate': 'newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)' },
      color: { '.validate': 'newData.isString() && newData.val().matches(/^#[0-9a-fA-F]{6}$/)' },
      fromOne: bool,
      notify: bool,
      pub: bool,
      v: { '.validate': 'newData.val() === 1' },
      $other: { '.validate': false },
    },
  };
  return {
    u: {
      $uid: {
        cards: { ...t.owner(), ...card },
        pub: { ...t.friendsRead(), ...card },
        $other: { '.validate': false },
      },
    },
  };
};
