// mod/chat 규칙 조각 (COM-01, ROM-02). 메시지는 방 멤버가 만들기만 하고 채팅 설정은 방 주인만 쓴다
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => ({
  r: {
    $room: {
      msgs: {
        ...t.appendOnly(t.roomMember(), {
          // 키는 서버 시각 15자리_uid라 남의 키를 미리 차지하지 못한다. 채팅이 꺼진 방에는 쓰지 못한다.
          // 키 시각은 서버 시각보다 1분 넘게 앞서지 못한다 (먼 미래 키가 새 메시지를 가리지 않게). 지금 시각은 13자리라 앞에 00을 붙여 글자로 비교한다
          '.validate': "newData.hasChildren(['uid', 'name', 'text', 'at', 'v']) && $id.matches(/^[0-9]{15}_/) && $id < '00' + (now + 60000) && $id.endsWith('_' + auth.uid) && root.child('mod/chat/r/' + $room + '/cfg/on').val() !== false",
          uid: { '.validate': 'newData.val() === auth.uid' },
          // 20은 @shared/constants의 NAME_MAX_LENGTH, 300은 logic.ts의 MSG_MAX (rules.test.ts가 맞춰 본다)
          name: { '.validate': 'newData.isString() && newData.val().length <= 20' },
          text: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 300' },
          at: { '.validate': 'newData.val() === now' },
          v: { '.validate': 'newData.val() === 1' },
          $other: { '.validate': false },
        }),
        // 방을 지울 때 주인 앱이 통째로 지운다 (deleteWithRoom)
        '.write': `${t.roomOwner()['.write'] as string} && !newData.exists()`,
      },
      cfg: {
        ...t.roomOwner(),
        '.validate': "newData.hasChildren(['on', 'v'])",
        on: { '.validate': 'newData.isBoolean()' },
        v: { '.validate': 'newData.val() === 1' },
        $other: { '.validate': false },
      },
    },
  },
});
