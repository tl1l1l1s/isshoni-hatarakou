import { createElement, lazy, Suspense } from 'react';
import { z } from 'zod';
import { defineModule, type SlotProps } from '@core/types';
import { Sha256 } from '@shared/schemas';
import type { AccountApi } from './api';
import AccountTab from './ui/AccountTab';
import { photoFor } from './ui/Photo';

const MePage = lazy(() => import('./ui/MePage'));
const Me = (p: SlotProps) => createElement(Suspense, { fallback: createElement('p', null, '불러오는 중이에요.') }, createElement(MePage, p));

// 설정 창 계정 탭: 닉네임과 친구 코드 (ACC-04). 런처의 내 정보 화면과 프로필 사진 (SCR-03)
export default defineModule<AccountApi>({
  id: 'account',
  title: '계정',
  version: '0.1.0',
  specIds: ['ACC-04', 'SCR-03'],
  // 레벨과 친구 랭킹, 휴지통 (SCR-03)
  optionalRequires: ['growth', 'friends', 'wardrobe'],
  // 서버 프로필을 읽지 못한 날에도 이름이 비지 않게 이 PC에 이름을 함께 둔다
  local: { account: { version: 1, schema: z.object({ name: z.string() }), initial: () => ({ name: '' }) } },
  // 프로필 사진은 친구만 본다 (10.14의 16번)
  server: { version: 1, collections: { photo: { scope: 'user', schema: Sha256, template: 'friendsRead' } } },
  ui: {
    contributions: [
      { slot: 'settings.tabs', id: 'account.tab', label: '계정', order: 10, component: AccountTab },
      { slot: 'launcher.me', id: 'account.me', label: '내 정보', component: Me },
    ],
  },
  setup(ctx) {
    const local = () => ctx.local.get<{ name: string }>('account').name;
    // 프로필을 읽기 전에는 이 PC의 이름을 보이기만 한다. 서버에 쓰는 일은 코어가 프로필을 읽은 뒤 정한다
    ctx.self.fillName(local());
    // 사용자가 바꾸거나 늦게 읽은 서버 프로필이 채운 이름을 이 PC에도 둔다
    const keep = () => void (ctx.self.name() !== local() && ctx.local.update('account', () => ({ name: ctx.self.name() })));
    keep();
    ctx.self.onChange(keep);
    return { Photo: photoFor(ctx) };
  },
});
