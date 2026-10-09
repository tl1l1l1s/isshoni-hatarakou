// mod/sound 규칙 조각. 친구가 읽는 플리 사본은 본인이 쓰고 본인과 친구가 읽는다 (SND-05..SND-07, 10.14의 16번)
import type { RuleNode, Templates } from '../../../rules/core.ts';

// 수치는 logic.ts와 같다 (rules.test.ts가 맞춰 본다)
export default (t: Templates): RuleNode => {
  const str = (max: number) => ({ '.validate': `newData.isString() && newData.val().length <= ${max}` });
  const no = { '.validate': false };
  return {
    u: {
      $uid: {
        share: {
          ...t.friendsRead(),
          '.validate': "newData.hasChildren(['v'])",
          // 프리셋 p0, p1, p2. 곡 배열은 0..19 숫자 키 객체로 저장된다
          $p: {
            '.validate': '$p.matches(/^p[0-2]$/)',
            name: str(20),
            tracks: {
              $i: {
                '.validate': "$i.matches(/^1?[0-9]$/) && newData.hasChildren(['v', 'title'])",
                v: { '.validate': 'newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{11}$/)' },
                title: str(200),
                $other: no,
              },
            },
            $other: no,
          },
          cur: { '.validate': 'newData.val() === 0 || newData.val() === 1 || newData.val() === 2' },
          bio: str(140),
          locked: { '.validate': 'newData.isBoolean()' },
          // 마이홈 공개 (SND-05). 친구 플리 화면에 마이홈으로 가는 버튼을 보일지
          home: { '.validate': 'newData.isBoolean()' },
          v: { '.validate': 'newData.val() === 1' },
        },
        $other: no,
      },
    },
  };
};
