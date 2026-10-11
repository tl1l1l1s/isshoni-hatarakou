import type { Bridge } from '../../preload/api';
import type { LocalDecl, SettingsDecl } from './types';

/** 파일 하나를 메모리에 두고 바뀌면 같은 틱의 변경을 모아 바로 메인에 보낸다. 디스크 쓰기를 미루는 일은 메인이 하므로
 *  Windows 로그오프처럼 렌더러를 기다릴 수 없는 종료에도 메인이 들고 있는 값이 남는다 (10.7.1). 종료와 절전 때는 flush로 바로 보낸다.
 *  readOnly 파일은 메모리에서만 바꾸고 쓰지 않는다 (앱보다 새 버전이 쓴 파일을 덮지 않는다) */
export class JsonFile<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private bridge: Bridge, readonly path: string, public value: T, private readOnly = false) {}

  /** valid가 false인 파일(JSON은 맞지만 모양이 다른 것)은 메인이 .bak으로 옮기고 fallback으로 시작한다 */
  static async load<T>(bridge: Bridge, path: string, fallback: () => T, valid: (v: unknown) => boolean = () => true): Promise<JsonFile<T>> {
    const raw = await bridge.invoke('store.read', { path });
    if (raw != null && !valid(raw)) {
      await bridge.invoke('store.quarantine', { path }).catch(() => undefined);
      void bridge.invoke('log.write', { level: 'warn', scope: 'core', message: `${path} 모양이 맞지 않아 .bak으로 옮기고 처음 값으로 시작` }).catch(() => undefined);
      return new JsonFile(bridge, path, fallback());
    }
    return new JsonFile(bridge, path, (raw as T | null) ?? fallback());
  }

  set(v: T): void {
    this.value = v;
    if (this.timer === null) this.timer = setTimeout(() => void this.flush(), 0);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.readOnly) return;
    await this.bridge.invoke('store.write', { path: this.path, data: this.value });
  }
}

/** 설정 파일 모양: 사용자가 바꾼 값과 schemaVersion만 (10.5 settings) */
export interface SettingsFile { schemaVersion: number; modules: Record<string, { v: number; values: Record<string, unknown> }> }
export const emptySettings = (): SettingsFile => ({ schemaVersion: 1, modules: {} });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** 설정 파일로 읽을 수 있는 모양인지. 모듈 값은 모듈마다 schema로 다시 검사한다 (readSettings) */
export const isSettingsFile = (v: unknown): boolean => isObject(v) && isObject(v.modules);

/** 기본값과 다른 값만 남긴다 */
export function changedOnly(values: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(defaults[k])));
}

/** 저장된 값에 기본값을 채우고 schema로 검사한다. 맞지 않는 키만 버리고 그 키는 기본값을 쓴다 */
export function readSettings(decl: SettingsDecl, stored: Record<string, unknown> | undefined): Record<string, unknown> {
  const defaults = decl.schema.parse({}) as Record<string, unknown>;
  const merged = { ...defaults };
  for (const [k, v] of Object.entries(stored ?? {})) {
    const r = decl.schema.shape[k]?.safeParse(v);
    if (r?.success) merged[k] = r.data;
  }
  const r = decl.schema.safeParse(merged);
  return r.success ? (r.data as Record<string, unknown>) : defaults;
}

/** 로컬 모듈 데이터 {v, data}를 읽어 migration을 차례로 실행하고 검사한다 (10.7.3의 1번).
 *  tooNew는 앱보다 새 버전이 쓴 파일이다. 되돌린 앱이 그 파일을 덮지 않게 호출한 쪽이 쓰지 않는다 */
export function readLocal(decl: LocalDecl, stored: unknown): { data: unknown; error: string | null; tooNew?: true } {
  if (stored == null) return { data: decl.initial(), error: null };
  const rec = stored as { v?: number; data?: unknown };
  let v = typeof rec.v === 'number' ? rec.v : 1;
  let data = rec.data;
  if (v > decl.version) return { data: decl.initial(), error: `앱보다 새 형식(v${v})`, tooNew: true };
  try {
    while (v < decl.version) {
      const step = decl.migrate?.[v - 1];
      if (!step) throw new Error(`v${v}에서 v${v + 1}로 가는 migration이 없습니다`);
      data = step(data);
      v++;
    }
    return { data: decl.schema.parse(data), error: null };
  } catch (e) {
    return { data: decl.initial(), error: e instanceof Error ? e.message : String(e) };
  }
}
