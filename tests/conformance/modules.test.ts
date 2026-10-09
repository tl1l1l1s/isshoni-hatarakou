// 등록한 모든 모듈에 자동으로 실행하는 적합성 시험 (10.10.1)
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { modules } from '@modules/index';
import { validateManifests, setupOrder } from '@core/host';
import { readLocal, readSettings } from '@core/persist';
import { PRESENCE_MODULE_MAX_BYTES } from '@shared/constants';

describe('모듈 선언', () => {
  it('id, 접두어, 중복 검사를 통과한다', () => {
    expect(validateManifests(modules)).toEqual([]);
  });
  it('requires에 적은 모듈이 모두 등록되어 있다', () => {
    const ids = new Set(modules.map((m) => m.id));
    for (const m of setupOrder(modules)) for (const d of m.requires ?? []) expect(ids, `${m.id} -> ${d}`).toContain(d);
  });
});

describe.each(modules.map((m) => [m.id, m] as const))('%s', (id, m) => {
  it('specIds는 기능 ID 형식이다', () => {
    for (const s of m.specIds ?? []) expect(s).toMatch(/^([A-Z]{3}-\d{2}|OUR-\d{2}|TDO-\d{2})$/);
  });
  it('설정 기본값이 schema를 통과한다', () => {
    if (m.settings) expect(() => readSettings(m.settings!, undefined)).not.toThrow();
  });
  it('로컬 v1 고정 자료가 지금 schema까지 migration된다', () => {
    for (const s of ['device', 'account'] as const) {
      const decl = m.local?.[s];
      if (!decl) continue;
      expect(readLocal(decl, null).error).toBeNull();
      // 범위마다 고정 자료를 둔다 (fixtures/account.v1.json, fixtures/device.v1.json)
      const fixture = `src/modules/${id}/fixtures/${s}.v1.json`;
      if (decl.version > 1) expect(existsSync(fixture), `${fixture}가 필요합니다`).toBe(true);
      if (existsSync(fixture)) expect(readLocal(decl, JSON.parse(readFileSync(fixture, 'utf8'))).error).toBeNull();
    }
  });
  it('presence 필드 예시 값이 128바이트 안에 든다', () => {
    const sample = Object.fromEntries(Object.entries(m.presence ?? {}).map(([k, f]) => [k, exampleOf(f.schema)]));
    expect(new TextEncoder().encode(JSON.stringify(sample)).length).toBeLessThanOrEqual(PRESENCE_MODULE_MAX_BYTES);
  });
  it('서버 컬렉션은 규칙 템플릿을 고른다', () => {
    for (const c of Object.values(m.server?.collections ?? {})) expect(c.template).toBeTruthy();
  });
});

function exampleOf(schema: { safeParse(v: unknown): { success: boolean } }): unknown {
  for (const v of [true, 0, '', 'x'.repeat(16), null]) if (schema.safeParse(v).success) return v;
  return null;
}
