import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import type { Ctx } from '@core/types';
import { paintDoc } from '../draw';
import { EMPTY, fileName, handleOf, INKS, PENS, push, redo, STICKER_SIZE, STICKERS, stickerAt, twist, undo } from '../logic';
import type { Doc, History, PenId, Pt, Sticker } from '../logic';
import { download } from './save';
import css from './photo.module.css';

const VIEW = { width: 580, height: 440 };
/** 방에 보낼 때 긴 변. 64KB 안에 들지 않으면 코어가 더 줄인다 */
const SEND_SIDE = 960;
/** 손잡이를 잡았다고 보는 거리 (사진 픽셀) */
const HANDLE_HIT = 24;

type Drag = { kind: 'draw' } | { kind: 'move' | 'twist'; i: number; s0: Sticker; p0: Pt };

/** 꾸미기: 찍은 사진 위에 펜으로 그리고 스티커를 붙인 뒤 내려받거나 방 사람에게 보낸다 */
export default function Decorate({ ctx, sheet }: { ctx: Ctx; sheet: ImageBitmap }) {
  const [hist, setHist] = useState<History>({ list: [EMPTY], at: 0 });
  // 끄는 동안의 문서. 손을 떼면 되돌리기 목록에 넣는다
  const [draft, setDraft] = useState<Doc | null>(null);
  const [mode, setMode] = useState<'draw' | 'move'>('draw');
  const [pen, setPen] = useState<PenId>('basic');
  const [width, setWidth] = useState(15);
  const [color, setColor] = useState(INKS[2]![0]);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const doc = hist.list[hist.at]!;
  const shown = draft ?? doc;
  const scale = Math.min(VIEW.width / sheet.width, VIEW.height / sheet.height);

  useEffect(() => paintDoc(canvas.current!.getContext('2d')!, sheet, shown, mode === 'move' ? sel : null), [sheet, shown, mode, sel]);

  const at = (e: PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.round(((e.clientX - r.left) / r.width) * sheet.width), y: Math.round(((e.clientY - r.top) / r.height) * sheet.height) };
  };
  const down = (e: PointerEvent) => {
    const p = at(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (mode === 'draw') {
      drag.current = { kind: 'draw' };
      return setDraft({ ...doc, strokes: [...doc.strokes, { pen, color, width, pts: [p.x, p.y] }] });
    }
    const s = sel === null ? undefined : doc.stickers[sel];
    if (s && sel !== null) {
      const h = handleOf(s);
      if (Math.hypot(p.x - h.x, p.y - h.y) < HANDLE_HIT) return void (drag.current = { kind: 'twist', i: sel, s0: s, p0: p });
    }
    const i = stickerAt(doc.stickers, p);
    setSel(i);
    if (i !== null) drag.current = { kind: 'move', i, s0: doc.stickers[i]!, p0: p };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    if (d.kind === 'draw') {
      return setDraft((x) => x && { ...x, strokes: x.strokes.map((s, j) => (j === x.strokes.length - 1 ? { ...s, pts: [...s.pts, p.x, p.y] } : s)) });
    }
    const next = d.kind === 'move' ? { ...d.s0, x: d.s0.x + p.x - d.p0.x, y: d.s0.y + p.y - d.p0.y } : twist(d.s0, d.p0, p);
    setDraft({ ...doc, stickers: doc.stickers.map((s, j) => (j === d.i ? next : s)) });
  };
  const up = () => {
    drag.current = null;
    if (draft) setHist((h) => push(h, draft));
    setDraft(null);
  };
  // 펜이나 색을 고르면 그리기로 돌아간다
  const draw = (pick: () => void) => {
    pick();
    setMode('draw');
  };
  const change = (fn: (h: History) => History) => {
    setHist(fn);
    setSel(null);
  };
  const addSticker = (e: string) => {
    const d = { ...doc, stickers: [...doc.stickers, { e, x: sheet.width / 2, y: sheet.height / 2, size: STICKER_SIZE, rot: 0 }] };
    setHist((h) => push(h, d));
    setMode('move');
    setSel(d.stickers.length - 1);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    setNote('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  // 고른 스티커 테두리 없이 사진 크기 그대로 굽는다
  const render = () => {
    const c = new OffscreenCanvas(sheet.width, sheet.height);
    paintDoc(c.getContext('2d')!, sheet, doc);
    return c.convertToBlob({ type: 'image/png' });
  };
  const save = (e: MouseEvent<HTMLButtonElement>) => {
    const d = e.currentTarget.ownerDocument;
    void run(async () => {
      download(ctx, d, await render(), fileName(new Date()));
      setNote('사진을 내려받았어요.');
    });
  };
  const send = () =>
    run(async () => {
      if (!ctx.room.current()) throw new Error('방에 들어가 있을 때만 보낼 수 있어요.');
      const png = new Uint8Array(await (await render()).arrayBuffer());
      const file = await ctx.files.upload(await ctx.files.prepareImage(png, { maxSide: SEND_SIDE }));
      if (!ctx.room.emit('shared', { file })) throw new Error('지금은 보낼 수 없어요. 잠시 뒤에 다시 보내 주세요.');
      setNote('지금 방에 있는 사람들에게 보냈어요.');
    });

  return (
    <div>
      <div className={css.sheet}>
        <canvas
          ref={canvas}
          width={sheet.width}
          height={sheet.height}
          aria-label="꾸미기 캔버스"
          className={mode === 'draw' ? css.drawing : css.moving}
          style={{ width: sheet.width * scale, height: sheet.height * scale }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>
      <p className={css.hint}>
        {mode === 'move' ? '스티커를 누르면 손잡이가 나와요. 끌어서 옮기고 손잡이로 크기와 각도를 맞춰요.' : draft ? '그리는 중이에요. 스티커는 옮기기에서 움직여요.' : '사진 위를 끌어서 그려요.'}
      </p>
      <nav aria-label="꾸미기 도구">
        <button aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>그리기</button>
        <button aria-pressed={mode === 'move'} onClick={() => setMode('move')}>옮기기</button>
      </nav>
      <div className={css.stickers}>
        {STICKERS.map((e) => <button key={e} aria-label={`스티커 ${e}`} onClick={() => addSticker(e)}>{e}</button>)}
      </div>
      <div className={css.row}>
        <span>펜</span>
        <nav aria-label="펜 종류">
          {PENS.map(([id, label]) => <button key={id} aria-pressed={pen === id} onClick={() => draw(() => setPen(id))}>{label}</button>)}
        </nav>
      </div>
      <div className={css.row}>
        <span>색</span>
        <div className={css.swatches}>
          {INKS.map(([c, name]) => <button key={c} className={css.swatch} style={{ background: c }} aria-label={name} aria-pressed={color === c} onClick={() => draw(() => setColor(c))} />)}
        </div>
      </div>
      <label>굵기 {width}<input type="range" min={2} max={40} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
      <div className={css.foot}>
        <button disabled={hist.at === 0} onClick={() => change(undo)}>되돌리기</button>
        <button disabled={hist.at === hist.list.length - 1} onClick={() => change(redo)}>앞으로</button>
        <button disabled={!doc.strokes.length && !doc.stickers.length} onClick={() => change((h) => push(h, EMPTY))}>전부 지우기</button>
        <span className={css.grow} />
        <button disabled={busy} onClick={() => void send()}>방에 보내기</button>
        <button type="submit" disabled={busy} onClick={save}>저장하기</button>
      </div>
      <p className={css.hint}>저장하기는 내 컴퓨터에 바로 내려받아요. 방에 보내기는 64KB 안으로 줄인 사진을 지금 방에 있는 사람들에게 보내요.</p>
      {note && <p className={css.hint} role="status">{note}</p>}
      {msg && <p role="alert" className={css.error}>{msg}</p>}
    </div>
  );
}
