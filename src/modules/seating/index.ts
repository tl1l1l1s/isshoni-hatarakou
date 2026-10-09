import { z } from 'zod';
import { defineModule, type Ctx } from '@core/types';
import { BENCH_SEATS } from '@modules/wardrobe/api';
import type { Appearance } from '@shared/schemas';
import { benchReason, layoutOf, mineOf, rideTarget } from './logic';
import Chip from './ui/Chip';

// seat.menu 명령은 args로 { uid, name }을 받는다
const target = (args: unknown) => z.object({ uid: z.string() }).safeParse(args).data?.uid ?? '';
const uid = z.string().max(128).nullable();

const me = (ctx: Ctx) => mineOf(ctx.room.members().find((s) => s.self));
const capOf = (a: Appearance) => BENCH_SEATS[a.slots.desk?.[0]?.item ?? ''] ?? 0;
const ride = (ctx: Ctx, args: unknown) => {
  if (ctx.modules.get('wardrobe')?.appearance().body !== 'animal') return { reason: '동물 캐릭터만 머리 위에 올라탈 수 있어요.' };
  return rideTarget(ctx.room.members(), ctx.self.uid(), target(args));
};

// 올라타기와 동물탑, 벤치. 붙임 상태는 presence로 보내고 모든 PC가 같은 배치를 그린다 (10.8.2 좌석 계층)
export default defineModule({
  id: 'seating',
  title: '자리',
  version: '0.1.0',
  specIds: ['COM-16', 'HOM-17', 'AVT-21'],
  requires: ['wardrobe'],
  presence: {
    on: { schema: uid, sync: 'onChange' },
    bench: { schema: uid, sync: 'onChange' },
    cap: { schema: z.number().int().min(0).max(3), sync: 'onChange' },
  },
  ui: {
    contributions: [
      { slot: 'seat.menu', id: 'seating.ride', label: '머리 위에 올라타기', command: 'seating.ride' },
      { slot: 'seat.menu', id: 'seating.sit', label: '벤치에 같이 앉기', command: 'seating.sit' },
      { slot: 'chip.buttons', id: 'seating.chip', label: '내려오기', component: Chip },
    ],
  },
  commands: [
    {
      id: 'seating.ride',
      enabledWhen: (ctx, args) => {
        const r = ride(ctx, args);
        return 'reason' in r ? r.reason : null;
      },
      run: (ctx, args) => {
        const r = ride(ctx, args);
        if ('reason' in r) throw new Error(r.reason);
        ctx.room.setMine({ on: r.seat.uid });
      },
    },
    { id: 'seating.down', enabledWhen: (ctx) => (me(ctx).on ? null : '올라타 있지 않아요.'), run: (ctx) => ctx.room.setMine({ on: null }) },
    {
      id: 'seating.sit',
      enabledWhen: (ctx, args) => benchReason(ctx.room.members(), ctx.self.uid(), target(args)),
      run: (ctx, args) => ctx.room.setMine({ bench: target(args) }),
    },
    { id: 'seating.stand', enabledWhen: (ctx) => (me(ctx).bench ? null : '벤치에 앉아 있지 않아요.'), run: (ctx) => ctx.room.setMine({ bench: null }) },
  ],
  setup(ctx) {
    const wardrobe = ctx.modules.get('wardrobe')!;
    ctx.room.setMine({ on: null, bench: null, cap: capOf(wardrobe.appearance()) });
    // 동물이 아니게 되면 내려온다. 내 책상이 벤치인지는 바뀔 때마다 알린다
    wardrobe.onChange((a) => ctx.room.setMine({ cap: capOf(a), ...(a.body !== 'animal' && { on: null }) }));
    // 다른 방으로 옮기면 올라타기와 벤치를 푼다. 절전 뒤나 기기를 가져온 뒤 같은 방에 다시 들어가면 그대로 둔다
    let code = ctx.room.current();
    ctx.room.onChange((c) => {
      if (!c || c === code) return;
      code = c;
      ctx.room.setMine({ on: null, bench: null });
    });

    // 멤버 기록이 바뀔 때마다 배치를 다시 계산하고 바뀐 좌석만 코어에 알린다
    let applied: ReturnType<typeof layoutOf> = { attach: {}, bench: {} };
    ctx.room.onMembers((members) => {
      const next = layoutOf(members);
      for (const k of new Set([...Object.keys(applied.attach), ...Object.keys(next.attach)])) {
        if (applied.attach[k] !== next.attach[k]) ctx.seats.attach(k, next.attach[k] ?? null);
      }
      for (const k of new Set([...Object.keys(applied.bench), ...Object.keys(next.bench)])) {
        if (applied.bench[k] !== next.bench[k]) ctx.seats.setBench(k, next.bench[k] ?? null);
      }
      applied = next;
    });
  },
});
