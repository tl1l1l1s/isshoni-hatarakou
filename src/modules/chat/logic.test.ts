import { describe, expect, it } from 'vitest';
import { badge, countUnread, isSendKey, msgKey, nextTime, short, type Item } from './logic';

const item = (t: number, uid: string): Item => ({ key: msgKey(t, uid), value: { uid, name: uid, text: 'x', at: t, v: 1 } });

describe('메시지 키', () => {
  it('문자열 순서가 시각 순서다 (자릿수가 달라도)', () => {
    const times = [5, 999, 1_000, 1_728_450_000_000, 1_728_450_000_001, 99_999_999_999_999];
    const keys = times.map((t) => msgKey(t, 'u'));
    expect([...keys].sort()).toEqual(keys);
  });

  it('같은 시각이어도 사람마다 다르고 같은 앱은 1ms씩 민다', () => {
    expect(msgKey(10, 'alice')).not.toBe(msgKey(10, 'bob'));
    let last = 0;
    const ts = [100, 100, 100, 99, 105].map((now) => (last = nextTime(now, last)));
    expect(ts).toEqual([100, 101, 102, 103, 105]);
    expect(new Set(ts.map((t) => msgKey(t, 'me'))).size).toBe(5);
  });
});

describe('안 읽은 수', () => {
  const items = [item(1, 'bob'), item(2, 'me'), item(3, 'bob'), item(4, 'carol')];
  it('읽은 자리 뒤에 남이 보낸 것만 센다', () => {
    expect(countUnread(items, '', 'me')).toBe(3);
    expect(countUnread(items, items[1]!.key, 'me')).toBe(2);
    expect(countUnread(items, items[3]!.key, 'me')).toBe(0);
  });
  it('10개부터는 9+', () => {
    expect([badge(1), badge(9), badge(10)]).toEqual(['1', '9', '9+']);
  });
});

describe('Enter로 보내기', () => {
  const key = (over: Partial<Parameters<typeof isSendKey>[0]>) => isSendKey({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13, ...over });
  it('한글 조합 중 Enter와 Shift+Enter는 보내지 않는다', () => {
    expect(key({})).toBe(true);
    expect(key({ isComposing: true })).toBe(false);
    expect(key({ keyCode: 229 })).toBe(false);
    expect(key({ shiftKey: true })).toBe(false);
    expect(key({ key: 'a', keyCode: 65 })).toBe(false);
  });
});

it('말풍선 글은 한 줄로 줄인다', () => {
  expect(short('안녕\n하세요')).toBe('안녕 하세요');
  expect(short('가'.repeat(40))).toBe(`${'가'.repeat(30)}…`);
});
