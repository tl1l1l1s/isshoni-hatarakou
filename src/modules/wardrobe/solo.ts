// 혼자 모드 자리 추가 (AVT-22). 고른 다른 캐릭터 슬롯을 내 옆 로컬 좌석으로 앉히고 방에 들어가면 숨긴다
import { z } from 'zod';
import type { Ctx } from '@core/types';
import type { Appearance } from '@shared/schemas';
import { SLOT_COUNT, type Local } from './logic';
import type { Wardrobe } from './state';

/** 이 PC의 자리 추가 설정. row는 앉은 슬롯을 왼쪽부터 적은 순서이고 지금 슬롯이 없으면 맨 앞에 앉는다 */
export const Solo = z.object({ row: z.array(z.number().int().min(0).max(SLOT_COUNT - 1)).max(SLOT_COUNT) });
export type Solo = z.infer<typeof Solo>;
export const initialSolo = (): Solo => ({ row: [] });

export const soloKey = (i: number) => `wardrobe.solo.${i}`;

/** 지금 슬롯을 넣은 앉는 순서 */
export const fullRow = (row: number[], active: number): number[] => (row.includes(active) ? row : [active, ...row]);

/** 로컬 좌석으로 앉힐 슬롯과 좌석 순서 힌트. 방 안이면 비운다. 한 번도 저장하지 않은 슬롯은 앉히지 않는다 */
export function soloSeats(l: Local, row: number[], inRoom: boolean, myKey: string): { add: number[]; order: string[] } {
  if (inRoom) return { add: [], order: [] };
  const add = row.filter((i) => i !== l.active && l.chars[i]!.mtime > 0);
  const order = fullRow(row, l.active).flatMap((i) => (i === l.active ? [myKey] : add.includes(i) ? [soloKey(i)] : []));
  return { add, order };
}

const syncs = new WeakMap<Ctx, () => void>();

/** 설정을 바꾼 뒤 좌석을 다시 맞춘다 */
export function setSoloRow(ctx: Ctx, row: number[]) {
  ctx.local.update<Solo>('device', () => Solo.parse({ row }));
  syncs.get(ctx)?.();
}

/** 슬롯, 방, 설정이 바뀔 때마다 로컬 좌석을 맞춘다. 외형이 그대로인 좌석은 다시 넣지 않는다 */
export function startSolo(ctx: Ctx, w: Wardrobe) {
  let shown = new Map<number, Appearance>();
  const sync = () => {
    const l = w.local();
    const { add, order } = soloSeats(l, ctx.local.get<Solo>('device').row, ctx.room.current() !== null, `${ctx.self.uid()}_${ctx.self.deviceId()}`);
    for (const i of shown.keys()) if (!add.includes(i)) ctx.seats.removeLocal(soloKey(i));
    for (const i of add) {
      const a = l.chars[i]!.appearance;
      if (shown.get(i) !== a) ctx.seats.addLocal({ key: soloKey(i), appearance: a, name: `캐릭터 ${i + 1}` });
    }
    shown = new Map(add.map((i) => [i, l.chars[i]!.appearance]));
    ctx.seats.setOrder(order);
  };
  syncs.set(ctx, sync);
  w.subscribe(sync);
  ctx.room.onChange(() => sync());
  sync();
}
