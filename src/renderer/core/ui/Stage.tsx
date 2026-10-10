import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterView, Point } from '@render/port';
import type { Rect } from '../../../preload/api';
import type { ContributionDecl, SeatView } from '../types';
import { bodyOnly, emptyAppearance, type Appearance } from '@shared/schemas';
import { FPS_ASLEEP, FPS_AWAKE } from '@shared/constants';
import { useBlobUrl } from '@shared/blobUrl';
import type { CoreRuntime } from '../runtime';
import type { Store } from '../store';
import { useCoreSettings } from '../coreSettings';
import { arrange, fitScale } from '../seats';
import { shakeMove, startShake, type Shake } from './shake';
import css from './stage.module.css';

const SEAT = { width: 160, height: 200 };
// 같은 벤치 좌석은 좌석 폭의 이 비율만큼만 옆으로 옮겨 겹쳐 앉힌다 (AVT-21). ponytail: 고정 비율, 벤치 그림에 맞출 값이 생기면 그 값을 쓴다
const BENCH_STEP = 0.6;
// 이름표 한 줄과 상태칩 두 줄 (상태칩이 좌석 폭을 넘으면 접힌다)
const NAMEPLATE_H = 76;
const MENU_ITEM_H = 32;
// 메뉴를 닫았을 때 좌석 위에 남겨 두는 높이
const MENU_CLOSED_H = 40;
const BUBBLE_H = 32;
const UPDATE_H = 36;
// 옆에 세운 상태칩 칸 폭 (SET-15). 상태 알약 최대 폭 96px에 여백을 더했다
const CHIP_COL_W = 104;
// 도트 렌더의 점 크기 CSS 픽셀 (SET-13)
const PIXEL = 3;

const use = <T,>(s: Store<T>) => useSyncExternalStore(s.subscribe, s.get);

/** 스테이지: 좌석 영역 크기의 투명 창 (10.4, 10.8.2 좌석 계층) */
export function Stage({ core }: { core: CoreRuntime }) {
  use(core.seats);
  const layout = use(core.layout);
  const away = use(core.away);
  const pick = use(core.picking);
  const elsewhere = use(core.elsewhere);
  const display = use(core.displayMode);
  const toasts = use(core.toasts);
  const mode = use(core.mode);
  use(core.seatsDrawn);
  const seats = core.allSeats();
  const { row, joined, on, depth } = arrange(seats, layout, away);
  // 열린 메뉴의 좌석 key. 내 좌석이면 ▼ 메뉴, 남의 좌석이면 다른 사용자 메뉴 (ROM-11). 이름표나 캐릭터 오른쪽 클릭으로 연다
  const [menu, setMenu] = useState<string | null>(null);
  const toggle = (key: string) => setMenu((m) => (m === key ? null : key));
  // 다른 기기에서 쓰는 중이면 좌석 대신 안내만 띄운다 (SCR-08)
  const running = mode === 'run' && !elsewhere;
  const target = running && !pick ? seats.find((s) => s.key === menu) : undefined;
  const root = useRef<HTMLDivElement>(null);
  // 좌석과 이름표 크기 (SET-07, SET-17), 머리 위 표시 (SET-14), 도트 렌더 (SET-13), 상태칩 자리 (SET-15)
  const { scale: wanted, showHead, pixel, chips } = useCoreSettings(core);
  const side = chips === 'below' ? null : chips;
  const update = useUpdate(core);
  const area = useWorkArea(core);
  const extra = update ? UPDATE_H : 0;
  // 메뉴 높이는 메뉴 항목 수로 정한다 (모듈 항목과 코어의 설정, 구분선과 여백)
  use(core.registry.contributions);
  const count = (slot: string) => core.registry.slot(slot).length;
  // 캐릭터를 짧게 누르거나 누른 채로 흔들면 모듈이 넣은 첫 명령을 그 좌석으로 실행한다. 누를 명령이 없으면 메뉴를 연다
  const [click] = core.registry.slot('seat.click');
  const [shake] = core.registry.slot('seat.shake');
  const act = (d: ContributionDecl, s: SeatView) => {
    if (d.command) void core.registry.run(d.command, s).catch((e: Error) => core.toast(e.message));
  };
  // 좌석 칸 크기와 자리를 배율로 잰다. 좌석 줄이 작업 영역보다 넓거나 높으면 들어갈 배율로 한 번 더 잰다
  const measure = (scale: number) => {
    const seatSize = { width: Math.round(SEAT.width * scale), height: Math.round(SEAT.height * scale) };
    const benchStep = Math.round(seatSize.width * BENCH_STEP);
    const sideW = Math.round(CHIP_COL_W * scale);
    // 좌석 칸의 왼쪽 위치. 벤치 좌석은 앞 좌석에 겹친다
    const left = new Map<string, number>();
    // 벤치에 붙은 좌석은 벤치 첫 좌석의 책상을 함께 쓴다
    const deskOf = new Map<string, SeatView>();
    let head: SeatView | undefined;
    let rowW = 0;
    for (const s of row) {
      if (!joined.has(s.key)) head = s;
      else if (head) deskOf.set(s.key, head);
      if (joined.has(s.key)) rowW -= seatSize.width - benchStep;
      const chipW = side && s.self && !s.local ? sideW : 0;
      if (side === 'left') rowW += chipW;
      left.set(s.key, 8 + rowW);
      rowW += seatSize.width;
      if (side === 'right') rowW += chipW;
    }
    const stageW = Math.max(seatSize.width, rowW) + 16;
    // 메뉴를 닫은 창 높이. ponytail: 한 층에 좌석 높이 전체를 더한다. 실제로는 머리에서 발까지만 올라가므로 조금 넉넉하다
    const closedH = Math.round((BUBBLE_H + NAMEPLATE_H) * scale) + seatSize.height * (1 + depth) + MENU_CLOSED_H + extra;
    return { scale, seatSize, benchStep, left, deskOf, stageW, closedH };
  };
  let m = measure(wanted);
  const fit = fitScale(wanted, { width: m.stageW, height: m.closedH }, { width: 16, height: MENU_CLOSED_H + extra }, area);
  if (fit < wanted) m = measure(fit);
  const { scale, seatSize, benchStep, left, deskOf, stageW, closedH } = m;
  // ▼ 메뉴는 항목과 설정, 다른 사용자 메뉴는 이름 줄과 항목(없으면 안내 한 줄). 작업 영역에 남는 높이까지만 커지고 나머지는 메뉴 안에서 스크롤한다
  const rows = !target ? 0 : target.self ? count('menu.main') + 1 : Math.max(1, count('seat.menu')) + 1;
  const menuRoom = area ? area.height - closedH + MENU_CLOSED_H : Infinity;
  const menuH = target ? Math.max(MENU_CLOSED_H, Math.min(rows * MENU_ITEM_H + 28, menuRoom)) : MENU_CLOSED_H;
  const seatOf = (key: string) => seats.find((s) => s.key === key)!;
  const seatProps = (s: SeatView): SeatProps => ({
    core, seat: s, size: seatSize, scale, showHead, paused: display === 'hidden',
    // 회사원 모드에서는 머리 위 말풍선을 숨긴다 (SET-03)
    showBubble: showHead && display === 'normal', pixel: pixel ? PIXEL : undefined, chipSide: side,
    onHide: display === 'quiet' ? () => core.setDisplayMode('hidden') : undefined,
    riders: () => [...on].filter(([, under]) => under === s.key).map(([k]) => seatProps(seatOf(k))),
    onToggle: () => toggle(s.key),
    onAct: click ? () => act(click.decl, s) : () => toggle(s.key),
    actLabel: click?.decl.label,
    onShake: shake && (() => act(shake.decl, s)),
    onPick: pick && !s.self ? () => pick(s) : undefined,
  });

  useEffect(() => {
    if (pick) setMenu(null);
  }, [pick]);

  // 창 크기: 좌석 수, 크기 배율, 올라탄 층 수, 메뉴 높이, 업데이트 안내로 정한다
  useEffect(() => {
    // 런처 화면에서는 좌석을 숨기고 알림만 띄울 작은 창으로 둔다 (SCR-02)
    void core.deps.bridge.invoke('stage.setSize', running ? { width: stageW, height: closedH - MENU_CLOSED_H + menuH } : { width: 360, height: 120 + extra });
  }, [core, stageW, closedH, menuH, running, extra]);

  // 클릭 받을 영역: data-interactive 요소를 바뀔 때만 보낸다 (10.8.1)
  useLayoutEffect(() => {
    let last = '';
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const send = () => {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      raf = 0;
      timer = null;
      const rects: Rect[] = [...(root.current?.querySelectorAll<HTMLElement>('[data-interactive]') ?? [])].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      });
      const key = JSON.stringify(rects);
      if (key !== last) void core.deps.bridge.invoke('stage.setInteractive', { rects: JSON.parse((last = key)) as Rect[] });
    };
    // 그릴 일이 없어 프레임이 멈춘 동안에도 보내도록 타이머를 함께 건다
    const schedule = () => {
      raf ||= requestAnimationFrame(send);
      timer ??= setTimeout(send, 60);
    };
    const mo = new MutationObserver(schedule);
    if (root.current) mo.observe(root.current, { subtree: true, childList: true, attributes: true });
    window.addEventListener('resize', schedule);
    // 메인이 창 크기를 바꾼 뒤 창의 resize 이벤트가 오지 않는 경우가 있다. 뷰포트가 그 크기가 될 때까지 기다렸다가 다시 보낸다
    let waitId = 0;
    const offResized = core.deps.bridge.on('stage.resized', ({ height }) => {
      const id = ++waitId;
      const tryLater = (left: number) => {
        if (id !== waitId) return;
        if (window.innerHeight === height || left === 0) send();
        else setTimeout(() => tryLater(left - 1), 30);
      };
      tryLater(20);
    });
    schedule();
    return () => {
      mo.disconnect();
      window.removeEventListener('resize', schedule);
      offResized();
      waitId++;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [core]);

  return (
    <div ref={root} className={css.stage}>
      <div className={css.toasts}>
        {update && (
          <div data-interactive className={`${css.toast} ${css.update}`}>
            업데이트가 준비됐어요 ({update})
            <button onClick={() => void core.deps.bridge.invoke('update.install', {})}>다시 시작</button>
          </div>
        )}
        {elsewhere && (
          <div data-interactive className={`${css.toast} ${css.update}`}>
            다른 기기에서 쓰는 중이에요. 한 번에 한 기기에서만 쓸 수 있어요.
            <button onClick={() => core.takeOver()}>여기서 계속 쓰기</button>
          </div>
        )}
        {pick && running && (
          <div data-interactive className={`${css.toast} ${css.update}`}>
            누구에게 할지 캐릭터를 눌러 주세요
            <button onClick={() => pick(null)}>취소</button>
          </div>
        )}
        {toasts.map((t) => (
          <div key={t.id} className={css.toast}>{t.text}</div>
        ))}
      </div>
      {target?.self && <Menu core={core} maxHeight={menuH - 8} onClose={() => setMenu(null)} />}
      {target && !target.self && (
        <SeatMenu
          core={core}
          seat={target}
          left={Math.max(8, Math.min(left.get(target.key) ?? 8, stageW - 180))}
          maxHeight={menuH - 8}
          onClose={() => setMenu(null)}
        />
      )}
      {running && (
        <div className={css.row}>
          {row.map((s) => (
            <Seat key={s.key} {...seatProps(s)} riding={on.has(s.key)} away={away.has(s.key)} joinedOffset={joined.has(s.key) ? seatSize.width - benchStep : 0} desk={deskOf.get(s.key)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 열린 패널 창의 portal. 스테이지와 따로 열린 창 목록만 구독해서 좌석이 바뀌어도 패널을 다시 그리지 않는다 */
export function Panels({ core }: { core: CoreRuntime }) {
  const open = use(core.windows.open);
  return open.map((w) =>
    createPortal(
      <Suspense fallback={null}>
        <w.Component ctx={w.ctx} />
      </Suspense>,
      w.win.document.body,
      w.id,
    ),
  );
}

/** 캐릭터가 있는 모니터의 작업 영역 크기(DIP). 모니터나 배율이 바뀌면 메인이 다시 알려 준다. 아직 모르면 null */
function useWorkArea(core: CoreRuntime): { width: number; height: number } | null {
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const b = core.deps.bridge;
    void b.invoke('stage.workArea', {}).then(setArea);
    return b.on('stage.workArea', setArea);
  }, [core]);
  return area;
}

/** 받아 둔 업데이트 버전 (NFR-19). 렌더러가 다시 만들어져도 메인에 물어 다시 띄운다 */
function useUpdate(core: CoreRuntime): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    const b = core.deps.bridge;
    void b.invoke('update.state', {}).then((s) => s.version && setVersion(s.version));
    return b.on('update.ready', (e) => setVersion(e.version));
  }, [core]);
  return version;
}

interface SeatProps {
  core: CoreRuntime; seat: SeatView; size: { width: number; height: number }; scale: number; showHead: boolean; paused: boolean;
  showBubble: boolean; pixel?: number; chipSide: 'right' | 'left' | null;
  /** 회사원 모드의 ▪ 버튼 (SET-03) */
  onHide?: () => void;
  /** 이 좌석 머리 위에 올라탄 좌석 */
  riders: () => SeatProps[];
  /** 메뉴 열고 닫기, 캐릭터를 짧게 눌렀을 때와 그 항목 이름, 흔들었을 때 */
  onToggle: () => void; onAct: () => void; actLabel?: string; onShake?: () => void; onPick?: () => void;
}

/** 좌석 칸: 캐릭터 뷰, 말풍선, 클릭 영역, 이름표와 상태칩. 다른 좌석에 올라탔거나 효과로 자리를 떠나면 몸을 숨기고 책상과 이름표만 남긴다 */
function Seat(props: SeatProps & { riding: boolean; away: boolean; joinedOffset: number; desk?: SeatView }) {
  const { core, seat, size, scale, showHead, riding, away, joinedOffset, onToggle, onHide, chipSide: side } = props;
  const { box, view, hit, anchors } = useView(props, !riding, false, props.desk);
  const { width, height } = size;
  // 몸 대신 세우는 그림 (CHR-07). 올라탔거나 효과로 자리를 떠난 동안에는 쓰지 않는다
  const cover = riding || away ? null : core.imageOf(seat);
  const hidden = riding || away || cover !== null;
  useEffect(() => {
    if (hidden) view?.detach();
    else view?.reattach();
  }, [view, hidden]);

  // ctx.seats.list의 anchor와 클릭 영역은 제자리 좌석 칸 기준이다
  useEffect(() => {
    if (!view) return;
    core.seatGeometry.set(seat.key, { anchors: view.anchors(), hit });
    return () => void core.seatGeometry.delete(seat.key);
  }, [core, view, seat.key, hit]);

  const chipBox = seat.self && !seat.local && (
    <div data-interactive className={side ? `${css.chipBox} ${css.chipCol}` : css.chipBox} style={side ? { zoom: scale } : undefined}>
      <SlotItems core={core} slot="chip.buttons" seat={seat} />
      {onHide && (
        <button className={css.chip} onClick={onHide} title="화면 숨기기">
          ▪
        </button>
      )}
      <button className={css.chip} onClick={onToggle} title="메뉴">
        ▼
      </button>
    </div>
  );
  // 상태칩을 옆에 둘 때도 뷰 칸은 첫 자식으로 남긴다. 뷰 캔버스가 그 DOM 요소에 직접 붙어 있다
  const beside = chipBox ? side : null;
  return (
    <div className={css.seat} data-side={beside ?? undefined} style={{ width: beside ? undefined : width, marginLeft: -joinedOffset }}>
      <div ref={box} className={css.view} style={{ width, height }}>
        {!hidden && <Body {...props} hit={hit} anchors={anchors} />}
        {cover && <Cover {...props} file={cover.file} side={Math.round(cover.size * scale)} feet={anchors.feet} />}
        {/* 이 좌석이 남의 머리 위에 올라타 있으면 위에 탄 좌석은 그쪽 Rider가 그린다 */}
        {!riding && !away && props.riders().map((r) => <Rider key={r.seat.key} {...r} head={anchors.head} />)}
      </div>
      {/* 이름표와 칩은 모듈 조각까지 함께 키우도록 zoom을 쓴다 */}
      <div className={css.plates} style={{ zoom: scale }}>
        <button data-interactive className={css.nameplate} aria-label={seat.self ? '내 메뉴' : `${seat.name || '이름 없음'} 메뉴`} onClick={onToggle}>
          <span className={css.state} data-state={seat.state} title={STATE_LABEL[seat.state]} />
          <span className={css.name}>{seat.name || '이름 없음'}</span>
          {showHead && <SlotItems core={core} slot="seat.badge" seat={seat} />}
        </button>
        {!beside && chipBox}
      </div>
      {beside && chipBox}
    </div>
  );
}

/** 다른 좌석 머리 위에 올라탄 캐릭터 (COM-16, HOM-17). 책상과 바닥 없이 몸만 그리고 발을 아래 좌석 머리에 맞춘다 */
function Rider(props: SeatProps & { head: Point }) {
  const { size, head } = props;
  const { box, hit, anchors } = useView(props, true, true);
  return (
    <div ref={box} className={css.rider} style={{ width: size.width, height: size.height, left: head.x - anchors.feet.x, top: head.y - anchors.feet.y }}>
      <Body {...props} hit={hit} anchors={anchors} />
      {props.riders().map((r) => <Rider key={r.seat.key} {...r} head={anchors.head} />)}
    </div>
  );
}

/** 말풍선과 클릭 영역. 대상을 고르는 중이면 다른 사람 좌석을 강조하고 누르면 고른다 */
function Body({ core, seat, scale, showBubble, onToggle, onAct, actLabel, onShake, onPick, hit, anchors }: SeatProps & { hit: Rect; anchors: { bubble: Point } }) {
  const bubble = core.bubbleOf(seat);
  const press = useRef<Shake | null>(null);
  const name = seat.name || '이름 없음';
  const who = seat.self && !seat.local ? '내 캐릭터' : name;
  return (
    <>
      {showBubble && bubble && (
        <div className={css.bubble} style={{ left: anchors.bubble.x, top: anchors.bubble.y, transform: `translate(-50%, -100%) scale(${scale})` }}>
          {typeof bubble === 'string' ? bubble : <FileImage core={core} hash={bubble.image} />}
        </div>
      )}
      <div
        data-interactive
        role="button"
        aria-label={onPick ? `${name} 고르기` : actLabel ? `${who} ${actLabel}` : who}
        className={onPick ? `${css.hit} ${css.pick}` : css.hit}
        style={{ left: hit.x, top: hit.y, width: hit.width, height: hit.height }}
        onPointerDown={(e) => void (press.current = e.button === 0 ? startShake(e.clientX) : null)}
        // 클릭 통과 창은 캐릭터 밖의 포인터를 받지 못해서 흔들기는 캐릭터 위에서만 센다
        onPointerMove={(e) => {
          if (press.current && e.buttons & 1 && shakeMove(press.current, e.clientX, e.timeStamp)) onShake?.();
        }}
        onClick={() => {
          if (onPick) onPick();
          else if (!press.current?.moved) onAct();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!onPick) onToggle();
        }}
      />
    </>
  );
}

/** 파일 해시를 blob URL로 읽는다 */
const useFileUrl = (core: CoreRuntime, hash: string) => useBlobUrl(hash, (h) => core.getFile(h));

/** 몸 대신 세운 그림 (CHR-07). 그림 아래 가운데를 몸의 발 위치에 맞추고 말풍선과 클릭 영역도 그림에 맞춘다 */
function Cover(props: SeatProps & { file: string; side: number; feet: Point }) {
  const { core, file, side, feet } = props;
  const url = useFileUrl(core, file);
  const hit = { x: Math.round(feet.x - side / 2), y: Math.round(feet.y - side), width: side, height: side };
  return (
    <>
      {url && <img className={css.cover} src={url} alt="" style={{ left: hit.x, top: hit.y, width: side, height: side }} />}
      <Body {...props} hit={hit} anchors={{ bubble: { x: feet.x, y: hit.y - 8 } }} />
    </>
  );
}

/** 말풍선 그림 */
function FileImage({ core, hash }: { core: CoreRuntime; hash: string }) {
  const url = useFileUrl(core, hash);
  return url ? <img className={css.bubbleImage} src={url} alt="" /> : null;
}

/** 좌석 하나의 CharacterView. register면 효과 좌표용으로 core.seatViews에 올린다. bodyOnly면 책상과 바닥을 빼고 그린다.
 *  desk가 있으면 내 책상과 바닥 대신 그 좌석의 책상을 그린다 (벤치 하나에 여럿이 앉기) */
function useView({ core, seat, size, paused, pixel }: SeatProps, register: boolean, body = false, desk?: SeatView) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<CharacterView | null>(null);
  const [hit, setHit] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [anchors, setAnchors] = useState({ head: { x: size.width / 2, y: 0 }, bubble: { x: size.width / 2, y: 24 }, feet: { x: size.width / 2, y: size.height } });
  const { width, height } = size;

  // 크기가 바뀌면 뷰를 다시 만들어 캔버스를 그 크기로 또렷하게 그린다. 아래 useEffect들도 새 뷰에 다시 적용한다
  useEffect(() => {
    let v: CharacterView | null = null;
    v = core.deps.backend.createView(box.current!, {
      mode: 'stage',
      size: { width, height },
      pixel,
      onGeometry: () => {
        if (!v) return;
        setHit(v.hitRegion());
        setAnchors(v.anchors());
      },
      images: core.images,
    });
    setView(v);
    return () => {
      v?.dispose();
      setView(null);
    };
  }, [core, width, height, pixel]);

  useEffect(() => {
    if (!view || !register) return;
    core.seatViews.set(seat.key, { view, el: box.current! });
    return () => {
      if (core.seatViews.get(seat.key)?.view === view) core.seatViews.delete(seat.key);
    };
  }, [core, view, seat.key, register]);

  // 좌석 값은 그릴 때마다 새로 만들어지므로 외형이 바뀔 때만 다시 넣는다
  const lookOf = (s: SeatView) => (s.local ? core.layout.get().local.find((l) => l.key === s.key)?.appearance : s.look);
  const look = lookOf(seat);
  const deskLook = desk && lookOf(desk);
  useEffect(() => {
    let alive = true;
    void Promise.all([core.seatAppearance(seat), desk ? core.seatAppearance(desk) : null]).then(([a, d]) => {
      if (!alive) return;
      const own = a ?? emptyAppearance();
      const b = bodyOnly(own);
      view?.setAppearance(body ? b : desk ? { ...b, slots: { ...b.slots, ...(d?.slots.desk && { desk: d.slots.desk }) } } : own);
    });
    return () => void (alive = false);
  }, [core, view, look, body, desk?.key, deskLook]);

  const pose = core.poseOf(seat);
  useEffect(() => {
    view?.setState(pose);
    view?.setFrameBudget(paused ? 0 : pose === 'sleep' || pose === 'away' ? FPS_ASLEEP : FPS_AWAKE);
  }, [view, pose, paused]);

  return { box, view, hit, anchors };
}

/** ▼ 메뉴. maxHeight는 작업 영역에 남는 높이이고 넘치는 항목은 스크롤한다 */
function Menu({ core, maxHeight, onClose }: { core: CoreRuntime; maxHeight: number; onClose: () => void }) {
  use(core.registry.contributions);
  const main = core.registry.slot('menu.main');
  const run = (id: string) => {
    onClose();
    void core.registry.run(id).catch((e: Error) => core.toast(e.message));
  };
  return (
    <div data-interactive className={css.menu} style={{ maxHeight }}>
      {main.map((c) => (
        <button key={c.decl.id} onClick={() => c.decl.command && run(c.decl.command)}>
          {c.decl.label}
        </button>
      ))}
      <hr />
      <button onClick={() => run('core.settings')}>설정</button>
    </div>
  );
}

/** 다른 사용자 메뉴 (ROM-11). 항목은 seat.menu 슬롯이고 명령은 args로 { uid, name }을 받는다 */
function SeatMenu({ core, seat, left, maxHeight, onClose }: { core: CoreRuntime; seat: SeatView; left: number; maxHeight: number; onClose: () => void }) {
  use(core.registry.contributions);
  // 이 좌석에서 쓸 수 없는 항목(예: 이미 친구인 사람의 친구 신청)은 숨긴다
  const args = { uid: seat.uid, name: seat.name };
  const items = core.registry.slot('seat.menu').filter((c) => !c.decl.command || !core.registry.reason(c.decl.command, args));
  const run = (id: string) => {
    onClose();
    void core.registry.run(id, args).catch((e: Error) => core.toast(e.message));
  };
  return (
    <div data-interactive role="menu" aria-label={seat.name || '이름 없음'} className={css.menu} style={{ marginLeft: left, maxHeight }}>
      <div className={css.menuNote}>{seat.name || '이름 없음'}</div>
      {items.map((c) => (
        <button key={c.decl.id} role="menuitem" onClick={() => c.decl.command && run(c.decl.command)}>
          {c.decl.label}
        </button>
      ))}
      {!items.length && <div className={css.menuNote}>아직 메뉴가 없어요</div>}
    </div>
  );
}

const STATE_LABEL = { online: '접속 중', away: '자리비움', busy: '바쁨' } as const;

/** 모듈이 슬롯에 넣은 화면 조각을 그린다. 한 조각의 오류가 좌석을 멈추지 않게 각각 감싼다 */
export function SlotItems({ core, slot, seat }: { core: CoreRuntime; slot: string; seat?: SeatView }) {
  use(core.registry.contributions);
  return (
    <>
      {core.registry
        .slot(slot)
        .filter((x) => x.decl.component)
        .map((x) => {
          const C = x.decl.component!;
          return (
            <Guard key={x.decl.id} id={x.decl.id} core={core}>
              <C ctx={x.ctx} seat={seat} />
            </Guard>
          );
        })}
    </>
  );
}

class Guard extends Component<{ id: string; core: CoreRuntime; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(e: Error) {
    this.props.core.log('error', 'slot', `${this.props.id}: ${e.message}`);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** ctx.ui.CharacterPreview. 좌석과 같은 backend로 그리고 appearance가 없으면 내 지금 외형을 그린다 */
export function CharacterPreview({ core, appearance, pose = 'idle', width = 160, height = 200 }: {
  core: CoreRuntime; appearance?: Appearance | null; pose?: 'idle' | 'typing' | 'sleep'; width?: number; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<CharacterView | null>(null);
  const self = use(core.self);
  const look = appearance === undefined ? self.appearance : appearance;

  useEffect(() => {
    const v = core.deps.backend.createView(box.current!, { mode: 'preview', size: { width, height }, images: core.images });
    view.current = v;
    return () => {
      v.dispose();
      view.current = null;
    };
  }, [core, width, height]);

  useEffect(() => {
    if (look) view.current?.setAppearance(look);
  }, [look]);

  useEffect(() => view.current?.setState(pose), [pose]);

  return <div ref={box} style={{ position: 'relative', width, height }} />;
}
