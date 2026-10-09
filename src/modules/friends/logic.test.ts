import { describe, expect, it } from 'vitest';
import { friendCodeOf, INVITE_TTL_MS, plan, profileView, type Effect, type Slot } from './logic';

describe('친구 코드 정규화', () => {
  it.each([
    ['ABCD2345', 'ABCD2345'],
    [' abcd2345 ', 'ABCD2345'],
    ['MATE-abcd2345', 'ABCD2345'],
    ['mate-ABCD2345', 'ABCD2345'],
    ['ABCD234', null],
    ['ABCD23456', null],
    ['MATEABCD2345', null],
    ['ABCD-2345', null],
    ['ABCD2I45', null],
    ['', null],
  ])('%s', (input, want) => expect(friendCodeOf(input)).toBe(want));
});

it('공개 프로필에서 이름과 레벨을 읽는다', () => {
  expect(profileView({ name: '하나', m: { growth: { level: 3 } } })).toEqual({ name: '하나', level: 3 });
  expect(profileView({ name: 1, m: 'x' })).toEqual({ name: null, level: null });
  expect(profileView(null)).toEqual({ name: null, level: null });
});

// 두 사람의 친구 목록과 받은 기록을 메모리에 두고 plan이 정한 일을 그대로 해 본다 (state.ts의 apply와 같은 일)
type World = { list: Record<string, Set<string>>; inbox: Record<string, Record<string, Slot>> };
const world = (): World => ({ list: { a: new Set(), b: new Set() }, inbox: { a: {}, b: {} } });
const slot = (w: World, to: string, from: string) => (w.inbox[to]![from] ??= {});

function apply(w: World, me: string, e: Effect) {
  if (e.kind === 'befriend') w.list[me]!.add(e.uid);
  else if (e.kind === 'reply') slot(w, e.uid, me).ok = { at: 1 };
  else if (e.kind === 'unsend') delete slot(w, e.uid, me).req;
  else if (e.item) delete w.inbox[me]![e.uid]?.[e.item];
  else delete w.inbox[me]![e.uid];
  // 서버처럼 빈 칸은 사라진다
  for (const box of Object.values(w.inbox)) for (const [k, v] of Object.entries(box)) if (!Object.keys(v).length) delete box[k];
}

/** 한 사람의 앱이 받은 기록을 한 번 처리하고 화면에 보여 줄 신청과 초대를 돌려준다 */
function step(w: World, me: string, now = 0) {
  const shown: string[] = [];
  for (const [uid, s] of Object.entries(w.inbox[me]!)) {
    const p = plan(uid, s, { friend: w.list[me]!.has(uid), requested: Boolean(w.inbox[uid]![me]?.req), now });
    p.effects.forEach((e) => apply(w, me, e));
    if (p.request) shown.push(`req:${uid}`);
    if (p.invite) shown.push(`inv:${uid}`);
  }
  return shown;
}
const request = (w: World, from: string, to: string) => (slot(w, to, from).req = { name: from, at: 1 });
const accept = (w: World, me: string, uid: string) => {
  apply(w, me, { kind: 'befriend', uid, since: 1 });
  apply(w, me, { kind: 'reply', uid });
};
const done = (w: World) => {
  expect([...w.list.a!]).toEqual(['b']);
  expect([...w.list.b!]).toEqual(['a']);
  expect(w.inbox).toEqual({ a: {}, b: {} });
};

describe('친구 신청과 수락', () => {
  it('신청하고 받은 쪽이 수락하면 신청한 쪽 앱이 마무리하고 양쪽 목록에 서로 들어간다', () => {
    const w = world();
    request(w, 'a', 'b');
    expect(step(w, 'b')).toEqual(['req:a']);
    accept(w, 'b', 'a');
    // 신청한 쪽이 아직 못 봤으면 받은 쪽 앱은 신청을 다시 보여 주지 않는다
    expect(step(w, 'b')).toEqual([]);
    step(w, 'a');
    done(w);
  });

  it('서로 동시에 신청하고 한쪽이 수락한다', () => {
    const w = world();
    request(w, 'a', 'b');
    request(w, 'b', 'a');
    accept(w, 'b', 'a');
    step(w, 'a');
    step(w, 'b');
    done(w);
  });

  it('서로 동시에 신청하고 둘 다 수락한다', () => {
    const w = world();
    request(w, 'a', 'b');
    request(w, 'b', 'a');
    accept(w, 'a', 'b');
    accept(w, 'b', 'a');
    step(w, 'a');
    step(w, 'b');
    done(w);
  });

  it('거절하면 신청만 사라진다', () => {
    const w = world();
    request(w, 'a', 'b');
    apply(w, 'b', { kind: 'drop', uid: 'a', item: null });
    expect(step(w, 'a')).toEqual([]);
    expect(w).toEqual(world());
  });

  it('나를 끊었던 사람이 다시 신청하면 아직 목록에 둔 쪽 앱이 바로 수락을 보낸다', () => {
    const w = world();
    w.list.b!.add('a');
    request(w, 'a', 'b');
    expect(step(w, 'b')).toEqual([]);
    step(w, 'a');
    step(w, 'b');
    done(w);
  });

  it('신청하지 않았는데 온 수락은 버린다', () => {
    const w = world();
    w.list.b!.add('a');
    slot(w, 'a', 'b').ok = { at: 1 };
    step(w, 'a');
    expect(w.list.a!.size).toBe(0);
    expect(w.inbox.a).toEqual({});
  });
});

describe('초대', () => {
  const inv = (at: number) => ({ room: '7Q2K9M', name: 'b', at });

  it('친구의 10분 안 초대만 보여 주고 나머지는 지운다', () => {
    const w = world();
    w.list.a!.add('b');
    slot(w, 'a', 'b').inv = inv(1000);
    expect(step(w, 'a', 1000 + INVITE_TTL_MS - 1)).toEqual(['inv:b']);
    expect(step(w, 'a', 1000 + INVITE_TTL_MS)).toEqual([]);
    expect(w.inbox.a).toEqual({});
  });

  it('친구가 아닌 사람의 초대는 지운다', () => {
    const w = world();
    slot(w, 'a', 'b').inv = inv(1000);
    expect(step(w, 'a', 1000)).toEqual([]);
    expect(w.inbox.a).toEqual({});
  });
});
