import { useEffect, useState } from 'react';
import type { Ctx } from '@core/types';
import { useBlobUrl } from '@shared/blobUrl';
import { Sha256 } from '@shared/schemas';
import css from './account.module.css';

/** 프로필 사진 (SCR-03, SND-05). mod/account/u/{uid}/photo를 구독해 바뀌면 바로 다시 그린다.
 *  사진이 없거나 읽지 못하면(친구가 아님) 빈 동그라미 */
export default function Photo({ ctx, uid, size }: { ctx: Ctx; uid: string; size: number }) {
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    setHash(null);
    return ctx.server.userOf(uid).watch('photo', (raw) => setHash(Sha256.safeParse(raw).data ?? null));
  }, [ctx, uid]);
  const url = useBlobUrl(hash, ctx.files.get);
  return <span className={css.photo} style={{ width: size, height: size }}>{url && <img src={url} alt="프로필 사진" />}</span>;
}

/** 다른 모듈이 쓰는 사진 (account 공개 API). 이 모듈의 ctx로 읽는다 */
export const photoFor = (ctx: Ctx) =>
  function AccountPhoto(p: { uid: string; size: number }) {
    return <Photo ctx={ctx} {...p} />;
  };
