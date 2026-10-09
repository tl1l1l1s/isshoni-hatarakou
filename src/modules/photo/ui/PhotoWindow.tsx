import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import { fileName } from '../logic';
import { inboxOf, type Received } from '../state';
import Decorate from './Decorate';
import { download } from './save';
import Shoot from './Shoot';
import css from './photo.module.css';

type Tab = 'shoot' | 'edit' | 'inbox';

/** 스티커 사진 창: 찍기, 꾸미기, 받은 사진. 탭을 옮겨도 찍기 설정과 꾸민 내용이 남도록 숨기기만 한다 (COM-15) */
export default function PhotoWindow({ ctx }: { ctx: Ctx }) {
  const inbox = inboxOf(ctx);
  const unseen = useSyncExternalStore(inbox.subscribe, inbox.unseen);
  const [tab, setTab] = useState<Tab>(() => (inbox.unseen() ? 'inbox' : 'shoot'));
  const [sheet, setSheet] = useState<{ n: number; img: ImageBitmap } | null>(null);

  return (
    <div>
      <nav aria-label="스티커 사진">
        <button aria-pressed={tab === 'shoot'} onClick={() => setTab('shoot')}>찍기</button>
        <button aria-pressed={tab === 'edit'} disabled={!sheet} onClick={() => setTab('edit')}>꾸미기</button>
        <button aria-pressed={tab === 'inbox'} onClick={() => setTab('inbox')}>받은 사진{unseen ? ` ${unseen}` : ''}</button>
      </nav>
      <div hidden={tab !== 'shoot'}>
        <Shoot ctx={ctx} onDone={(img) => {
          setSheet((s) => ({ n: (s?.n ?? 0) + 1, img }));
          setTab('edit');
        }} />
      </div>
      {/* 새로 찍으면 꾸미기를 처음부터 한다 */}
      {sheet && <div hidden={tab !== 'edit'}><Decorate key={sheet.n} ctx={ctx} sheet={sheet.img} /></div>}
      {tab === 'inbox' && <Inbox ctx={ctx} />}
    </div>
  );
}

function Inbox({ ctx }: { ctx: Ctx }) {
  const inbox = inboxOf(ctx);
  const list = useSyncExternalStore(inbox.subscribe, inbox.list);
  useEffect(() => inbox.seen(), [inbox, list]);
  if (!list.length) return <p className={css.hint}>방 사람이 보낸 스티커 사진이 여기에 나와요.</p>;
  return (
    <>
      <p className={css.hint}>받은 사진은 앱을 끄면 사라지니 마음에 들면 저장해 주세요.</p>
      <ul className={css.inbox}>
        {list.map((r) => <Photo key={`${r.file}${r.at}`} ctx={ctx} r={r} />)}
      </ul>
    </>
  );
}

function Photo({ ctx, r }: { ctx: Ctx; r: Received }) {
  const [img, setImg] = useState<{ url: string; bytes: Uint8Array } | null>(null);
  useEffect(() => {
    let url = '', alive = true;
    void ctx.files.get(r.file).then((bytes) => {
      if (!alive || !bytes) return;
      url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]));
      setImg({ url, bytes });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ctx, r.file]);
  const when = new Date(r.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return (
    <li>
      <span>{r.from}님이 {when}에 보냈어요</span>
      {img ? <img src={img.url} alt={`${r.from}님이 보낸 스티커 사진`} /> : <span className={css.hint}>불러오는 중이에요.</span>}
      <button disabled={!img} onClick={(e) => img && download(ctx, e.currentTarget.ownerDocument, new Blob([img.bytes as Uint8Array<ArrayBuffer>]), fileName(new Date(r.at), img.bytes))}>
        저장하기
      </button>
    </li>
  );
}
