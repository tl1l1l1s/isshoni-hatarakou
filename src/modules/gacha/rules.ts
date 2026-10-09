// mod/gacha 규칙 조각 (10.7.2 방별 가챠 데이터). 방 범위는 아이템과 삭제 표시, 사용자 범위는 횟수와 보관함
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => {
  const OWN = t.owner()['.write'] as string;
  const MEMBER = t.roomMember()['.read'] as string;
  const OWNER = t.roomOwner()['.write'] as string;
  const g = (p: string) => `root.child('mod/gacha/r/' + $room + '/${p}')`;
  // 코어 rooms/meta/deletedAt은 이 조각에서 읽지 못한다. 방을 지우기 전에 gacha가 쓰는 tomb/_room으로 대신 본다
  const ROOM_GONE = `${g('tomb/_room')}.exists()`;
  // 3600은 logic.ts의 DEFAULT_SEC_PER_TICKET
  const SPT = `(${g('cfg/secPerTicket')}.exists() ? ${g('cfg/secPerTicket')}.val() : 3600)`;
  const int = (min: number, max: number) => `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= ${min} && newData.val() <= ${max}`;
  const oneOf = (...xs: string[]) => xs.map((x) => `newData.val() === '${x}'`).join(' || ');
  const grows = '(!data.exists() || newData.val() >= data.val())';
  const before = (snap: string) => `(${snap}.exists() ? ${snap}.val() : 0)`;
  const str = (max: number) => ({ '.validate': `newData.isString() && newData.val().length >= 1 && newData.val().length <= ${max}` });
  const hash = { '.validate': 'newData.isString() && newData.val().length === 64' };
  const num = { '.validate': 'newData.isNumber()' };
  const no = { '.validate': false };
  const itemTomb = (mode: string) => `${g("tomb/' + $itemId + '/mode")}.val() === '${mode}'`;
  const item = (f: string) => `${g("items/' + $itemId + '/" + f)}`;
  // 기간 한정 아이템은 서버 시각이 기간 안일 때만 뽑힌다 (GCH-04)
  const IN_PERIOD = `(!${item('from')}.exists() || ${item('from')}.val() <= now) && (!${item('until')}.exists() || now < ${item('until')}.val())`;

  return {
    r: {
      $room: {
        '.read': MEMBER,
        cfg: {
          '.write': OWNER,
          '.validate': "newData.hasChildren(['adders', 'secPerTicket', 'onRemove', 'v'])",
          adders: { '.validate': oneOf('owner', 'members') },
          secPerTicket: { '.validate': int(60, 86400) },
          onRemove: { '.validate': oneOf('keep', 'revoke') },
          v: { '.validate': 'newData.val() === 1' },
          $other: no,
        },
        items: {
          // 방을 지울 때 코어가 목록을 통째로 지운다. 방 전체 삭제 표시가 먼저 있어야 한다
          '.write': `${OWNER} && !newData.exists() && newData.parent().child('tomb/_room').exists()`,
          $itemId: {
            // 주인은 만들고 고치고 지운다. 지울 때는 같은 쓰기 안에 삭제 표시가 있어야 한다.
            // 멤버는 cfg/adders가 members일 때 by가 자기 uid인 항목을 만들기만 한다
            '.write': `(${OWNER} && (newData.exists() || newData.parent().parent().child('tomb/' + $itemId).exists() || newData.parent().parent().child('tomb/_room').exists())) || (${MEMBER} && !data.exists() && newData.exists() && newData.child('by').val() === auth.uid && ${g('cfg/adders')}.val() === 'members' && !${ROOM_GONE})`,
            '.validate': "newData.hasChildren(['name', 'file', 'w', 'by', 'st', 'at', 'v'])",
            // 20은 logic.ts의 ITEM_NAME_MAX
            name: str(20),
            file: hash,
            w: { '.validate': int(1, 100) },
            by: { '.validate': 'newData.isString()' },
            st: { '.validate': oneOf('on', 'off') },
            at: num,
            // 기간 한정 (GCH-04)
            from: num,
            until: num,
            v: { '.validate': 'newData.val() === 1' },
            $other: no,
          },
        },
        tomb: {
          // 주인만 한 번 만들고 고치거나 지우지 못한다
          $itemId: {
            '.write': `${OWNER} && !data.exists() && newData.exists()`,
            '.validate': "newData.hasChildren(['mode', 'at'])",
            mode: { '.validate': oneOf('keep', 'revoke') },
            at: num,
            $other: no,
          },
        },
      },
    },
    u: {
      $uid: {
        '.read': OWN,
        r: {
          $room: {
            // 쓰기는 기록을 만들거나 sec나 spent를 늘릴 때만 받는다. 보관함 항목만 지우는 쓰기는 got/$itemId 규칙이 받는다
            '.write': `${OWN} && newData.exists() && (!data.exists() || newData.child('sec').val() > data.child('sec').val() || newData.child('spent').val() > data.child('spent').val())`,
            '.validate': "newData.hasChildren(['sec', 'spent', 'bonus', 'v'])",
            sec: { '.validate': `newData.isNumber() && ${grows}` },
            bonus: { '.validate': `newData.isNumber() && ${grows}` },
            // 늘 때는 남은 횟수 floor(sec / secPerTicket) + bonus - spent가 0 아래로 내려가지 않고 방이 지워지지 않아야 한다
            spent: {
              '.validate': `newData.isNumber() && newData.val() % 1 === 0 && ${grows} && (newData.val() === ${before('data')} || ((newData.val() - newData.parent().child('bonus').val()) * ${SPT} <= newData.parent().child('sec').val() && !${ROOM_GONE}))`,
            },
            v: { '.validate': 'newData.val() === 1' },
            got: {
              $itemId: {
                // 지우기는 그 아이템이나 방 전체의 삭제 표시가 revoke일 때만
                '.write': `${OWN} && !newData.exists() && (${itemTomb('revoke')} || ${g('tomb/_room/mode')}.val() === 'revoke')`,
                // 처음 만들 때는 방 아이템의 이름과 그림을 그대로 복사하고 그 뒤에는 바꾸지 않는다
                '.validate': `newData.hasChildren(['n', 'name', 'file', 'at']) && (data.exists() ? newData.child('name').val() === data.child('name').val() && newData.child('file').val() === data.child('file').val() : newData.child('name').val() === ${item('name')}.val() && newData.child('file').val() === ${item('file')}.val())`,
                // 늘 때는 아이템이 on이고 기간 안이며 같은 쓰기에서 늘어난 spent보다 많이 늘지 않는다
                // ponytail: 규칙은 자식을 순회하지 못해 항목별로만 본다. 한 번에 두 항목을 1씩 올리거나 뽑기 쓰기 안에서 got을 지우는 고친 앱은 막지 못한다.
                // 막아야 하면 서버 함수(Blaze)로 뽑기를 옮긴다 (10.14의 7번)
                n: {
                  '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1 && ${grows} && (newData.val() === ${before('data')} || (${item('st')}.val() === 'on' && ${IN_PERIOD} && newData.val() - ${before('data')} <= newData.parent().parent().parent().child('spent').val() - ${before("data.parent().parent().parent().child('spent')")}))`,
                },
                name: { '.validate': 'newData.isString()' },
                file: hash,
                at: num,
                $other: no,
              },
            },
            $other: no,
          },
        },
      },
    },
  };
};
