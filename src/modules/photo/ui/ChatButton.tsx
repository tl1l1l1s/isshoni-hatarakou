import type { SlotProps } from '@core/types';
import css from './photo.module.css';

/** 대화하기 창 도구 줄의 스티커 사진 단추 (COM-15). 회사원 모드에서는 슬롯이 숨긴다 */
export default function ChatButton({ ctx }: SlotProps) {
  return (
    <button className={css.chatButton} onClick={() => void ctx.commands.run('photo.open').catch((e: Error) => ctx.ui.toast(e.message))}>
      📷 스티커 사진
    </button>
  );
}
