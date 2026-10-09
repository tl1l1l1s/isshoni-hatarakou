import { z } from 'zod';
import { defineModule } from '@core/types';
import type { HomeApi } from './api';
import { Book, Gift, Home, Local, Mark } from './logic';
import { addTab, openHome, watchInbox } from './state';

const VisitArgs = z.object({ uid: z.string().min(1), name: z.string().default('') });

// 마이홈: 프로필, 배경음악, 게시글, 바탕화면, 색과 창 바탕, 스티커, 방명록, 친구 방문, 북마크, 말랑이와 말랑이 선물, 웹박수
export default defineModule<HomeApi>({
  id: 'home',
  title: '마이홈',
  version: '0.1.0',
  specIds: ['HOM-01', 'HOM-02', 'HOM-03', 'HOM-04', 'HOM-05', 'HOM-06', 'HOM-07', 'HOM-08', 'HOM-09', 'HOM-10', 'HOM-11', 'HOM-12', 'HOM-13', 'HOM-14', 'HOM-15'],
  optionalRequires: ['friends', 'sound', 'account'],
  local: { account: { version: 1, schema: Local, initial: () => ({ bookSeen: 0, giftSeen: 0, claps: { day: '', n: {} } }) } },
  // 배경음악 플레이어 (HOM-04)
  externalOrigins: ['https://www.youtube-nocookie.com'],
  server: {
    version: 1,
    collections: {
      home: { scope: 'user', schema: Home, template: 'friendsRead' },
      // 방명록 글 in/{보낸 사람}/{id}, 말랑이 선물 in/{보낸 사람}/gift/{id}, 박수 수 in/{보낸 사람}/clap
      in: { scope: 'user.inbox', schema: z.union([Book, Gift, z.number()]), template: 'inbox' },
      // 북마크 책장 전체는 주인만, 공개한 책은 친구도 읽는다 (HOM-11)
      shelf: { scope: 'user', schema: z.array(Mark), template: 'owner' },
      shelfPub: { scope: 'user', schema: z.array(Mark), template: 'friendsRead' },
      // 받은 기록을 남긴 사람 색인 senders/{보낸 사람}. 주인 앱이 적어 친구를 끊은 뒤에도 그 사람 칸을 읽는다
      senders: { scope: 'user', schema: z.record(z.string(), z.literal(true)), template: 'owner' },
    },
  },
  ui: {
    windows: [{ id: 'home.main', title: '마이홈', width: 800, height: 580, focusable: true, component: () => import('./ui/HomeWindow') }],
    contributions: [
      { slot: 'menu.main', id: 'home.open', label: '마이홈', command: 'home.open', order: 30, quiet: 'hide' },
      { slot: 'seat.menu', id: 'home.seat', label: '마이홈 보기', command: 'home.visit', quiet: 'hide' },
    ],
  },
  commands: [
    { id: 'home.open', quiet: 'block', run: (ctx) => openHome(ctx, null) },
    {
      id: 'home.visit',
      quiet: 'block',
      // 마이홈은 친구로 등록한 사람에게만 보인다 (10.14의 16번). 친구가 아니면 좌석 메뉴에서 숨는다
      enabledWhen: (ctx, args) => {
        const v = VisitArgs.safeParse(args);
        return v.success && ctx.modules.get('friends')?.isFriend(v.data.uid) ? null : '친구로 등록한 사람의 마이홈만 볼 수 있어요.';
      },
      run: (ctx, args) => openHome(ctx, VisitArgs.parse(args)),
    },
  ],
  setup(ctx) {
    watchInbox(ctx);
    // 회사원 모드에서는 마이홈이 잠긴다 (SET-03)
    ctx.mode.on((m) => m === 'quiet' && ctx.ui.close('home.main'));
    return { addTab: (tab) => addTab(ctx, tab) };
  },
});
