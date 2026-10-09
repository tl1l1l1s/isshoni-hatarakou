// 설정 코드: 'TD1-' + base64url(JSON { e: 이메일, p: 비밀번호 }) (10.7.2 신원).
// scripts/create-account.ts가 만들고 로그인할 때 읽는다. 스크립트가 Node로 바로 불러오므로 import를 두지 않는다.
const PREFIX = 'TD1-';

export function encodeSetupCode(email: string, password: string): string {
  const bin = String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ e: email, p: password })));
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSetupCode(code: string): { email: string; password: string } | null {
  const s = code.replace(/\s/g, '');
  if (!s.startsWith(PREFIX)) return null;
  try {
    const bin = atob(s.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/'));
    const { e, p } = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as { e?: unknown; p?: unknown };
    return typeof e === 'string' && typeof p === 'string' ? { email: e, password: p } : null;
  } catch {
    return null;
  }
}
