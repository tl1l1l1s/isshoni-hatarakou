/** 활성 앱 키. Windows는 실행 파일 이름, Mac은 번들 ID (10.8.1 ActiveWindow). 창 제목은 쓰지 않는다. */
export type AppKey = `win:${string}` | `mac:${string}`;

export function winAppKey(exePath: string): AppKey {
  const base = exePath.split(/[\\/]/).pop() ?? exePath;
  return `win:${base.toLowerCase()}`;
}

export function macAppKey(bundleId: string): AppKey {
  return `mac:${bundleId.toLowerCase()}`;
}
