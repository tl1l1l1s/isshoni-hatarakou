import { describe, expect, it } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../preload/api';
import account from './index';
import { cleanName, levelOf, rankOf } from './logic';

describe('account', () => {
  it('닉네임은 앞뒤 공백을 지우고 1자부터 20자까지 받는다', () => {
    expect(cleanName('  토끼  ')).toEqual({ ok: true, name: '토끼' });
    expect(cleanName('가'.repeat(20))).toEqual({ ok: true, name: '가'.repeat(20) });
    expect(cleanName('가'.repeat(21)).ok).toBe(false);
    expect(cleanName('   ').ok).toBe(false);
  });

  it('친구 랭킹은 나보다 레벨이 높은 친구 수에 1을 더하고 같은 레벨은 같은 순위다', () => {
    expect(rankOf(10, [])).toBe(1);
    expect(rankOf(10, [3, 10])).toBe(1);
    expect(rankOf(10, [12, 11, 10])).toBe(3);
    expect([levelOf({ m: { growth: { level: 7 } } }), levelOf({ name: 'x' }), levelOf(null)]).toEqual([7, null, null]);
  });
});

// 부팅 때 서버 프로필을 읽지 못한 PC (오프라인 부팅). 이 PC에 둔 이름을 보이되 서버에 쓰지 않는다
const LOCAL = 'accounts/alice/modules/account.json';
async function boot(cached: string, profile: { name?: string } | null | undefined, hub = new MemoryHub()) {
  const disk = new Map<string, unknown>(cached ? [[LOCAL, { v: 1, data: { name: cached } }]] : []);
  const bridge = {
    version: 0,
    invoke: async (ch: string, args: { path?: string; data?: unknown }) => {
      if (ch === 'store.read') return disk.get(args.path!) ?? null;
      if (ch === 'store.write') disk.set(args.path!, args.data);
      return null;
    },
    on: () => () => {},
    invokeModule: async () => null,
  } as unknown as Bridge;
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn('dev-alice');
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  const ms = [account as ModuleManifest];
  await core.preloadLocal(ms);
  await core.start(ms);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    core,
    ctx: core.ctxs.get('account')!.ctx,
    server,
    serverName: () => (hub.read(`users/${uid}/public`) as { name?: string } | null)?.name,
    localName: async () => (await tick(), (disk.get(LOCAL) as { data: { name: string } }).data.name),
  };
}

describe('오프라인 부팅의 이름', () => {
  it('프로필을 읽기 전에는 이 PC의 이름을 보이기만 하고 늦게 온 서버 이름으로 바꾼다', async () => {
    const hub = new MemoryHub();
    const other = createMemoryServer(hub);
    await other.profile.write(await other.identity.signIn('dev-alice'), { name: '다른 PC에서 정함' });
    const a = await boot('옛 이름', undefined, hub);
    expect(a.core.self.get().name).toBe('옛 이름');
    expect(a.serverName()).toBe('다른 PC에서 정함');
    a.core.setProfile(await a.server.profile.read('alice'));
    expect(a.core.self.get().name).toBe('다른 PC에서 정함');
    expect(a.serverName()).toBe('다른 PC에서 정함');
    expect(await a.localName()).toBe('다른 PC에서 정함');
  });

  it('프로필을 읽기 전에 사용자가 정한 이름은 늦게 온 서버 이름보다 앞선다', async () => {
    const a = await boot('옛 이름', undefined);
    a.ctx.self.setName('지금 정함');
    await Promise.resolve();
    a.core.setProfile({ name: '서버 이름' });
    expect(a.core.self.get().name).toBe('지금 정함');
    expect(a.serverName()).toBe('지금 정함');
    expect(await a.localName()).toBe('지금 정함');
  });

  it('서버에 이름이 없는 계정은 이 PC의 이름을 한 번 올린다', async () => {
    const a = await boot('옛 이름', null);
    await Promise.resolve();
    expect(a.core.self.get().name).toBe('옛 이름');
    expect(a.serverName()).toBe('옛 이름');
    const b = await boot('', { name: '서버 이름' });
    expect(b.core.self.get().name).toBe('서버 이름');
    expect(await b.localName()).toBe('서버 이름');
  });
});
