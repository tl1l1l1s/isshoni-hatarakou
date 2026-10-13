// 얼굴 그림판 상태와 자세 그림 굽기 (AVT-03, AVT-04). 캐릭터 만들기 창이 열려 있는 동안만 쓴다
import type { Ctx } from '@core/types';
import type { Appearance } from '@shared/schemas';
import { BODIES, faceRect, poseCanvas, posePng } from './bodies';
import { FACE_SIZE, faceOf, faceView, mirror, POSE_IDS, pushOp, redoOp, undoOp, withFace, type History, type PoseId, type Pt, type Rect } from './logic';

/** bare는 얼굴 그리기의 전부 지우기가 몸까지 뺐는지. 되돌리면 몸도 돌아온다 */
export type Op =
  | { t: 'line'; color: string; size: number; erase: boolean; sym: boolean; pts: Pt[] }
  | { t: 'clear'; bare?: boolean }
  | { t: 'stamp'; img: CanvasImageSource; r: Rect };

type G = OffscreenCanvasRenderingContext2D;
const INK = '#4a3b47';

function line(g: G, pts: Pt[], color: string, size: number) {
  g.beginPath();
  if (pts.length === 1) {
    g.arc(pts[0]![0], pts[0]![1], size / 2, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    return;
  }
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.strokeStyle = color;
  g.lineWidth = size;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

function drawOp(g: G, op: Op) {
  if (op.t === 'clear') return g.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
  if (op.t === 'stamp') return g.drawImage(op.img, op.r.x, op.r.y, op.r.w, op.r.h);
  g.save();
  g.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
  line(g, op.pts, op.color, op.size);
  if (op.sym) line(g, mirror(op.pts, FACE_SIZE), op.color, op.size);
  g.restore();
}

/** 512px 그림판 하나. 바탕 그림 위에 획 기록을 다시 그려 되돌리기를 한다. 스티커 직접 그리기(AVT-09)도 api.ts로 받아 쓴다 */
export function painter(changed: () => void) {
  const layer = new OffscreenCanvas(FACE_SIZE, FACE_SIZE);
  const g = layer.getContext('2d')!;
  const scratch = new OffscreenCanvas(FACE_SIZE, FACE_SIZE);
  let base: CanvasImageSource | null = null;
  let h: History<Op> = { done: [], undone: [] };
  let dirty = false;
  const redraw = () => {
    g.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
    if (base) g.drawImage(base, 0, 0, FACE_SIZE, FACE_SIZE);
    h.done.forEach((op) => drawOp(g, op));
    changed();
  };
  const move = (next: History<Op>, op: Op | undefined) => {
    if (next === h) return op;
    h = next;
    dirty = true;
    redraw();
    return op;
  };
  return {
    layer,
    dirty: () => dirty,
    canUndo: () => h.done.length > 0,
    canRedo: () => h.undone.length > 0,
    setBase(b: CanvasImageSource | null) {
      base = b;
      redraw();
    },
    add(op: Op) {
      h = pushOp(h, op);
      dirty = true;
      drawOp(g, op);
      changed();
    },
    /** 되돌리기와 다시 하기는 옮긴 획을 돌려준다. 얼굴 그리기가 몸까지 뺀 전부 지우기인지 본다 */
    undo: () => move(undoOp(h), h.done.at(-1)),
    redo: () => move(redoOp(h), h.undone.at(-1)),
    /** 되돌리기(back)나 다시 하기가 다음에 옮길 획. 옮기지 않고 본다 */
    peek: (back: boolean) => (back ? h.done : h.undone).at(-1),
    /** 그리는 중인 획을 얹은 모습 */
    preview(op: Op) {
      const s = scratch.getContext('2d')!;
      s.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
      s.drawImage(layer, 0, 0);
      drawOp(s, op);
      return scratch;
    },
  };
}
export type Painter = ReturnType<typeof painter>;

/** 처음 얼굴. 기본 자세 그림(placeholder)과 같은 눈, 입, 볼을 얼굴 칸 좌표로 그린다 */
function defaultFace(closed: boolean): OffscreenCanvas {
  const c = new OffscreenCanvas(FACE_SIZE, FACE_SIZE);
  const g = c.getContext('2d')!;
  const v = faceView(faceRect('idle'), FACE_SIZE);
  g.setTransform(v.s, 0, 0, v.s, v.dx, v.dy);
  g.lineWidth = 3;
  g.strokeStyle = INK;
  const dot = (x: number, y: number, rx: number, ry: number, fill: string) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };
  const arc = (x: number, y: number) => {
    g.beginPath();
    g.arc(x, y, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  };
  dot(52, 146, 9, 5, '#ffa8bd');
  dot(108, 146, 9, 5, '#ffa8bd');
  if (closed) {
    arc(62, 124);
    arc(98, 124);
    dot(80, 146, 2.5, 2, INK);
  } else {
    dot(62, 126, 5, 6, INK);
    dot(98, 126, 5, 6, INK);
    dot(64, 123, 1.6, 1.6, '#fff');
    dot(100, 123, 1.6, 1.6, '#fff');
    arc(80, 138);
  }
  return c;
}

/** 외형 하나의 얼굴 그림판 두 장(표정, 감은눈). 저장한 얼굴 그림이 있으면 받아 바탕으로 깐다 */
export function faceEdit(ctx: Ctx, a: Appearance) {
  const subs = new Set<() => void>();
  let version = 0;
  const changed = () => {
    version++;
    subs.forEach((fn) => fn());
  };
  const f = faceOf(a);
  const open = painter(changed);
  const closed = painter(changed);
  const load = async (p: Painter, hash: string | undefined, isClosed: boolean) => {
    if (!hash) return p.setBase(defaultFace(isClosed));
    const bytes = await ctx.files.get(hash);
    if (!bytes) throw new Error('얼굴 그림을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.');
    p.setBase(await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>])));
  };
  const ready = Promise.all([load(open, f.open, false), load(closed, f.closed, true)]).then(() => undefined);
  ready.catch((e: Error) => ctx.log.warn(e.message));
  return {
    open,
    closed,
    ready,
    /** 저장할 때 자세 그림을 다시 굽는다. 그림이 하나도 없는 새 캐릭터는 처음부터 켠다 */
    touched: POSE_IDS.every((p) => !a.poses[p]),
    version: () => version,
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
}
export type FaceEdit = ReturnType<typeof faceEdit>;

/** 그림판에 alpha가 0보다 큰 픽셀이 하나도 없는지 */
function blank(c: OffscreenCanvas): boolean {
  const px = c.getContext('2d')!.getImageData(0, 0, FACE_SIZE, FACE_SIZE).data;
  for (let i = 3; i < px.length; i += 4) if (px[i]) return false;
  return true;
}

/** 자세에 들어갈 얼굴 그림판. 잠듦은 감은 눈을 쓰는데 몸 없이 그릴 때 감은 눈이 비어 있으면 표정을 써서 잠들어도 캐릭터가 사라지지 않는다.
 *  몸이 있으면 픽셀을 읽지 않는다 */
export const poseFace = (e: FaceEdit, pose: PoseId, bare = false) =>
  (pose !== 'sleep' || (bare && blank(e.closed.layer)) ? e.open : e.closed).layer;

const png = async (c: OffscreenCanvas) => new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());

/** 저장하면 bakeFace가 구울 자세 그림을 올리지 않고 바로 그린다. 미리보기가 저장하기 전 얼굴을 보이게 한다.
 *  고치지 않았으면 저장한 그림 그대로라 없다 */
export function facePoses(a: Appearance, e: FaceEdit): Partial<Record<PoseId, OffscreenCanvas>> | undefined {
  if (!e.touched) return undefined;
  const f = faceOf(a);
  return Object.fromEntries(POSE_IDS.filter((p) => f.use[p]).map((p) => [p, poseCanvas(f.bare ? null : a.body, p, f.color, poseFace(e, p, f.bare))]));
}

/** 얼굴 그리기를 쓰는 자세의 그림을 굽고 올려 poses에 넣고 고칠 수 있는 편집 데이터를 bodyExt.face에 남긴다 */
export async function bakeFace(ctx: Ctx, a: Appearance, e: FaceEdit): Promise<Appearance> {
  if (!e.touched) return a;
  await e.ready;
  const f = faceOf(a);
  const up = async (bytes: Uint8Array, maxSide: number) => ctx.files.upload(await ctx.files.prepareImage(bytes, { maxSide }));
  const keep = (p: Painter, hash: string | undefined) => (hash && !p.dirty() ? hash : png(p.layer).then((b) => up(b, FACE_SIZE)));
  const [open, closed, ...baked] = await Promise.all([
    keep(e.open, f.open),
    keep(e.closed, f.closed),
    // 자세 그림은 좌석의 두 배 해상도(320x400) 그대로 올린다
    ...POSE_IDS.map((p) => (f.use[p] ? posePng(f.bare ? null : a.body, p, f.color, poseFace(e, p, f.bare)).then((b) => up(b, 400)) : null)),
  ]);
  const poses = { ...a.poses };
  POSE_IDS.forEach((p, i) => {
    if (baked[i]) poses[p] = baked[i];
  });
  return withFace({ ...a, poses }, { ...f, tpl: BODIES[a.body].id, open: open!, closed: closed! });
}
