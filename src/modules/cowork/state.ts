// 같이 작업하기 상태 (ROM-15). 방에 들어가 있는 동안 지금 세션(cur)과 참여 기록(parts)을 구독하고 1초마다 단계를 본다.
// 진행 중에는 방에 쓰지 않는다. 남은 시간은 각 PC가 서버 시각으로 계산한다
import { useSyncExternalStore } from 'react';
import type { Ctx, Dispose } from '@core/types';
import type {} from '@modules/pomodoro/api';
import type {} from '@modules/rooms/api';
import { bubbleText, canJoin, create, GOAL_MAX, notice, phaseOf, readParts, readSession, start, stop, type Draft, type Part, type Phase, type Session } from './logic';

export const WIN = 'cowork.main';
/** 만든 지 이 시간 안의 세션만 초대 알림을 띄운다. 늦게 켠 앱이 오래된 세션을 알리지 않게 한다 */
const INVITE_MS = 2 * 60_000;

export interface View {
  code: string | null;
  cur: Session | null;
  parts: Record<string, Part>;
  /** 내 목표. 공유하지 않은 목표도 이 PC에서는 보인다 */
  goal: string;
}

interface Store {
  view: View;
  subs: Set<() => void>;
  /** 초대 알림을 띄웠거나 띄우지 않기로 한 세션 */
  seen: Set<string>;
  /** 마지막으로 본 단계와 그 단계가 끝나는 시각 */
  last: { id: string; phase: Phase; end: number } | null;
  /** 머리 위 글이 바뀌었는지 보려고 둔 마지막 값 */
  shown: string;
}
const stores = new WeakMap<Ctx, Store>();

function store(ctx: Ctx): Store {
  let s = stores.get(ctx);
  if (!s) stores.set(ctx, (s = { view: { code: null, cur: null, parts: {}, goal: '' }, subs: new Set(), seen: new Set(), last: null, shown: '' }));
  return s;
}

function set(ctx: Ctx, patch: Partial<View>) {
  const s = store(ctx);
  s.view = { ...s.view, ...patch };
  s.subs.forEach((fn) => fn());
}

export function useView(ctx: Ctx): View {
  const s = store(ctx);
  return useSyncExternalStore(
    (fn) => {
      s.subs.add(fn);
      return () => void s.subs.delete(fn);
    },
    () => s.view,
  );
}

export const viewOf = (ctx: Ctx) => store(ctx).view;

/** 지금 세션에 참여 중인지 */
export const joined = (v: View, uid: string) => !!v.cur && v.parts[uid]?.sid === v.cur.id;

/** 참여자: 지금 세션에 참여했고 지금 방에 앉아 있는 사람. 앱을 끄거나 방을 나간 사람은 빠진다 */
export function participants(ctx: Ctx, v: View): Array<{ uid: string; name: string; goal?: string }> {
  if (!v.cur) return [];
  const seats = ctx.room.members();
  const out: Array<{ uid: string; name: string; goal?: string }> = [];
  for (const [uid, p] of Object.entries(v.parts)) {
    const seat = seats.find((x) => x.uid === uid);
    if (p.sid === v.cur.id && seat) out.push({ uid, name: seat.name || '이름 없음', ...(p.goal && { goal: p.goal }) });
  }
  return out;
}

const nameOf = (ctx: Ctx, uid: string) => ctx.room.members().find((x) => x.uid === uid)?.name || '방 친구';

/** 좌석 머리 위 글 (CHR-09). 지금 세션 참여자에게만 띄운다 */
export function seatBubble(ctx: Ctx, uid: string): string | null {
  const v = store(ctx).view;
  return joined(v, uid) ? bubbleText(v.cur, ctx.clock.serverNow()) : null;
}

/** 1초마다와 세션이 바뀔 때. 초대 알림, 참여자의 단계 알림, 머리 위 글 다시 그리기 */
function check(ctx: Ctx): void {
  const s = store(ctx);
  const v = s.view;
  const me = ctx.self.uid();
  const now = ctx.clock.serverNow();
  const { phase, end } = phaseOf(v.cur, now);
  if (v.cur && phase !== 'done' && !s.seen.has(v.cur.id)) {
    s.seen.add(v.cur.id);
    if (v.cur.by !== me && canJoin(phase) && now - v.cur.at < INVITE_MS && ctx.mode.get() !== 'quiet') {
      ctx.ui.toast(`${nameOf(ctx, v.cur.by)}님이 같이 작업하기를 열었어요.`);
    }
  }
  const prev = s.last;
  s.last = v.cur ? { id: v.cur.id, phase, end } : null;
  if (v.cur && prev?.id === v.cur.id && prev.phase !== phase && joined(v, me)) {
    const text = notice(v.cur, prev.phase, phase, v.cur.st === 'stop' ? now : prev.end, now);
    if (text) {
      ctx.ui.toast(text);
      // 시작과 누가 끝낸 것은 창 안 알림만 띄우고 집중과 세션이 끝날 때는 OS 알림과 소리도 낸다
      if (phase === 'break' || (phase === 'done' && v.cur.st !== 'stop')) {
        ctx.notify({ title: '같이 작업하기', body: text, onClick: () => ctx.ui.open(WIN) });
        ctx.modules.get('pomodoro')?.chime();
      }
    }
  }
  const shown = `${bubbleText(v.cur, now)}|${participants(ctx, v).map((p) => p.uid).join()}`;
  if (shown !== s.shown) {
    s.shown = shown;
    ctx.seats.refresh();
  }
}

/** setup에서 한 번 부른다. 들어간 방을 따라 세션을 구독한다 */
export function watch(ctx: Ctx): void {
  let off: Dispose[] = [];
  let prev: string | null = null;
  const follow = (code: string | null) => {
    off.forEach((f) => f());
    off = [];
    // 방을 옮기거나 나오면 앞 방의 내 참여를 지운다. 규칙은 방을 나온 뒤에도 내 기록을 지우게 한다
    if (prev && prev !== code) void ctx.server.room(prev, ['parts']).remove(ctx.self.uid()).catch(() => undefined);
    prev = code;
    store(ctx).last = null;
    set(ctx, { code, cur: null, parts: {} });
    if (!code) return;
    const room = ctx.server.room(code);
    off.push(
      room.watch('cur', (v) => {
        if (ctx.room.current() !== code) return;
        set(ctx, { cur: readSession(v) });
        check(ctx);
      }),
      room.watch('parts', (v) => {
        if (ctx.room.current() !== code) return;
        set(ctx, { parts: readParts(v) });
        check(ctx);
      }),
    );
  };
  follow(ctx.room.current());
  ctx.room.onChange((code) => follow(code));
  ctx.timers.every(1000, () => check(ctx));
  // 참여 중에 개인 뽀모도로를 시작하면 세션에서 나온다. 두 타이머가 함께 돌며 끝 알림을 따로 내지 않게 한다
  ctx.modules.get('pomodoro')?.onChange((running) => {
    if (!running || !joined(store(ctx).view, ctx.self.uid())) return;
    void leave(ctx).catch(() => undefined);
    ctx.ui.toast('개인 뽀모도로를 시작해서 같이 작업하기에서 나왔어요.');
  });
}

/** 개인 뽀모도로가 돌면 끝내고 참여할지 창 안에서 묻는다. 취소하면 false */
async function stopPomodoro(ctx: Ctx): Promise<boolean> {
  const pomodoro = ctx.modules.get('pomodoro');
  if (!pomodoro?.running()) return true;
  const ok = await ctx.ui.ask(WIN, { text: '개인 뽀모도로를 끝내고 참여할까요?', ok: '끝내고 참여', cancel: '취소' });
  if (ok) pomodoro.stop();
  return ok;
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');

function room(ctx: Ctx): string {
  const code = ctx.room.current();
  if (!code) throw new Error('방에 들어가면 쓸 수 있어요.');
  return code;
}

async function writePart(ctx: Ctx, code: string, sid: string, goal: string, share: boolean) {
  const g = goal.trim().slice(0, GOAL_MAX);
  set(ctx, { goal: g });
  await ctx.server.room(code, ['parts']).set(ctx.self.uid(), { sid, at: ctx.clock.serverNow(), ...(share && g && { goal: g }), v: 1 });
}

/** 세션을 열고 참여한다. 개인 뽀모도로를 끝내지 않기로 하면 false. 다른 사람이 먼저 열었으면 알린다 */
export async function open(ctx: Ctx, d: Draft, goal: string, share: boolean): Promise<boolean> {
  const code = room(ctx);
  if (!(await stopPomodoro(ctx))) return false;
  const id = newId();
  const me = ctx.self.uid();
  const r = await ctx.server.room(code).transaction<unknown>('cur', (cur) => create(readSession(cur), me, d, id, ctx.clock.serverNow()));
  if (!r.committed || readSession(r.value)?.id !== id) throw new Error('이미 같이 작업하는 중이에요.');
  store(ctx).seen.add(id);
  await writePart(ctx, code, id, goal, share);
  return true;
}

/** 지금 세션에 참여한다. 목표는 share일 때만 방에 쓴다 */
export async function join(ctx: Ctx, goal: string, share: boolean): Promise<boolean> {
  const code = room(ctx);
  const { cur } = store(ctx).view;
  if (!cur || !canJoin(phaseOf(cur, ctx.clock.serverNow()).phase)) throw new Error('지금은 참여할 수 없어요.');
  if (!(await stopPomodoro(ctx))) return false;
  await writePart(ctx, code, cur.id, goal, share);
  return true;
}

/** 내 참여만 끝낸다 */
export async function leave(ctx: Ctx): Promise<void> {
  await ctx.server.room(room(ctx), ['parts']).remove(ctx.self.uid());
}

/** 개설자가 시작한다. 5초 뒤 집중이 시작된다 */
export async function begin(ctx: Ctx): Promise<void> {
  const me = ctx.self.uid();
  const r = await ctx.server.room(room(ctx)).transaction<unknown>('cur', (cur) => start(readSession(cur), me, ctx.clock.serverNow()));
  if (!r.committed) throw new Error('지금은 시작할 수 없어요.');
}

/** 개설자나 방 주인이 세션 전체를 끝낸다 */
export async function end(ctx: Ctx): Promise<void> {
  const me = ctx.self.uid();
  const owner = ctx.modules.get('rooms')?.isOwner() ?? false;
  const r = await ctx.server.room(room(ctx)).transaction<unknown>('cur', (cur) => stop(readSession(cur), me, owner, ctx.clock.serverNow()));
  if (!r.committed) throw new Error('이미 끝난 세션이에요.');
}

/** 이 사람이 세션 전체를 끝낼 수 있는지 */
export const canEnd = (ctx: Ctx, cur: Session | null) => !!cur && (cur.by === ctx.self.uid() || (ctx.modules.get('rooms')?.isOwner() ?? false));
