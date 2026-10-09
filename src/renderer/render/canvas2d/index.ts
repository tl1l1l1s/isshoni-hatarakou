// canvas2d backend: 라이브러리 없이 Canvas 2D로 그린다 (10.8.2).
import { SEAT_SLOTS, type Appearance } from '@shared/schemas';
import { FPS_AWAKE } from '@shared/constants';
import type { Box, CharacterView, ImageSource, PoseId, RenderBackend, SceneSpec, ViewOptions } from '../port';
import { DEFAULT_SIZE, anchorsFromBounds, colorFilter, containFit, cssBox, dither, frameDue, opaqueBounds, poseFor } from './logic';
import type { Fit, Size } from './logic';
import { placeholder } from './placeholder';

const POSES: PoseId[] = ['idle', 'typing', 'sleep'];
/** 층 순서. 'pose'는 자세 그림 자리. 바닥 오브제는 책상 앞 바닥에 놓이므로 책상 다음에 그린다 (AVT-14) */
const LAYERS = ['pose', 'desk', 'floor', 'desk.items', 'sticker'];
/** 이 값 이하의 알파는 anchor와 클릭 영역 계산에서 투명으로 본다 */
const ALPHA_MIN = 16;
/** renderScene 구도: 불투명 영역 위에서부터 남길 높이 비율 */
const FRAMING = { face: 0.35, bust: 0.6, full: 1 };

// 해시는 내용 주소라서 모든 뷰와 renderScene이 그림 캐시를 같이 쓴다
// ponytail: 지우지 않는 캐시. 좌석 10개에 그림 몇 장씩이면 충분하고 늘어나면 LRU로 바꾼다
const loading = new Map<string, Promise<ImageBitmap | null>>();
const bitmaps = new Map<string, ImageBitmap>();
const boundsCache = new WeakMap<ImageBitmap, Box | null>();

function load(src: ImageSource, h: string) {
  let p = loading.get(h);
  if (!p) {
    p = src(h).catch(() => null).then((b) => {
      // 실패는 캐시하지 않고 다음 setAppearance 때 다시 받는다
      if (b) bitmaps.set(h, b);
      else loading.delete(h);
      return b;
    });
    loading.set(h, p);
  }
  return p;
}

const hashesOf = (a: Appearance) =>
  [...Object.values(a.poses), ...Object.values(a.slots).flat().map((e) => e.file)].filter((h): h is string => !!h);

/** 그림마다 한 번만 픽셀을 읽어 불투명 영역을 구한다 */
function boundsOf(img: ImageBitmap) {
  if (!boundsCache.has(img)) {
    const g = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
    g.drawImage(img, 0, 0);
    boundsCache.set(img, opaqueBounds(g.getImageData(0, 0, img.width, img.height).data, img.width, img.height, ALPHA_MIN));
  }
  return boundsCache.get(img) ?? null;
}

// ponytail: 색을 입힌 그림을 화면 밖 캔버스로 TINT_MAX장까지 캐시하고 가장 오래 안 쓴 것부터 버린다
const TINT_MAX = 32;
const tints = new Map<string, OffscreenCanvas>();

/** color가 있으면 색조와 채도 필터를 입힌 그림을 돌려준다 (AVT-08) */
function tinted(img: ImageBitmap, hash: string | null, color: string | undefined): ImageBitmap | OffscreenCanvas {
  const filter = colorFilter(color);
  if (!filter) return img;
  const key = `${hash} ${filter}`;
  let c = tints.get(key);
  if (c) tints.delete(key);
  else {
    c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.filter = filter;
    g.drawImage(img, 0, 0);
    if (tints.size >= TINT_MAX) tints.delete(tints.keys().next().value!);
  }
  tints.set(key, c);
  return c;
}

type Ctx = CanvasState & CanvasTransform & CanvasDrawImage & CanvasImageSmoothing;

/**
 * 그림 한 장을 먼저 자세 그림처럼 뷰에 맞추고(contain, 아래 정렬) 그 가운데를 기준으로
 * (x * 뷰 너비, y * 뷰 높이)만큼 옮긴 뒤 scale배 키우고 rot도(시계 방향)만큼 돌린다. 기본값은 0, 0, 1, 0이다.
 * 그래서 자세 그림과 같은 크기 캔버스에 그린 책상은 값 없이도 자리가 맞는다.
 */
function place(g: Ctx, img: ImageBitmap | OffscreenCanvas, e: { x?: number; y?: number; scale?: number; rot?: number }, size: Size, dpr: number) {
  const f = containFit(img, size), w = img.width * f.scale, h = img.height * f.scale, s = e.scale ?? 1;
  // 줄일 때는 부드럽게, 키울 때는 또렷한 픽셀로 그린다. dpr은 size 한 픽셀이 캔버스에서 차지하는 픽셀 수
  g.imageSmoothingEnabled = f.scale * s * dpr < 1;
  g.save();
  g.translate(f.x + w / 2 + (e.x ?? 0) * size.width, f.y + h / 2 + (e.y ?? 0) * size.height);
  g.rotate(((e.rot ?? 0) * Math.PI) / 180);
  g.scale(s, s);
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.restore();
}

/** seatOnly면 몸(자세 그림과 스티커)을 빼고 책상과 바닥만 그린다 (detach) */
function paint(g: Ctx, look: Appearance | null, body: ImageBitmap | undefined, size: Size, dpr: number, seatOnly = false) {
  for (const layer of LAYERS) {
    if (seatOnly && !SEAT_SLOTS.includes(layer)) continue;
    if (layer === 'pose') {
      if (body) place(g, body, {}, size, dpr);
      continue;
    }
    for (const e of look?.slots[layer] ?? []) {
      const img = e.file && bitmaps.get(e.file);
      if (img) place(g, tinted(img, e.file, e.color), e, size, dpr);
    }
  }
}

function createView(container: HTMLElement, opts: ViewOptions): CharacterView {
  const size = opts.size ?? DEFAULT_SIZE;
  // 패널 창의 미리보기는 스테이지와 배율이 다른 모니터에 있을 수 있어 캔버스가 붙는 창의 배율을 쓴다
  const win = container.ownerDocument.defaultView ?? window;
  // 클릭은 hitRegion으로 코어가 처리하므로 캔버스는 포인터를 받지 않고 컨테이너의 다른 요소 아래에 둔다
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;width:${size.width}px;height:${size.height}px`;
  if (opts.pixel) canvas.style.imageRendering = 'pixelated';
  container.prepend(canvas);
  const g = canvas.getContext('2d', { willReadFrequently: !!opts.pixel })!;
  const ph = new Map<PoseId, ImageBitmap>();
  const ac = new AbortController();
  let look: Appearance | null = null, pose: PoseId = 'idle', pos = { x: 0, y: 0 }, facing: 1 | -1 = 1;
  let fps = FPS_AWAKE, last = -Infinity, raf = 0, isDirty = true, gone = false, detached = false;
  let geoImg: ImageBitmap | undefined;

  const bodyFor = (p: PoseId) => {
    const h = look?.poses[p];
    return (h && bitmaps.get(h)) || ph.get(p);
  };
  // anchor와 클릭 영역은 기본 자세 그림의 불투명 영역으로 정해서 자세가 바뀌어도 이름표가 움직이지 않는다
  const geo = (): [Box | null, Box, Fit, 1 | -1] => {
    const img = bodyFor('idle');
    return [img ? boundsOf(img) : null, { ...pos, ...size }, containFit(img ?? size, size), facing];
  };

  const draw = () => {
    const dpr = win.devicePixelRatio;
    const k = opts.pixel ? 1 / opts.pixel : dpr;
    const w = Math.max(1, Math.round(size.width * k)), h = Math.max(1, Math.round(size.height * k));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    g.setTransform(w / size.width, 0, 0, h / size.height, 0, 0);
    g.clearRect(0, 0, size.width, size.height);
    paint(g, look, bodyFor(pose), size, dpr, detached);
    if (opts.pixel) {
      const d = g.getImageData(0, 0, w, h);
      dither(d.data, w);
      g.putImageData(d, 0, 0);
    }
    if (bodyFor('idle') !== geoImg) {
      geoImg = bodyFor('idle');
      opts.onGeometry?.();
    }
  };
  // 바뀐 것이 있을 때만 rAF를 걸고 fps 상한 안에서 한 번 그린다. 그릴 것이 없으면 rAF도 걸지 않는다
  const tick = (now: number) => {
    raf = 0;
    if (frameDue(now, last, fps)) {
      last = now;
      isDirty = false;
      draw();
    }
    schedule();
  };
  const schedule = () => {
    if (isDirty && fps > 0 && !raf && !gone) raf = requestAnimationFrame(tick);
  };
  const dirty = () => {
    isDirty = true;
    schedule();
  };
  // 배율이 다른 모니터로 옮기면 backing store를 다시 잡는다
  const watchDpr = (): void => {
    const onChange = () => {
      dirty();
      watchDpr();
    };
    win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`).addEventListener('change', onChange, { once: true, signal: ac.signal });
  };
  watchDpr();
  for (const p of POSES) {
    void (opts.placeholder ?? placeholder)(p).then((b) => {
      ph.set(p, b);
      dirty();
    });
  }
  dirty();

  return {
    setAppearance(a) {
      look = a;
      // 늦게 온 그림은 그 사이 외형이 바뀌었으면 다시 그리지 않는다
      for (const h of hashesOf(a)) void load(opts.images, h).then(() => look === a && dirty());
      dirty();
    },
    setState(s) {
      const p = poseFor(s);
      if (p !== pose) {
        pose = p;
        dirty();
      }
    },
    setPosition(p) {
      pos = { ...p };
      canvas.style.left = `${p.x}px`;
      canvas.style.top = `${p.y}px`;
    },
    setFacing(d) {
      facing = d;
      canvas.style.transform = d === -1 ? 'scaleX(-1)' : '';
    },
    playEffect: (id, seed) => console.debug('[render] playEffect', id, seed),
    anchors: () => anchorsFromBounds(...geo()),
    hitRegion: () => cssBox(...geo()),
    // 몸만 숨기고 책상은 남긴다. anchor와 클릭 영역은 그대로다
    detach() {
      detached = true;
      dirty();
    },
    reattach() {
      detached = false;
      dirty();
    },
    setFrameBudget(f) {
      fps = f;
      if (f > 0) return schedule();
      cancelAnimationFrame(raf);
      raf = 0;
    },
    dispose() {
      gone = true;
      cancelAnimationFrame(raf);
      ac.abort();
      canvas.remove();
    },
  };
}

async function renderScene(spec: SceneSpec, out: Size, opts: ViewOptions): Promise<ImageBitmap> {
  const size = opts.size ?? DEFAULT_SIZE, a = spec.appearance;
  await Promise.all(hashesOf(a).map((h) => load(opts.images, h)));
  const h = a.poses[spec.pose];
  const body = (h && bitmaps.get(h)) || (await (opts.placeholder ?? placeholder)(spec.pose));
  // 불투명 영역의 위쪽을 구도 비율만큼 남기고 out 가운데에 contain으로 맞춘다
  const b = cssBox(boundsOf(body), { x: 0, y: 0, ...size }, containFit(body, size));
  const ch = b.height * FRAMING[spec.framing];
  const s = Math.min(out.width / b.width, out.height / ch);
  const c = new OffscreenCanvas(out.width, out.height);
  const g = c.getContext('2d')!;
  g.setTransform(s, 0, 0, s, (out.width - b.width * s) / 2 - b.x * s, (out.height - ch * s) / 2 - b.y * s);
  paint(g, a, body, size, s);
  return c.transferToImageBitmap();
}

export const canvas2dBackend: RenderBackend = { id: 'canvas2d', createView, renderScene };
