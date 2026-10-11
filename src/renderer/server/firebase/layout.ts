// Realtime Database 경로 배치와 파일 인코딩 (10.7.2). 메모리 구현도 같은 배치를 써서 두 구현의 결과를 맞춘다.
import { FILE_MAX_BASE64_BYTES, FILE_MAX_RAW_BYTES } from '@shared/constants';
import type { AccountPresence, Namespace } from '../port';

export function nsPath(ns: Namespace): string {
  const base =
    ns.scope === 'user' ? `mod/${ns.module}/u/${ns.uid}`
    : ns.scope === 'user.pub' ? `mod/${ns.module}/u/${ns.uid}/pub`
    : ns.scope === 'user.inbox' ? `mod/${ns.module}/u/${ns.uid}/in${ns.sender === undefined ? '' : `/${ns.sender}`}`
    : ns.scope === 'room' ? `mod/${ns.module}/r/${ns.room}`
    : `mod/${ns.module}/g`;
  return [base, ...(ns.path ?? [])].join('/');
}

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
/** push 키의 앞 8글자(만든 시각). 이 값부터 키 순서로 읽으면 그 시각 뒤에 만든 키만 온다 */
export function pushKeyTime(ms: number): string {
  let s = '';
  for (let i = 0; i < 8; i++, ms = Math.floor(ms / 64)) s = PUSH_CHARS.charAt(ms % 64) + s;
  return s;
}

/** push 키 앞 8글자에 담긴 만든 시각. 보낸 앱이 어림한 서버 시각이다 */
export function keyTime(key: string): number {
  let ms = 0;
  for (const ch of key.slice(0, 8)) ms = ms * 64 + PUSH_CHARS.indexOf(ch);
  return ms;
}

/** 서버가 거부한 쓰기의 안내. 메모리 서버도 같은 글을 써서 시험이 같은 글을 본다 */
export const WRITE_DENIED = '권한이 없어 저장하지 못했어요. 방이 지워졌거나 계정 설정이 바뀌었을 수 있어요.';

/** 쓰기 실패를 사용자에게 보일 글로 바꾼다. 모듈은 e.message를 그대로 띄우므로 원래 오류는 cause와 code에 남긴다.
 *  set과 update의 거부는 code가 PERMISSION_DENIED이고 transaction의 거부는 code 없이 message만 permission_denied다 */
export function writeError(e: unknown): Error {
  const o = e as { code?: unknown; message?: unknown } | null;
  const denied = o?.code === 'PERMISSION_DENIED' || /permission_denied/i.test(String(o?.message));
  const text = denied ? WRITE_DENIED : '저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.';
  return Object.assign(new Error(text), { cause: e, code: denied ? 'PERMISSION_DENIED' : o?.code });
}

/** Firebase가 빈 m을 저장하지 않으므로 빈 값을 채운다 */
export function toPresence(v: unknown): AccountPresence | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as { online?: unknown; lastSeen?: unknown; m?: unknown };
  return {
    online: o.online === true,
    lastSeen: typeof o.lastSeen === 'number' ? o.lastSeen : 0,
    m: (typeof o.m === 'object' && o.m !== null ? o.m : {}) as AccountPresence['m'],
  };
}

export const isInc = (v: unknown): v is { $inc: number } =>
  typeof v === 'object' && v !== null && typeof (v as { $inc?: unknown }).$inc === 'number';

/** files/{sha256}에 올릴 해시와 base64. base64로 64KB를 넘으면 받지 않는다 */
export async function encodeFile(bytes: Uint8Array): Promise<{ hash: string; b64: string }> {
  if (Math.ceil(bytes.length / 3) * 4 > FILE_MAX_BASE64_BYTES) {
    throw new Error(`파일이 너무 커요. 약 ${Math.floor(FILE_MAX_RAW_BYTES / 1024)}KB까지 올릴 수 있어요.`);
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return { hash: await sha256(bytes), b64: btoa(bin) };
}

/** 서버에서 읽은 files/{hash} 값. base64가 아니거나 내용이 해시와 다르면(누가 그 해시 자리를 다른 내용으로 먼저 썼다) null */
export async function decodeFile(hash: string, v: unknown): Promise<Uint8Array | null> {
  if (typeof v !== 'string') return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  return (await sha256(bytes)) === hash ? bytes : null;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
