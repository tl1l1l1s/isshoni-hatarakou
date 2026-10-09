// 얼굴 그리기용 기본 몸 (AVT-03). 외부 에셋 없이 코드로 그린 자체 제작 그림이다 (assets.json).
// 좌석(160x200) 좌표로 그리고 자세 그림처럼 320x400으로 굽는다. 얼굴 그림은 자세마다 정한 얼굴 칸에 들어간다.
import type { PoseId, Rect } from './logic';

type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Ell = [x: number, y: number, rx: number, ry: number];

const INK = '#4a3b47';

export const BODIES = {
  human: { id: 'wardrobe.body.human', label: '사람', ears: false },
  animal: { id: 'wardrobe.body.animal', label: '동물', ears: true },
};
export type BodyKind = keyof typeof BODIES;

/** 자세마다 몸통, 손, 얼굴 칸. 타이핑은 얼굴이 조금 아래를 보고 잠듦은 몸이 눌린다 */
const LAYOUT: Record<PoseId, { body: Ell; hands: Ell[]; face: Rect }> = {
  idle: { body: [80, 136, 58, 54], hands: [[24, 158, 11, 9], [136, 158, 11, 9]], face: { x: 36, y: 84, w: 88, h: 88 } },
  typing: { body: [80, 136, 58, 54], hands: [[60, 172, 13, 9], [100, 172, 13, 9]], face: { x: 36, y: 90, w: 88, h: 88 } },
  sleep: { body: [80, 144, 60, 46], hands: [[30, 174, 11, 8], [130, 174, 11, 8]], face: { x: 36, y: 96, w: 88, h: 88 } },
};

export const faceRect = (pose: PoseId): Rect => LAYOUT[pose].face;

function blob(g: G, [x, y, rx, ry]: Ell, fill: string, stroke = true) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (stroke) g.stroke();
}

function poly(g: G, pts: Array<[number, number]>, fill: string, stroke = true) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) g.stroke();
}

/** 얼굴 없는 몸. 지금 변환 위에 160x200 좌표로 그린다 */
export function drawBody(g: G, kind: BodyKind, pose: PoseId, color: string) {
  const { body, hands } = LAYOUT[pose];
  const [cx, cy, , ry] = body;
  const top = cy - ry;
  g.save();
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  blob(g, [58, 190, 14, 7], color);
  blob(g, [102, 190, 14, 7], color);
  if (BODIES[kind].ears) {
    blob(g, [cx + 48, cy + 42, 13, 10], color);
    for (const s of [-1, 1]) {
      poly(g, [[cx + s * 50, top + 30], [cx + s * 44, top - 12], [cx + s * 16, top + 8]], color);
      poly(g, [[cx + s * 47, top + 13], [cx + s * 42, top - 3], [cx + s * 27, top]], '#ffc2d1', false);
    }
  }
  blob(g, body, color);
  hands.forEach((h) => blob(g, h, color));
  g.restore();
}

/** 몸통 안쪽만 남기는 clip. 부르기 전에 save하고 끝나면 restore한다 */
export function clipBody(g: G, pose: PoseId) {
  const [x, y, rx, ry] = LAYOUT[pose].body;
  g.beginPath();
  g.ellipse(x, y, rx - 1.5, ry - 1.5, 0, 0, Math.PI * 2);
  g.clip();
}

/** 몸에 얼굴 그림을 합친다. 얼굴은 몸통 밖으로 나가지 않게 자른다 */
export function drawPose(g: G, kind: BodyKind, pose: PoseId, color: string, face: CanvasImageSource | null) {
  drawBody(g, kind, pose, color);
  const r = LAYOUT[pose].face;
  if (face) {
    g.save();
    clipBody(g, pose);
    g.imageSmoothingQuality = 'high';
    g.drawImage(face, r.x, r.y, r.w, r.h);
    g.restore();
  }
  if (pose === 'sleep') {
    g.fillStyle = INK;
    g.font = 'bold 22px sans-serif';
    g.fillText('z', 124, 76);
    g.font = 'bold 15px sans-serif';
    g.fillText('z', 142, 58);
  }
}

/** 자세 그림 한 장을 두 배 해상도(320x400) PNG로 굽는다 */
export async function posePng(kind: BodyKind, pose: PoseId, color: string, face: CanvasImageSource | null): Promise<Uint8Array> {
  const c = new OffscreenCanvas(320, 400);
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  drawPose(g, kind, pose, color, face);
  return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
