import { describe, expect, it } from 'vitest';
import { buildRules, type Fragment } from '../build';

describe('rules/build', () => {
  it('조각이 없으면 코어 규칙만 만든다', () => {
    const { rules } = buildRules({});
    expect(Object.keys(rules)).toEqual(['users', 'codes', 'rooms', 'config', 'files', 'catalog', 'catalogVersion']);
  });

  it('조각은 mod/<id> 아래에 들어가고 템플릿과 자기 namespace 참조는 허용한다', () => {
    const hello: Fragment = (t) => ({
      u: { $uid: { notes: t.owner(), memo: t.friendsRead() } },
      r: { $room: { cfg: t.roomOwner(), items: { $item: { ...t.roomMember(), '.validate': "root.child('mod/hello/r/' + $room + '/cfg').exists()" } } } },
    });
    const { rules } = buildRules({ hello });
    expect((rules.mod as Record<string, unknown>).hello).toBeDefined();
  });

  it('조각이 자기 namespace 밖을 참조하면 실패한다', () => {
    expect(() => buildRules({ hello: () => ({ g: { '.read': "root.child('users/x').exists()" } }) })).toThrow('namespace 밖');
    expect(() => buildRules({ hello: () => ({ g: { '.read': "root.child('mod/gacha/g').exists()" } }) })).toThrow('namespace 밖');
    expect(() => buildRules({ hello: (t) => ({ g: { '.write': `${t.owner()['.write'] as string} || root.child('rooms').exists()` } }) })).toThrow();
  });
});
