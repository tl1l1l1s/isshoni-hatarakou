import { describe, expect, it } from 'vitest';
import { dayIndex, dayKey, nextQuota } from './time';
import { isRoomCode, normalizeCode, randomCode } from './codes';
import { winAppKey, macAppKey } from './appkey';
import { CODE_ALPHABET } from './constants';
import { Appearance, emptyAppearance, readState } from './schemas';

describe('dayKey', () => {
  const kst = (s: string) => Date.parse(`${s}+09:00`);
  it('한국 시간 오전 6시에 날짜가 바뀐다', () => {
    expect(dayKey(kst('2026-10-08T05:59:59'))).toBe('2026-10-07');
    expect(dayKey(kst('2026-10-08T06:00:00'))).toBe('2026-10-08');
    expect(dayKey(kst('2026-10-08T23:59:59'))).toBe('2026-10-08');
    expect(dayKey(kst('2026-10-09T00:30:00'))).toBe('2026-10-08');
  });
  it('연말과 윤년 경계', () => {
    expect(dayKey(kst('2027-01-01T05:00:00'))).toBe('2026-12-31');
    expect(dayKey(kst('2028-03-01T05:00:00'))).toBe('2028-02-29');
  });
  it('dayIndex는 dayKey와 같은 시각에 바뀐다', () => {
    const at = (s: string) => dayIndex(kst(s));
    expect(at('2026-10-08T06:00:00') - at('2026-10-08T05:59:59')).toBe(1);
    expect(at('2026-10-09T05:59:59')).toBe(at('2026-10-08T06:00:00'));
    expect(new Date(at('2026-10-08T12:00:00') * 86_400_000).toISOString().slice(0, 10)).toBe(dayKey(kst('2026-10-08T12:00:00')));
  });
  it('nextQuota는 같은 날 1씩 올리고 날이 바뀌면 1부터 세며 한도에서 멈춘다', () => {
    expect(nextQuota(null, 5, 2)).toEqual({ d: 5, n: 1 });
    expect(nextQuota({ d: 5, n: 1 }, 5, 2)).toEqual({ d: 5, n: 2 });
    expect(nextQuota({ d: 5, n: 2 }, 5, 2)).toBeUndefined();
    expect(nextQuota({ d: 4, n: 2 }, 5, 2)).toEqual({ d: 5, n: 1 });
    expect(nextQuota(null, 5, 0)).toBeUndefined();
  });
});

describe('codes', () => {
  it('알파벳은 0, 1, I, O를 뺀 32자', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[01IO]/);
  });
  it('randomCode는 6자 방 코드를 만든다', () => {
    const code = randomCode();
    expect(isRoomCode(code)).toBe(true);
    expect(randomCode(4, () => new Uint8Array([0, 31, 32, 255]))).toBe('2Z2Z');
  });
  it('입력을 정규화한다', () => {
    expect(normalizeCode(' ab3-k7q ')).toBe('AB3K7Q');
    expect(isRoomCode('AB3K7O')).toBe(false);
  });
});

describe('appkey', () => {
  it('실행 파일 이름만 소문자로 쓴다', () => {
    expect(winAppKey('C:\\Program Files\\CELSYS\\CLIPStudioPaint.exe')).toBe('win:clipstudiopaint.exe');
    expect(macAppKey('com.Adobe.Photoshop')).toBe('mac:com.adobe.photoshop');
  });
});

describe('schemas', () => {
  it('빈 Appearance가 v1 schema를 통과한다', () => {
    expect(Appearance.parse(emptyAppearance())).toEqual(emptyAppearance());
  });
  it('모르는 상태는 online으로 읽는다', () => {
    expect(readState('away')).toBe('away');
    expect(readState('future-state')).toBe('online');
  });
});
