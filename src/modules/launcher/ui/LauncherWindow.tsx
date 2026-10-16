import { useEffect, useState } from 'react';
import type { Ctx } from '@core/types';
import type {} from '@modules/growth/api';
import css from './launcher.module.css';

/** 런처 창: 미리보기, 이름, 시작하기, 다른 모듈 카드, 캐릭터 만들기와 내 정보와 설정 (SCR-02) */
export default function LauncherWindow({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState(ctx.self.name());
  // 내 정보 (SCR-03)는 런처 창 안에서 화면을 바꾸고 ◀로 돌아온다
  const [me, setMe] = useState(false);

  useEffect(() => {
    const off = ctx.self.onChange((s) => setName(s.name));
    return () => {
      off();
      // 런처 창을 닫으면(×, Alt+F4) 앱을 끈다. 저장하지 않은 편집을 묻다가 계속하기를 누르면 런처를 다시 연다
      if (ctx.app.mode() === 'launcher') void ctx.commands.run('core.quit').then((quit) => quit || ctx.ui.open('launcher.main'));
    };
  }, [ctx]);

  const start = () => {
    ctx.app.setMode('run');
    ctx.ui.close('launcher.main');
  };
  const level = ctx.modules.get('growth')?.levelText();
  const run = async (id: string) => {
    try {
      await ctx.commands.run(id);
    } catch {
      ctx.ui.toast('지금은 열 수 없어요.');
    }
  };
  // 내 정보에 저장하지 않은 일이 있으면 돌아가기 전에 묻는다
  const back = () => void ctx.ui.confirmLeave('launcher.main').then((ok) => ok && setMe(false));

  if (me) {
    return (
      <div>
        <div className={css.back}>
          <button aria-label="뒤로" onClick={back}>◀</button>
          <h3>내 정보</h3>
        </div>
        <ctx.ui.Slot name="launcher.me" />
      </div>
    );
  }

  return (
    <div className={css.root}>
      <div className={css.pic}>
        <ctx.ui.CharacterPreview />
      </div>
      <div className={css.name}>
        <span>{name || '이름 없음'}</span>
        {level !== undefined && <span className={css.level}>{level}</span>}
      </div>
      <button className={css.start} onClick={start}>시작하기</button>
      <div className={css.cards}>
        <ctx.ui.Slot name="launcher.cards" />
      </div>
      <div className={css.row}>
        <button onClick={() => void run('wardrobe.open')}>캐릭터 만들기</button>
        <button onClick={() => setMe(true)}>내 정보</button>
        <button onClick={() => void run('core.settings')}>설정</button>
      </div>
    </div>
  );
}
