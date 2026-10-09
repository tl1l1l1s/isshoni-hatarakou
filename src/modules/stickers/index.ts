import { defineModule } from '@core/types';
import type {} from '@modules/gacha/api';
import type {} from '@modules/wardrobe/api';
import { withoutKeys } from './logic';

// 꾸미기: 가챠 아이템과 직접 그린 그림을 스티커, 책상 소품, 바닥 오브제로 붙인다
// (AVT-05, AVT-06, AVT-07, AVT-08, AVT-09, AVT-10, AVT-13, AVT-14, AVT-19, 9.3 OUR-03)
export default defineModule({
  id: 'stickers',
  title: '꾸미기',
  version: '0.2.0',
  specIds: ['AVT-05', 'AVT-06', 'AVT-07', 'AVT-08', 'AVT-09', 'AVT-10', 'AVT-13', 'AVT-14', 'AVT-19'],
  requires: ['wardrobe'],
  optionalRequires: ['gacha'],
  ui: {
    windows: [{ id: 'stickers.edit', title: '꾸미기', width: 560, height: 640, focusable: true, component: () => import('./ui/EditWindow') }],
    contributions: [{ slot: 'menu.main', id: 'stickers.open', label: '꾸미기', command: 'stickers.open', order: 25 }],
  },
  commands: [{ id: 'stickers.open', run: (ctx) => ctx.ui.open('stickers.edit') }],
  setup(ctx) {
    const wardrobe = ctx.modules.get('wardrobe')!;
    // 함께 지우기로 빠진 아이템은 모든 캐릭터 슬롯에서 뺀다 (OUR-02)
    ctx.bus.on('gacha.revoked', ({ keys }) => {
      wardrobe.updateAll((a) => ({ ...a, slots: withoutKeys(a.slots, keys) })).catch((e: Error) => ctx.log.warn(`스티커 빼기 실패: ${e.message}`));
    });
  },
});
