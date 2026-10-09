import { useEffect, useState } from 'react';
import type { Ctx } from '@core/types';
import type { InventoryItem } from '../api';
import { entries, kinds, type Entry } from '../logic';
import { sync, useGacha } from '../state';
import { Pic } from './parts';
import css from './gacha.module.css';

/** 여러 방에서 뽑은 내 아이템 (GCH-01). 열 때 함께 지우기 표시를 확인하고 방마다 몇 종 모았는지 센다 (GCH-06) */
export default function InventoryWindow({ ctx }: { ctx: Ctx }) {
  const { inventory } = useGacha(ctx);
  // 방 코드별 지금 아이템 목록. 읽지 못하면 null
  const [roomItems, setRoomItems] = useState<Record<string, Entry[] | null>>({});
  const codes = [...new Set(inventory.map((i) => i.room))].join(' ');
  useEffect(() => {
    sync(ctx).catch((e: Error) => ctx.log.warn(`보관함 동기화 실패: ${e.message}`));
  }, [ctx]);
  useEffect(() => {
    let alive = true;
    for (const code of codes.split(' ').filter(Boolean)) {
      ctx.server.room(code).get('items').then(
        (v) => alive && setRoomItems((m) => ({ ...m, [code]: entries(v) })),
        () => alive && setRoomItems((m) => ({ ...m, [code]: null })),
      );
    }
    return () => void (alive = false);
  }, [ctx, codes]);

  const need = ctx.tunables.get<number>('hueUnlockCount');
  if (!inventory.length) return <p>아직 뽑은 아이템이 없습니다. 방에서 작업한 시간으로 그 방의 가챠를 뽑을 수 있습니다.</p>;
  const rooms = new Map<string, InventoryItem[]>();
  for (const i of inventory) rooms.set(i.room, [...(rooms.get(i.room) ?? []), i]);
  return (
    <div>
      {need > 1 && <p className={css.muted}>같은 아이템을 {need}개 모으면 꾸미기에서 색을 바꿀 수 있어요.</p>}
      {[...rooms].map(([room, items]) => (
        <section key={room}>
          <h4>
            {room} 방 <span className={css.muted}>{kinds(items, roomItems[room])}</span>
          </h4>
          <div className={css.grid}>
            {items.map((i) => (
              <div key={i.key} className={css.card}>
                <Pic ctx={ctx} file={i.file} />
                <span>{i.name}</span>
                <span className={css.muted}>{i.n}개</span>
                <span className={css.hue}>{i.n >= need ? '색 바꾸기 가능' : `색 ${i.n}/${need}`}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
