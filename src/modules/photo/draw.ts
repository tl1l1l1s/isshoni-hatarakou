// 스티커 사진 그리기. 미리보기와 촬영과 저장이 같은 함수를 크기만 바꿔 쓴다 (COM-15)
import { cutRects, FILTERS, handleOf, SHEET, type Doc, type FilterId, type FrameId, type Orient, type Size, type Sticker, type Stroke } from './logic';

type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 컷 안의 한 사람. img는 칸 하나(컷 너비 / 사람 수) 크기로 그린 캐릭터, lift는 점프한 높이(컷 높이 비율) */
export interface Person { img: ImageBitmap; dx: number; flip: boolean; lift: number }
export interface CutScene { bg: string; people: Array<Person | null>; filter: FilterId; frame: FrameId; own: ImageBitmap | null }

export function drawCut(g: G, size: Size, scene: CutScene) {
  const { width: w, height: h } = size;
  // 필터를 배경과 캐릭터에 한 번에 걸려고 따로 그린다
  const raw = new OffscreenCanvas(w, h);
  const r = raw.getContext('2d')!;
  r.fillStyle = scene.bg;
  r.fillRect(0, 0, w, h);
  const col = w / Math.max(1, scene.people.length);
  scene.people.forEach((p, i) => {
    if (!p) return;
    r.save();
    r.translate(col * (i + 0.5 + p.dx), -p.lift * h);
    if (p.flip) r.scale(-1, 1);
    r.drawImage(p.img, -col / 2, 0, col, h);
    r.restore();
  });
  const f = FILTERS.find((x) => x.id === scene.filter) ?? FILTERS[0]!;
  g.save();
  g.filter = f.css;
  if (f.pixel) {
    const small = new OffscreenCanvas(Math.ceil(w / f.pixel), Math.ceil(h / f.pixel));
    small.getContext('2d')!.drawImage(raw, 0, 0, small.width, small.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, w, h);
  } else g.drawImage(raw, 0, 0);
  g.restore();
  drawFrame(g, size, scene.frame, scene.own);
}

/** 기본 프레임 3종은 코드로 그린다. 내 프레임은 컷 크기로 늘려 겹친다 */
function drawFrame(g: G, { width: w, height: h }: Size, frame: FrameId, own: ImageBitmap | null) {
  g.save();
  const u = Math.min(w, h) / 10;
  if (frame === 'own' && own) g.drawImage(own, 0, 0, w, h);
  if (frame === 'film') {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.rect(0, 0, w, h);
    g.roundRect(u * 0.5, u * 0.5, w - u, h - u * 1.6, u * 0.4);
    g.fill('evenodd');
  }
  if (frame === 'heart') {
    g.fillStyle = '#ff7aa2';
    g.strokeStyle = '#ffffff';
    g.lineWidth = u * 0.08;
    for (const [x, y] of [[u, u * 0.6], [w - u, u * 0.6], [u, h - u * 1.4], [w - u, h - u * 1.4]] as const) heart(g, x, y, u * 0.9);
  }
  if (frame === 'star') {
    g.fillStyle = '#ffd93d';
    g.strokeStyle = '#ffffff';
    g.lineWidth = u * 0.06;
    for (let i = 0; i < 6; i++) {
      star(g, (w * (i + 0.5)) / 6, u * 0.6, u * (i % 2 ? 0.3 : 0.45));
      star(g, (w * (i + 0.5)) / 6, h - u * 0.6, u * (i % 2 ? 0.45 : 0.3));
    }
  }
  g.restore();
}

function heart(g: G, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.3);
  g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  g.fill();
  g.stroke();
}

function star(g: G, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, d = i % 2 ? r * 0.45 : r;
    g.lineTo(x + d * Math.cos(a), y + d * Math.sin(a));
  }
  g.closePath();
  g.fill();
  g.stroke();
}

/** 찍은 컷들을 검은 테두리 한 장에 놓는다 */
export function drawSheet(o: Orient, cuts: ImageBitmap[]): ImageBitmap {
  const s = SHEET[o];
  const c = new OffscreenCanvas(s.width, s.height);
  const g = c.getContext('2d')!;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, s.width, s.height);
  cutRects(o, cuts.length).forEach((r, i) => g.drawImage(cuts[i]!, r.x, r.y, r.width, r.height));
  return c.transferToImageBitmap();
}

/** 사진 위에 펜과 스티커를 그린다. sel은 화면에서만 보이는 고른 스티커 테두리와 손잡이 */
export function paintDoc(g: G, sheet: ImageBitmap, doc: Doc, sel: number | null = null) {
  g.drawImage(sheet, 0, 0);
  doc.strokes.forEach((s) => stroke(g, s, sheet));
  doc.stickers.forEach((s) => sticker(g, s));
  const s = sel === null ? undefined : doc.stickers[sel];
  if (s) {
    g.save();
    g.translate(s.x, s.y);
    g.rotate((s.rot * Math.PI) / 180);
    g.setLineDash([8, 6]);
    g.lineWidth = 3;
    g.strokeStyle = '#ffffff';
    g.strokeRect(-s.size / 2, -s.size / 2, s.size, s.size);
    g.restore();
    const h = handleOf(s);
    g.beginPath();
    g.arc(h.x, h.y, 12, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#222222';
    g.stroke();
  }
}

function sticker(g: G, s: Sticker) {
  g.save();
  g.translate(s.x, s.y);
  g.rotate((s.rot * Math.PI) / 180);
  g.font = `${Math.round(s.size * 0.8)}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s.e, 0, s.size * 0.05);
  g.restore();
}

function stroke(g: G, s: Stroke, sheet: Size) {
  const { pts } = s;
  const path = (c: G) => {
    c.beginPath();
    c.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
    // 점 하나도 둥근 점으로 보이게 한다
    if (pts.length === 2) c.lineTo(pts[0]! + 0.01, pts[1]!);
  };
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (s.pen === 'basic') {
    path(g);
    g.strokeStyle = s.color;
    g.lineWidth = s.width;
    g.stroke();
  } else if (s.pen === 'rainbow') {
    g.lineWidth = s.width;
    // 마디마다 색조를 조금씩 돌린다
    for (let i = 0; i < pts.length; i += 2) {
      const j = Math.max(0, i - 2);
      g.beginPath();
      g.moveTo(pts[j]!, pts[j + 1]!);
      g.lineTo(pts[i]! + 0.01, pts[i + 1]!);
      g.strokeStyle = `hsl(${(i * 4) % 360} 90% 60%)`;
      g.stroke();
    }
  } else if (s.pen === 'outline') {
    path(g);
    g.strokeStyle = s.color;
    g.lineWidth = s.width + 8;
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = s.width;
    g.stroke();
  } else if (s.pen === 'hollow') {
    // 가운데를 지운 선을 따로 그려서 아래 사진과 다른 선은 지우지 않는다
    const t = new OffscreenCanvas(sheet.width, sheet.height).getContext('2d')!;
    t.lineCap = 'round';
    t.lineJoin = 'round';
    path(t);
    t.strokeStyle = s.color;
    t.lineWidth = s.width;
    t.stroke();
    t.globalCompositeOperation = 'destination-out';
    t.lineWidth = s.width * 0.5;
    t.stroke();
    g.drawImage(t.canvas, 0, 0);
  } else {
    path(g);
    g.shadowColor = s.color;
    g.shadowBlur = s.width;
    g.strokeStyle = s.color;
    g.lineWidth = s.width * 0.6;
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = '#ffffff';
    g.lineWidth = s.width * 0.25;
    g.stroke();
  }
  g.restore();
}
