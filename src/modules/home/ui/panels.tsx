import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Ctx } from '@core/types';
import { ACCENTS, BOOK_MAX, MALLANGI_MAX, MALLANGI_SIDE, Mark, MARK_SIDE, MARK_TITLE_MAX, MARK_URL_MAX, SHELF_MAX } from '../logic';
import type { Book, Gift, Home, Item, Pt } from '../logic';
import { pickImage, putImage, removeBook, removeGift, run, saveMallangi, saveShelf, useFiles, writeBook } from '../state';
import css from './home.module.css';

const when = (at: number) => new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const FULL = `말랑이는 ${MALLANGI_MAX}개까지 둘 수 있어요. 하나를 지우고 다시 해 주세요.`;

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className={css.panelHead}>
      <b>{title}</b>
      <button onClick={onClose}>닫기</button>
    </header>
  );
}

/** 방명록. 방문자는 140자까지 남기고 주인은 하나씩 지운다. 최근 글부터 한 쪽씩 받는다 (HOM-09) */
export function BookPanel({ ctx, owner, mine, book, more, onMore, onClose }: {
  ctx: Ctx; owner: string; mine: boolean; book: Array<Item<Book>>; more: boolean; onMore: () => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const send = () =>
    run(ctx, async () => {
      await writeBook(ctx, owner, text.trim());
      setText('');
    });
  return (
    <>
      <Head title="방명록" onClose={onClose} />
      {!mine && (
        <div className={css.write}>
          <textarea maxLength={BOOK_MAX} value={text} aria-label="방명록 글" placeholder="인사를 남겨 보세요." onChange={(e) => setText(e.target.value)} />
          <small className={css.count}>{text.length} / {BOOK_MAX}</small>
          <button disabled={!text.trim()} onClick={send}>남기기</button>
        </div>
      )}
      {book.length ? (
        <ul className={css.list}>
          {book.map((b) => (
            <li key={`${b.sender}/${b.id}`}>
              <div>
                <b>{b.name}</b> <small className={css.count}>{when(b.at)}</small>
                <p className={css.pre}>{b.text}</p>
              </div>
              {mine && <button onClick={() => run(ctx, () => removeBook(ctx, b))}>지우기</button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={css.hint}>아직 방명록이 없어요.</p>
      )}
      {more && <button onClick={onMore}>이전 글 더 보기</button>}
    </>
  );
}

/** 받은 말랑이 선물. 받으면 내 말랑이가 되고 숨기기는 한 번 더 묻는다 (HOM-14) */
export function GiftPanel({ ctx, home, gifts, onClose }: { ctx: Ctx; home: Home; gifts: Array<Item<Gift>>; onClose: () => void }) {
  const files = useFiles(ctx, gifts.map((g) => g.file));
  const [asking, setAsking] = useState<string | null>(null);
  const accept = (g: Item<Gift>) =>
    run(ctx, async () => {
      if (!home.mallangi.includes(g.file)) {
        if (home.mallangi.length >= MALLANGI_MAX) throw new Error(FULL);
        await saveMallangi(ctx, [...home.mallangi, g.file]);
      }
      await removeGift(ctx, g);
      ctx.ui.toast('말랑이를 받았어요.');
    });
  return (
    <>
      <Head title="선물함" onClose={onClose} />
      {gifts.length ? (
        <ul className={css.list}>
          {gifts.map((g) => {
            const key = `${g.sender}/${g.id}`;
            return (
              <li key={key}>
                <span className={css.thumb}>{files[g.file] && <img src={files[g.file]} alt="" />}</span>
                <div>
                  <b>{g.name}님의 선물</b> <small className={css.count}>{when(g.at)}</small>
                  {g.msg && <p className={css.pre}>{g.msg}</p>}
                  {asking === key ? (
                    <p>
                      숨긴 선물은 다시 볼 수 없어요. 숨길까요?{' '}
                      <button onClick={() => run(ctx, () => removeGift(ctx, g))}>숨기기</button>{' '}
                      <button onClick={() => setAsking(null)}>취소</button>
                    </p>
                  ) : (
                    <p>
                      <button onClick={() => accept(g)}>받기</button> <button onClick={() => setAsking(key)}>숨기기</button>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={css.hint}>받은 선물이 없어요.</p>
      )}
    </>
  );
}

/** 내 말랑이 그림. 직접 그리거나 그림을 올려 긴 변 160px로 줄여 둔다 (HOM-12) */
export function MallangiPanel({ ctx, home, onClose }: { ctx: Ctx; home: Home; onClose: () => void }) {
  const files = useFiles(ctx, home.mallangi);
  const [drawing, setDrawing] = useState(false);
  const full = home.mallangi.length >= MALLANGI_MAX;
  const add = async (file: string) => {
    if (full) throw new Error(FULL);
    await saveMallangi(ctx, [...home.mallangi, file]);
  };
  const upload = () =>
    run(ctx, async () => {
      if (full) throw new Error(FULL);
      const file = await pickImage(ctx, MALLANGI_SIDE);
      if (file) await add(file);
    });
  return (
    <>
      <Head title={`말랑이 ${home.mallangi.length} / ${MALLANGI_MAX}`} onClose={onClose} />
      <div className={css.cells}>
        {home.mallangi.map((h, i) => (
          <span key={i} className={css.thumb}>
            {files[h] && <img src={files[h]} alt="" />}
            <button className={css.x} title="지우기" onClick={() => run(ctx, () => saveMallangi(ctx, home.mallangi.filter((_, j) => j !== i)))}>×</button>
          </span>
        ))}
      </div>
      {drawing ? (
        <DrawPad
          ctx={ctx}
          onCancel={() => setDrawing(false)}
          onSave={async (file) => {
            await add(file);
            setDrawing(false);
          }}
        />
      ) : (
        <p>
          <button disabled={full} onClick={() => setDrawing(true)}>그리기</button> <button disabled={full} onClick={upload}>그림 올리기</button>
        </p>
      )}
      <p className={css.hint}>말랑이 부르기를 누르면 이 가운데 하나가 나와서 바닥을 걸어 다녀요. 친구 탭에서 친구에게 선물할 수 있어요.</p>
    </>
  );
}

function DrawPad({ ctx, onSave, onCancel }: { ctx: Ctx; onSave: (file: string) => Promise<void>; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<Pt | null>(null);
  const [color, setColor] = useState('#1f2430');
  const pos = (ev: PointerEvent<HTMLCanvasElement>): Pt => {
    const r = ev.currentTarget.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const draw = (ev: PointerEvent<HTMLCanvasElement>) => {
    const from = last.current;
    if (!from) return;
    const p = pos(ev);
    const g = ev.currentTarget.getContext('2d')!;
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  };
  const save = () =>
    run(ctx, async () => {
      const blob = await new Promise<Blob | null>((res) => canvas.current!.toBlob(res, 'image/png'));
      if (!blob) throw new Error('그림을 저장하지 못했어요.');
      await onSave(await putImage(ctx, new Uint8Array(await blob.arrayBuffer()), MALLANGI_SIDE));
    });
  return (
    <div className={css.pad}>
      <canvas
        ref={canvas}
        width={MALLANGI_SIDE}
        height={MALLANGI_SIDE}
        onPointerDown={(ev) => {
          ev.currentTarget.setPointerCapture(ev.pointerId);
          last.current = pos(ev);
          draw(ev);
        }}
        onPointerMove={draw}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <p>
        <input type="color" value={color} title="펜 색" onChange={(e) => setColor(e.target.value)} />{' '}
        <button onClick={() => canvas.current!.getContext('2d')!.clearRect(0, 0, MALLANGI_SIDE, MALLANGI_SIDE)}>지우기</button>{' '}
        <button onClick={onCancel}>취소</button> <button onClick={save}>저장</button>
      </p>
    </div>
  );
}

/** 밝은 책등에는 어두운 글씨 */
const inkOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160 ? '#1d1d1f' : '#ffffff';
};

/** 북마크 책장. 책 한 권이 링크 하나이고 누르면 기본 브라우저로 연다. 공개한 책만 친구에게 보인다 (HOM-11) */
export function ShelfPanel({ ctx, mine, list, onClose }: { ctx: Ctx; mine: boolean; list: Mark[]; onClose: () => void }) {
  const files = useFiles(ctx, list.flatMap((m) => (m.img ? [m.img] : [])));
  const [sel, setSel] = useState<number | null>(null);
  const [form, setForm] = useState<{ i: number | null; m: Mark } | null>(null);
  const cur = sel === null ? undefined : list[sel];
  const pubs = list.filter((m) => m.pub).length;
  const write = (next: Mark[], after?: () => void) =>
    run(ctx, async () => {
      await saveShelf(ctx, next);
      after?.();
    });
  const swap = (d: -1 | 1) => {
    const j = sel! + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[sel!], next[j]] = [next[j]!, next[sel!]!];
    write(next, () => setSel(j));
  };
  const submit = () => {
    const r = Mark.safeParse({ ...form!.m, title: form!.m.title.trim(), url: form!.m.url.trim() });
    if (!r.success) return ctx.ui.toast('제목과 http나 https로 시작하는 링크를 넣어 주세요.');
    const i = form!.i;
    write(i === null ? [...list, r.data] : list.map((m, j) => (j === i ? r.data : m)), () => {
      setForm(null);
      setSel(i ?? list.length);
    });
  };
  const head = mine ? `북마크 ${list.length} / ${SHELF_MAX}${pubs ? `, 공개 ${pubs}` : ''}` : '북마크';
  return (
    <>
      <Head title={head} onClose={onClose} />
      {list.length ? (
        <div className={css.shelf}>
          {list.map((m, i) => (
            <button
              key={i}
              className={css.spine}
              aria-pressed={sel === i}
              data-pub={mine && m.pub}
              title={m.title}
              style={{ background: m.color, backgroundImage: m.img && files[m.img] ? `url(${files[m.img]})` : undefined, color: inkOn(m.color) }}
              onClick={() => {
                setSel(sel === i ? null : i);
                setForm(null);
              }}
            >
              {m.title}
            </button>
          ))}
        </div>
      ) : (
        <p className={css.hint}>{mine ? '아직 꽂은 책이 없어요. 링크를 책으로 꽂아 두고 친구에게 공개할 수 있어요.' : '공개된 책이 없어요.'}</p>
      )}
      {cur && !form && (
        <div className={css.markInfo}>
          <b>{cur.title}</b>
          <small className={css.count}>{cur.url}</small>
          <p>
            <button onClick={() => run(ctx, () => ctx.shell.openExternal(cur.url))}>열기</button>{' '}
            {mine && (
              <>
                <button onClick={() => write(list.map((m, j) => (j === sel ? { ...m, pub: !m.pub } : m)))}>{cur.pub ? '공개 끄기' : '친구에게 공개'}</button>{' '}
                <button aria-label="앞으로" onClick={() => swap(-1)}>◀</button> <button aria-label="뒤로" onClick={() => swap(1)}>▶</button>{' '}
                <button onClick={() => setForm({ i: sel, m: cur })}>수정</button>{' '}
                <button onClick={() => write(list.filter((_, j) => j !== sel), () => setSel(null))}>빼기</button>
              </>
            )}
          </p>
        </div>
      )}
      {mine &&
        (form ? (
          <div className={css.write}>
            <label className={css.field}>
              책 제목
              <input maxLength={MARK_TITLE_MAX} value={form.m.title} placeholder={`책 제목 (${MARK_TITLE_MAX}자)`} onChange={(e) => setForm({ ...form, m: { ...form.m, title: e.target.value } })} />
            </label>
            <label className={css.field}>
              링크
              <input maxLength={MARK_URL_MAX} value={form.m.url} placeholder="https://" onChange={(e) => setForm({ ...form, m: { ...form.m, url: e.target.value } })} />
            </label>
            <div className={css.row}>
              <input type="color" aria-label="책등 색" value={form.m.color} onChange={(e) => setForm({ ...form, m: { ...form.m, color: e.target.value } })} />
              <button
                onClick={() =>
                  run(ctx, async () => {
                    const img = await pickImage(ctx, MARK_SIDE);
                    if (img) setForm((f) => f && { ...f, m: { ...f.m, img } });
                  })
                }
              >
                책등 그림
              </button>
              {form.m.img && <button onClick={() => setForm({ ...form, m: { ...form.m, img: undefined } })}>그림 빼기</button>}
            </div>
            <label>
              친구에게 공개
              <input type="checkbox" checked={form.m.pub} onChange={(e) => setForm({ ...form, m: { ...form.m, pub: e.target.checked } })} />
            </label>
            <p>
              <button onClick={() => setForm(null)}>취소</button> <button onClick={submit}>{form.i === null ? '꽂기' : '저장'}</button>
            </p>
          </div>
        ) : (
          <p>
            <button
              disabled={list.length >= SHELF_MAX}
              onClick={() => {
                setSel(null);
                setForm({ i: null, m: { title: '', url: '', color: ACCENTS[list.length % ACCENTS.length]![0], pub: false } });
              }}
            >
              + 책 꽂기
            </button>
          </p>
        ))}
    </>
  );
}
