import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Ctx } from '@core/types';
import { PAD_SIZE as SIZE, painter, type Op, type Pt } from '@modules/wardrobe/api';
import { boardLines, fitIn, opaqueRect, type Rect } from '../logic';
import css from './stickers.module.css';

const INKS: Array<[string, string]> = [['#222222', '검정'], ['#ffffff', '흰색'], ['#ff8fb1', '분홍'], ['#4a90e2', '파랑'], ['#ff9f43', '주황']];
const FULL: Rect = { x: 0, y: 0, w: SIZE, h: SIZE };
/** 칠판 자리. 회색 테두리의 가로로 긴 흰 판 (AVT-10) */
const BOARD: Rect = { x: 16, y: 96, w: SIZE - 32, h: 320 };

type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawBoard(g: G, text: string) {
  const { x, y, w, h } = BOARD;
  g.fillStyle = '#9a9a9a';
  g.beginPath();
  g.roundRect(x, y, w, h, 24);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(x + 14, y + 14, w - 28, h - 28, 12);
  g.fill();
  const lines = boardLines(text);
  if (!lines.length) return;
  let size = 72;
  g.font = `bold ${size}px sans-serif`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  if (widest > w - 60) size = Math.floor((size * (w - 60)) / widest);
  g.font = `bold ${size}px sans-serif`;
  g.fillStyle = '#222222';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.2));
}

/**
 * 스티커 그림판 (AVT-09, AVT-10). 얼굴 그리기의 512px 그림판을 그대로 쓴다.
 * under가 있으면 그 그림 위에 그리고(파츠에 직접 그리기) board면 칠판 위에 글씨와 낙서를 한다.
 * 완료하면 그린 부분만 잘라 PNG로 넘긴다
 */
export default function DrawPanel({ ctx, board, under, onDone, onCancel }: {
  ctx: Ctx;
  board: boolean;
  under: ImageBitmap | null;
  onDone: (png: Uint8Array) => Promise<void>;
  onCancel: () => void;
}) {
  const [, setVersion] = useState(0);
  const [p] = useState(() => painter(() => setVersion((n) => n + 1)));
  const [color, setColor] = useState(INKS[0]![0]);
  const [size, setSize] = useState(board ? 8 : 16);
  const [erase, setErase] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pad = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Op | null>(null);
  const underAt = under && fitIn(under.width, under.height, FULL);

  // 칠판, 고친 그림, 획 순서로 겹친다. 획은 칠판 밖으로 나가지 않는다
  const paint = (g: G, live: boolean) => {
    g.clearRect(0, 0, SIZE, SIZE);
    if (board) drawBoard(g, text);
    if (under && underAt) g.drawImage(under, underAt.x, underAt.y, underAt.w, underAt.h);
    g.save();
    if (board) {
      g.beginPath();
      g.rect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
      g.clip();
    }
    g.drawImage(live && stroke.current ? p.preview(stroke.current) : p.layer, 0, 0);
    g.restore();
  };
  const redraw = () => {
    const g = pad.current?.getContext('2d');
    if (g) paint(g, true);
  };
  useEffect(redraw);

  const at = (e: PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) * SIZE) / r.width, ((e.clientY - r.top) * SIZE) / r.height];
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stroke.current = { t: 'line', color: erase ? '#000000' : color, size, erase, sym: false, pts: [at(e)] };
    redraw();
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (stroke.current?.t !== 'line') return;
    stroke.current.pts.push(at(e));
    redraw();
  };
  const up = () => {
    const op = stroke.current;
    stroke.current = null;
    if (op) p.add(op);
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
  // 도안 불러오기: 고른 그림을 그림판(칠판이면 칠판)에 꽉 맞춰 찍는다. 큰 그림은 그림판 크기로 줄여 둔다
  const pattern = () =>
    run(async () => {
      const f = await ctx.files.openImage();
      if (!f) return;
      let img = await createImageBitmap(new Blob([f.bytes as Uint8Array<ArrayBuffer>]));
      const k = SIZE / Math.max(img.width, img.height);
      if (k < 1) {
        const big = img;
        img = await createImageBitmap(big, { resizeWidth: Math.round(big.width * k), resizeHeight: Math.round(big.height * k), resizeQuality: 'high' });
        big.close();
      }
      p.add({ t: 'stamp', img, r: fitIn(img.width, img.height, board ? BOARD : FULL) });
    });
  const done = () =>
    run(async () => {
      const c = new OffscreenCanvas(SIZE, SIZE);
      const g = c.getContext('2d')!;
      paint(g, false);
      // 칠판은 칠판 크기로, 고친 그림은 원래 그림 자리로 자른다. 원래 그림과 비율이 같아서 붙인 자리가 그대로다
      const r = board ? BOARD : underAt ?? opaqueRect(g.getImageData(0, 0, SIZE, SIZE).data, SIZE, SIZE);
      if (!r) throw new Error('그림을 먼저 그려 주세요.');
      const out = new OffscreenCanvas(Math.round(r.w), Math.round(r.h));
      out.getContext('2d')!.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
      await onDone(new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer()));
    });

  const pick = (c: string) => {
    setColor(c);
    setErase(false);
  };
  return (
    <div className={css.draw}>
      <h4>{board ? '칠판' : under ? '그림에 그리기' : '직접 그리기'}</h4>
      {board && (
        <label>
          칠판 글씨
          <textarea rows={3} maxLength={62} placeholder="세 줄까지 적을 수 있어요" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      <div className={css.actions}>
        {INKS.map(([c, name]) => (
          <button key={c} className={css.swatch} style={{ background: c }} aria-label={name} aria-pressed={!erase && color === c} onClick={() => pick(c)} />
        ))}
        <input type="color" aria-label="붓 색 고르기" value={color} onChange={(e) => pick(e.target.value)} />
        <label>
          굵기 <input type="range" min={2} max={60} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
      </div>
      <div className={css.actions}>
        <button aria-pressed={erase} onClick={() => setErase((v) => !v)}>지우개</button>
        <button disabled={!p.canUndo()} onClick={p.undo}>되돌리기</button>
        <button disabled={!p.canRedo()} onClick={p.redo}>다시 하기</button>
        <button onClick={() => p.add({ t: 'clear' })}>지우기</button>
        <button disabled={busy} onClick={() => void pattern()}>도안 불러오기</button>
      </div>
      <canvas ref={pad} width={SIZE} height={SIZE} className={css.pad} aria-label="스티커 그림판"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <p className={css.hint}>{under ? '그린 선은 원래 그림 위에 겹쳐집니다.' : '그린 부분만 잘라 스티커로 만듭니다.'} 큰 그림은 256px로 줄여 저장합니다.</p>
      <div className={css.foot}>
        {msg && <p role="alert" className={css.error}>{msg}</p>}
        <button disabled={busy} onClick={onCancel}>취소</button>
        <button disabled={busy} onClick={() => void done()}>완료</button>
      </div>
    </div>
  );
}
