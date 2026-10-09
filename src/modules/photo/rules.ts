// mod/photo 규칙 조각 (10.12 COM-15). 방 범위는 촬영 자리, 진행자 설정, 자세, 컷이고 전체 범위는 하루 촬영 한도
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => {
  const MEMBER = t.roomMember()['.write'] as string;
  const OWNER = t.roomOwner()['.write'] as string;
  const slot = (p: string) => `root.child('mod/photo/r/' + $room + '/slots/${p}')`;
  // 진행자: 사람이 있는 가장 작은 번호의 자리 주인 (쓰기 전 상태로 판단)
  let HOST = `${slot('3/uid')}.val() === auth.uid`;
  for (const i of [2, 1, 0]) HOST = `(${slot(`${i}/uid`)}.val() === auth.uid || (!${slot(String(i))}.exists() && ${HOST}))`;
  const HOLDS = `root.child('mod/photo/r/' + $room + '/slots/' + $i + '/uid').val() === auth.uid`;
  const SLOT_KEY = '$i.matches(/^[0-3]$/)';
  // 마지막으로 나가는 사람이 자기 자리와 함께 세션을 지운다
  const NO_SLOTS_AFTER = "!newData.parent().child('slots').exists()";
  // 방 주인은 방을 지울 때 컬렉션을 통째로 지운다 (deleteWithRoom)
  const OWNER_WIPE = `${OWNER} && !newData.exists()`;
  // 900000은 logic.ts의 SLOT_STALE_MS(15분)
  const STALE = "now - data.child('at').val() > 900000";
  const int = (min: number, max: number) => ({ '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= ${min} && newData.val() <= ${max}` });
  const oneOf = (...xs: string[]) => ({ '.validate': xs.map((x) => `newData.val() === '${x}'`).join(' || ') });
  const num = { '.validate': 'newData.isNumber()' };
  const no = { '.validate': false };
  const setup = {
    o: oneOf('wide', 'tall'),
    n: { '.validate': 'newData.val() === 1 || newData.val() === 2 || newData.val() === 4' },
    bg: { '.validate': 'newData.isString() && newData.val().matches(/^#[0-9a-f]{6}$/)' },
    fl: oneOf('none', 'soft', 'ps1', 'mono', 'dawn', 'vintage'),
    fr: oneOf('none', 'heart', 'star', 'film', 'own'),
    own: { '.validate': "newData.isString() && (newData.val() === '' || newData.val().length === 64)" },
    t0: num,
  };
  const SETUP_KEYS = "['o', 'n', 'bg', 'fl', 'fr', 'own', 't0']";

  return {
    r: {
      $room: {
        '.read': t.roomMember()['.read'] as string,
        slots: {
          '.write': OWNER_WIPE,
          // 빈자리, 내 자리, 15분 지난 자리만 내 uid로 잡거나 비운다
          $i: {
            '.write': `${MEMBER} && ${SLOT_KEY} && (!data.exists() || data.child('uid').val() === auth.uid || ${STALE}) && (!newData.exists() || newData.child('uid').val() === auth.uid)`,
            '.validate': "newData.hasChildren(['uid', 'at'])",
            uid: { '.validate': 'newData.isString()' },
            // 앞날 시각으로 자리를 오래 차지하지 못하게 한다. 60초는 PC 시계 추정 오차를 봐준 것이다
            at: { '.validate': 'newData.isNumber() && newData.val() <= now + 60000' },
            $other: no,
          },
        },
        // 자세는 그 자리 주인만 쓴다. 자리가 비면 누구나 지운다
        p: {
          '.write': OWNER_WIPE,
          $i: {
            '.write': `${MEMBER} && ${SLOT_KEY} && (${HOLDS} || (!newData.exists() && !newData.parent().parent().child('slots/' + $i).exists()))`,
            '.validate': "newData.hasChildren(['x', 'f', 'z', 'j'])",
            x: int(-10, 10),
            f: int(0, 1),
            z: int(0, 2),
            j: num,
            $other: no,
          },
        },
        cfg: {
          '.write': `(${MEMBER} && (${HOST} || (!newData.exists() && ${NO_SLOTS_AFTER}))) || (${OWNER_WIPE})`,
          '.validate': `newData.hasChildren(${SETUP_KEYS})`,
          ...setup,
          $other: no,
        },
        // 컷은 진행자가 한 번만 만든다. 새 촬영을 시작하거나 세션을 지울 때 통째로 지운다
        shots: {
          '.write': `!newData.exists() && ((${MEMBER} && (${HOST} || ${NO_SLOTS_AFTER})) || ${OWNER})`,
          $i: {
            '.write': `${MEMBER} && ${HOST} && ${SLOT_KEY} && !data.exists() && newData.exists()`,
            '.validate': `newData.hasChildren(${SETUP_KEYS})`,
            ...setup,
            ppl: {
              $k: {
                '.validate': "$k.matches(/^[0-3]$/) && newData.hasChildren(['l', 'x', 'f', 'z', 'y'])",
                l: { '.validate': "newData.isString() && (newData.val() === '' || newData.val().length === 64)" },
                x: int(-10, 10),
                f: int(0, 1),
                z: int(0, 2),
                y: int(0, 20),
                $other: no,
              },
            },
            $other: no,
          },
        },
      },
    },
    // 400은 logic.ts의 DAILY_CAP_MAX. 앱은 tunable photoDailyCap까지만 센다
    g: { quota: t.dailyQuota('global', 400) },
  };
};
