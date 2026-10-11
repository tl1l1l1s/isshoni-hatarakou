// 한 계정의 PC 두 대가 메모리 허브 하나를 함께 쓰는 시뮬레이터 (src/modules/gacha/sim.test.ts와 같은 방식)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import { emptyAppearance } from '@shared/schemas';
import type { Bridge } from '../../preload/api';
import wardrobe from './index';
import { withPose } from './logic';
import { wardrobeOf } from './state';

let hub: MemoryHub;

/** PC 한 대. 디스크는 PC마다 따로 둔다 */
async function pc(deviceId: string) {
  const disk = new Map<string, unknown>();
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
    { bridge, server, backend: {} as RenderBackend, uid, deviceId, appVersion: 'test', selfAppKey: null, profile: { name: 'alice' } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  vi.spyOn(core.windows, 'show').mockResolvedValue();
  const ms = [wardrobe] as ModuleManifest[];
  await core.preloadLocal(ms);
  await core.start(ms);
  await vi.advanceTimersByTimeAsync(0);
  return { core, w: wardrobeOf(core.ctxs.get('wardrobe')!.ctx) };
}

describe('wardrobe 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('지금 쓰는 슬롯을 서버에 남겨 새로 설치한 PC도 같은 캐릭터로 시작하고 맞춘 적 있는 PC는 제 슬롯을 지킨다', async () => {
    const a = await pc('pc');
    await a.w.write(1, withPose(emptyAppearance(), 'idle', 'b'.repeat(64)), true);
    await a.w.setActive(1);
    const look = a.core.self.get().look;

    // 켤 때 맞추기는 외형 해시를 비동기로 구하므로 끝나기를 기다린다
    const b = await pc('laptop');
    await vi.waitFor(() => expect(b.core.self.get().look).toBe(look));
    expect(b.w.local().active).toBe(1);

    // 맞춘 뒤에는 다른 PC가 슬롯을 바꿔도 따라 바꾸지 않는다
    await a.w.setActive(0);
    await b.w.sync();
    expect(b.w.local().active).toBe(1);
  });
});
