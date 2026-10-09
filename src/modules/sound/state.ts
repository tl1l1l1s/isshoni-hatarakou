// 재생 상태, 내 플리 저장과 사본 올리기, 친구 플리 읽기. 상태는 ctx마다 따로 둔다
import { useCallback, useSyncExternalStore } from 'react';
import type { Ctx, Dispose } from '@core/types';
import type {} from '@modules/friends/api';
import { levelOf, openPreset, parseShared, pickSurf, toShared, type Playlist, type Shared, type Track } from './logic';

export const WINDOW = 'sound.player';

export interface Player { current: Track | null; playing: boolean; load: number }
interface Box { p: Player; subs: Set<() => void>; upload: Dispose | null }
const boxes = new WeakMap<Ctx, Box>();
function box(ctx: Ctx): Box {
  let b = boxes.get(ctx);
  if (!b) boxes.set(ctx, (b = { p: { current: null, playing: false, load: 0 }, subs: new Set(), upload: null }));
  return b;
}

export const player = (ctx: Ctx): Player => box(ctx).p;

export function setPlayer(ctx: Ctx, patch: Partial<Player>): void {
  const b = box(ctx);
  b.p = { ...b.p, ...patch };
  b.subs.forEach((f) => f());
}

/** 이 곡을 처음부터 튼다. null이면 멈추고 플레이어를 내린다 */
export const play = (ctx: Ctx, t: Track | null): void => setPlayer(ctx, { current: t, playing: t !== null, load: player(ctx).load + 1 });

export function usePlayer(ctx: Ctx): Player {
  const sub = useCallback((fn: () => void) => {
    const b = box(ctx);
    b.subs.add(fn);
    return () => void b.subs.delete(fn);
  }, [ctx]);
  return useSyncExternalStore(sub, () => player(ctx));
}

/** 친구가 읽는 사본을 올린다 (SND-05..SND-07) */
export const upload = (ctx: Ctx): Promise<void> =>
  ctx.server.user().set('share', toShared(ctx.local.get<Playlist>('device'))).catch((e: Error) => ctx.log.warn(`플리 사본 올리기 실패: ${e.message}`));

/** 이 PC에 저장하고 1초 동안 더 바뀌지 않으면 사본을 올린다 */
// ponytail: 플리는 PC마다 두고 마지막에 고친 PC의 것을 올린다. 두 PC를 함께 쓰게 되면 서버 사본을 기준으로 바꾼다
export function savePlaylist(ctx: Ctx, next: Playlist): void {
  ctx.local.update<Playlist>('device', () => next);
  const b = box(ctx);
  b.upload?.();
  b.upload = ctx.timers.at(1000, () => {
    b.upload = null;
    void upload(ctx);
  });
}

export interface Friend { uid: string; name: string; level: number | null }
export interface Guest extends Friend { shared: Shared; preset: number }

/** 친구로 등록한 사람만 (10.14의 16번) */
export async function friends(ctx: Ctx): Promise<Friend[]> {
  const list = ctx.modules.get('friends')?.list() ?? [];
  return Promise.all(
    list.map(async ({ uid }) => {
      const p = await ctx.users.profile(uid).catch(() => null);
      return { uid, name: typeof p?.name === 'string' && p.name ? p.name : '이름 없음', level: levelOf(p) };
    }),
  );
}

/** 친구의 사본. 아직 올리지 않았거나 읽지 못하면 null */
export const loadShared = async (ctx: Ctx, uid: string): Promise<Shared | null> =>
  parseShared(await ctx.server.userOf(uid).get('share').catch(() => null), uid);

export async function openFriend(ctx: Ctx, f: Friend): Promise<Guest | null> {
  const shared = await loadShared(ctx, f.uid);
  return shared && { ...f, shared, preset: openPreset(shared) };
}

/** 파도타기 (SND-06). now는 지금 듣는 친구 목록 uid:프리셋 */
export async function surf(ctx: Ctx, now: string | null): Promise<Guest | null> {
  const all = await Promise.all((await friends(ctx)).map(async (f) => ({ ...f, shared: await loadShared(ctx, f.uid) })));
  const o = pickSurf(all, now, Math.random());
  const f = o && all.find((x) => x.uid === o.uid);
  return f?.shared ? { ...f, shared: f.shared, preset: o!.preset } : null;
}
