import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent } from 'react';
import type { Ctx } from '@core/types';
import { clipBody, drawBody, drawPose, faceRect, type BodyKind } from '../bodies';
import type { FaceEdit, Op } from '../face';
import { FACE_SIZE, faceView, fitStamp, POSE_IDS, resizeRect, toLocal, type Face, type PoseId, type Pt, type Rect } from '../logic';
import css from './wardrobe.module.css';

const INKS: Array<[string, string]> = [['#222222', '검정'], ['#ffffff', '흰색'], ['#ff8fb1', '분홍'], ['#4a90e2', '파랑'], ['#ff9f43', '주황']];
const SKINS: Array<[string, string]> = [['#ffe4ec', '분홍'], ['#fff1d6', '크림'], ['#dcefff', '하늘'], ['#e2f4dc', '연두'], ['#d9c2a5', '갈색']];
const POSE_LABEL: Record<PoseId, string> = { idle: '기본', typing: '타이핑', sleep: '잠듦' };

interface Stamp { img: ImageBitmap; base: Rect; r: Rect; scale: number }

/** 얼굴 그리기 (AVT-03, AVT-04). 몸과 몸 색을 고르고 표정과 감은눈을 512px 그림판에 그린다 */
export default function FacePanel({ ctx, edit, face, body, onFace, onError }: {
  ctx: Ctx;
  edit: FaceEdit;
  face: Face;
  body: BodyKind;
  onFace: (f: Face) => void;
  onError: (msg: string) => void;
}) {
  useSyncExternalStore(edit.subscribe, edit.version);
  const [which, setWhich] = useState<'open' | 'closed'>('open');
  const [color, setColor] = useState(INKS[0]![0]);
  const [size, setSize] = useState(12);
  const [sym, setSym] = useState(false);
  const [erase, setErase] = useState(false);
  const [stamp, setStamp] = useState<Stamp | null>(null);
  // 저장하지 않은 그림이 있을 때 ESC를 한 번 누르면 창을 닫기 전에 묻는다
  const [leaving, setLeaving] = useState(false);
  const board = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Op | null>(null);
  const drag = useRef<Pt | null>(null);
  const p = which === 'open' ? edit.open : edit.closed;
  const pose: PoseId = which === 'open' ? 'idle' : 'sleep';

  // 얼굴 칸만큼 확대한 몸 위에 그림판을 몸통 모양으로 잘라 얹는다. 저장되는 모습과 같다
  const paint = () => {
    const g = board.current?.getContext('2d');
    if (!g) return;
    const v = faceView(faceRect(pose), FACE_SIZE);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
    g.setTransform(v.s, 0, 0, v.s, v.dx, v.dy);
    drawBody(g, body, pose, face.color);
    g.save();
    clipBody(g, pose);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(stroke.current ? p.preview(stroke.current) : p.layer, 0, 0);
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (stamp) {
      const { x, y, w, h } = stamp.r;
      g.globalAlpha = 0.85;
      g.drawImage(stamp.img, x, y, w, h);
      g.globalAlpha = 1;
      g.setLineDash([8, 6]);
      g.lineWidth = 2;
      g.strokeStyle = '#4a3b47';
      g.strokeRect(x, y, w, h);
      g.setLineDash([]);
    }
  };
  useEffect(paint);

  const pickInk = (c: string) => {
    setColor(c);
    setErase(false);
  };
  const act = (fn: () => void) => {
    fn();
    edit.touched = true;
  };
  const putStamp = () => {
    if (!stamp) return;
    act(() => p.add({ t: 'stamp', img: stamp.img, r: stamp.r }));
    setStamp(null);
  };
  const dropStamp = () => {
    stamp?.img.close();
    setStamp(null);
  };

  // 창 안에서 Ctrl+Z 되돌리기, Ctrl+Shift+Z 다시 하기. 한글 조합 중에는 무시한다.
  // 여기서 처리한 ESC는 창 닫기로 넘기지 않는다
  useEffect(() => {
    const doc = board.current?.ownerDocument;
    if (!doc) return;
    const consume = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        act(e.shiftKey ? p.redo : p.undo);
      } else if (stamp && e.key === 'Enter') {
        e.preventDefault();
        putStamp();
      } else if (stamp && e.key === 'Escape') {
        consume(e);
        dropStamp();
      } else if (e.key === 'Escape' && !leaving && (edit.open.dirty() || edit.closed.dirty())) {
        consume(e);
        setLeaving(true);
      }
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  });

  const at = (e: PointerEvent<HTMLCanvasElement>): Pt => toLocal(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), FACE_SIZE);
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (stamp) drag.current = at(e);
    else stroke.current = { t: 'line', color: erase ? '#000000' : color, size, erase, sym, pts: [at(e)] };
    paint();
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const pt = at(e);
    if (stamp && drag.current) {
      const [dx, dy] = [pt[0] - drag.current[0], pt[1] - drag.current[1]];
      drag.current = pt;
      setStamp({ ...stamp, r: { ...stamp.r, x: stamp.r.x + dx, y: stamp.r.y + dy } });
    } else if (stroke.current?.t === 'line') {
      stroke.current.pts.push(pt);
      paint();
    }
  };
  const up = () => {
    drag.current = null;
    const op = stroke.current;
    stroke.current = null;
    if (op) act(() => p.add(op));
  };

  // 큰 그림은 그림판 크기로 줄여 둔다
  const pickStamp = async () => {
    try {
      const f = await ctx.files.openImage();
      if (!f) return;
      let img = await createImageBitmap(new Blob([f.bytes as Uint8Array<ArrayBuffer>]));
      const k = FACE_SIZE / Math.max(img.width, img.height);
      if (k < 1) {
        const big = img;
        img = await createImageBitmap(big, { resizeWidth: Math.round(big.width * k), resizeHeight: Math.round(big.height * k), resizeQuality: 'high' });
        big.close();
      }
      const r = fitStamp(img.width, img.height, FACE_SIZE, 0.6);
      stamp?.img.close();
      setStamp({ img, base: r, r, scale: 1 });
    } catch {
      onError('그림 파일을 읽지 못했습니다. PNG, WebP, GIF, JPG 파일인지 확인해 주세요.');
    }
  };

  return (
    <div>
      {leaving && (
        <div role="alert" className={css.tools}>
          <span>저장하지 않은 그림이 있어요. 창을 닫을까요?</span>
          <button onClick={() => ctx.ui.close('wardrobe.create')}>닫기</button>
          <button onClick={() => setLeaving(false)}>계속 그리기</button>
        </div>
      )}
      <div className={css.tools}>
        <span>몸 색</span>
        {SKINS.map(([c, name]) => (
          <button key={c} className={css.swatch} style={{ background: c }} aria-label={`몸 색 ${name}`} aria-pressed={face.color === c} onClick={() => onFace({ ...face, color: c })} />
        ))}
        <input type="color" aria-label="몸 색 고르기" value={face.color} onChange={(e) => onFace({ ...face, color: e.target.value })} />
      </div>
      <nav className={css.steps} aria-label="그릴 얼굴">
        <button aria-pressed={which === 'open'} onClick={() => setWhich('open')}>표정</button>
        <button aria-pressed={which === 'closed'} onClick={() => setWhich('closed')}>감은눈</button>
      </nav>
      <div className={css.tools}>
        {INKS.map(([c, name]) => (
          <button key={c} className={css.swatch} style={{ background: c }} aria-label={name} aria-pressed={!erase && color === c} onClick={() => pickInk(c)} />
        ))}
        <input type="color" aria-label="붓 색 고르기" value={color} onChange={(e) => pickInk(e.target.value)} />
        <label>
          굵기 <input type="range" min={2} max={60} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
      </div>
      <div className={css.tools}>
        <button aria-pressed={sym} onClick={() => setSym((s) => !s)}>대칭</button>
        <button aria-pressed={erase} onClick={() => setErase((s) => !s)}>지우개</button>
        <button disabled={!p.canUndo()} onClick={() => act(p.undo)}>되돌리기</button>
        <button disabled={!p.canRedo()} onClick={() => act(p.redo)}>다시 하기</button>
        <button onClick={() => act(() => p.add({ t: 'clear' }))}>지우기</button>
        <button onClick={() => void pickStamp()}>이미지</button>
      </div>
      {stamp && (
        <div className={css.tools}>
          <label>
            크기 <input type="range" min={20} max={200} value={Math.round(stamp.scale * 100)} onChange={(e) => {
              const scale = Number(e.target.value) / 100;
              setStamp({ ...stamp, scale, r: resizeRect(stamp.r, stamp.base.w * scale, stamp.base.h * scale) });
            }} />
          </label>
          <button onClick={putStamp}>찍기</button>
          <button onClick={dropStamp}>취소</button>
        </div>
      )}
      <p className={css.hint}>
        {stamp ? '그림을 끌어서 옮기고 크기를 맞춘 뒤 찍기를 눌러 주세요.' : which === 'open' ? '표정은 기본 자세와 타이핑 자세에 들어갑니다.' : '감은눈은 잠든 자세에 들어갑니다.'}
      </p>
      <div className={css.face}>
        <canvas ref={board} width={FACE_SIZE} height={FACE_SIZE} className={css.board} aria-label="얼굴 그림판"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        <div className={css.minis}>
          {POSE_IDS.map((ps) => (
            <div key={ps}>
              {face.use[ps] ? <PoseThumb edit={edit} body={body} color={face.color} pose={ps} small /> : <div className={css.mini}>넣은 그림</div>}
              {POSE_LABEL[ps]}
            </div>
          ))}
        </div>
      </div>
      {POSE_IDS.some((ps) => !face.use[ps]) && <p className={css.hint}>그림을 넣은 자세는 넣은 그림을 씁니다. 자세 그림 넣기에서 바꿀 수 있습니다.</p>}
    </div>
  );
}

/** 얼굴 그리기로 만들 자세 그림 미리보기. 저장 전이라 올리지 않고 바로 그린다 */
export function PoseThumb({ edit, body, color, pose, small = false }: { edit: FaceEdit; body: BodyKind; color: string; pose: PoseId; small?: boolean }) {
  const v = useSyncExternalStore(edit.subscribe, edit.version);
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = c.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 160, 200);
    drawPose(g, body, pose, color, (pose === 'sleep' ? edit.closed : edit.open).layer);
  }, [v, edit, body, color, pose]);
  return <canvas ref={c} width={160} height={200} className={small ? css.mini : css.thumb} aria-label={`${POSE_LABEL[pose]} 미리보기`} />;
}
