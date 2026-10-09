import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Ctx } from '@core/types';
import { useBlobUrls } from '@shared/blobUrl';
import type { Equip, Sha256 } from '@shared/schemas';
import { BOARD_ITEM, NO_TINT, OWN_ITEM, SCALE_MAX, SCALE_MIN, adjust, capMessage, editOf, fresh, moveTo, parseColor, placeOf, twist, withColor, withEdit, withoutKeys } from '../logic';
import type { Point, Size, SlotId } from '../logic';
import DrawPanel from './DrawPanel';
import css from './stickers.module.css';

const VIEW = { width: 240, height: 300 };
const TABS: Array<[SlotId, string]> = [['sticker', '스티커'], ['desk.items', '책상 소품'], ['floor', '바닥']];
/** 그림 넣기와 직접 그리기로 올리는 그림의 긴 변. 가챠 아이템 그림과 같은 기준이고 64KB 안에 든다 (AVT-09) */
const SIDE = 256;

interface Img extends Size { url: string }
interface Drag { i: number; kind: 'move' | 'twist'; e0: Equip; img: Size; p0: Point; c: Point; at: Point }
/** 그림판. target이 있으면 그 항목의 그림을 바꾸고 없으면 새로 붙인다 */
interface Pad { board: boolean; target: number | null; under: ImageBitmap | null }

/** 꾸미기 창: 미리보기 위에서 끌어 옮기고 모서리 손잡이로 크기와 회전을 맞춘다. 직접 그리기와 칠판은 그림판으로 바꿔 그린다
 *  (AVT-05, AVT-07, AVT-08, AVT-09, AVT-10, AVT-13, AVT-14, AVT-19) */
export default function EditWindow({ ctx }: { ctx: Ctx }) {
  const wardrobe = ctx.modules.get('wardrobe')!;
  const gacha = ctx.modules.get('gacha');
  const [base, setBase] = useState(() => wardrobe.appearance());
  const [edit, setEdit] = useState(() => editOf(wardrobe.appearance()));
  const [inv, setInv] = useState(() => gacha?.inventory() ?? []);
  const [tab, setTab] = useState<SlotId>('sticker');
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pad, setPad] = useState<Pad | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => wardrobe.onChange(setBase), [wardrobe]);
  useEffect(() => gacha?.onInventory(setInv), [gacha]);
  useEffect(
    () =>
      ctx.bus.on('gacha.revoked', ({ keys }) => {
        setEdit((s) => editOf({ slots: withoutKeys(s, keys) }));
        setSel(null);
      }),
    [ctx],
  );

  const list = edit[tab];
  const cur = sel === null ? undefined : list[sel];
  const imgs = useImages(ctx, [...Object.values(edit).flat(), ...inv].map((x) => x.file));
  const nameOf = (e: Equip) => inv.find((x) => x.key === e.item)?.name ?? (e.item === OWN_ITEM ? '내 그림' : e.item === BOARD_ITEM ? '칠판' : e.item.split('/').pop());

  const setList = (fn: (l: Equip[]) => Equip[]) => setEdit((s) => ({ ...s, [tab]: fn(s[tab]) }));
  const patch = (i: number, fn: (e: Equip) => Equip) => setList((l) => l.map((e, j) => (j === i ? fn(e) : e)));
  const reorder = (i: number, d: number) => {
    setList((l) => {
      const out = [...l];
      [out[i], out[i + d]] = [out[i + d]!, out[i]!];
      return out;
    });
    setSel(i + d);
  };
  const remove = (i: number) => {
    setList((l) => l.filter((_, j) => j !== i));
    setSel(null);
  };
  const add = (item: string, file: Sha256, img?: Size) => {
    const full = capMessage(tab, list.length);
    setMsg(full ?? '');
    if (full) return;
    setList((l) => [...l, fresh(tab, item, file, img)]);
    setSel(list.length);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const addOwn = () =>
    run(async () => {
      const full = capMessage(tab, list.length);
      if (full) throw new Error(full);
      const f = await ctx.files.openImage();
      if (f) add(OWN_ITEM, ...(await upload(f.bytes)));
    });
  /** 줄여 올리고 그림 크기를 함께 돌려준다. 바닥 오브제를 바닥에 맞춰 놓을 때 크기가 필요하다 */
  const upload = async (bytes: Uint8Array): Promise<[Sha256, Size]> => {
    const small = await ctx.files.prepareImage(bytes, { maxSide: SIDE });
    const b = await createImageBitmap(new Blob([small as Uint8Array<ArrayBuffer>]));
    const size = { width: b.width, height: b.height };
    b.close();
    return [await ctx.files.upload(small), size];
  };
  // 칠판은 새 칠판으로 다시 쓰고 다른 것은 지금 그림 위에 그린다
  const openPad = (board: boolean, target: number | null) =>
    run(async () => {
      const full = target === null && capMessage(tab, list.length);
      if (full) throw new Error(full);
      const e = target === null ? null : list[target];
      const bytes = e?.file && !board ? await ctx.files.get(e.file) : null;
      setPad({ board, target, under: bytes ? await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>])) : null });
    });
  const closePad = () => {
    pad?.under?.close();
    setPad(null);
  };
  const drawn = async (png: Uint8Array) => {
    const [file, size] = await upload(png);
    if (pad && pad.target !== null) patch(pad.target, (e) => ({ ...e, file }));
    else add(pad?.board ? BOARD_ITEM : OWN_ITEM, file, size);
    closePad();
  };
  const save = () =>
    run(async () => {
      await wardrobe.update((a) => withEdit(a, edit));
      ctx.ui.toast('꾸미기를 저장했습니다.');
      ctx.ui.close('stickers.edit');
    });

  // 끌기는 픽셀로 계산하고 Equip 값으로 바꾼다. 포인터를 잡아 두어 미리보기 밖으로 나가도 이어진다
  const down = (ev: PointerEvent, i: number, kind: Drag['kind']) => {
    const e = list[i]!, img = e.file && imgs[e.file];
    ev.stopPropagation();
    setSel(i);
    if (!img) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const r = overlay.current!.getBoundingClientRect(), p = placeOf(img, e, VIEW);
    drag.current = { i, kind, e0: e, img, p0: { x: ev.clientX, y: ev.clientY }, c: { x: r.left + p.cx, y: r.top + p.cy }, at: { x: p.cx, y: p.cy } };
  };
  const move = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = { x: ev.clientX, y: ev.clientY };
    patch(d.i, () => (d.kind === 'move' ? moveTo(d.img, d.e0, VIEW, d.at.x + p.x - d.p0.x, d.at.y + p.y - d.p0.y) : twist(d.e0, d.c, d.p0, p)));
  };
  const up = () => (drag.current = null);

  const tint = parseColor(cur?.color);
  // 가챠 아이템은 같은 것을 모아야 색을 바꾼다 (GCH-05). 보관함에 없는 그림(내 그림)은 막지 않는다
  const need = gacha?.hueNeed() ?? 1;
  const owned = cur && inv.find((x) => x.key === cur.item);
  const hueOpen = !owned || owned.n >= need;
  const look = useMemo(() => withEdit(base, edit), [base, edit]);
  if (pad) return <DrawPanel ctx={ctx} board={pad.board} under={pad.under} onDone={drawn} onCancel={closePad} />;
  return (
    <div className={css.root}>
      <div className={css.left}>
        <div className={css.stage}>
          <ctx.ui.CharacterPreview appearance={look} width={VIEW.width} height={VIEW.height} />
          <div ref={overlay} className={css.overlay} onPointerDown={() => setSel(null)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            {list.map((e, i) => {
              const img = e.file && imgs[e.file];
              if (!img) return null;
              const p = placeOf(img, e, VIEW), s = e.scale ?? 1;
              return (
                <div
                  key={i}
                  className={css.box}
                  data-on={i === sel}
                  style={{ left: p.cx - (p.w * s) / 2, top: p.cy - (p.h * s) / 2, width: p.w * s, height: p.h * s, transform: `rotate(${e.rot ?? 0}deg)` }}
                  onPointerDown={(ev) => down(ev, i, 'move')}
                >
                  {i === sel && <span className={css.handle} title="끌어서 크기와 회전 맞추기" onPointerDown={(ev) => down(ev, i, 'twist')} />}
                </div>
              );
            })}
          </div>
        </div>
        {cur && sel !== null ? (
          <div className={css.controls}>
            <label>크기<input type="range" min={SCALE_MIN} max={SCALE_MAX} step={0.01} value={cur.scale ?? 1} onChange={(ev) => patch(sel, (e) => adjust(e, Number(ev.target.value), e.rot ?? 0))} /></label>
            <label>회전<input type="range" min={-180} max={179} value={cur.rot ?? 0} onChange={(ev) => patch(sel, (e) => adjust(e, e.scale ?? 1, Number(ev.target.value)))} /></label>
            {hueOpen ? (
              <>
                <label>색조 {tint.h}도<input type="range" min={0} max={359} value={tint.h} onChange={(ev) => patch(sel, (e) => withColor(e, { ...parseColor(e.color), h: Number(ev.target.value) }))} /></label>
                <label>채도 {tint.s}%<input type="range" min={0} max={200} step={5} value={tint.s} onChange={(ev) => patch(sel, (e) => withColor(e, { ...parseColor(e.color), s: Number(ev.target.value) }))} /></label>
              </>
            ) : (
              <p className={css.hint}>같은 아이템을 {need}개 모으면 색을 바꿀 수 있어요. 지금 {owned.n}개예요.</p>
            )}
            <button disabled={!cur.color} onClick={() => patch(sel, (e) => withColor(e, NO_TINT))}>원래 색으로</button>
            <div className={css.actions}>
              <button disabled={busy} onClick={() => void openPad(cur.item === BOARD_ITEM, sel)}>{cur.item === BOARD_ITEM ? '칠판 새로 쓰기' : '그림에 그리기'}</button>
              {owned && cur.file !== owned.file && <button onClick={() => patch(sel, (e) => ({ ...e, file: owned.file }))}>원래 그림으로</button>}
            </div>
          </div>
        ) : (
          <p className={css.hint}>붙인 것을 고르면 끌어서 옮기고 모서리 손잡이로 크기와 회전을 맞춥니다.</p>
        )}
      </div>

      <div className={css.right}>
        <nav className={css.tabs}>
          {TABS.map(([id, label]) => (
            <button key={id} aria-pressed={tab === id} onClick={() => {
              setTab(id);
              setSel(null);
              setMsg('');
            }}>{label}</button>
          ))}
        </nav>
        <h4>붙인 것 {list.length}개 <small className={css.hint}>아래쪽이 앞에 보입니다</small></h4>
        <ol className={css.list}>
          {list.map((e, i) => (
            <li key={i} data-on={i === sel}>
              {/* 고르기는 버튼이라 키보드로도 고른다. 순서와 빼기 버튼은 따로 둔다 */}
              <button className={css.pick} aria-pressed={i === sel} onClick={() => setSel(i)}>
                <Thumb url={e.file ? imgs[e.file]?.url : undefined} />
                <span>{nameOf(e)}</span>
              </button>
              <span className={css.btns}>
                <button disabled={i === 0} onClick={() => reorder(i, -1)}>뒤로</button>
                <button disabled={i === list.length - 1} onClick={() => reorder(i, 1)}>앞으로</button>
                <button onClick={() => remove(i)}>빼기</button>
              </span>
            </li>
          ))}
        </ol>
        <div className={css.actions}>
          <button disabled={busy} onClick={() => void openPad(false, null)}>직접 그리기</button>
          <button disabled={busy} onClick={() => void openPad(true, null)}>칠판 만들기</button>
          {tab !== 'sticker' && <button disabled={busy} onClick={() => void addOwn()}>그림 넣기</button>}
        </div>
        <h4>보관함</h4>
        {inv.length ? (
          <div className={css.inv}>
            {inv.map((it) => (
              <button key={it.key} className={css.item} disabled={busy} onClick={() => add(it.key, it.file, imgs[it.file])}>
                <Thumb url={imgs[it.file]?.url} />
                <span>{it.name}</span>
                <small>{it.room} 방</small>
              </button>
            ))}
          </div>
        ) : (
          <p className={css.hint}>방 가챠에서 뽑은 아이템이 여기에 나옵니다.</p>
        )}
      </div>

      <div className={css.foot}>
        {msg && <p role="alert" className={css.error}>{msg}</p>}
        <button disabled={busy} onClick={() => void save()}>저장</button>
      </div>
    </div>
  );
}

const Thumb = ({ url }: { url: string | undefined }) => <span className={css.thumb}>{url && <img src={url} alt="" />}</span>;

/** 해시마다 그림을 한 번 받아 blob URL과 크기를 기억한다. 창이 닫히면 URL을 돌려준다 */
function useImages(ctx: Ctx, hashes: Array<Sha256 | null>): Record<string, Img> {
  const urls = useBlobUrls(hashes.filter((h) => h !== null), ctx.files.get);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  useEffect(() => {
    for (const [h, url] of Object.entries(urls)) {
      if (sizes[h] || !url) continue;
      const el = new Image();
      el.src = url;
      el.decode().then(() => setSizes((m) => ({ ...m, [h]: { width: el.naturalWidth, height: el.naturalHeight } })), () => undefined);
    }
  }, [urls, sizes]);
  return useMemo(() => Object.fromEntries(Object.entries(sizes).flatMap(([h, sz]) => (urls[h] ? [[h, { ...sz, url: urls[h] }]] : []))), [urls, sizes]);
}
