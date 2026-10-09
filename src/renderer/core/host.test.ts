import { describe, expect, it } from 'vitest';
import { ModuleHost, setupOrder, validateManifests } from './host';
import type { Ctx, ModuleManifest } from './types';
import type { Scope } from './scope';

const mod = (id: string, extra: Partial<ModuleManifest> = {}): ModuleManifest => ({ id, setup: () => id, ...extra });

describe('ModuleHost', () => {
  it('requires 순서로 setup하고 공개 API를 준다', async () => {
    const order: string[] = [];
    const host = new ModuleHost((m) => {
      order.push(m.id);
      return {} as Ctx;
    }, () => {});
    await host.start([mod('b', { requires: ['a'] }), mod('a')]);
    expect(order).toEqual(['a', 'b']);
    expect(host.api('b')).toBe('b');
  });

  it('setup 예외는 그 모듈과 그 모듈을 필요로 하는 모듈만 끈다', async () => {
    const host = new ModuleHost(() => ({}) as Ctx, () => {});
    await host.start([mod('a', { setup: () => { throw new Error('x'); } }), mod('b', { requires: ['a'] }), mod('c')]);
    expect(host.status.filter((s) => !s.on).map((s) => s.id)).toEqual(['a', 'b']);
    expect(host.api('c')).toBe('c');
  });

  it('내리면 scope에 모은 정리 함수를 모두 부른다', async () => {
    const disposed: string[] = [];
    const host = new ModuleHost((m, scope: Scope) => {
      scope.add(() => disposed.push(`${m.id}.timer`));
      scope.add(() => disposed.push(`${m.id}.window`));
      return {} as Ctx;
    }, () => {});
    await host.start([mod('a')]);
    host.stopAll();
    expect(disposed).toEqual(['a.window', 'a.timer']);
  });
});

describe('validateManifests', () => {
  it('접두어 없는 명령과 겹치는 id를 찾는다', () => {
    const errs = validateManifests([mod('a', { commands: [{ id: 'open', run: () => 0 }] }), mod('a')]);
    expect(errs.some((e) => e.includes('접두어'))).toBe(true);
    expect(errs.some((e) => e.includes('겹칩니다'))).toBe(true);
  });
  it('순환이 있어도 멈추지 않는다', () => {
    expect(setupOrder([mod('a', { requires: ['b'] }), mod('b', { requires: ['a'] })])).toHaveLength(2);
  });
});
