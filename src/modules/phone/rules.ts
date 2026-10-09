// mod/phone 규칙 조각 (FOC-09). 연결 키는 본인만 읽고 쓰고 신호는 로그인하지 않은 폰이 sig/{키}에 쓴다 (keyedWrite)
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => ({
  u: {
    $uid: {
      // 32는 logic.ts newKey의 길이
      key: { ...t.owner(), '.validate': 'newData.isString() && newData.val().length === 32' },
      sig: t.keyedWrite("'mod/phone/u/' + $uid + '/key'", {
        // 폰은 {".sv": "timestamp"}를 보내고 4시간 상한은 이 서버 시각으로 잰다. 하위 칸만 고치는 쓰기도 at을 함께 써야 한다
        '.validate': "newData.hasChildren(['open', 'at']) && newData.child('at').val() === now",
        open: { '.validate': 'newData.isBoolean()' },
        // 36은 logic.ts의 APP_NAME_MAX
        app: { '.validate': 'newData.isString() && newData.val().length <= 36' },
        at: { '.validate': 'newData.val() === now' },
        $other: { '.validate': false },
      }),
    },
  },
});
