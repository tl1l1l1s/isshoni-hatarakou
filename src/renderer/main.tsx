import './core/ui/theme.css';
import { boot } from './core/boot';

void boot(document.getElementById('root')!).catch((e: unknown) => {
  console.error(e);
  document.getElementById('root')!.textContent = `시작하지 못했습니다. ${e instanceof Error ? e.message : String(e)}`;
});
