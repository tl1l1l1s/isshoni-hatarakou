import { z } from 'zod';
import { defineModule } from '@core/types';
import type { WardrobeApi } from './api';
import { CharRecord, initialLocal, Local, migrateV1, TrashRecord, UnlockRecord } from './logic';
import { initialSolo, Solo, startSolo } from './solo';
import { createWardrobe } from './state';
import { SYNC_MS } from './sync';
import SlotCard from './ui/SlotCard';
import SoloTab from './ui/SoloTab';

// 캐릭터 만들기: 얼굴 그리기나 자세 그림 세 장과 책상, 캐릭터 슬롯 3개, 동물 캐릭터, 캐릭터 파일, 서버 보관과 이전 모습, 혼자 모드 자리 추가
export default defineModule<WardrobeApi>({
  id: 'wardrobe',
  title: '캐릭터',
  version: '0.3.0',
  specIds: ['AVT-01', 'AVT-02', 'AVT-03', 'AVT-04', 'AVT-11', 'AVT-15', 'AVT-17', 'AVT-18', 'AVT-22', 'GRW-03', 'ACC-08', 'OUR-03', 'ACC-13', 'NFR-17'],
  optionalRequires: ['growth'],
  local: { account: { version: 2, schema: Local, initial: initialLocal, migrate: [migrateV1] }, device: { version: 1, schema: Solo, initial: initialSolo } },
  server: {
    version: 1,
    collections: {
      chars: { scope: 'user', schema: CharRecord, template: 'owner', merge: 'askUser' },
      trash: { scope: 'user', schema: TrashRecord, template: 'owner' },
      unlock: { scope: 'user', schema: UnlockRecord, template: 'owner' },
    },
  },
  tunables: { animalUnlockLevel: { schema: z.number().int().min(1).max(999), default: 30 } },
  // 레벨 보상 표(GRW-02)에 보이도록 해금 레벨을 gate로도 적는다. 실제 해금은 state.ts의 해금 기록이 정한다
  gates: { 'wardrobe.animal': { requires: { module: 'growth', key: 'level', gte: { tunable: 'animalUnlockLevel' } }, label: '동물 캐릭터 만들기' } },
  ui: {
    windows: [
      { id: 'wardrobe.create', title: '캐릭터 만들기', width: 520, height: 760, focusable: true, component: () => import('./ui/WardrobeWindow') },
      { id: 'wardrobe.conflict', title: '캐릭터 맞추기', width: 440, height: 460, component: () => import('./ui/ConflictWindow') },
    ],
    contributions: [
      { slot: 'menu.main', id: 'wardrobe.open', label: '캐릭터 만들기', command: 'wardrobe.open', order: 20 },
      { slot: 'launcher.cards', id: 'wardrobe.slots', label: '캐릭터 슬롯', component: SlotCard, order: 5 },
      { slot: 'settings.tabs', id: 'wardrobe.solo', label: '자리 추가', component: SoloTab, order: 25 },
    ],
  },
  commands: [{ id: 'wardrobe.open', run: (ctx) => ctx.ui.open('wardrobe.create') }],
  setup(ctx) {
    const w = createWardrobe(ctx);
    w.publish().catch((e: Error) => ctx.log.warn(`외형 올리기 실패: ${e.message}`));
    w.sync().catch((e: Error) => ctx.log.warn(`캐릭터 서버 맞추기 실패: ${e.message}`));
    startSolo(ctx, w);
    // 30분마다와 다른 기기에서 이 기기로 다시 가져올 때도 맞춘다 (ACC-13)
    const resync = () => void w.sync().catch((e: Error) => ctx.log.warn(`캐릭터 서버 맞추기 실패: ${e.message}`));
    ctx.timers.every(SYNC_MS, resync);
    ctx.self.onActiveDevice((active) => active && resync());
    return { appearance: w.appearance, update: w.update, updateAll: w.updateAll, onChange: w.onChange, trashList: w.trashList, restore: w.restore };
  },
});
