import { createElement, lazy, Suspense } from 'react';
import { z } from 'zod';
import { defineModule, NOT_IN_ROOM, type Dispose, type SlotProps } from '@core/types';
import type {} from '@modules/focus/api';
import type { GachaApi } from './api';
import { Cfg, entries, Got, HUE_UNLOCK_DEFAULT, Item, readCfg, readRec, Tomb } from './logic';
import { addSec, drawOnce, drawReason, flush, markRoomRemoved, onInventory, patch, setRoomRec, start, sync, view, type Local } from './state';
import { OwnerSection } from './ui/OwnerSection';

// 내 정보의 보관함 탭은 처음 열 때 불러온다. 보관함 창과 같은 파일을 나눠 쓴다
const InventoryWindow = lazy(() => import('./ui/InventoryWindow'));
const Box = (p: SlotProps) => createElement(Suspense, { fallback: createElement('p', null, '불러오는 중이에요.') }, createElement(InventoryWindow, p));

const Inventory = z.array(
  z.object({ key: z.string(), room: z.string(), itemId: z.string(), name: z.string(), file: z.string(), n: z.number(), at: z.number() }),
);
/** 보관함 사본과 서버가 아직 받지 않은 방 작업 초 */
const LocalData = z.object({ inv: Inventory, pending: z.record(z.string(), z.object({ sec: z.number().min(0), earned: z.number().min(0) })) });

export default defineModule<GachaApi>({
  id: 'gacha',
  title: '방 가챠',
  version: '0.1.0',
  specIds: ['OUR-02', 'GCH-01', 'GCH-02', 'GCH-03', 'GCH-04', 'GCH-05', 'GCH-07', 'GCH-08', 'AVT-20'],
  requires: ['rooms'],
  // 1로 두면 처음부터 색을 바꿀 수 있다 (GCH-05 메모)
  tunables: { hueUnlockCount: { schema: z.number().int().min(1).max(99), default: HUE_UNLOCK_DEFAULT } },
  // 보관함 사본은 서버 목록을 읽기 전과 오프라인에도 스티커가 그려지게 한다. v2에서 보내지 못한 방 작업 초를 더했다
  local: { account: { version: 2, schema: LocalData, initial: () => ({ inv: [], pending: {} }), migrate: [(inv) => ({ inv, pending: {} })] } },
  server: {
    version: 1,
    collections: {
      cfg: { scope: 'room', schema: Cfg, template: 'roomOwner', roomRetention: 'deleteWithRoom' },
      // 멤버 넣기는 rules.ts가 roomMember 조건을 더한다
      items: { scope: 'room', schema: Item, template: 'roomOwner', roomRetention: 'deleteWithRoom' },
      tomb: { scope: 'room', schema: Tomb, template: 'roomOwner', roomRetention: 'keep' },
      r: {
        scope: 'user',
        schema: z.object({ sec: z.number(), earned: z.number().min(0).optional(), spent: z.number(), bonus: z.number(), v: z.literal(1), got: z.record(z.string(), Got).optional() }),
        template: 'owner',
        merge: 'transaction',
      },
    },
  },
  ui: {
    windows: [
      { id: 'gacha.room', title: '가챠', width: 360, height: 540, focusable: true, component: () => import('./ui/RoomWindow') },
      { id: 'gacha.inventory', title: '보관함', width: 360, height: 480, component: () => import('./ui/InventoryWindow') },
    ],
    contributions: [
      { slot: 'menu.main', id: 'gacha.menu', label: '가챠', command: 'gacha.open', order: 41, needsRoom: true },
      { slot: 'menu.main', id: 'gacha.inventoryMenu', label: '보관함', command: 'gacha.inventory', order: 42 },
      { slot: 'rooms.settings', id: 'gacha.settings', label: '가챠', component: OwnerSection },
      // 런처 내 정보 화면의 보관함 탭 (SCR-03)
      { slot: 'account.box', id: 'gacha.box', label: '보관함', component: Box },
    ],
  },
  commands: [
    { id: 'gacha.open', enabledWhen: (ctx) => (ctx.room.current() ? null : NOT_IN_ROOM), run: (ctx) => ctx.ui.open('gacha.room') },
    { id: 'gacha.inventory', run: (ctx) => ctx.ui.open('gacha.inventory') },
    { id: 'gacha.draw', enabledWhen: drawReason, run: (ctx) => drawOnce(ctx) },
  ],
  setup(ctx) {
    start(ctx, ctx.local.get<Local>('account'));

    // 지금 방의 설정, 아이템, 내 기록을 구독한다
    let stops: Dispose[] = [];
    const onRoom = (code: string | null) => {
      stops.forEach((d) => d());
      stops = [];
      patch(ctx, { code, owner: false, cfg: readCfg(null), items: [], rec: readRec(null), pendingSec: 0, pendingEarned: 0 });
      if (!code) return;
      ctx.room.owner(code).then(
        (o) => ctx.room.current() === code && patch(ctx, { owner: o === ctx.self.uid() }),
        (e: Error) => ctx.log.warn(`방 주인 확인 실패: ${e.message}`),
      );
      const room = ctx.server.room(code);
      stops = [
        room.watch('cfg', (v) => patch(ctx, { cfg: readCfg(v) })),
        room.watch('items', (v) => patch(ctx, { items: entries(v) })),
        ctx.server.user(['r']).watch(code, (v) => setRoomRec(ctx, code, readRec(v))),
      ];
    };
    ctx.room.onChange(onRoom);
    onRoom(ctx.room.current());

    // 방에 들어가 있는 동안의 포커스 초. 다른 멤버가 없어도 센다 (9.3 OUR-02)
    ctx.bus.on('focus.tick', ({ sec }) => {
      const code = ctx.room.current();
      if (code) addSec(ctx, code, sec);
    });
    // 1분마다 보낸다. 보내기 전에 PC에 남기므로 끊긴 채 꺼져도 다음 실행이 보낸다. 갑자기 꺼지면 마지막 1분 안쪽은 잃는다
    ctx.timers.every(60_000, () => void flush(ctx));
    ctx.lifecycle.on((e) => {
      if (e.type === 'suspend' || e.type === 'shutdown') void flush(ctx);
      // stickers가 setup을 마친 뒤에 gacha.revoked를 받도록 ready에서 맞춘다. 지난 실행에 보내지 못한 초도 이때 보낸다
      if (e.type === 'ready') {
        sync(ctx).catch((err: Error) => ctx.log.warn(`보관함 동기화 실패: ${err.message}`));
        void flush(ctx);
      }
    });
    ctx.room.beforeRemove((code) => markRoomRemoved(ctx, code));

    return { inventory: () => view(ctx).inventory, onInventory: (fn) => onInventory(ctx, fn), hueNeed: () => ctx.tunables.get<number>('hueUnlockCount') };
  },
});
