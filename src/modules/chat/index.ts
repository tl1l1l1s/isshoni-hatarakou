import { z } from 'zod';
import { defineModule } from '@core/types';
import { Sha256 } from '@shared/schemas';
import { BUBBLE_PRIORITY } from '@modules/status/api';
import type { ChatApi } from './api';
import { EMOJI_MS, EMOJIS, FONT_SIZES, FontSize, Local, Mine, Msg } from './logic';
import { CHAT_OFF, emojis, flash, intercept, loadMine, NOT_IN_ROOM, says, view, watchRoom, WINDOW } from './state';
import { ChatChip, ChatSetting } from './ui/slots';

/** 방 채팅. 방 주인이 방 설정에서 켜고 끈다 (ROM-02) */
export default defineModule<ChatApi>({
  id: 'chat',
  title: '대화하기',
  version: '0.1.0',
  specIds: ['ROM-02', 'COM-01', 'COM-02', 'COM-08', 'COM-09', 'COM-18', 'COM-04', 'SET-08'],
  // 대화하기 창 이름 옆 프로필 사진
  optionalRequires: ['account'],
  // 대화하기 창 글자 크기 (COM-04, SET-08). 창 안과 설정 창 일반 탭에서 고른다
  settings: { version: 1, scope: 'device', schema: z.object({ fontSize: FontSize.default('m') }), fields: { fontSize: { label: '채팅 글자 크기', options: FONT_SIZES } } },
  profile: { emo: Mine },
  local: { account: { version: 1, schema: Local, initial: () => ({ read: {} }) } },
  server: {
    version: 1,
    collections: {
      msgs: { scope: 'room', schema: Msg, template: 'appendOnly', roomRetention: 'deleteWithRoom', rate: { perSec: 2, burst: 8 } },
      cfg: { scope: 'room', schema: z.object({ on: z.boolean(), v: z.literal(1) }), template: 'roomOwner', roomRetention: 'deleteWithRoom' },
    },
  },
  roomEvents: { emoji: { schema: z.object({ e: z.enum(EMOJIS) }), perMinute: 20 }, custom: { schema: z.object({ h: Sha256 }), perMinute: 20 } },
  // 이모티콘이 채팅 글보다 위에 보인다
  bubbles: [
    {
      id: 'chat.emoji',
      priority: BUBBLE_PRIORITY.chat + 1,
      text: (seat) => {
        const e = emojis.get(seat.uid);
        return e?.image ? { image: e.image } : (e?.text ?? null);
      },
    },
    { id: 'chat.say', priority: BUBBLE_PRIORITY.chat, text: (seat) => says.get(seat.uid)?.text ?? null },
  ],
  ui: {
    windows: [
      { id: WINDOW, title: '대화하기', width: 360, height: 480, focusable: true, component: () => import('./ui/ChatWindow') },
      { id: 'chat.emoji', title: '이모티콘', width: 260, height: 260, component: () => import('./ui/EmojiWindow') },
    ],
    contributions: [
      { slot: 'menu.main', id: 'chat.menu', label: '대화하기', command: 'chat.open', order: 20 },
      { slot: 'menu.main', id: 'chat.emojiMenu', label: '이모티콘', command: 'chat.emoji', order: 21 },
      { slot: 'chip.buttons', id: 'chat.chip', label: '대화하기', component: ChatChip },
      { slot: 'rooms.settings', id: 'chat.setting', label: '채팅 켜기', component: ChatSetting },
    ],
  },
  commands: [
    { id: 'chat.open', enabledWhen: (ctx) => (!view(ctx).code ? NOT_IN_ROOM : view(ctx).on ? null : CHAT_OFF), run: (ctx) => ctx.ui.open(WINDOW) },
    { id: 'chat.emoji', enabledWhen: (ctx) => (view(ctx).code ? null : NOT_IN_ROOM), run: (ctx) => ctx.ui.open('chat.emoji') },
  ],
  setup(ctx) {
    watchRoom(ctx);
    ctx.room.onEvent<{ e: string }>('emoji', (ev) => flash(ctx, emojis, ev.uid, ev.payload.e, EMOJI_MS));
    ctx.room.onEvent<{ h: string }>('custom', (ev) => flash(ctx, emojis, ev.uid, '', EMOJI_MS, ev.payload.h));
    loadMine(ctx).catch((e: Error) => ctx.log.warn(`내 이모티콘 읽기 실패: ${e.message}`));
    return { intercept: (fn) => intercept(ctx, fn) };
  },
});
