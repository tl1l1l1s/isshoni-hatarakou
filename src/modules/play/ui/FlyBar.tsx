import { useEffect, useReducer } from 'react';
import type { SlotProps } from '@core/types';
import type { Local } from '../logic';
import { state } from '../state';
import css from './play.module.css';

/** 대화하기 창 입력란 위: 날리기 체크와 글자 크기, 색 (COM-05), 폭탄 (COM-13) */
export default function FlyBar({ ctx }: SlotProps) {
  const [, render] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = [ctx.mode.on(render), ctx.gates.onChange(render)];
    return () => offs.forEach((off) => off());
  }, [ctx]);
  const st = state(ctx);
  const l = ctx.local.get<Local>('account');
  const set = (p: Partial<Local>) => {
    ctx.local.update<Local>('account', (x) => ({ ...x, ...p }));
    render();
  };
  // 회사원 모드에서는 날리기를 막는다
  const flying = ctx.mode.get() === 'normal';
  return (
    <div className={css.bar}>
      {flying && (
        <label>
          날리기
          <input
            type="checkbox"
            checked={st.fly}
            onChange={(e) => {
              st.fly = e.target.checked;
              render();
            }}
          />
        </label>
      )}
      {flying && st.fly && (
        <select aria-label="글자 크기" value={l.size} onChange={(e) => set({ size: e.target.value as Local['size'] })}>
          <option value="l">크게</option>
          <option value="m">보통</option>
          <option value="s">작게</option>
        </select>
      )}
      {flying && st.fly && ctx.gates.isOpen('play.flyColor') && <input type="color" aria-label="글자 색" value={l.color} onChange={(e) => set({ color: e.target.value })} />}
      {ctx.gates.isOpen('play.bomb') && (
        <button title="폭탄" onClick={() => void ctx.commands.run('play.bomb').catch((e: Error) => ctx.ui.toast(e.message))}>
          💣
        </button>
      )}
    </div>
  );
}
