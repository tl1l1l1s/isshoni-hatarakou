import './core/ui/theme.css';
import { boot } from './core/boot';
import { getBridge, reportError } from './core/bridge';
import stage from './core/ui/stage.module.css';

void boot(document.getElementById('root')!).catch((e: unknown) => {
  console.error(e);
  // 켜지지 못한 것도 메인 로그와 자동 오류 보고로 남긴다 (NFR-21). 업데이트 뒤 켜지지 않는 일을 선물하는 사람이 알 수 있다.
  // 까닭(영어나 코드일 수 있다)은 보고에만 싣고 화면에는 할 일만 보인다
  reportError(getBridge(), 'renderer.boot', e);
  const root = document.getElementById('root')!;
  root.textContent = '시작하지 못했어요. 앱을 다시 켜 주세요.';
  // 스테이지는 투명한 창이라 실행 화면 알림과 같은 유리 판에 올려 어떤 바탕화면에서도 읽히게 한다
  root.className = stage.toast ?? '';
});
