// 코어 런타임 두 개가 메모리 허브 하나를 함께 쓰는 받은 기록 흐름 (friends/sim.test.ts와 같은 방식)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryServer, MemoryHub } from '@server/memory';
import { CoreRuntime } from '@core/runtime';
import { JsonFile, emptySettings } from '@core/persist';
import type { ModuleManifest } from '@core/types';
import type { RenderBackend } from '@render/port';
import type { Bridge } from '../../preload/api';
import friends from '../friends/index';
import home from './index';
import type { Inbox } from './logic';
import { sendClap, sendGift, watchInboxOf, writeBook } from './state';

let hub: MemoryHub;
const H = 'a'.repeat(64);
const bridge = { version: 0, invoke: async () => null, on: () => () => {}, invokeModule: async () => null } as unknown as Bridge;

async function app(name: string) {
  hub.write(`users/${name}/public`, { v: 1, name, friendCode: name.toUpperCase().padEnd(8, '0') });
  const server = createMemoryServer(hub);
  const uid = await server.identity.signIn(`dev-${name}`);
  const core = new CoreRuntime(
    { bridge, server, backend: {} as RenderBackend, uid, deviceId: 'pc', appVersion: 'test', selfAppKey: null, profile: { name, friendCode: '' } },
    new JsonFile(bridge, 'settings.json', emptySettings()),
    new JsonFile(bridge, `accounts/${uid}/settings.json`, emptySettings()),
  );
  const ms = [friends as ModuleManifest, home as ModuleManifest];
  await core.preloadLocal(ms);
  await core.start(ms);
  await vi.advanceTimersByTimeAsync(0);
  return core.ctxs.get('home')!.ctx;
}

const befriend = (a: string, b: string) => hub.writeMany({ [`mod/friends/u/${a}/list/${b}`]: { since: 1, v: 1 }, [`mod/friends/u/${b}/list/${a}`]: { since: 1, v: 1 } });

describe('home 시뮬레이터', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => vi.useRealTimers());

  it('친구를 끊어도 그 사람이 남긴 방명록 글과 선물과 박수는 주인에게 그대로 보인다', async () => {
    const alice = await app('alice');
    const bob = await app('bob');
    befriend('alice', 'bob');
    await vi.advanceTimersByTimeAsync(0);
    await writeBook(bob, 'alice', '놀러 왔어');
    await sendGift(bob, 'alice', H, '선물이야');
    await sendClap(bob, 'alice');

    let seen: Inbox | null = null;
    const stop = watchInboxOf(alice, 'alice', 30, (v) => (seen = v));
    await vi.advanceTimersByTimeAsync(0);
    const view = () => ({ book: seen!.book.map((b) => b.text), gifts: seen!.gifts.length, claps: seen!.claps });
    expect(view()).toEqual({ book: ['놀러 왔어'], gifts: 1, claps: 1 });
    // 주인 앱이 기록을 본 사람을 색인에 적는다
    expect(hub.read('mod/home/u/alice/senders')).toEqual({ bob: true });

    hub.write('mod/friends/u/alice/list/bob', null);
    await vi.advanceTimersByTimeAsync(0);
    expect(view()).toEqual({ book: ['놀러 왔어'], gifts: 1, claps: 1 });
    stop();
  });

  it('색인이 없는 받은 기록은 처음 켤 때 한 번 읽어 색인을 만들고 친구가 아닌 사람의 글도 보인다', async () => {
    hub.write('mod/home/u/alice/in/carol/1700000000001', { name: '캐럴', text: '옛날 글', at: 1700000000001 });
    const alice = await app('alice');
    await vi.advanceTimersByTimeAsync(0);
    expect(hub.read('mod/home/u/alice/senders')).toEqual({ carol: true });

    let seen: Inbox | null = null;
    const stop = watchInboxOf(alice, 'alice', 30, (v) => (seen = v));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen!.book.map((b) => b.text)).toEqual(['옛날 글']);
    stop();
  });
});
