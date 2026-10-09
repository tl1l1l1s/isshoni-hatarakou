import { useState } from 'react';
import type { SlotProps } from '@core/types';
import { NAME_MAX_LENGTH } from '@shared/constants';
import { cleanName, PHOTO_SIDE } from '../logic';
import Photo from './Photo';
import css from './account.module.css';

/** 설정 창과 내 정보 화면의 계정 탭. code가 false면 친구 코드 줄을 뺀다 (내 정보 머리에 이미 있다) */
export default function AccountTab({ ctx, code: showCode = true }: SlotProps & { code?: boolean }) {
  const [name, setName] = useState(ctx.self.name());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const code = ctx.self.friendCode();

  const save = () => {
    const r = cleanName(name);
    if (!r.ok) return setMsg(r.reason);
    ctx.self.setName(r.name);
    setName(r.name);
    setMsg('저장했습니다');
  };
  const copy = () =>
    ctx.shell.copy(code ?? '').then(
      () => setMsg('친구 코드를 복사했습니다'),
      () => setMsg('복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요'),
    );
  // 프로필 사진 (SCR-03). 64KB 파일 한도 안으로 줄여 올리고 친구만 읽는 자리에 해시를 둔다
  const photo = async (pick: boolean) => {
    setBusy(true);
    setMsg('');
    try {
      if (!pick) {
        await ctx.server.user().remove('photo');
        return setMsg('사진을 뺐습니다');
      }
      const f = await ctx.files.openImage();
      if (!f) return;
      await ctx.server.user().set('photo', await ctx.files.upload(await ctx.files.prepareImage(f.bytes, { maxSide: PHOTO_SIDE })));
      setMsg('사진을 바꿨습니다');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={css.photoRow}>
        <Photo ctx={ctx} uid={ctx.self.uid()} size={56} />
        <button disabled={busy} onClick={() => void photo(true)}>사진 넣기</button>
        <button disabled={busy} onClick={() => void photo(false)}>사진 빼기</button>
      </div>
      <p className={css.hint}>프로필 사진은 친구로 등록한 사람만 봐요.</p>
      <form onSubmit={(e) => (e.preventDefault(), save())}>
        <label>
          닉네임
          <input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit">저장</button>
      </form>
      {!showCode ? null : code ? (
        <label>
          친구 코드
          <span>
            <input readOnly value={code} size={10} onFocus={(e) => e.target.select()} />{' '}
            <button onClick={() => void copy()}>복사</button>
          </span>
        </label>
      ) : (
        <p>개발용 계정이라 친구 코드가 없습니다</p>
      )}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
