import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { Ctx } from '@core/types';
import { drawCut, type CutScene } from '../draw';
import { BACKGROUNDS, CUTS, DISTANCES, FILTERS, FRAMES, jump, JUMP_MS, keyPose, liftAt, ORIENTS, type Setup, type Shot } from '../logic';
import { playMusic } from '../music';
import { openSession, type Person, type Session } from '../session';
import { inboxOf } from '../state';
import { colSize, cutSize, images, renderRun, type Images } from './scene';
import css from './photo.module.css';

const VIEW = { width: 580, height: 340 };
const INIT: Setup = { o: 'wide', n: 4, bg: BACKGROUNDS[1]![0], fl: 'none', fr: 'heart', own: '' };
/** 방에 올리는 내 프레임의 긴 변 */
const FRAME_SIDE = 960;

/** 찍기: 방에서는 자리를 잡은 사람끼리 함께 찍고 진행자가 설정과 셔터를 맡는다. 방 밖에서는 나 혼자 찍는다.
 *  키로는 내 캐릭터만 움직이고 다른 사람의 자세는 방에서 받아 그린다 */
export default function Shoot({ ctx, onDone }: { ctx: Ctx; onDone: (sheet: ImageBitmap) => void }) {
  const room = useSyncExternalStore(ctx.room.onChange, ctx.room.current);
  const localOwn = useRef<ImageBitmap | null>(null);
  const [im] = useState(() => images(ctx, () => localOwn.current));
  const done = useRef(onDone);
  done.current = onDone;
  const [session, setSession] = useState<Session | null>(null);

  // 방이 바뀌면 자리를 놓고 새 방에서 다시 잡는다
  useEffect(() => {
    const inbox = inboxOf(ctx);
    const s = openSession(ctx, INIT, (shots: Shot[]) => {
      renderRun(im, shots).then((b) => done.current(b), (e: Error) => ctx.log.warn(`사진 만들기 실패: ${e.message}`));
    });
    inbox.setShooting(true);
    setSession(s);
    return () => {
      s.close();
      inbox.setShooting(false);
    };
  }, [ctx, room, im]);

  return session ? <View ctx={ctx} session={session} im={im} localOwn={localOwn} /> : null;
}

function View({ ctx, session, im, localOwn }: { ctx: Ctx; session: Session; im: Images; localOwn: { current: ImageBitmap | null } }) {
  const v = useSyncExternalStore(session.subscribe, session.get);
  const { cfg } = v;
  const [msg, setMsg] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<HTMLDivElement>(null);
  const size = cutSize(cfg.o, cfg.n);
  const pics = usePics(im, v.people, colSize(size, v.people.length));
  const own = useFrame(im, cfg.fr === 'own' ? cfg.own : '');
  const me = v.people.find((p) => p.self);
  const busy = !!v.count;

  // 점프하는 사람이 있으면 그동안 미리보기를 다시 그린다
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const t = ctx.clock.serverNow();
  const jumping = v.people.some((p) => t - p.pose.j < JUMP_MS);
  useEffect(() => (jumping ? ctx.timers.every(33, redraw) : undefined), [ctx, jumping]);

  const scene: CutScene = {
    bg: cfg.bg, filter: cfg.fl, frame: cfg.fr, own,
    people: v.people.map((p) => {
      const img = pics.get(picKey(p));
      return img ? { img, dx: p.pose.x / 10, flip: p.pose.f === 1, lift: liftAt(p.pose.j, t) } : null;
    }),
  };
  useEffect(() => drawCut(canvas.current!.getContext('2d')!, size, scene));
  useEffect(() => pad.current?.focus(), []);
  // 촬영하는 동안 배경음악. 회사원 모드에서는 내지 않는다
  useEffect(() => (busy && ctx.mode.get() !== 'quiet' ? playMusic(ctx) : undefined), [ctx, busy]);

  const onKey = (e: KeyboardEvent) => {
    if (session.pose((p, now) => (e.code === 'Space' ? jump(p, now) : keyPose(p, e.code)))) e.preventDefault();
  };
  const pickFrame = async () => {
    setMsg('');
    const f = await ctx.files.openImage();
    if (!f) return;
    try {
      if (v.room) {
        // 함께 찍는 사람들도 같은 프레임을 그리도록 64KB 안으로 줄여 올린다
        session.setup({ fr: 'own', own: await ctx.files.upload(await ctx.files.prepareImage(f.bytes, { maxSide: FRAME_SIDE })) });
      } else {
        localOwn.current = await createImageBitmap(new Blob([f.bytes as Uint8Array<ArrayBuffer>]));
        session.setup({ fr: 'own', own: `local${Date.now()}` });
      }
    } catch {
      setMsg('그림 파일을 읽지 못했어요. PNG 파일인지 확인해 주세요.');
    }
  };
  const start = () => {
    setMsg('');
    pad.current?.focus();
    session.start().catch((e: Error) => setMsg(e.message));
  };

  const scale = Math.min(VIEW.width / size.width, VIEW.height / size.height);
  const lead = v.host && !busy;
  const names = v.people.map((p) => p.name || '이름 없음').join(', ');
  return (
    <div>
      <div ref={pad} className={css.pad} tabIndex={0} aria-label="촬영 미리보기" onKeyDown={onKey}>
        <canvas ref={canvas} width={size.width} height={size.height} style={{ width: size.width * scale, height: size.height * scale }} />
        {v.count && <div className={css.count} role="status">{v.count.left}</div>}
      </div>
      <p className={css.hint}>
        {v.count ? `컷 ${v.count.cut + 1} / ${cfg.n} 찍는 중이에요.` : '아래 단추나 키로 움직여요. 미리보기를 누르고 A D로 옮기고 Q E로 돌고 W S로 다가가거나 물러나요. Space는 점프예요.'}
      </p>
      <p className={css.hint}>함께 찍는 사람 {names || '없음'}</p>
      {v.room && <p className={css.hint}>{v.full ? '자리 네 칸이 다 찼어요. 자리가 나면 함께 찍어요.' : !v.joined ? '자리를 잡는 중이에요.' : v.host ? '내가 진행해요. 설정을 고르고 촬영을 시작해요.' : `${v.hostName}님이 진행해요. 설정과 촬영 시작은 진행하는 사람이 해요.`}</p>}
      <div className={css.row}>
        <span>방향</span>
        <nav aria-label="방향">
          {ORIENTS.map(([id, label]) => <button key={id} aria-pressed={cfg.o === id} disabled={!lead} onClick={() => session.setup({ o: id, n: CUTS[id].includes(cfg.n) ? cfg.n : 4 })}>{label}</button>)}
        </nav>
      </div>
      <div className={css.row}>
        <span>컷 수</span>
        <nav aria-label="컷 수">
          {CUTS[cfg.o].map((c) => <button key={c} aria-pressed={cfg.n === c} disabled={!lead} onClick={() => session.setup({ n: c })}>{c}컷</button>)}
        </nav>
      </div>
      <div className={css.row}>
        <span>거리</span>
        <nav aria-label="거리">
          {DISTANCES.map(([id, label], i) => <button key={id} aria-pressed={me?.pose.z === i} disabled={!me} onClick={() => session.pose((p) => ({ ...p, z: i }))}>{label}</button>)}
        </nav>
      </div>
      {/* 펜으로도 키와 같은 자세를 만든다 */}
      <div className={css.row}>
        <span>자세</span>
        <div className={css.moves}>
          <button disabled={!me} onClick={() => session.pose((p) => keyPose(p, 'KeyA'))}>왼쪽으로</button>
          <button disabled={!me} onClick={() => session.pose((p) => keyPose(p, 'KeyD'))}>오른쪽으로</button>
          <button aria-pressed={me?.pose.f === 1} disabled={!me} onClick={() => session.pose((p) => keyPose(p, p.f ? 'KeyE' : 'KeyQ'))}>돌아서기</button>
          <button disabled={!me} onClick={() => session.pose(jump)}>점프</button>
        </div>
      </div>
      <div className={css.row}>
        <span>배경</span>
        <div className={css.swatches}>
          {BACKGROUNDS.map(([c, name]) => <button key={c} className={css.swatch} style={{ background: c }} aria-label={`배경 ${name}`} aria-pressed={cfg.bg === c} disabled={!v.host} onClick={() => session.setup({ bg: c })} />)}
        </div>
      </div>
      <div className={css.row}>
        <span>필터</span>
        <nav aria-label="필터">
          {FILTERS.map((f) => <button key={f.id} aria-pressed={cfg.fl === f.id} disabled={!v.host} onClick={() => session.setup({ fl: f.id })}>{f.label}</button>)}
        </nav>
      </div>
      <div className={css.row}>
        <span>프레임</span>
        <nav aria-label="프레임">
          {FRAMES.map(([id, label]) => <button key={id} aria-pressed={cfg.fr === id} disabled={!v.host} onClick={() => session.setup({ fr: id })}>{label}</button>)}
          <button aria-pressed={cfg.fr === 'own'} disabled={!v.host} onClick={() => void pickFrame()}>내 프레임</button>
        </nav>
      </div>
      <p className={css.hint}>
        {v.room ? '내 프레임은 배경이 투명한 PNG를 골라 컷마다 겹쳐요. 함께 찍는 사람들도 보도록 작게 줄여 올려요.' : '내 프레임은 배경이 투명한 PNG를 골라 컷마다 겹쳐요. 이 PC에만 쓰고 서버에 올리지 않아요.'}
      </p>
      {msg && <p role="alert" className={css.error}>{msg}</p>}
      <div className={css.foot}>
        {v.quota && <span className={css.hint}>오늘 {v.quota.used} / {v.quota.cap}</span>}
        <span className={css.grow} />
        <button type="submit" disabled={!lead || !v.people.length} onClick={start}>{busy ? '찍는 중' : '촬영 시작'}</button>
      </div>
    </div>
  );
}

const picKey = (p: Person) => `${p.look} ${p.pose.z}`;

/** 사람마다 거리와 칸 크기에 맞춘 캐릭터 그림. 책상과 바닥은 빼고 몸만 그린다 */
function usePics(im: Images, people: Person[], col: { width: number; height: number }): Map<string, ImageBitmap> {
  const [pics, setPics] = useState(new Map<string, ImageBitmap>());
  const keys = [...new Set(people.map(picKey))];
  const want = `${col.width}x${col.height} ${keys.join(',')}`;
  useEffect(() => {
    let alive = true;
    const list = people.map((p) => [picKey(p), p] as const);
    Promise.all(list.map(([k, p]) => im.person(p.look, p.pose.z, col).then((b) => [k, b] as const))).then(
      (xs) => alive && setPics(new Map(xs.flatMap(([k, b]) => (b ? [[k, b] as const] : [])))),
      () => undefined,
    );
    return () => void (alive = false);
  }, [want]);
  return pics;
}

/** 프레임 그림. own이 비면 null */
function useFrame(im: Images, own: string): ImageBitmap | null {
  const [img, setImg] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    let alive = true;
    im.frame(own).then((b) => alive && setImg(b), () => alive && setImg(null));
    return () => void (alive = false);
  }, [im, own]);
  return img;
}
