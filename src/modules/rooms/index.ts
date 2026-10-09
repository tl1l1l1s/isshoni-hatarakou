import { z } from 'zod';
import { ROOM_CAP_MAX, ROOM_CAP_MIN } from '@shared/constants';
import { defineModule, type Dispose } from '@core/types';
import type { RoomsApi } from './api';
import { forget, Local, mustLeave, remember } from './logic';
import { info, joinRoom, leaveRoom, publish } from './state';
import { RoomCard, RoomChip } from './ui/slots';

const NOT_IN_ROOM = '방에 들어가 있지 않습니다.';

export default defineModule<RoomsApi>({
  id: 'rooms',
  title: '워킹룸',
  version: '0.1.0',
  specIds: ['ROM-01', 'ROM-04', 'ROM-05', 'ROM-06', 'ROM-08', 'OUR-01'],
  settings: {
    version: 1,
    scope: 'account',
    schema: z.object({ autoRejoin: z.boolean().default(true) }),
    fields: { autoRejoin: { label: '앱을 켤 때 마지막 방에 다시 들어가기' } },
  },
  local: { account: { version: 1, schema: Local, initial: () => ({ lastRoom: null, recent: [] }) } },
  // 지금 있는 방 코드. 친구만 읽어 친구 목록에서 따라 들어간다 (혼자면 null)
  accountPresence: { code: z.string().nullable() },
  server: {
    version: 1,
    collections: {
      cfg: {
        scope: 'room',
        schema: z.object({ cap: z.number().int().min(ROOM_CAP_MIN).max(ROOM_CAP_MAX), v: z.literal(1) }),
        template: 'roomOwner',
        roomRetention: 'deleteWithRoom',
      },
    },
  },
  ui: {
    windows: [
      { id: 'rooms.join', title: '방 만들기 / 참여하기', width: 340, height: 420, focusable: true, component: () => import('./ui/JoinWindow') },
      { id: 'rooms.settings', title: '방 설정', width: 340, height: 420, focusable: true, component: () => import('./ui/SettingsWindow') },
    ],
    contributions: [
      { slot: 'menu.main', id: 'rooms.menu', label: '방 만들기 / 참여하기', command: 'rooms.open', order: 10 },
      { slot: 'chip.buttons', id: 'rooms.chip', label: '방 코드', component: RoomChip },
      { slot: 'launcher.cards', id: 'rooms.card', label: '워킹룸', component: RoomCard, order: 10 },
    ],
  },
  commands: [
    { id: 'rooms.open', run: (ctx) => ctx.ui.open('rooms.join') },
    { id: 'rooms.leave', enabledWhen: (ctx) => (ctx.room.current() ? null : NOT_IN_ROOM), run: (ctx) => leaveRoom(ctx) },
    {
      id: 'rooms.remove',
      // 확인은 방 설정 창이 받는다
      enabledWhen: (ctx) => (!info(ctx).code ? NOT_IN_ROOM : info(ctx).owner ? null : '방 주인만 지울 수 있습니다.'),
      run: async (ctx) => {
        const code = info(ctx).code!;
        await ctx.room.remove(code);
        ctx.local.update<Local>('account', (s) => forget(s, code));
        ctx.ui.toast('방을 지웠습니다.');
      },
    },
  ],
  setup(ctx) {
    let stopCfg: Dispose | null = null;

    // 정원 확인 (OUR-01). 서버는 정원을 보지 않으므로 늦게 들어온 쪽의 앱이 스스로 나간다
    const check = () => {
      const r = info(ctx);
      if (!r.code || ctx.room.current() !== r.code || !mustLeave(ctx.room.members(), r.cap)) return;
      void leaveRoom(ctx);
      ctx.ui.toast(`정원 ${r.cap}명이 차서 방에서 나왔습니다.`);
    };

    ctx.room.onChange((code) => {
      stopCfg?.();
      stopCfg = null;
      ctx.self.setPresence({ code });
      publish(ctx, { code, owner: false, cap: ROOM_CAP_MAX, count: ctx.room.members().length });
      if (!code) return;
      ctx.local.update<Local>('account', (s) => remember(s, code));
      ctx.room
        .owner(code)
        .then((o) => ctx.room.current() === code && publish(ctx, { owner: o === ctx.self.uid() }))
        .catch((e: Error) => ctx.log.warn(`방 주인 확인 실패: ${e.message}`));
      stopCfg = ctx.server.room(code).watch<{ cap: number }>('cfg', (v) => {
        publish(ctx, { cap: v?.cap ?? ROOM_CAP_MAX });
        check();
      });
    });
    ctx.room.onMembers((seats) => {
      if (seats.length !== info(ctx).count) publish(ctx, { count: seats.length });
      check();
    });

    // 자동 재입장 (ROM-04). 모든 모듈의 beforeJoin이 등록된 뒤(ready)에 들어간다
    ctx.lifecycle.on((e) => {
      if (e.type !== 'ready') return;
      const { lastRoom } = ctx.local.get<Local>('account');
      if (!lastRoom || ctx.room.current() || !ctx.settings.get<{ autoRejoin: boolean }>().autoRejoin) return;
      void joinRoom(ctx, lastRoom).then((err) => err && ctx.ui.toast(err));
    });

    return { current: () => info(ctx).code, isOwner: () => info(ctx).owner };
  },
});
