import type { Ctx } from '@core/types';
import css from './status.module.css';

/** 자동 퇴장 1분 전 안내 (CHR-13). 취소하면 접속 중으로 돌아간다 */
export default function LeaveWindow({ ctx }: { ctx: Ctx }) {
  return (
    <div>
      <p>자리를 오래 비워서 1분 뒤에 방에서 나가요.</p>
      <p className={css.hint}>나간 뒤에도 키보드나 마우스를 쓰면 그 방에 다시 들어가요.</p>
      <button onClick={() => void ctx.commands.run('status.stay')}>취소</button>
    </div>
  );
}
