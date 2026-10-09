import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent, Ref, RefObject } from 'react';
import type { Ctx } from '@core/types';
import { FLOOR, HOP_MS, ON_SCREEN_MAX, stepAll, summon, VIEW, WALKER, type Pt, type Walker } from '../logic';
import { useFiles } from '../state';
import css from './home.module.css';

const TICK = 50;
interface Grab { id: number; dx: number; dy: number; p0: Pt; moved: boolean }
/** 마이홈 보기 화면이 말랑이를 부를 때 쓴다 */
export interface Herd { call(): void }

/** 말랑이 층 (HOM-12, HOM-13). 50ms마다 움직이므로 상태와 타이머를 이 층에만 두어 보기 화면 나머지를 다시 그리지 않는다.
 *  나와 있는 동안만 움직이고 창을 닫으면 모두 사라진다 */
export default function Walkers({ ctx, box, mallangi, onHeart, ref }: {
  ctx: Ctx;
  box: RefObject<HTMLDivElement | null>;
  mallangi: string[];
  onHeart: (x: number, y: number) => void;
  ref: Ref<Herd>;
}) {
  const [walkers, setWalkers] = useState<Walker[]>([]);
  const now = useRef(walkers);
  now.current = walkers;
  const grab = useRef<Grab | null>(null);
  const files = useFiles(ctx, walkers.map((m) => m.file));

  const walking = walkers.length > 0;
  useEffect(() => (walking ? ctx.timers.every(TICK, () => setWalkers((ws) => stepAll(ws, TICK, Math.random))) : undefined), [ctx, walking]);
  useImperativeHandle(ref, () => ({
    call() {
      const next = summon(now.current, mallangi, Math.random);
      if (next) setWalkers(next);
      else ctx.ui.toast(mallangi.length ? `말랑이는 한 번에 ${ON_SCREEN_MAX}마리까지 나와요.` : '등록한 말랑이가 없어요.');
    },
  }), [ctx, mallangi]);

  // 끌기는 보기 화면 기준 픽셀로 계산한다. 포인터를 잡아 두어 화면 밖으로 나가도 이어진다
  const at = (ev: PointerEvent): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const hold = (ev: PointerEvent, m: Walker) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = at(ev);
    grab.current = { id: m.id, dx: p.x - m.x, dy: p.y - m.y, p0: p, moved: false };
    setWalkers((ws) => ws.map((w) => (w.id === m.id ? { ...w, held: true, on: null, act: w.act === 'climb' ? 'walk' : w.act } : w)));
  };
  // 4px 넘게 움직여야 끌기다. 그보다 적으면 놓을 때 누른 것으로 친다
  const move = (ev: PointerEvent) => {
    const g = grab.current;
    if (!g) return;
    const p = at(ev);
    if (!g.moved && Math.hypot(p.x - g.p0.x, p.y - g.p0.y) <= 4) return;
    g.moved = true;
    const x = Math.min(VIEW.width - WALKER, Math.max(0, p.x - g.dx)), y = Math.min(FLOOR, Math.max(0, p.y - g.dy));
    setWalkers((ws) => ws.map((w) => (w.id === g.id ? { ...w, x, y } : w)));
  };
  // 누르면 제자리에서 통통 뛰며 하트를 띄운다 (HOM-13)
  const up = () => {
    const g = grab.current;
    grab.current = null;
    if (!g) return;
    const w = now.current.find((m) => m.id === g.id);
    if (!g.moved && w) onHeart(w.x + WALKER / 2, w.y);
    setWalkers((ws) => ws.map((m) => (m.id === g.id ? { ...m, held: false, hop: g.moved ? 0 : HOP_MS } : m)));
  };

  return (
    <div className={css.walkers}>
      {walkers.map((m) => (
        <img
          key={m.id}
          src={files[m.file]}
          alt=""
          draggable={false}
          className={css.walker}
          data-held={m.held}
          data-act={m.act}
          data-hop={m.hop > 0}
          style={{
            left: m.x, top: m.y, width: WALKER, scale: m.vx < 0 ? '-1 1' : undefined,
            // 벽을 탈 때는 발이 벽에 닿게 돌린다
            rotate: m.act === 'climb' ? (m.x <= 0 ? '90deg' : '-90deg') : undefined,
          }}
          title="끌어서 옮기기, 누르면 통통, 오른쪽 클릭으로 들여보내기"
          onPointerDown={(ev) => hold(ev, m)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(ev) => {
            ev.preventDefault();
            setWalkers((ws) => ws.filter((w) => w.id !== m.id));
          }}
        />
      ))}
    </div>
  );
}
