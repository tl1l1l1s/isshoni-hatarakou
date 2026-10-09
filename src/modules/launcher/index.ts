import { defineModule } from '@core/types';
import type { Ctx } from '@core/types';

// 런처 (SCR-02). 앱을 켜면 먼저 뜨고 시작하기를 누르면 실행 화면으로 간다
const open = (ctx: Ctx) => {
  ctx.app.setMode('launcher');
  ctx.ui.open('launcher.main');
};

export default defineModule({
  id: 'launcher',
  title: '런처',
  version: '0.1.0',
  specIds: ['SCR-02', 'SCR-04', 'SCR-05', 'SCR-06', 'SCR-07', 'CHR-01', 'CHR-03', 'CHR-04', 'SCR-03'],
  // 이름 옆 레벨
  optionalRequires: ['growth'],
  ui: {
    // 창 제목은 package.json productName과 같게 둔다
    windows: [{ id: 'launcher.main', title: 'Isshoni Hatarakou', width: 380, height: 560, focusable: true, component: () => import('./ui/LauncherWindow') }],
    contributions: [{ slot: 'menu.main', id: 'launcher.back', label: '« 런처로', command: 'launcher.open', order: 1000 }],
  },
  commands: [{ id: 'launcher.open', run: open }],
  setup(ctx) {
    open(ctx);
  },
});
