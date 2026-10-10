// 자동 오류 보고의 본문과 한도 (NFR-21, OPS-03). Electron 없이 시험할 수 있게 순수 함수만 둔다

export interface CrashInput {
  /** 오류 종류 (main.uncaught, renderer.error, render-process-gone, abnormal-exit 등) */
  type: string;
  message: string;
  stack: string;
  version: string;
  os: string;
  /** 켠 뒤 지난 분 */
  minutes: number;
  /** 로그 파일의 마지막 줄들 (이미 가린 것) */
  log: string[];
}

export const HEAD = '[자동 오류 보고]';
/** 디스코드 한도 2000자 안 */
const DISCORD_MAX = 1900;
const DISCORD_LOG_LINES = 10;
const LOG_LINE_MAX = 200;
const STACK_LINES = 8;
export const DAY_MAX = 20;
export const GAP_MS = 5 * 60_000;

const firstLine = (s: string) => s.split('\n')[0] ?? '';

/** 같은 오류를 실행마다 한 번만 보내기 위한 서명 */
export const signature = (type: string, message: string) => `${type}:${firstLine(message)}`;

/** 집 폴더와 데이터 폴더를 ~와 <data>로 바꾸고 사용자 이름이 든 경로 조각(/Users/이름, C:\Users\이름)도 ~로 바꾼다 */
export function sanitizer(home: string, userData: string): (text: string) => string {
  // 로그에는 \가 \\로 적히기도 하므로 구분자는 어느 쪽이든 하나 이상으로 맞춘다
  const re = (p: string) => new RegExp(p.replace(/[.*+?^${}()|[\]\\/]/g, (c) => (c === '/' || c === '\\' ? '[\\\\/]+' : `\\${c}`)), 'g');
  const data = re(userData);
  const homeRe = re(home);
  return (t) => t.replace(data, '<data>').replace(homeRe, '~').replace(/(?:[A-Za-z]:[\\/]+Users|\/Users)[\\/]+[^\\/\s'"]+/g, '~');
}

const head = (r: CrashInput) => [`${HEAD} ${r.type}: ${firstLine(r.message)}`, `v${r.version}, ${r.os}, 켠 지 ${r.minutes}분`];

/** 서버 기록에 남길 본문. 로그 줄은 모두 넣고 자르기는 기록하는 쪽이 한다 */
export function recordText(r: CrashInput): string {
  return [...head(r), r.stack || r.message, '최근 로그', ...r.log].join('\n');
}

/** 디스코드 웹훅 본문. 1900자 안에 들도록 스택은 몇 줄만, 로그는 마지막 10줄을 코드 블록에 넣고 넘치면 앞 줄부터 뺀다. 멘션은 울리지 않는다 */
export function discordBody(r: CrashInput): { content: string; allowed_mentions: { parse: never[] } } {
  const stack = (r.stack || r.message).split('\n').slice(0, STACK_LINES).join('\n');
  const frame = `${[...head(r), stack].join('\n').slice(0, 1200)}\n최근 로그\n\`\`\`\n`;
  const lines = r.log.slice(-DISCORD_LOG_LINES).map((l) => l.slice(0, LOG_LINE_MAX).replaceAll('`', "'"));
  const room = DISCORD_MAX - frame.length - 4;
  while (lines.length && lines.join('\n').length > room) lines.shift();
  return { content: `${frame}${lines.join('\n')}\n\`\`\``, allowed_mentions: { parse: [] } };
}

export interface LimitState { day: string; count: number }

const dayOf = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** 보내기 한도. 같은 서명은 실행마다 한 번, 5분에 하나, 하루 20개. 날짜와 수는 state에 남겨 다시 켜도 이어진다 */
export function createLimiter(state: LimitState, now: () => number = Date.now) {
  const seen = new Set<string>();
  let last = -Infinity;
  return {
    allow(sig: string): boolean {
      const t = now();
      const day = dayOf(t);
      if (state.day !== day) {
        state.day = day;
        state.count = 0;
      }
      if (seen.has(sig) || t - last < GAP_MS || state.count >= DAY_MAX) return false;
      seen.add(sig);
      last = t;
      state.count++;
      return true;
    },
  };
}
