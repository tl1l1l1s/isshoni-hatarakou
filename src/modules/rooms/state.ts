// 방 상태와 동작. 상태는 ctx마다 따로 두어 시험에서 앱 여러 개를 한 프로세스에 띄워도 섞이지 않는다
import { useCallback, useSyncExternalStore } from 'react';
import { ROOM_CAP_MAX } from '@shared/constants';
import type { Ctx } from '@core/types';
import type { RoomInfo } from './api';
import { forget, type Local } from './logic';

const SOLO: RoomInfo = { code: null, owner: false, cap: ROOM_CAP_MAX, count: 1 };
const infos = new WeakMap<Ctx, RoomInfo>();

export const info = (ctx: Ctx): RoomInfo => infos.get(ctx) ?? SOLO;

export function publish(ctx: Ctx, patch: Partial<RoomInfo>): void {
  const next = { ...info(ctx), ...patch };
  infos.set(ctx, next);
  ctx.bus.emit('rooms.changed', next);
}

export function useRoom(ctx: Ctx): RoomInfo {
  const sub = useCallback((fn: () => void) => ctx.bus.on('rooms.changed', fn), [ctx]);
  return useSyncExternalStore(sub, () => info(ctx));
}

/** 들어가지 못하면 이유. 지운 방이나 없는 방이면 최근 목록에서 뺀다 */
export async function joinRoom(ctx: Ctx, code: string): Promise<string | null> {
  const r = await ctx.room.join(code);
  if (r.ok) return null;
  if (r.kind === 'gone' || r.kind === 'missing') ctx.local.update<Local>('account', (s) => forget(s, code));
  return r.reason;
}

/** 방을 만들고 들어간 뒤 정원을 쓴다. cfg는 roster에 든 뒤에 써야 메모리 서버도 받아 준다 */
export async function createRoom(ctx: Ctx, cap: number): Promise<string | null> {
  try {
    const code = await ctx.room.create();
    const err = await joinRoom(ctx, code);
    if (!err) await ctx.server.room(code).set('cfg', { cap, v: 1 });
    return err;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 스스로 나가면 다음에 켤 때 다시 들어가지 않는다 */
export function leaveRoom(ctx: Ctx): Promise<void> {
  ctx.local.update<Local>('account', (s) => ({ ...s, lastRoom: null }));
  return ctx.room.leave();
}
