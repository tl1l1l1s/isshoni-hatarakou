import './core/ui/theme.css';
import { boot } from './core/boot';
import { getBridge, reportError } from './core/bridge';

void boot(document.getElementById('root')!).catch((e: unknown) => {
  console.error(e);
  // 켜지지 못한 것도 메인 로그와 자동 오류 보고로 남긴다 (NFR-21). 업데이트 뒤 켜지지 않는 일을 선물하는 사람이 알 수 있다
  reportError(getBridge(), 'renderer.boot', e);
  document.getElementById('root')!.textContent = `시작하지 못했습니다. ${e instanceof Error ? e.message : String(e)}`;
});
