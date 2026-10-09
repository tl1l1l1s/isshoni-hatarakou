// 두 PC에서 다르게 고친 캐릭터 고르기의 순수 계산 (ACC-13, NFR-17의 askUser)
import type { Char } from './logic';

/** 서버 쪽 변경을 확인하는 주기 */
export const SYNC_MS = 30 * 60_000;

/** 고르기를 기다리는 슬롯과 서버 쪽 캐릭터 */
export interface Conflict { slot: number; remote: Char }

type Synced = Array<number | null> | undefined;

const same = (a: Char, b: Char) => JSON.stringify(a.appearance) === JSON.stringify(b.appearance);

/** 마지막으로 서버와 맞춘 mtime(synced) 뒤에 이 PC와 서버가 모두 바뀌었고 내용이 다른 슬롯.
 *  synced를 모르는 슬롯(이 기능 전에 맞춘 슬롯)은 늦게 고친 쪽을 쓰는 perItemMtime에 맡긴다 */
export function conflictsOf(local: Char[], remote: Array<Char | null>, synced: Synced): Conflict[] {
  return local.flatMap((l, i) => {
    const r = remote[i];
    const b = synced?.[i] ?? null;
    return r && b !== null && l.mtime !== b && r.mtime !== b && !same(l, r) ? [{ slot: i, remote: r }] : [];
  });
}

/** 맞춘 뒤의 synced. 올릴 슬롯은 지금 서버 쪽 mtime을 기준으로 삼고 고르기를 기다리는 슬롯은 그대로 둔다 */
export function syncedAfter(chars: Char[], remote: Array<Char | null>, prev: Synced, upload: number[], waiting: number[]): Array<number | null> {
  return chars.map((c, i) => {
    if (waiting.includes(i)) return prev?.[i] ?? null;
    if (upload.includes(i)) return remote[i]?.mtime ?? prev?.[i] ?? null;
    return c.mtime;
  });
}

/** 슬롯 i의 synced만 바꾼다 */
export const withSynced = (prev: Synced, size: number, i: number, mtime: number): Array<number | null> =>
  Array.from({ length: size }, (_, j) => (j === i ? mtime : prev?.[j] ?? null));
