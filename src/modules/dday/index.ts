import { createElement, lazy } from 'react';
import { defineModule } from '@core/types';
import type { HomeTabProps } from '@modules/home/api';
import type { DdayApi } from './api';
import { Card } from './logic';
import { myCards, watchCards } from './state';

// 탭을 처음 열 때 불러온다. 마이홈 창이 불러오는 동안 안내를 보인다
const DdayTab = lazy(() => import('./ui/DdayTab'));

// 마이홈 [D-day] 탭과 카드. 공개 카드는 pub에도 써서 친구가 읽는다 (HOM-21)
export default defineModule<DdayApi>({
  id: 'dday',
  title: 'D-day',
  version: '0.1.0',
  specIds: ['HOM-21'],
  requires: ['home'],
  server: {
    version: 1,
    collections: {
      cards: { scope: 'user', schema: Card, template: 'owner' },
      pub: { scope: 'user.pub', schema: Card, template: 'friendsRead' },
    },
  },
  setup(ctx) {
    watchCards(ctx);
    ctx.modules.get('home')!.addTab({ id: 'dday', label: 'D-day', order: 20, component: (p: HomeTabProps) => createElement(DdayTab, { ...p, ctx }) });
    return { cards: () => myCards(ctx).map(({ id, name, date, notify }) => ({ id, name, date, notify })) };
  },
});
