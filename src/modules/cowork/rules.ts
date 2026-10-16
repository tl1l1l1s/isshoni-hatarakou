// mod/cowork 규칙 조각 (ROM-15). 방마다 지금 세션 하나(cur)와 사람마다 참여 기록(parts)
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => {
  const MEMBER = t.roomMember()['.write'] as string;
  const OWNER = t.roomOwner()['.write'] as string;
  // 방 주인은 방을 지울 때 컬렉션을 통째로 지운다 (deleteWithRoom)
  const OWNER_WIPE = `${OWNER} && !newData.exists()`;
  const d = (k: string) => `data.child('${k}').val()`;
  const n = (k: string) => `newData.child('${k}').val()`;
  const same = (...ks: string[]) => ks.map((k) => `${n(k)} === ${d(k)}`).join(' && ');
  // 앱이 ctx.clock.serverNow()로 쓴 시각. 서버 시각과 1분 안이어야 한다 (PC 시계 추정 오차)
  const nearNow = (k: string) => `${n(k)} >= now - 60000 && ${n(k)} <= now + 60000`;
  // 끝난 세션: 없거나, 누가 끝냈거나, 시작하고 5초와 집중과 휴식이 지났거나, 시작하지 않고 30분이 지났다 (logic.ts의 phaseOf).
  // 5000은 LEAD_MS, 1800000은 WAIT_MAX_MS
  const ENDED = `(!data.exists() || ${d('st')} === 'stop' || (${d('st')} === 'run' && now > ${d('go')} + 5000 + (${d('f')} + ${d('b')}) * 60000) || (${d('st')} === 'wait' && now > ${d('at')} + 1800000))`;
  // 만들기: 끝난 세션 위에만 새 id로 내가 연다
  const CREATE = `${ENDED} && ${n('by')} === auth.uid && ${n('id')} !== ${d('id')} && ${n('st')} === 'wait' && ${nearNow('at')} && !newData.child('go').exists()`;
  // 시작: 개설자가 시작 전 세션을 시작한다
  const START = `!${ENDED} && ${d('st')} === 'wait' && ${d('by')} === auth.uid && ${n('st')} === 'run' && ${same('id', 'by', 'title', 'f', 'b', 'at')} && ${nearNow('go')}`;
  // 끝내기: 개설자나 방 주인이 진행 중인 세션을 끝낸다. 나머지 값은 그대로 둔다
  const STOP = `!${ENDED} && (${d('by')} === auth.uid || ${OWNER}) && ${n('st')} === 'stop' && ${same('id', 'by', 'title', 'f', 'b', 'at', 'go')}`;
  const int = (min: number, max: number) => ({ '.validate': `newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= ${min} && newData.val() <= ${max}` });
  const num = { '.validate': 'newData.isNumber()' };
  const v1 = { '.validate': 'newData.val() === 1' };
  const no = { '.validate': false };

  return {
    r: {
      $room: {
        '.read': t.roomMember()['.read'] as string,
        cur: {
          '.write': `(${MEMBER} && ((${CREATE}) || (${START}) || (${STOP}))) || (${OWNER_WIPE})`,
          '.validate': "newData.hasChildren(['id', 'by', 'title', 'f', 'b', 'st', 'at', 'v'])",
          id: { '.validate': 'newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{1,32}$/)' },
          by: { '.validate': 'newData.isString()' },
          // logic.ts의 TITLE_MAX, FOCUS_MIN과 FOCUS_MAX, BREAK_MIN과 BREAK_MAX
          title: { '.validate': 'newData.isString() && newData.val().length <= 20' },
          f: int(5, 180),
          b: int(0, 60),
          st: { '.validate': "newData.val() === 'wait' || newData.val() === 'run' || newData.val() === 'stop'" },
          at: num,
          go: num,
          v: v1,
          $other: no,
        },
        parts: {
          '.write': OWNER_WIPE,
          $uid: {
            // 내 참여만 쓴다. 방을 나온 뒤에도 내 기록은 지운다
            '.write': `(${MEMBER} && $uid === auth.uid) || (auth != null && $uid === auth.uid && !newData.exists())`,
            '.validate': "newData.hasChildren(['sid', 'at', 'v'])",
            sid: { '.validate': 'newData.isString() && newData.val().length <= 32' },
            at: { '.validate': 'newData.isNumber() && newData.val() <= now + 60000' },
            // 40은 logic.ts의 GOAL_MAX
            goal: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 40' },
            v: v1,
            $other: no,
          },
        },
      },
    },
  };
};
