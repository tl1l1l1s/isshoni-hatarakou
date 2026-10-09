import { z } from 'zod';
import { defineModule, type Ctx } from '@core/types';
import type {} from '@modules/chat/api';
import { BUBBLE_PRIORITY } from '@modules/status/api';
import { PLAY_LEVELS } from './api';
import { effects } from './effects';
import { Aim, Dance, FlyText, initialLocal, Local, Pet, Roll } from './logic';
import { bomb, dance, danceWait, headText, hit, listen, NOT_IN_ROOM, onChatText, react, roll, rollWait, stopAll, targetOf } from './state';
import FlyBar from './ui/FlyBar';

const level = (gte: number, label: string) => ({ requires: { module: 'growth', key: 'level', gte }, sticky: true, label });
const inRoom = (ctx: Ctx) => (ctx.room.current() ? null : NOT_IN_ROOM);
const someone = (ctx: Ctx, args: unknown) => (targetOf(ctx, args) ? null : '방에 있는 사람에게만 할 수 있어요.');

/** 방 안 놀이: 춤, 때리기, 폭탄, 러시안룰렛, 깜짝쇼, 쓰다듬기, 채팅 날리기 */
export default defineModule({
  id: 'play',
  title: '놀이',
  version: '0.1.0',
  specIds: ['COM-05', 'COM-10', 'COM-11', 'COM-13', 'COM-14', 'COM-17', 'CHR-11'],
  optionalRequires: ['growth', 'chat'],
  settings: {
    version: 1,
    scope: 'device',
    schema: z.object({ reactions: z.boolean().default(true) }),
    fields: { reactions: { label: '머리 위 반응 보이기 (하트, 어지러움)', widget: 'toggle' } },
  },
  local: { account: { version: 1, schema: Local, initial: initialLocal } },
  roomEvents: {
    dance: { schema: Dance, perMinute: 20 },
    roll: { schema: Roll, perMinute: 10 },
    hit: { schema: Aim, perMinute: 30 },
    bomb: { schema: Aim, perMinute: 20 },
    pet: { schema: Pet, perMinute: 30 },
    shake: { schema: Pet, perMinute: 30 },
    text: { schema: FlyText, perMinute: 20 },
  },
  // 레벨 보상 (GRW-02). 한 번 열리면 회차가 넘어가도 열려 있다
  gates: {
    'play.dance': level(PLAY_LEVELS.dance, '춤추기'),
    'play.bomb': level(PLAY_LEVELS.bomb, '폭탄'),
    'play.dance2': level(PLAY_LEVELS.dance2, '회전 춤'),
    'play.flyColor': level(PLAY_LEVELS.flyColor, '채팅 날리기 글자 색'),
  },
  effects,
  // 반응과 주사위는 채팅보다 위에 보인다. 잠 반응 z는 잠든 자세 그림에 들어 있다 (CHR-05). 내 다른 캐릭터 좌석에도 띄운다
  bubbles: [{ id: 'play.head', priority: BUBBLE_PRIORITY.chat + 50, local: true, text: (seat, ctx) => headText(ctx, seat.key) }],
  ui: {
    contributions: [
      { slot: 'menu.main', id: 'play.danceMenu', label: '춤추기', command: 'play.dance', order: 40, gate: 'play.dance' },
      { slot: 'menu.main', id: 'play.rollMenu', label: '러시안룰렛', command: 'play.roll', order: 41 },
      { slot: 'seat.menu', id: 'play.petMenu', label: '쓰다듬기', command: 'play.pet', order: 30 },
      // 캐릭터를 짧게 누르면 쓰다듬고 누른 채로 흔들면 어지러워한다 (CHR-11)
      { slot: 'seat.click', id: 'play.petClick', label: '쓰다듬기', command: 'play.pet' },
      { slot: 'seat.shake', id: 'play.shakeHold', label: '흔들기', command: 'play.shake' },
      { slot: 'seat.menu', id: 'play.hitMenu', label: '때리기', command: 'play.hit', order: 31 },
      { slot: 'seat.menu', id: 'play.bombMenu', label: '폭탄 던지기', command: 'play.bomb', order: 32, gate: 'play.bomb' },
      { slot: 'chat.toolbar', id: 'play.flyBar', label: '날리기', component: FlyBar },
    ],
  },
  commands: [
    { id: 'play.dance', gate: 'play.dance', enabledWhen: danceWait, run: (ctx, args) => dance(ctx, 80, args) },
    { id: 'play.dance2', gate: 'play.dance2', enabledWhen: danceWait, run: (ctx, args) => dance(ctx, 150, args) },
    { id: 'play.roll', quiet: 'block', enabledWhen: rollWait, run: roll },
    { id: 'play.pet', run: (ctx, args) => react(ctx, 'pet', args) },
    { id: 'play.shake', run: (ctx, args) => react(ctx, 'shake', args) },
    { id: 'play.hit', enabledWhen: someone, run: hit },
    { id: 'play.bomb', gate: 'play.bomb', quiet: 'block', enabledWhen: (ctx, args) => (args ? someone(ctx, args) : inRoom(ctx)), run: bomb },
  ],
  setup(ctx) {
    listen(ctx);
    // 반응을 끄거나 조용한 모드로 바뀌면 떠 있는 반응을 바로 숨긴다
    ctx.settings.onChange(() => ctx.seats.refresh());
    ctx.mode.on((m) => {
      if (m !== 'normal') stopAll(ctx);
      ctx.seats.refresh();
    });
    ctx.modules.get('chat')?.intercept((text) => onChatText(ctx, text));
  },
});
