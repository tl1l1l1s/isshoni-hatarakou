import { createElement } from 'react';
import { z } from 'zod';
import { defineModule } from '@core/types';
import type { HomeTabProps } from '@modules/home/api';
import { newNotes, Post, Shout } from './logic';
import { NOTES } from './notes';
import { shoutText, start } from './state';
import MailBox, { MailChip } from './ui/MailBox';
import type { Device } from './ui/UpdatesWindow';

// 선물하는 사람이 보내는 소식: 우편함, 업데이트 소식 창, 확성기. 쓰기는 scripts/ops.ts만 한다 (OPS-21)
export default defineModule({
  id: 'notice',
  title: '우편함',
  version: '0.1.0',
  specIds: ['ACC-09', 'OPS-01', 'OPS-17', 'OPS-18'],
  optionalRequires: ['home'],
  local: {
    device: { version: 1, schema: z.object({ seenVersion: z.string() }), initial: () => ({ seenVersion: '' }) },
    account: { version: 1, schema: z.object({ read: z.array(z.string()) }), initial: () => ({ read: [] }) },
  },
  server: {
    version: 1,
    collections: {
      posts: { scope: 'global', schema: Post, template: 'ownerWritePublicRead' },
      mail: { scope: 'user', schema: Post, template: 'owner' },
      shout: { scope: 'global', schema: Shout, template: 'ownerWritePublicRead' },
    },
  },
  // 확성기 글은 방에 있는 모든 캐릭터 위에 다른 말풍선보다 먼저 보인다
  bubbles: [
    {
      id: 'notice.shout',
      priority: 500,
      text: (seat, ctx) => {
        const t = shoutText(ctx);
        return t && !seat.local ? `📢 ${t}` : null;
      },
    },
  ],
  ui: {
    windows: [
      { id: 'notice.main', title: '우편함', width: 420, height: 480, component: () => import('./ui/MailBox') },
      { id: 'notice.updates', title: '업데이트 소식', width: 380, height: 420, component: () => import('./ui/UpdatesWindow') },
    ],
    contributions: [{ slot: 'chip.buttons', id: 'notice.chip', label: '우편함', component: MailChip, order: 14, quiet: 'hide' }],
  },
  setup(ctx) {
    start(ctx);
    // 친구 마이홈을 보는 동안에는 우편함을 보여 주지 않는다
    const tab = (p: HomeTabProps) => (p.mine ? createElement(MailBox, { ctx }) : createElement('p', null, '우편함은 내 마이홈에서만 볼 수 있어요.'));
    ctx.modules.get('home')?.addTab({ id: 'notice', label: '우편함', order: 30, component: tab });
    // 업데이트한 뒤 처음 켜면 바뀐 점을 한 번 보여 준다. 처음 설치한 PC는 지금 버전만 적는다
    ctx.lifecycle.on((e) => {
      if (e.type !== 'ready') return;
      const seen = ctx.local.get<Device>('device').seenVersion;
      if (newNotes(NOTES, seen, ctx.app.version).length) ctx.ui.open('notice.updates');
      else if (seen !== ctx.app.version) ctx.local.update<Device>('device', () => ({ seenVersion: ctx.app.version }));
    });
  },
});
