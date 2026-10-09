// 놀이 효과 (10.8.2). 그림은 DOM 요소 하나에 Web Animations를 걸어 프레임마다 JS가 돌지 않게 한다 (NFR-05)
import type { EffectArgs, EffectDecl, EffectSurface } from '@core/types';
import { BOMB_MS, DANCE_MS, flightPath, FLY_MS, HIT_MS, TEXT_MS, TEXT_SIZES } from './logic';

/** 날리는 글 효과의 data */
export interface TextData { text: string; size: keyof typeof TEXT_SIZES; color?: string }

const el = (s: EffectSurface, tag: string, css: string): HTMLElement => {
  const e = s.root.ownerDocument.createElement(tag);
  e.style.cssText = `position:absolute;will-change:transform;${css}`;
  s.root.append(e);
  return e;
};

/** detach 효과의 캐릭터 그림을 좌석과 같은 자리에 놓는다 */
function sprite(s: EffectSurface, a: EffectArgs, origin: string): HTMLCanvasElement | null {
  if (!a.sprite) return null;
  const { image, width, height } = a.sprite;
  const c = el(s, 'canvas', `left:${a.from.x - width / 2}px;top:${a.from.y - height / 2}px;width:${width}px;height:${height}px;transform-origin:${origin}`) as HTMLCanvasElement;
  c.width = image.width;
  c.height = image.height;
  c.getContext('2d')?.drawImage(image, 0, 0);
  return c;
}

const animate = (e: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
  const a = e?.animate(frames, opts);
  return () => a?.cancel();
};

const sway: Keyframe[] = ['0', '-12deg', '0', '12deg', '0'].map((r, i) => ({ transform: `rotate(${r}) translateX(${[0, -6, 0, 6, 0][i]}px)` }));
const spin: Keyframe[] = [
  { transform: 'translateY(0) scaleX(1)' },
  { transform: 'translateY(-24px) scaleX(0)' },
  { transform: 'translateY(0) scaleX(-1)' },
  { transform: 'translateY(-24px) scaleX(0)' },
  { transform: 'translateY(0) scaleX(1)' },
];

export const effects: EffectDecl[] = [
  // 레벨 80 춤: 몸을 좌우로 흔든다
  { id: 'play.dance80', detach: true, durationMs: DANCE_MS, run: (s, a) => animate(sprite(s, a, '50% 100%'), sway, { duration: 1000, iterations: DANCE_MS / 1000 }) },
  // 레벨 150 춤: 좌우로 돌며 뛴다. 깜짝쇼면 두 배로 빠르다 (COM-17)
  {
    id: 'play.dance150',
    detach: true,
    durationMs: DANCE_MS,
    run: (s, a) => {
      const ms = (a.data as { fast?: boolean } | undefined)?.fast ? 500 : 1000;
      return animate(sprite(s, a, '50% 100%'), spin, { duration: ms, iterations: DANCE_MS / ms });
    },
  },
  // 날아갔다 돌아온다 (COM-13, COM-14, COM-17)
  {
    id: 'play.fly',
    detach: true,
    durationMs: FLY_MS,
    run: (s, a) => {
      const c = sprite(s, a, '50% 50%');
      const half = { w: (a.sprite?.width ?? 0) / 2, h: (a.sprite?.height ?? 0) / 2 };
      const path = flightPath(a.rand, a.from, half, { w: s.width, h: s.height });
      return animate(c, path.map((p) => ({ transform: `translate(${p.x - a.from.x}px, ${p.y - a.from.y}px) rotate(${p.r}deg)` })), { duration: FLY_MS });
    },
  },
  // 맞으면 납작해졌다가 튕기며 돌아온다. 어지러움은 끝난 뒤 머리 위 반응으로 보인다 (COM-11)
  {
    id: 'play.hit',
    detach: true,
    durationMs: HIT_MS,
    run: (s, a) =>
      animate(
        sprite(s, a, '50% 100%'),
        [
          { transform: 'scale(1, 1)', offset: 0 },
          { transform: 'scale(1.3, 0.45)', offset: 0.15 },
          { transform: 'scale(0.9, 1.15)', offset: 0.45 },
          { transform: 'scale(1.05, 0.95)', offset: 0.7 },
          { transform: 'scale(1, 1)', offset: 1 },
        ],
        { duration: HIT_MS },
      ),
  },
  // 폭탄이 던진 사람에게서 대상에게 포물선으로 날아가 터진다 (COM-13)
  {
    id: 'play.bomb',
    durationMs: BOMB_MS,
    run: (s, a) => {
      const to = a.to;
      if (!to) return () => {};
      const ball = el(s, 'div', `left:${a.from.x - 9}px;top:${a.from.y - 9}px;width:18px;height:18px;border-radius:50%;background:#222;box-shadow:0 0 0 2px #fff`);
      const steps = Array.from({ length: 13 }, (_, i) => i / 12);
      const fly = ball.animate(
        steps.map((t) => ({ transform: `translate(${(to.x - a.from.x) * t}px, ${(to.y - a.from.y) * t - 640 * t * (1 - t)}px)` })),
        { duration: BOMB_MS * 0.75, fill: 'forwards' },
      );
      const boom = el(s, 'div', `left:${to.x - 40}px;top:${to.y - 40}px;width:80px;height:80px;border-radius:50%;border:6px solid #fff;box-shadow:0 0 0 3px #222;opacity:0`);
      const burst = boom.animate([{ transform: 'scale(0.2)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: BOMB_MS * 0.25, delay: BOMB_MS * 0.75 });
      return () => {
        fly.cancel();
        burst.cancel();
      };
    },
  },
  // 채팅 날리기: 화면 오른쪽 끝에서 나타나 왼쪽으로 지나간다. 높이는 시드로 정한다 (COM-05)
  {
    id: 'play.text',
    durationMs: TEXT_MS,
    run: (s, a) => {
      const d = a.data as TextData;
      const px = TEXT_SIZES[d.size];
      const top = Math.round(s.height * 0.05 + a.rand() * (s.height * 0.9 - px));
      const t = el(s, 'div', `left:0;top:${top}px;white-space:nowrap;font:700 ${px}px/1.2 system-ui,sans-serif;color:${d.color ?? '#fff'};text-shadow:0 0 3px #000,0 0 1px #000,1px 1px 0 #000`);
      t.textContent = d.text;
      return animate(t, [{ transform: `translateX(${s.width}px)` }, { transform: 'translateX(-100%)' }], { duration: TEXT_MS });
    },
  },
];
