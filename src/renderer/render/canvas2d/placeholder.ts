// 친구 그림이 아직 없을 때 쓰는 임시 자세 그림. 외부 파일 없이 동그란 캐릭터를 직접 그린다.
import type { PoseId } from '../port';

const made = new Map<PoseId, ImageBitmap>();

export function placeholder(pose: PoseId): Promise<ImageBitmap> {
  let b = made.get(pose);
  if (!b) made.set(pose, (b = draw(pose)));
  return Promise.resolve(b);
}

// 160x200 좌표로 그리고 두 배 해상도로 굽는다
function draw(pose: PoseId): ImageBitmap {
  const c = new OffscreenCanvas(320, 400);
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  const ink = '#4a3b47', paw = '#ffd0dc';
  g.lineWidth = 3;
  g.strokeStyle = ink;
  const blob = (x: number, y: number, rx: number, ry: number, fill: string, stroke = true) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke) g.stroke();
  };
  const arc = (x: number, y: number, r: number) => {
    g.beginPath();
    g.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  };

  blob(58, 190, 14, 7, paw);
  blob(102, 190, 14, 7, paw);
  blob(80, 136, 58, 54, '#ffe4ec');
  blob(52, 146, 9, 5, '#ffa8bd', false);
  blob(108, 146, 9, 5, '#ffa8bd', false);

  if (pose === 'idle') {
    blob(62, 126, 5, 6, ink, false);
    blob(98, 126, 5, 6, ink, false);
    blob(64, 123, 1.6, 1.6, '#fff', false);
    blob(100, 123, 1.6, 1.6, '#fff', false);
    arc(80, 138, 6);
  } else if (pose === 'typing') {
    // 아래를 보는 눈과 앞으로 내민 두 손
    blob(62, 132, 5, 4, ink, false);
    blob(98, 132, 5, 4, ink, false);
    blob(80, 146, 3, 3, ink, false);
    blob(60, 172, 13, 9, paw);
    blob(100, 172, 13, 9, paw);
  } else {
    // 감은 눈과 z
    arc(62, 124, 6);
    arc(98, 124, 6);
    blob(80, 146, 2.5, 2, ink, false);
    g.fillStyle = ink;
    g.font = 'bold 22px sans-serif';
    g.fillText('z', 124, 76);
    g.font = 'bold 15px sans-serif';
    g.fillText('z', 142, 58);
  }
  return c.transferToImageBitmap();
}
