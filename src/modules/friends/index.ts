import { z } from 'zod';
import { defineModule } from '@core/types';
import type { FriendsApi } from './api';
import { Entry, Slot } from './logic';
import { isFriend, request, snap, start, subscribe } from './state';

const Target = z.object({ uid: z.string().min(1), name: z.string() });

export default defineModule<FriendsApi>({
  id: 'friends',
  title: '친구',
  version: '0.1.0',
  specIds: ['FRD-01', 'FRD-02', 'FRD-03', 'FRD-04', 'FRD-05', 'FRD-06', 'ROM-11'],
  settings: {
    version: 1,
    scope: 'account',
    schema: z.object({ appearOffline: z.boolean().default(false) }),
    fields: { appearOffline: { label: '친구에게 오프라인으로 보이기', widget: 'toggle' } },
  },
  // 오프라인으로 보이기 (FRD-06). 코어는 online을 그대로 쓰고 친구 앱이 이 표시를 보고 오프라인으로 그린다.
  // online을 끄면 폰 신호 규칙(keyedWrite)이 PC가 꺼진 것으로 보고 거부한다 (ADR 0016)
  accountPresence: { hidden: z.boolean() },
  server: {
    version: 1,
    collections: {
      list: { scope: 'user', schema: Entry, template: 'owner' },
      in: { scope: 'user.inbox', schema: Slot, template: 'inbox' },
    },
  },
  ui: {
    windows: [{ id: 'friends.main', title: '친구', width: 360, height: 480, focusable: true, component: () => import('./ui/FriendsWindow') }],
    contributions: [
      { slot: 'menu.main', id: 'friends.menu', label: '친구', command: 'friends.open', order: 15 },
      { slot: 'seat.menu', id: 'friends.seat', label: '친구 신청', command: 'friends.request', order: 10 },
    ],
  },
  commands: [
    { id: 'friends.open', run: (ctx) => ctx.ui.open('friends.main') },
    {
      // seat.menu가 { uid, name }을 넘긴다. 이미 친구면 좌석 메뉴에서 숨긴다
      id: 'friends.request',
      enabledWhen: (ctx, args) => {
        const t = Target.safeParse(args);
        return t.success && isFriend(ctx, t.data.uid) ? '이미 친구예요.' : null;
      },
      run: async (ctx, args) => {
        const t = Target.parse(args);
        ctx.ui.toast(await request(ctx, t.uid, t.name).catch(() => '친구 신청을 보내지 못했어요. 잠시 뒤에 다시 해 주세요.'));
      },
    },
  ],
  setup(ctx) {
    start(ctx);
    const hide = () => ctx.self.setPresence({ hidden: ctx.settings.get<{ appearOffline: boolean }>().appearOffline });
    hide();
    ctx.settings.onChange(hide);
    const list = () => Object.keys(snap(ctx).list ?? {}).map((uid) => ({ uid }));
    return {
      list,
      isFriend: (uid) => isFriend(ctx, uid),
      onChange: (fn) => {
        let last = snap(ctx).list;
        return subscribe(ctx, () => {
          if (snap(ctx).list === last) return;
          last = snap(ctx).list;
          fn(list());
        });
      },
    };
  },
});
