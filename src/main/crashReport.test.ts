import { describe, expect, it } from 'vitest';
import { createLimiter, DAY_MAX, discordBody, GAP_MS, recordText, sanitizer, signature, type CrashInput } from './crashReport';

const input = (p: Partial<CrashInput> = {}): CrashInput => ({
  type: 'renderer.error',
  message: '터졌어요\n둘째 줄',
  stack: 'Error: 터졌어요\n    at a (app://x/assets/index.js:1:2)',
  version: '0.1.0',
  os: 'darwin 25.6.0',
  minutes: 12,
  log: ['[2026-10-10 12:00:00.000] [info] 하나', '[2026-10-10 12:00:01.000] [error] 둘'],
  ...p,
});

describe('sanitizer', () => {
  it('데이터 폴더, 집 폴더, 사용자 이름이 든 경로를 가린다', () => {
    const s = sanitizer('/Users/tee', '/Users/tee/Library/Application Support/isshoni-hatarakou');
    expect(s('read /Users/tee/Library/Application Support/isshoni-hatarakou/logs/x.log')).toBe('read <data>/logs/x.log');
    expect(s('/Users/tee/Desktop/a.png and /Users/other/b')).toBe('~/Desktop/a.png and ~/b');
    const w = sanitizer('C:\\Users\\tee', 'C:\\Users\\tee\\AppData\\Roaming\\isshoni-hatarakou');
    expect(w('C:\\\\Users\\\\tee\\\\AppData\\\\Roaming\\\\isshoni-hatarakou\\\\settings.json')).toBe('<data>\\\\settings.json');
    expect(w('C:\\Users\\tee\\x and C:/Users/someone/y')).toBe('~\\x and ~/y');
  });
});

describe('recordText와 discordBody', () => {
  it('머리줄에 종류와 첫 줄, 둘째 줄에 버전과 OS와 시간을 넣고 로그를 모두 붙인다', () => {
    const t = recordText(input());
    expect(t.split('\n').slice(0, 2)).toEqual(['[자동 오류 보고] renderer.error: 터졌어요', 'v0.1.0, darwin 25.6.0, 켠 지 12분']);
    expect(t).toContain('at a (app://x/assets/index.js:1:2)');
    expect(t.endsWith('최근 로그\n[2026-10-10 12:00:00.000] [info] 하나\n[2026-10-10 12:00:01.000] [error] 둘')).toBe(true);
  });
  it('스택이 없으면 메시지를 쓴다', () => {
    expect(recordText(input({ stack: '' }))).toContain('터졌어요\n둘째 줄\n최근 로그');
  });
  it('디스코드 본문은 마지막 10줄을 코드 블록에 넣고 1900자를 넘지 않으며 멘션을 끈다', () => {
    const log = Array.from({ length: 50 }, (_, i) => `줄 ${i} ${'가'.repeat(150)}`);
    const b = discordBody(input({ log, stack: Array.from({ length: 30 }, (_, i) => `    at f${i}`).join('\n') }));
    expect(b.content.length).toBeLessThanOrEqual(1900);
    expect(b.content.startsWith('[자동 오류 보고] renderer.error: 터졌어요\nv0.1.0')).toBe(true);
    expect(b.content).toContain('최근 로그\n```\n');
    expect(b.content.endsWith('\n```')).toBe(true);
    expect(b.content).toContain('줄 49 ');
    expect(b.content).not.toContain('줄 39 ');
    expect(b.content).not.toContain('at f20');
    expect(b.allowed_mentions).toEqual({ parse: [] });
    const small = discordBody(input());
    expect(small.content).toContain('```\n[2026-10-10 12:00:00.000] [info] 하나\n[2026-10-10 12:00:01.000] [error] 둘\n```');
  });
  it('로그 줄의 백틱은 코드 블록을 깨지 않게 바꾼다', () => {
    expect(discordBody(input({ log: ['a ``` b'] })).content).toContain("a ''' b");
  });
});

describe('createLimiter', () => {
  it('같은 서명은 한 번, 5분에 하나, 하루 20개', () => {
    let t = Date.parse('2026-10-10T10:00:00+09:00');
    const state = { day: '', count: 0 };
    const l = createLimiter(state, () => t);
    expect(l.allow(signature('a', 'x\ny'))).toBe(true);
    expect(l.allow(signature('a', 'x\nz'))).toBe(false);
    t += GAP_MS;
    expect(l.allow(signature('a', 'x'))).toBe(false);
    expect(l.allow(signature('b', 'x'))).toBe(true);
    expect(l.allow(signature('c', 'x'))).toBe(false);
    expect(state.count).toBe(2);
    for (let i = 0; i < DAY_MAX; i++) {
      t += GAP_MS;
      l.allow(`d${i}`);
    }
    expect(state.count).toBe(DAY_MAX);
    t += GAP_MS;
    expect(l.allow('e')).toBe(false);
    t += 86_400_000;
    expect(l.allow('e')).toBe(true);
    expect(state).toEqual({ day: '2026-10-11', count: 1 });
  });
  it('저장된 날짜와 수를 이어 쓴다', () => {
    const t = Date.parse('2026-10-10T10:00:00+09:00');
    const l = createLimiter({ day: '2026-10-10', count: DAY_MAX }, () => t);
    expect(l.allow('a')).toBe(false);
  });
});
