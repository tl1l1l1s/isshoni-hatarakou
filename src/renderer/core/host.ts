import type { Ctx, ModuleManifest } from './types';
import { Scope } from './scope';

export interface ModuleStatus { id: string; on: boolean; reason?: string }

const ID = /^[a-z][a-z0-9-]*$/;

/** 선언 검사. 문제가 있으면 이유 목록 (부팅 때와 적합성 시험이 함께 쓴다) */
export function validateManifests(ms: ModuleManifest[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const seen = { window: new Set<string>(), command: new Set<string>(), contribution: new Set<string>(), effect: new Set<string>(), gate: new Set<string>() };
  for (const m of ms) {
    if (!ID.test(m.id)) errors.push(`${m.id}: id는 kebab-case여야 합니다`);
    if (ids.has(m.id)) errors.push(`${m.id}: id가 겹칩니다`);
    ids.add(m.id);
    const prefixed = (kind: keyof typeof seen, id: string) => {
      if (!id.startsWith(`${m.id}.`)) errors.push(`${m.id}: ${kind} ${id}에 모듈 접두어가 없습니다`);
      if (seen[kind].has(id)) errors.push(`${m.id}: ${kind} ${id}가 겹칩니다`);
      seen[kind].add(id);
    };
    m.ui?.windows?.forEach((w) => prefixed('window', w.id));
    m.commands?.forEach((c) => prefixed('command', c.id));
    m.ui?.contributions?.forEach((c) => prefixed('contribution', c.id));
    m.effects?.forEach((e) => prefixed('effect', e.id));
    Object.keys(m.gates ?? {}).forEach((g) => prefixed('gate', g));
    for (const c of m.ui?.contributions ?? []) {
      if (c.command && !m.commands?.some((x) => x.id === c.command) && !c.command.startsWith('core.')) {
        // 다른 모듈 명령을 부르는 항목은 requires에 그 모듈이 있어야 한다
        const target = c.command.split('.')[0]!;
        if (!m.requires?.includes(target)) errors.push(`${m.id}: ${c.id}가 requires에 없는 명령 ${c.command}를 부릅니다`);
      }
    }
  }
  return errors;
}

/** requires 순서. 순환이 있으면 순환에 든 모듈을 뒤에 둔다 (부팅에서 꺼짐) */
export function setupOrder(ms: ModuleManifest[]): ModuleManifest[] {
  const byId = new Map(ms.map((m) => [m.id, m]));
  const out: ModuleManifest[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: ModuleManifest) => {
    if (state.get(m.id) === 'done' || state.get(m.id) === 'visiting') return;
    state.set(m.id, 'visiting');
    for (const dep of [...(m.requires ?? []), ...(m.optionalRequires ?? [])]) {
      const d = byId.get(dep);
      if (d) visit(d);
    }
    state.set(m.id, 'done');
    out.push(m);
  };
  ms.forEach(visit);
  return out;
}

export interface Loaded { manifest: ModuleManifest; api: unknown; scope: Scope }

/** 모듈 호스트 (10.4 부팅 5단계). setup 예외는 그 모듈과 그 모듈을 필요로 하는 모듈만 끈다 */
export class ModuleHost {
  readonly loaded = new Map<string, Loaded>();
  readonly status: ModuleStatus[] = [];

  constructor(private makeCtx: (m: ModuleManifest, scope: Scope) => Ctx, private log: (msg: string) => void = console.warn) {}

  async start(ms: ModuleManifest[]): Promise<void> {
    for (const e of validateManifests(ms)) this.log(`[host] ${e}`);
    for (const m of setupOrder(ms)) {
      const missing = (m.requires ?? []).find((d) => !this.loaded.has(d));
      if (missing) {
        this.off(m.id, `필요한 모듈 ${missing}이 꺼져 있습니다`);
        continue;
      }
      const scope = new Scope();
      try {
        const api = await m.setup(this.makeCtx(m, scope));
        this.loaded.set(m.id, { manifest: m, api, scope });
        this.status.push({ id: m.id, on: true });
      } catch (e) {
        scope.dispose();
        this.off(m.id, e instanceof Error ? e.message : String(e));
      }
    }
  }

  api(id: string): unknown {
    return this.loaded.get(id)?.api;
  }

  /** 의존하는 모듈부터 거꾸로 내린다 */
  stopAll(): void {
    for (const id of [...this.loaded.keys()].reverse()) this.stop(id);
  }

  stop(id: string): void {
    const l = this.loaded.get(id);
    if (!l) return;
    l.scope.dispose();
    this.loaded.delete(id);
  }

  private off(id: string, reason: string) {
    this.status.push({ id, on: false, reason });
    this.log(`[host] ${id} 꺼짐: ${reason}`);
  }
}
