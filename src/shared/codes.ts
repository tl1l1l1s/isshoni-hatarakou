import { CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants.ts';

export type RandomBytes = (n: number) => Uint8Array;

const cryptoBytes: RandomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** 32자 알파벳에서 뽑은 코드. 32는 256의 약수라서 바이트를 나머지로 줄여도 치우치지 않는다. */
export function randomCode(length = ROOM_CODE_LENGTH, rnd: RandomBytes = cryptoBytes): string {
  return Array.from(rnd(length), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** 사용자가 넣은 코드를 정규화한다. 소문자, 공백, 줄표를 받아 준다. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}
