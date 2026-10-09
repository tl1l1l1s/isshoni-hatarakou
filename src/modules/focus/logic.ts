// 집중 시간 판정 (FOC-02, CHR-05, FOC-05). ctx 없이 시험하는 순수 함수
import { DAY_BOUNDARY_MS, KST_OFFSET_MS } from '@shared/constants';
import type { ActivitySample } from '@shared/schemas';
import { dayKey } from '@shared/time';

export type Rule = 'foreground' | 'foregroundUntilIdle20m' | 'foregroundWithInput';
export type App = { key: string; label: string } | null;
export type Reason = 'unknownApp' | 'otherApp' | 'idle' | 'gap';
/** 직전 샘플 시각과 마지막으로 시간을 센 시각 */
export interface Prev { at: number; countedAt: number }
export interface Step { sec: number; awake: boolean; typing: boolean; reason: Reason | null; next: Prev }

/** 샘플 사이가 이보다 길면 절전으로 보고 그 구간을 버린다 */
const GAP_MS = 30_000;
/** 등록 앱을 벗어난 뒤 잠들기까지 기다린다 (CHR-05 메모) */
const GRACE_MS = 5_000;
const IDLE_LIMIT_SEC = 20 * 60;

/** 직전 샘플부터 이번 샘플까지 더할 초, 깨어 있음, 타이핑, 세지 않은 이유.
 *  external이면 PC 밖 출처(폰)가 켜져 있어서 앱과 입력을 보지 않고 센다 (FOC-09) */
export function step(prev: Prev | null, s: ActivitySample, settings: { rule: Rule }, apps: readonly App[], external = false): Step {
  const reason: Reason | null =
    external ? null
    : s.appKey === null ? 'unknownApp'
    : !apps.some((a) => a?.key === s.appKey) ? 'otherApp'
    : settings.rule === 'foregroundUntilIdle20m' && s.idleSec >= IDLE_LIMIT_SEC ? 'idle'
    : settings.rule === 'foregroundWithInput' && s.idleSec > 1 ? 'idle'
    : null;
  const dt = prev ? s.at - prev.at : 0;
  const gap = dt > GAP_MS;
  const countedAt = reason === null ? s.at : (prev?.countedAt ?? -Infinity);
  const awake = s.at - countedAt <= GRACE_MS;
  return {
    sec: reason === null && !gap && dt > 0 ? dt / 1000 : 0,
    awake,
    // 그림 앱은 펜을 떼고 생각하는 시간이 길어서 4초까지 타이핑 자세로 본다 (CHR-12)
    typing: awake && (external || s.idleSec <= (s.pen ? 4 : 1)),
    reason: reason ?? (gap ? 'gap' : null),
    next: { at: s.at, countedAt },
  };
}

/** endMs에 끝난 sec초를 하루 키별로 나눈다. 오전 6시를 걸치면 6시에서 둘로 나눈다 (FOC-05) */
export function splitDay(endMs: number, sec: number): Array<[day: string, sec: number]> {
  const startMs = endMs - sec * 1000;
  const from = dayKey(startMs);
  const to = dayKey(endMs);
  if (from === to) return [[to, sec]];
  const boundary = Date.parse(to) - KST_OFFSET_MS + DAY_BOUNDARY_MS;
  return [[from, (boundary - startMs) / 1000], [to, (endMs - boundary) / 1000]];
}

/** 시:분:초. 시는 100을 넘어도 그대로 늘어난다 (FOC-03) */
export function hms(sec: number): string {
  const s = Math.floor(sec);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

/** 앱 키의 기본 이름. win:notepad.exe는 notepad, mac:com.apple.textedit는 textedit */
export const labelOf = (key: string): string => key.slice(4).replace(/\.exe$/, '').split('.').pop() ?? key;
