import { defineModule } from '@core/types';
import { Local, Pic, seatPic, toPresence } from './logic';
import Tab from './ui/Tab';

export default defineModule({
  id: 'awaypic',
  title: '자리비움 그림',
  version: '0.1.0',
  specIds: ['CHR-07'],
  // ponytail: 고른 그림은 이 PC에만 기억한다. 다시 설치해도 남겨야 하면 서버 사용자 기록으로 옮긴다
  local: { account: { version: 1, schema: Local, initial: () => ({ file: null, size: 80 }) } },
  // 방 사람들도 그림을 보도록 좌석 기록에 싣는다. status의 상태 글(최대 60바이트)과 합치면 128바이트를 넘어서 모듈을 나눴다
  presence: { pic: { schema: Pic.nullable(), sync: 'onChange', minIntervalMs: 3_000 } },
  seatImages: [{ id: 'awaypic.pic', priority: 100, image: (seat, ctx) => seatPic(seat, ctx.mode.get() === 'quiet') }],
  ui: {
    contributions: [
      { slot: 'settings.tabs', id: 'awaypic.tab', label: '자리비움 그림', component: Tab, order: 30 },
      // 런처 내 정보 화면의 자리비움 그림 칸 (SCR-03)
      { slot: 'account.away', id: 'awaypic.me', label: '자리비움 그림', component: Tab },
    ],
  },
  commands: [
    {
      id: 'awaypic.set',
      run: (ctx, args) => {
        const next = Local.parse(args);
        ctx.local.update<Local>('account', () => next);
        ctx.room.setMine({ pic: toPresence(next) });
      },
    },
  ],
  setup(ctx) {
    ctx.room.setMine({ pic: toPresence(ctx.local.get<Local>('account')) });
  },
});
