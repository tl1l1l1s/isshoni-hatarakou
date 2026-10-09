import { createElement, lazy } from 'react';
import { defineModule } from '@core/types';
import type { HomeTabProps } from '@modules/home/api';
import type { SchedulerApi } from './api';
import { Plan, Settings } from './logic';
import { items, watchPlans } from './state';

// 탭을 처음 열 때 불러온다. 마이홈 창이 불러오는 동안 안내를 보인다
const SchedulerTab = lazy(() => import('./ui/SchedulerTab'));

// 마이홈 [스케줄러] 탭과 일정. 공개 일정은 pub에도 써서 친구가 읽는다 (HOM-16)
export default defineModule<SchedulerApi>({
  id: 'scheduler',
  title: '스케줄러',
  version: '0.1.0',
  specIds: ['HOM-16'],
  requires: ['home'],
  optionalRequires: ['friends'],
  settings: {
    version: 1,
    scope: 'account',
    schema: Settings,
    fields: {
      weekStart: { label: '스케줄러 달력의 한 주 시작', widget: 'select', options: [{ value: 'sun', label: '일요일' }, { value: 'mon', label: '월요일' }] },
    },
  },
  server: {
    version: 1,
    collections: {
      ev: { scope: 'user', schema: Plan, template: 'owner' },
      pub: { scope: 'user.pub', schema: Plan, template: 'friendsRead' },
    },
  },
  setup(ctx) {
    watchPlans(ctx);
    ctx.modules.get('home')!.addTab({ id: 'scheduler', label: '스케줄러', order: 10, component: (p: HomeTabProps) => createElement(SchedulerTab, { ...p, ctx }) });
    return { items: () => items(ctx) };
  },
});
