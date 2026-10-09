// 사람 그림과 프레임 그림, 컷 기록으로 한 장 그리기. 미리보기와 완성본이 같은 그림을 쓴다 (COM-15)
import type { Ctx } from '@core/types';
import { Appearance, bodyOnly, emptyAppearance } from '@shared/schemas';
import { drawCut, drawSheet } from '../draw';
import { cutRects, DISTANCES, type Orient, type Shot, type Size } from '../logic';

export type Images = ReturnType<typeof images>;

/** 외형, 거리, 칸 크기마다 한 번만 그린다. own이 local로 시작하면 이 PC에서 고른 프레임이다 */
export function images(ctx: Ctx, localOwn: () => ImageBitmap | null) {
  const cache = new Map<string, Promise<ImageBitmap | null>>();
  const once = (k: string, make: () => Promise<ImageBitmap | null>) => {
    let p = cache.get(k);
    if (!p) {
      p = make();
      p.catch(() => cache.delete(k));
      cache.set(k, p);
    }
    return p;
  };
  return {
    person: (look: string | null, z: number, size: Size) =>
      once(`${look} ${z} ${size.width}x${size.height}`, async () =>
        ctx.render.renderScene({ appearance: bodyOnly(await appearanceOf(ctx, look)), pose: 'idle', framing: DISTANCES[z]?.[0] ?? 'full' }, size),
      ),
    frame: (own: string): Promise<ImageBitmap | null> => {
      if (own.startsWith('local')) return Promise.resolve(localOwn());
      if (!own) return Promise.resolve(null);
      return once(own, async () => {
        const b = await ctx.files.get(own);
        return b ? createImageBitmap(new Blob([b as Uint8Array<ArrayBuffer>])) : null;
      });
    },
  };
}

/** 컷 하나의 크기 */
export function cutSize(o: Orient, n: number): Size {
  const r = cutRects(o, n)[0]!;
  return { width: Math.round(r.width), height: Math.round(r.height) };
}
/** 사람 하나의 칸 크기 (컷 너비를 사람 수로 나눈다) */
export const colSize = (cut: Size, count: number): Size => ({ width: Math.round(cut.width / Math.max(1, count)), height: cut.height });

/** 컷 기록으로 한 장을 그린다. 모든 PC가 같은 기록에서 같은 사진을 얻는다 */
export async function renderRun(im: Images, shots: Shot[]): Promise<ImageBitmap> {
  const cuts = await Promise.all(
    shots.map(async (s) => {
      const size = cutSize(s.o, s.n);
      const ppl = s.ppl ?? [];
      const col = colSize(size, ppl.length);
      const [imgs, own] = await Promise.all([Promise.all(ppl.map((p) => im.person(p.l || null, p.z, col))), im.frame(s.fr === 'own' ? s.own : '')]);
      const c = new OffscreenCanvas(size.width, size.height);
      const people = ppl.map((p, i) => {
        const img = imgs[i];
        return img ? { img, dx: p.x / 10, flip: p.f === 1, lift: p.y / 100 } : null;
      });
      drawCut(c.getContext('2d')!, size, { bg: s.bg, filter: s.fl, frame: s.fr, own, people });
      return c.transferToImageBitmap();
    }),
  );
  return drawSheet(shots[0]!.o, cuts);
}

async function appearanceOf(ctx: Ctx, look: string | null): Promise<Appearance> {
  const bytes = look ? await ctx.files.get(look) : null;
  if (!bytes) return emptyAppearance();
  const r = Appearance.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  return r.success ? r.data : emptyAppearance();
}
