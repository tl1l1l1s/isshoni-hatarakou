// 놀이 상태와 동작. 상태는 ctx마다 따로 둔다.
// 방에 있으면 시드를 담은 방 이벤트를 보내고 받은 곳에서 효과를 실행해 모두가 같은 장면을 본다 (ADR 0007)
import type { Ctx, Dispose } from '@core/types';
import { dayIndex, nextQuota } from '@shared/time';
import type { TextData } from './effects';
import {
  busted, countShow, dice, diceText, DANCE_GAP_MS, DANCE_MS, DIZZY_MS, BOMB_MS, FLY_MS, HIT_LIMIT, HIT_MS, PET_MS,
  ROLL_GAP_MS, ROLL_LIMIT, ROLL_MS, ROLL_PAUSE_MS, ROLL_SHOW_MS, seed, STALE_MS, TEXT_LINES, TEXT_MS,
  type Aim, type Dance, type FlyText, type Local, type Roll,
} from './logic';

export const HEART = '💗';
export const DIZZY = '💫';
export const NOT_IN_ROOM = '방에 들어가 있을 때 쓸 수 있어요.';

interface State {
  /** 좌석 key별 머리 위 글. reaction은 설정과 조용한 모드를 따르는 반응 (CHR-11) */
  heads: Map<string, { text: string; reaction: boolean }>;
  running: Set<Dispose>;
  texts: number;
  danceAt: number;
  shows: Record<80 | 150, number[]>;
  rollAt: number;
  /** 내 캐릭터가 날아가 있거나 어지러운 동안 */
  busyUntil: number;
  /** 대화하기 창의 날리기 체크 */
  fly: boolean;
  handlers: Record<string, (payload: never, uid: string) => void>;
}
const states = new WeakMap<Ctx, State>();
export function state(ctx: Ctx): State {
  let s = states.get(ctx);
  if (!s) states.set(ctx, (s = { heads: new Map(), running: new Set(), texts: 0, danceAt: 0, shows: { 80: [], 150: [] }, rollAt: 0, busyUntil: 0, fly: false, handlers: {} }));
  return s;
}

const myKey = (ctx: Ctx): string => ctx.room.members().find((s) => s.self && !s.local)?.key ?? '';
const nameOf = (ctx: Ctx, key: string): string => ctx.room.members().find((s) => s.key === key)?.name || '이름 없음';
/** 다른 사용자 메뉴의 args { uid }로 그 사람 좌석을 찾는다 */
export const targetOf = (ctx: Ctx, args: unknown) => ctx.room.members().find((s) => !s.self && s.uid === (args as { uid?: string } | undefined)?.uid);

/** 좌석 머리 위 글. 조용한 모드에서는 받은 신호의 그림을 내지 않고 반응은 설정으로도 끈다 (CHR-11) */
export function headText(ctx: Ctx, key: string): string | null {
  const e = state(ctx).heads.get(key);
  if (!e || ctx.mode.get() !== 'normal') return null;
  return !e.reaction || ctx.settings.get<{ reactions: boolean }>().reactions ? e.text : null;
}

/** key 좌석 머리 위에 ms 동안 띄운다. 그 사이 새 글이 덮으면 새 글의 타이머가 지운다 */
function head(ctx: Ctx, key: string, text: string, ms: number, reaction = true): void {
  const { heads } = state(ctx);
  const entry = { text, reaction };
  heads.set(key, entry);
  ctx.seats.refresh();
  ctx.timers.at(ms, () => {
    if (heads.get(key) !== entry) return;
    heads.delete(key);
    ctx.seats.refresh();
  });
}

/** 효과를 실행하고 조용한 모드로 바뀌면 멈추도록 기억한다 */
function fx(ctx: Ctx, key: string, id: string, opts: { toSeatKey?: string; seed: number; data?: unknown }, ms: number): void {
  const { running } = state(ctx);
  const stop = ctx.render.playEffect(key, id, opts);
  running.add(stop);
  ctx.timers.at(ms, () => running.delete(stop));
}

/** 회사원 모드를 켜면 흐르던 글과 연출을 바로 지운다 (COM-05) */
export function stopAll(ctx: Ctx): void {
  const { running } = state(ctx);
  running.forEach((stop) => stop());
  running.clear();
}

/** 방에 있으면 방 이벤트로 보내고 혼자 모드면 이 PC에서만 실행한다. 보내지 못하면 false */
function send(ctx: Ctx, type: string, payload: unknown): boolean {
  if (!ctx.room.current()) {
    state(ctx).handlers[type]?.(payload as never, ctx.self.uid());
    return true;
  }
  if (ctx.room.emit(type, payload)) return true;
  ctx.ui.toast('잠시 뒤에 다시 해 주세요.');
  return false;
}

/** 하루 횟수를 하나 쓸 수 있으면 기록하는 함수, 다 썼으면 null. 하루는 오전 6시에 바뀐다 (FOC-05) */
function quota(ctx: Ctx, kind: 'hit' | 'roll', limit: number): (() => number) | null {
  const next = nextQuota(ctx.local.get<Local>('account')[kind], dayIndex(ctx.clock.serverNow()), limit);
  if (!next) return null;
  return () => {
    ctx.local.update<Local>('account', (l) => ({ ...l, [kind]: next }));
    return next.n;
  };
}

// ---- 받은 신호 ----------------------------------------------------------------

function fly(ctx: Ctx, key: string, s: number): void {
  fx(ctx, key, 'play.fly', { seed: s }, FLY_MS);
  ctx.timers.at(FLY_MS, () => head(ctx, key, DIZZY, DIZZY_MS));
  if (key === myKey(ctx)) state(ctx).busyUntil = Math.max(state(ctx).busyUntil, ctx.clock.now() + FLY_MS + DIZZY_MS);
}

const on = {
  dance(ctx: Ctx, d: Dance, uid: string) {
    fx(ctx, d.key, d.kind === 80 ? 'play.dance80' : 'play.dance150', { seed: d.seed, data: { fast: d.show } }, DANCE_MS);
    if (!d.show) return;
    // 누가 일으켰는지 알린다 (COM-17)
    ctx.ui.toast(`${nameOf(ctx, d.key)}님의 깜짝쇼예요`);
    if (d.kind === 80) ctx.room.members().filter((s) => s.uid !== uid && !s.local).forEach((s, i) => fly(ctx, s.key, d.seed + i + 1));
  },
  roll(ctx: Ctx, r: Roll) {
    const result = dice(r.seed);
    let i = 0;
    const stop = ctx.timers.every(100, () => {
      i++;
      head(ctx, r.key, diceText([1 + (i % 6), 1 + ((i * 5 + 3) % 6)]), ROLL_MS, false);
    });
    ctx.timers.at(ROLL_MS, () => {
      stop();
      head(ctx, r.key, diceText(result), ROLL_SHOW_MS, false);
    });
    if (busted(result)) ctx.timers.at(ROLL_MS + ROLL_PAUSE_MS, () => fly(ctx, r.key, r.seed));
    if (r.key === myKey(ctx)) state(ctx).busyUntil = ctx.clock.now() + ROLL_MS + (busted(result) ? ROLL_PAUSE_MS + FLY_MS + DIZZY_MS : 0);
  },
  hit(ctx: Ctx, a: Aim) {
    fx(ctx, a.to, 'play.hit', { seed: a.seed }, HIT_MS);
    ctx.timers.at(HIT_MS, () => head(ctx, a.to, DIZZY, DIZZY_MS));
  },
  bomb(ctx: Ctx, a: Aim) {
    fx(ctx, a.from, 'play.bomb', { toSeatKey: a.to, seed: a.seed }, BOMB_MS);
    ctx.timers.at(BOMB_MS, () => fly(ctx, a.to, a.seed));
  },
  pet(ctx: Ctx, p: { to: string }) {
    head(ctx, p.to, HEART, PET_MS);
  },
  shake(ctx: Ctx, p: { to: string }) {
    head(ctx, p.to, DIZZY, DIZZY_MS);
  },
  text(ctx: Ctx, t: FlyText) {
    const st = state(ctx);
    if (st.texts >= TEXT_LINES) return;
    st.texts++;
    ctx.timers.at(TEXT_MS, () => st.texts--);
    const data: TextData = { text: `${nameOf(ctx, t.key)}: ${t.text}`, size: t.size, ...(t.color && { color: t.color }) };
    fx(ctx, t.key, 'play.text', { seed: t.seed, data }, TEXT_MS);
  },
};

/** 방 이벤트를 받는다. 30초가 지난 신호는 버린다 (CHR-11) */
export function listen(ctx: Ctx): void {
  const st = state(ctx);
  for (const [type, fn] of Object.entries(on) as Array<[string, (ctx: Ctx, p: never, uid: string) => void]>) {
    st.handlers[type] = (p, uid) => fn(ctx, p, uid);
    ctx.room.onEvent(type, (e) => {
      if (ctx.clock.serverNow() - e.at <= STALE_MS) fn(ctx, e.payload as never, e.uid);
    });
  }
}

// ---- 보내기 -------------------------------------------------------------------

export const danceWait = (ctx: Ctx): string | null => (ctx.clock.now() - state(ctx).danceAt < DANCE_GAP_MS ? '잠시 뒤에 다시 출 수 있어요.' : null);

/** 춤 (COM-10). 같은 춤 명령을 대화하기 창에 1분 안에 세 번 보내면 깜짝쇼 (COM-17). ▼ 메뉴 춤은 세지 않는다 */
export function dance(ctx: Ctx, kind: 80 | 150, args: unknown): void {
  const st = state(ctx);
  const now = ctx.clock.now();
  const r = (args as { chat?: boolean } | undefined)?.chat ? countShow(st.shows[kind], now) : { show: false, times: st.shows[kind] };
  if (!send(ctx, 'dance', { key: myKey(ctx), kind, show: r.show, seed: seed() })) return;
  st.shows[kind] = r.times;
  st.danceAt = now;
}

export function rollWait(ctx: Ctx): string | null {
  const st = state(ctx);
  const now = ctx.clock.now();
  if (now < st.busyUntil) return '아직 어지러워요. 잠시 뒤에 굴려 주세요.';
  return now - st.rollAt < ROLL_GAP_MS ? '잠시 뒤에 다시 굴릴 수 있어요.' : null;
}

/** 러시안룰렛 (COM-14). 하루 6번 */
export function roll(ctx: Ctx): void {
  const use = quota(ctx, 'roll', ROLL_LIMIT);
  if (!use) return ctx.ui.toast(`오늘은 ${ROLL_LIMIT}번 모두 굴렸어요.`);
  if (!send(ctx, 'roll', { key: myKey(ctx), seed: seed() })) return;
  use();
  state(ctx).rollAt = ctx.clock.now();
}

/** 때리기 (COM-11). 대상과 상관없이 하루 30번 */
export function hit(ctx: Ctx, args: unknown): void {
  const target = targetOf(ctx, args);
  if (!target) return;
  const use = quota(ctx, 'hit', HIT_LIMIT);
  if (!use) return ctx.ui.toast(`오늘은 ${HIT_LIMIT}번 모두 때렸어요.`);
  if (send(ctx, 'hit', { from: myKey(ctx), to: target.key, seed: seed() })) ctx.ui.toast(`때렸어요. 오늘 ${use()}/${HIT_LIMIT}`);
}

/** 폭탄 (COM-13). 다른 사용자 메뉴에서는 그 사람에게, 대화하기 창에서는 캐릭터를 골라 던진다 */
export async function bomb(ctx: Ctx, args: unknown): Promise<void> {
  const target = args ? targetOf(ctx, args) : await ctx.ui.pickTarget();
  if (target) send(ctx, 'bomb', { from: myKey(ctx), to: target.key, seed: seed() });
}

/** 쓰다듬기와 흔들기 (CHR-11). 캐릭터를 누르면 그 좌석을, 다른 사용자 메뉴는 { uid }를 args로 받는다.
 *  내 다른 캐릭터 좌석은 이 PC에만 있어서 보내지 않고 여기서만 띄운다 */
export function react(ctx: Ctx, type: 'pet' | 'shake', args: unknown): void {
  const seat = args as { key?: string; local?: boolean } | undefined;
  const to = seat?.key ?? targetOf(ctx, args)?.key;
  if (!to) return;
  if (seat?.local) state(ctx).handlers[type]?.({ to } as never, ctx.self.uid());
  else send(ctx, type, { to });
}

/** 대화하기 입력란의 글. 춤 명령과 날리기를 받으면 true (ChatApi.intercept) */
export function onChatText(ctx: Ctx, text: string): boolean {
  if (text === '/80' || text === '/150') {
    ctx.commands.run(text === '/80' ? 'play.dance' : 'play.dance2', { chat: true }).catch((e: Error) => ctx.ui.toast(e.message));
    return true;
  }
  if (!state(ctx).fly || ctx.mode.get() !== 'normal') return false;
  const { size, color } = ctx.local.get<Local>('account');
  send(ctx, 'text', { key: myKey(ctx), text, size, ...(ctx.gates.isOpen('play.flyColor') && { color }), seed: seed() });
  return true;
}
