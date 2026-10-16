import { defineModule } from '@core/types';
import { Part, Session } from './logic';
import { seatBubble, watch, WIN } from './state';
import Chip from './ui/Chip';

// 같이 작업하기 (ROM-15). 방 사람들이 같은 시각에 집중을 시작하고 같이 쉰다. 포커스 기록과 경험치에는 영향을 주지 않는다
export default defineModule({
  id: 'cowork',
  title: '같이 작업하기',
  version: '0.1.0',
  specIds: ['ROM-15'],
  // 개인 뽀모도로와 겹치지 않게 하고 방 주인도 세션을 끝내게 한다
  optionalRequires: ['pomodoro', 'rooms'],
  server: {
    version: 1,
    collections: {
      cur: { scope: 'room', schema: Session, template: 'roomMember', roomRetention: 'deleteWithRoom' },
      parts: { scope: 'room', schema: Part, template: 'roomMember', roomRetention: 'deleteWithRoom' },
    },
  },
  // 고른 상태 글(200)보다 낮고 개인 뽀모도로(150)보다 높다
  bubbles: [{ id: 'cowork.left', priority: 160, text: (seat, ctx) => seatBubble(ctx, seat.uid) }],
  ui: {
    windows: [{ id: WIN, title: '같이 작업하기', width: 340, height: 520, component: () => import('./ui/SessionWindow') }],
    contributions: [
      { slot: 'menu.main', id: 'cowork.menu', label: '같이 작업하기', command: 'cowork.open', order: 20.5, needsRoom: true },
      { slot: 'chip.buttons', id: 'cowork.chip', label: '같이 작업', component: Chip, order: 12, quiet: 'hide' },
    ],
  },
  commands: [{ id: 'cowork.open', run: (ctx) => ctx.ui.open(WIN) }],
  setup(ctx) {
    watch(ctx);
  },
});
