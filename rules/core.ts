// 코어 규칙과 모듈 규칙 템플릿 (10.7.2). rules/build.ts가 모듈 조각과 합쳐 database.rules.json을 만든다.
// 템플릿은 경로 변수 이름을 정해 둔다. 사용자 범위는 mod/<id>/u/$uid, 방 범위는 mod/<id>/r/$room 아래에 둔다.
import { DAY_BOUNDARY_MS, FILE_MAX_BASE64_BYTES, KST_OFFSET_MS, NAME_MAX_LENGTH, PRESENCE_MODULE_MAX_BYTES, PRESENCE_STALE_MS } from '../src/shared/constants.ts';
import { ROOM_EVENT_MAX_CHARS, ROOM_EVENT_TTL_MS, ROOM_EVENT_TYPE_MAX } from '../src/shared/constants.ts';

export interface RuleNode { [key: string]: RuleNode | string | boolean | string[] }

const SIGNED_IN = 'auth != null';
/** 계정 발급 스크립트(관리 SDK)만 만드는 friendCode가 있는 계정. 콘솔에서 가입을 막지 못했을 때 스스로 만든 계정을 막는다 (ADR 0020) */
export const ISSUED = "root.child('users/' + auth.uid + '/public/friendCode').exists()";
const AUTH = `${SIGNED_IN} && ${ISSUED}`;
const OWN = `${AUTH} && auth.uid === $uid`;
const ROOM = (sub: string) => `root.child('rooms/' + $room + '/${sub}')`;
// roster, 방 meta, 친구 목록은 발급 계정만 만드므로 IN_ROSTER, ROOM_OWNER, IS_FRIEND는 로그인만 본다
export const IN_ROSTER = `${SIGNED_IN} && root.child('rooms/' + $room + '/roster/' + auth.uid).exists()`;
export const NOT_DELETED = `!${ROOM('meta/deletedAt')}.exists()`;
/** 방 주인. 지운 방에서는 지우기만 한다 (남은 기록 정리) */
export const ROOM_OWNER = `${SIGNED_IN} && ${ROOM('meta/owner')}.val() === auth.uid && (${NOT_DELETED} || !newData.exists())`;
/** 다른 모듈 경로를 읽는 유일한 예외 (10.14의 16번) */
export const IS_FRIEND = `${SIGNED_IN} && root.child('mod/friends/u/' + $uid + '/list/' + auth.uid).exists()`;

/** 앱이 켜져 있는 동안 코어가 true로 두는 계정 접속 기록 (keyedWrite의 PC 실행 중 표시) */
export const PC_ON = `root.child('users/' + $uid + '/presence/online').val() === true`;

/** 조각 검사(build.ts)가 허용하는 root 참조. 템플릿이 만든 식은 자기 namespace 밖을 읽어도 된다.
 *  앞에서부터 지우므로 다른 식을 품은 식을 앞에 둔다 */
export const TEMPLATE_REFS = [IN_ROSTER, ROOM_OWNER, IS_FRIEND, PC_ON, NOT_DELETED, ISSUED];

/** 규칙 안의 오늘 날 번호. src/shared/time.ts dayIndex와 같은 계산이다 (규칙에는 내림 함수가 없어 나머지를 뺀다) */
const SHIFTED = `(now + ${KST_OFFSET_MS - DAY_BOUNDARY_MS})`;
const TODAY = `((${SHIFTED} - ${SHIFTED} % 86400000) / 86400000)`;

const OWNER_DELETES = `${OWN} && !newData.exists()`;

// 조각은 템플릿 결과를 펼치거나 노드 자리에 그대로 둔다. 템플릿의 .write는 아래 노드로 이어지므로
// 아래에 둔 .write는 위에서 준 권한을 거두지 못한다 (appendOnly, inbox는 권한을 주는 위치에 둔다).
export const templates = {
  /** 본인만 읽고 씀 */
  owner: (): RuleNode => ({ '.read': OWN, '.write': OWN }),
  /** 본인이 쓰고 로그인한 사용자가 읽음 */
  ownerWritePublicRead: (): RuleNode => ({ '.read': AUTH, '.write': OWN }),
  /** roster에 있는 사람만 읽고 씀. 지운 방에서는 지우기만 함 */
  roomMember: (): RuleNode => ({ '.read': IN_ROSTER, '.write': `${IN_ROSTER} && (${NOT_DELETED} || !newData.exists())` }),
  /** 방 주인만 쓰고 방 멤버가 읽음. 지운 방에서는 지우기만 함 */
  roomOwner: (): RuleNode => ({ '.read': IN_ROSTER, '.write': ROOM_OWNER }),
  /** 본인이 쓰고 본인과 친구가 읽음 */
  friendsRead: (): RuleNode => ({ '.read': `(${OWN}) || (${IS_FRIEND})`, '.write': OWN }),
  /** 항목 모음 노드에 둔다. 항목 $id는 base 템플릿의 쓰기 조건으로 만들기만 하고 고치거나 지우지 못하며 모음은 base의 읽기를 따른다.
   *  item은 항목에 더할 규칙(.validate, 필드).
   *  예: { r: { $room: { msgs: t.appendOnly(t.roomMember(), { '.validate': "newData.hasChildren(['text'])" }) } } } */
  appendOnly: (base: RuleNode, item: RuleNode = {}): RuleNode => ({
    ...(base['.read'] === undefined ? {} : { '.read': base['.read'] }),
    $id: { ...item, '.write': `(${base['.write'] as string}) && !data.exists() && newData.exists()` },
  }),
  /** 받은 기록 mod/<id>/u/$uid/in (10.7.2). in 노드에 둔다: { u: { $uid: { in: t.inbox() } } }
   *  보낸 사람은 자기 uid 칸 in/$sender 아래를 만들고 고치고 지우며(신청 취소) 자기 칸을 읽는다.
   *  받는 사람은 모두 읽고 칸이나 항목을 지우되 고치지 못한다.
   *  sender는 in/$sender에 더할 규칙이다. 한 사람이 여러 항목을 두면(방명록) 항목 변수를 $id로 적어야 받는 사람이 하나씩 지운다.
   *  readers 'friends'는 친구도, 'auth'는 로그인한 사용자도 in 전체를 읽는다 (방문자에게 보이는 방명록).
   *  예: { u: { $uid: { in: t.inbox({ $id: { '.validate': "newData.child('text').isString()" } }, 'friends') } } } */
  inbox: (sender: RuleNode = {}, readers?: 'friends' | 'auth'): RuleNode => {
    const { $id, ...rest } = sender;
    return {
      '.read': readers === 'friends' ? `(${OWN}) || (${IS_FRIEND})` : readers === 'auth' ? AUTH : OWN,
      '.write': OWNER_DELETES,
      $sender: {
        ...rest,
        '.read': `${AUTH} && auth.uid === $sender`,
        '.write': `${AUTH} && (auth.uid === $sender || (auth.uid === $uid && !newData.exists()))`,
        ...($id === undefined ? {} : { $id: { ...($id as RuleNode), '.write': OWNER_DELETES } }),
      },
    };
  },
  /** 날마다 limit번까지 1씩 올리는 기록 { d: 날 번호, n: 오늘 횟수 } (10.7.2 dailyQuota). 날이 바뀌면 1부터 다시 센다.
   *  scope는 읽고 쓰는 사람이다. user는 본인($uid 아래), room은 방 멤버($room 아래), global은 발급받은 계정으로 로그인한 사용자.
   *  두 사람 사이 한도는 user 템플릿을 상대 uid 키 아래에 둔다. 앱은 transaction에 @shared/time의 nextQuota(cur, dayIndex(serverNow), limit)를 넘긴다.
   *  예: { g: { quota: t.dailyQuota('global', 400) } } */
  dailyQuota: (scope: 'user' | 'room' | 'global', limit: number): RuleNode => {
    const who = scope === 'user' ? OWN : scope === 'room' ? IN_ROSTER : AUTH;
    const writer = scope === 'room' ? `${who} && ${NOT_DELETED}` : who;
    const d = "newData.child('d').val()";
    const n = "newData.child('n').val()";
    return {
      '.read': who,
      '.write': `${writer} && ${d} === ${TODAY} && ${n} <= ${limit} && ((data.child('d').val() === ${d} && ${n} === data.child('n').val() + 1) || (data.child('d').val() !== ${d} && ${n} === 1))`,
      '.validate': "newData.hasChildren(['d', 'n'])",
      d: { '.validate': 'newData.isNumber()' },
      n: { '.validate': 'newData.isNumber()' },
      $other: { '.validate': false },
    };
  },
  /** 로그인하지 않은 쓰기를 받는 칸 (FOC-09 폰 연동). $uid 아래에 둔다.
   *  폰은 키를 경로에 넣어 이 칸 아래 $key에 쓴다. $key가 keyPath에 본인이 저장한 키 문자열과 같고 그 사람의 앱이 켜져 있을 때(users/$uid/presence/online)만 받는다.
   *  키가 경로에 있으므로 키를 모르면 이미 있는 신호의 하위 칸도 쓰지 못한다. 폰은 지우지 못하고 본인은 언제나 읽고 쓴다. 키를 바꾸면 앱이 예전 키 칸을 지운다.
   *  item은 $key에 더할 규칙(.validate, 필드)이고 keyPath는 자기 namespace 안 경로를 만드는 규칙 식이다.
   *  예: { u: { $uid: { key: t.owner(), sig: t.keyedWrite("'mod/phone/u/' + $uid + '/key'") } } } */
  keyedWrite: (keyPath: string, item: RuleNode = {}): RuleNode => ({
    '.read': OWN,
    '.write': OWN,
    $key: { ...item, '.write': `${PC_ON} && newData.exists() && $key === root.child(${keyPath}).val()` },
  }),
};
export type Templates = typeof templates;

const MIN_PROTO = "root.child('config/minProtocol')";
const SHORT_KEY = (k: string) => `${k}.length <= 32`;
// 글자 수는 바이트 수보다 크지 않으므로 바이트 한도를 글자 수에 걸면 넉넉한 상한이 된다
const LEAF = `(newData.isBoolean() || newData.isNumber() || (newData.isString() && newData.val().length <= ${PRESENCE_MODULE_MAX_BYTES}))`;
const STALE = `now - data.child('seenAt').val() > ${PRESENCE_STALE_MS}`;

export function coreRules(): RuleNode {
  return {
    users: {
      $uid: {
        // friendCode는 계정 발급 스크립트(관리 SDK)만 쓴다
        public: {
          '.read': AUTH,
          '.write': OWN,
          friendCode: { '.validate': 'newData.val() === data.val()' },
          name: { '.validate': `newData.isString() && newData.val().length <= ${NAME_MAX_LENGTH}` },
        },
        // m(지금 있는 방 코드 등)은 본인과 친구만, online과 lastSeen은 로그인한 사용자 누구나 읽는다 (10.14의 16번)
        presence: {
          '.read': `(${OWN}) || (${IS_FRIEND})`,
          '.write': OWN,
          online: { '.read': AUTH, '.validate': 'newData.isBoolean()' },
          lastSeen: { '.read': AUTH, '.validate': 'newData.isNumber()' },
          m: {},
          $other: { '.validate': false },
        },
        private: { '.read': OWN, '.write': OWN },
      },
    },
    // 친구 코드 → uid. 스크립트만 만든다
    codes: { $code: { '.read': AUTH } },
    rooms: {
      $room: {
        meta: {
          '.read': AUTH,
          // 없을 때만 만들고 owner는 로그인 uid. meta는 지우지 않으므로 지운 방 코드로 다시 만들 수 없다
          '.write': `${AUTH} && !data.exists() && newData.child('owner').val() === auth.uid && !newData.child('deletedAt').exists()`,
          '.validate': "newData.hasChildren(['kind', 'owner', 'createdAt'])",
          kind: { '.validate': "newData.val() === 'work'" },
          owner: { '.validate': 'newData.isString()' },
          createdAt: { '.validate': 'newData.isNumber()' },
          // 주인만 한 번 쓴다
          deletedAt: {
            '.write': `${AUTH} && !data.exists() && newData.isNumber() && data.parent().child('owner').val() === auth.uid`,
            '.validate': 'newData.isNumber()',
          },
          $other: { '.validate': false },
        },
        roster: {
          '.read': `${AUTH} && data.child(auth.uid).exists()`,
          $uid: {
            '.read': OWN,
            '.write': `${OWN} && !data.exists() && ${ROOM('meta')}.exists() && ${NOT_DELETED}`,
            '.validate': 'newData.isNumber()',
          },
        },
        members: {
          '.read': IN_ROSTER,
          // 주인이 방을 지울 때 삭제 표시와 함께 멤버 기록을 모두 지운다
          '.write': `${AUTH} && !newData.exists() && ${ROOM('meta/owner')}.val() === auth.uid && newData.parent().child('meta/deletedAt').exists()`,
          $key: {
            // 본인 기록은 언제나 지우고 roster에 있고 지우지 않은 방에서 최소 프로토콜 이상으로만 쓴다.
            // 남의 기록은 seenAt이 150초 넘게 지난 것만 방 멤버가 지운다
            '.write': `${AUTH} && (($key.beginsWith(auth.uid + '_') && (!newData.exists() || (${IN_ROSTER} && ${NOT_DELETED} && (!${MIN_PROTO}.exists() || newData.child('proto').val() >= ${MIN_PROTO}.val())))) || (!newData.exists() && ${IN_ROSTER} && (!data.exists() || ${STALE})))`,
            '.validate': "newData.hasChildren(['uid', 'name', 'state', 'proto', 'joinedAt', 'seenAt']) && newData.child('uid').val() === auth.uid",
            uid: { '.validate': 'newData.isString()' },
            name: { '.validate': `newData.isString() && newData.val().length <= ${NAME_MAX_LENGTH}` },
            look: { '.validate': 'newData.isString() && newData.val().matches(/^[0-9a-f]{64}$/)' },
            state: { '.validate': 'newData.isString() && newData.val().length <= 16' },
            proto: { '.validate': 'newData.isNumber()' },
            mods: { $mid: { '.validate': `${SHORT_KEY('$mid')} && newData.isNumber()` } },
            joinedAt: { '.validate': 'newData.isNumber()' },
            seenAt: { '.validate': 'newData.isNumber()' },
            // 모듈 presence 필드 (10.5). 값은 짧은 글, 숫자, 참거짓이거나 그런 값을 담은 한 단계 객체다.
            // ponytail: 규칙은 자식 수를 세지 못해 필드마다 크기만 막는다. 합계는 앱(RoomSession.setMine)이 모듈마다 128바이트로 막는다
            m: {
              $mid: {
                '.validate': `${SHORT_KEY('$mid')} && newData.hasChildren()`,
                $f: { '.validate': `${SHORT_KEY('$f')} && (${LEAF} || newData.hasChildren())`, $g: { '.validate': `${SHORT_KEY('$g')} && ${LEAF}` } },
              },
            },
            $other: { '.validate': false },
          },
        },
        // 잠깐 쓰는 방 이벤트. p는 payload JSON 문자열이라 길이로 크기를 막는다
        ev: {
          '.read': IN_ROSTER,
          // 주인이 방을 지울 때 멤버 기록과 함께 지운다
          '.write': `${AUTH} && !newData.exists() && ${ROOM('meta/owner')}.val() === auth.uid && newData.parent().child('meta/deletedAt').exists()`,
          $id: {
            // roster에 있는 사람이 지우지 않은 방에 만들기만 한다. 보낸 사람은 언제나, 방 멤버는 ${ROOM_EVENT_TTL_MS / 1000}초 지난 것을 지운다
            '.write': `${AUTH} && ((!data.exists() && ${IN_ROSTER} && ${NOT_DELETED}) || (!newData.exists() && (data.child('uid').val() === auth.uid || (${IN_ROSTER} && now - data.child('at').val() > ${ROOM_EVENT_TTL_MS}))))`,
            '.validate': "newData.hasChildren(['t', 'uid', 'at', 'p'])",
            t: { '.validate': `newData.isString() && newData.val().length > 0 && newData.val().length <= ${ROOM_EVENT_TYPE_MAX}` },
            uid: { '.validate': 'newData.val() === auth.uid' },
            at: { '.validate': 'newData.val() === now' },
            p: { '.validate': `newData.isString() && newData.val().length <= ${ROOM_EVENT_MAX_CHARS}` },
            $other: { '.validate': false },
          },
        },
      },
    },
    config: { '.read': AUTH },
    // base64로 64KB 이하, 한 번 쓰면 같은 값으로만 다시 쓴다 (내용 해시가 키라 같은 파일은 같은 값)
    files: {
      $hash: {
        '.read': AUTH,
        '.write': `${AUTH} && newData.exists() && (!data.exists() || data.val() === newData.val())`,
        '.validate': `newData.isString() && newData.val().length <= ${FILE_MAX_BASE64_BYTES} && $hash.length === 64 && $hash.matches(/^[0-9a-f]+$/)`,
      },
    },
    catalog: { '.read': AUTH },
    catalogVersion: { '.read': AUTH },
  };
}
