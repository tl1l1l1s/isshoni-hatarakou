// mod/home 규칙 조각. 마이홈 문서는 본인이 쓰고 본인과 친구가 읽는다 (10.14의 16번).
// 방명록 글, 말랑이 선물, 박수는 친구가 주인의 받은 기록 in/{보낸 사람}에 쓰고 친구도 in을 읽는다 (HOM-09, HOM-14, HOM-15).
// 북마크 책장은 주인만 읽고 공개한 책을 담은 shelfPub는 친구도 읽는다 (HOM-11)
import type { RuleNode, Templates } from '../../../rules/core.ts';

// 수치는 logic.ts와 같다 (rules.test.ts가 맞춰 본다)
export default (t: Templates): RuleNode => {
  const FRIEND = t.friendsRead()['.read'] as string;
  const OWNER_DELETES = t.inbox()['.write'] as string;
  const str = (min: number, max: number) => ({ '.validate': `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}` });
  const range = (min: number, max: number) => ({ '.validate': `newData.isNumber() && newData.val() >= ${min} && newData.val() <= ${max}` });
  const num = { '.validate': 'newData.isNumber()' };
  const hash = { '.validate': 'newData.isString() && newData.val().matches(/^[0-9a-f]{64}$/)' };
  const no = { '.validate': false };
  const hex = { '.validate': 'newData.isString() && newData.val().matches(/^#[0-9a-fA-F]{6}$/)' };
  // 배열은 0..9 숫자 키 객체로 저장된다 (스티커 10개, 말랑이 10개)
  const UNDER_10 = '$i.matches(/^[0-9]$/)';
  // 북마크 책 50권은 0..49 키
  const shelf = (base: RuleNode): RuleNode => ({
    ...base,
    $i: {
      '.validate': "$i.matches(/^([0-9]|[1-4][0-9])$/) && newData.hasChildren(['title', 'url', 'color', 'pub'])",
      title: str(1, 14),
      url: { '.validate': "newData.isString() && newData.val().length <= 300 && (newData.val().beginsWith('http://') || newData.val().beginsWith('https://'))" },
      color: hex,
      img: hash,
      pub: { '.validate': 'newData.isBoolean()' },
      $other: no,
    },
  });

  return {
    u: {
      $uid: {
        home: {
          ...t.friendsRead(),
          '.validate': "newData.hasChildren(['v'])",
          profile: str(0, 500),
          post: { '.validate': "newData.hasChildren(['text', 'at'])", text: str(0, 1000), at: num, $other: no },
          bg: {
            '.validate': "newData.hasChildren(['color']) || newData.hasChildren(['file'])",
            color: hex,
            file: hash,
            $other: no,
          },
          bgm: {
            '.validate': "newData.hasChildren(['v', 'title'])",
            v: { '.validate': 'newData.isString() && newData.val().matches(/^[0-9A-Za-z_-]{11}$/)' },
            title: str(0, 200),
            $other: no,
          },
          accent: hex,
          wall: hash,
          clap: str(1, 32),
          stickers: {
            $i: {
              '.validate': `${UNDER_10} && newData.hasChildren(['file', 'x', 'y', 'w', 'rot', 'z', 'anim', 'speed'])`,
              file: hash, x: num, y: num, w: range(24, 400), rot: num, z: num, speed: range(0.5, 3),
              anim: { '.validate': "newData.val() === 'none' || newData.val() === 'bob' || newData.val() === 'spin'" },
              $other: no,
            },
          },
          mallangi: { $i: { '.validate': `${UNDER_10} && newData.isString() && newData.val().matches(/^[0-9a-f]{64}$/)` } },
          v: { '.validate': 'newData.val() === 1' },
          $other: no,
        },
        // 받은 기록. 보낸 사람이 친구일 때만 글과 선물을 만든다. 주인은 하나씩 지우되 고치지 못한다
        in: t.inbox(
          {
            '.validate': 'newData.hasChildren()',
            $id: { '.validate': `(${FRIEND}) && newData.hasChildren(['name', 'text', 'at'])`, name: str(0, 20), text: str(1, 140), at: num, $other: no },
            gift: {
              $gid: {
                '.write': OWNER_DELETES,
                '.validate': `(${FRIEND}) && newData.hasChildren(['file', 'msg', 'name', 'at'])`,
                file: hash, msg: str(0, 60), name: str(0, 20), at: num, $other: no,
              },
            },
            // 보낸 사람의 박수 수. 친구가 1씩 올리기만 한다
            clap: { '.validate': `(${FRIEND}) && newData.isNumber() && ((!data.exists() && newData.val() === 1) || newData.val() === data.val() + 1)` },
          },
          'friends',
        ),
        shelf: shelf(t.owner()),
        shelfPub: shelf(t.friendsRead()),
        // 받은 기록을 남긴 사람 색인. 주인 앱이 적고 주인만 읽는다
        senders: { ...t.owner(), $s: { '.validate': 'newData.val() === true' } },
        $other: no,
      },
    },
  };
};
