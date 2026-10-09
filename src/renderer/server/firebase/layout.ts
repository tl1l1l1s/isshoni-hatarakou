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
    throw new Error(`파일이 너무 큽니다. 약 ${Math.floor(FILE_MAX_RAW_BYTES / 1024)}KB까지 올릴 수 있습니다.`);
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
