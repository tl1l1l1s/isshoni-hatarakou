import { z } from 'zod';
import { defineModule } from '@core/types';
import { Sha256 } from '@shared/schemas';
import { Cfg, DAILY_CAP_MAX, Pose, Shot, Slot } from './logic';
import { createInbox } from './state';
import ChatButton from './ui/ChatButton';

// 스티커 사진: 방 사람들이 자리를 잡고 함께 찍은 뒤 펜과 스티커로 꾸며 내 컴퓨터에 저장한다 (COM-15)
export default defineModule({
  id: 'photo',
  title: '스티커 사진',
  version: '0.2.0',
  specIds: ['COM-15'],
  // 촬영 세션은 사진 창이 열려 있는 동안만 구독한다. 자세는 바뀔 때만 초당 10번까지 보낸다
  server: {
    version: 1,
    collections: {
      slots: { scope: 'room', schema: Slot, template: 'roomMember', roomRetention: 'deleteWithRoom' },
      cfg: { scope: 'room', schema: Cfg, template: 'roomMember', roomRetention: 'deleteWithRoom' },
      p: { scope: 'room', schema: Pose, template: 'roomMember', roomRetention: 'deleteWithRoom', rate: { perSec: 10, burst: 10 } },
      shots: { scope: 'room', schema: Shot, template: 'roomMember', roomRetention: 'deleteWithRoom' },
      quota: { scope: 'global', schema: z.object({ d: z.number(), n: z.number() }), template: 'dailyQuota' },
    },
  },
  // 서비스 전체의 하루 촬영 횟수. 0이면 세지 않는다 (친구 두세 명이면 서버 비용 걱정이 적다)
  tunables: { photoDailyCap: { schema: z.number().int().min(0).max(DAILY_CAP_MAX), default: 0 } },
  roomEvents: {
    // 꾸민 사진을 방 사람들에게 보낸다. 사진은 64KB 안으로 줄여 files에 올리고 이벤트에는 해시만 담는다
    shared: { schema: z.object({ file: Sha256 }), perMinute: 6 },
    // 처음 자리를 잡은 사람이 방 사람들에게 함께 찍자고 알린다
    invite: { schema: z.object({}), perMinute: 2 },
  },
  ui: {
    windows: [{ id: 'photo.main', title: '스티커 사진', width: 620, height: 820, focusable: true, component: () => import('./ui/PhotoWindow') }],
    contributions: [
      { slot: 'menu.main', id: 'photo.open', label: '스티커 사진', command: 'photo.open', order: 40, quiet: 'hide' },
      { slot: 'chat.toolbar', id: 'photo.chatButton', label: '스티커 사진', component: ChatButton, quiet: 'hide' },
    ],
  },
  commands: [{ id: 'photo.open', quiet: 'block', run: (ctx) => ctx.ui.open('photo.main') }],
  setup(ctx) {
    // 회사원 모드로 바뀌면 열린 사진 창을 닫는다 (SET-03)
    ctx.mode.on((m) => m === 'quiet' && ctx.ui.close('photo.main'));
    const inbox = createInbox(ctx);
    const nameOf = (uid: string) => ctx.room.members().find((s) => s.uid === uid)?.name || '방 친구';
    // 알림을 누르면 명령으로 열어서 회사원 모드에서는 열지 않는다
    const open = () => void ctx.commands.run('photo.open').catch((e: Error) => ctx.ui.toast(e.message));
    ctx.room.onEvent<{ file: string }>('shared', (e) => {
      if (e.self) return;
      const from = nameOf(e.uid);
      inbox.add({ from, file: e.payload.file, at: e.at });
      ctx.ui.toast(`${from}님이 스티커 사진을 보냈어요.`);
      ctx.notify({ title: '스티커 사진', body: `${from}님이 스티커 사진을 보냈어요.`, onClick: open });
    });
    ctx.room.onEvent('invite', (e) => {
      if (e.self || inbox.shooting() || ctx.mode.get() === 'quiet') return;
      const text = `${nameOf(e.uid)}님이 스티커 사진을 같이 찍자고 해요.`;
      ctx.ui.toast(text);
      ctx.notify({ title: '스티커 사진', body: text, onClick: open });
    });
  },
});
