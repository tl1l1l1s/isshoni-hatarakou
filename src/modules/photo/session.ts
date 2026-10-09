// 촬영 세션 (COM-15). 방에서는 mod/photo/r/{방}의 자리, 설정, 자세, 컷을 창이 열려 있는 동안만 구독하고
// 방 밖에서는 같은 모양을 메모리에 둔다. 진행자(사람이 있는 가장 작은 번호의 자리)만 설정과 컷을 쓰고
// 모든 PC는 컷 기록만으로 같은 사진을 그린다
import type { Ctx, Dispose } from '@core/types';
import { dayIndex, nextQuota, type QuotaRecord } from '@shared/time';
import {
  canTake, Cfg, countdown, dueCuts, fullRun, hostSlot, liftAt, Pose, POSE0, running, shotsOf, SLOT_REFRESH_MS, SLOTS, slotsOf,
  type Setup, type Shot, type Slot,
} from './logic';

/** 자세를 보내는 최소 간격 (초당 10번) */
const POSE_MS = 100;
export const QUOTA_OUT = '오늘 찍을 수 있는 횟수를 다 썼어요. 오전 6시 뒤에 다시 찍어 주세요.';

export interface Person { slot: number; uid: string; name: string; look: string | null; self: boolean; pose: Pose }
export interface View {
  room: string | null;
  /** 사진에 찍히는 사람. 자리 순서 */
  people: Person[];
  /** 자리를 잡았는지. 방 밖에서는 언제나 참 */
  joined: boolean;
  /** 자리 네 칸에 모두 다른 사람이 있다 */
  full: boolean;
  host: boolean;
  hostName: string;
  cfg: Cfg;
  /** 촬영 중이면 지금 컷과 남은 초 */
  count: { cut: number; left: number } | null;
  /** 하루 촬영 한도를 셀 때 오늘 쓴 횟수와 한도 */
  quota: { used: number; cap: number } | null;
}
export type Session = ReturnType<typeof openSession>;

export function openSession(ctx: Ctx, init: Setup, onRun: (shots: Shot[]) => void) {
  const room = ctx.room.current();
  const docs = room ? ctx.server.room(room) : null;
  const me = ctx.self.uid();
  const now = () => ctx.clock.serverNow();
  const cap = room ? ctx.tunables.get<number>('photoDailyCap') : 0;
  const warn = (e: Error) => ctx.log.warn(`스티커 사진: ${e.message}`);

  let slots: Array<Slot | null> = room ? slotsOf(null) : [{ uid: me, at: 0 }, null, null, null];
  let cfg: Cfg = { ...init, t0: 0 };
  // 서버에 cfg가 없다고 확인했는지 (진행자가 처음 쓴다)
  let cfgMissing = false;
  let poses: Record<string, Pose> = {};
  let mine = POSE0;
  let shots: Record<string, Shot> = {};
  let quota: QuotaRecord | null = null;
  let held: number | null = room ? null : 0;
  let taking = false;
  let starting = false;
  let closed = false;
  // 이 창에서 시작을 본 촬영과 사진을 만든 촬영
  let seen = 0;
  let done = 0;
  const writing = new Set<string>();
  const subs = new Set<() => void>();
  const stops: Dispose[] = [];

  const isHost = () => held !== null && held === hostSlot(slots);
  function people(): Person[] {
    const seats = ctx.room.members().filter((s) => !s.local);
    if (!room) return seats.filter((s) => s.self).map((s) => ({ slot: 0, uid: s.uid, name: s.name, look: s.look, self: true, pose: mine }));
    return slots.flatMap((s, i) => {
      // 방에서 나간 자리 주인은 찍지 않는다 (연결이 끊기면 자리도 곧 지워진다)
      const seat = s && seats.find((m) => m.uid === s.uid);
      return seat ? [{ slot: i, uid: seat.uid, name: seat.name, look: seat.look, self: seat.self, pose: seat.self ? mine : (poses[i] ?? POSE0) }] : [];
    });
  }

  let view: View;
  const emit = () => {
    const t = now();
    const ppl = people();
    view = {
      room, people: ppl, joined: held !== null, full: held === null && slots.every(Boolean), host: isHost(),
      hostName: ppl.find((p) => p.slot === hostSlot(slots))?.name || '이름 없음',
      cfg, count: running(cfg, t) ? countdown(cfg, t) : null,
      quota: cap > 0 ? { used: quota?.d === dayIndex(t) ? quota.n : 0, cap } : null,
    };
    subs.forEach((f) => f());
  };
  emit();

  /** 빈자리를 transaction으로 잡고 연결이 끊기면 자리와 자세를 지우도록 예약한다. 15분 지난 남의 자리는 빈자리가 없을 때만 잡는다 */
  async function take() {
    if (!docs || closed || taking || held !== null) return;
    taking = true;
    try {
      const free = (i: number) => !slots[i] || slots[i].uid === me;
      const all = [...Array(SLOTS).keys()];
      for (const i of [...all.filter(free), ...all.filter((i) => !free(i))]) {
        if (!canTake(slots[i] ?? null, me, now())) continue;
        const r = await docs.transaction<Slot>(`slots/${i}`, (cur) => (canTake(cur, me, now()) ? { uid: me, at: now() } : undefined));
        if (!r.committed) continue;
        held = i;
        if (closed) return release();
        await docs.removeOnDisconnect(`slots/${i}`);
        await docs.removeOnDisconnect(`p/${i}`);
        await docs.set(`p/${i}`, mine);
        // 처음 자리를 잡은 사람이 방 사람들에게 알린다
        if (slots.every((s, j) => j === i || !s)) ctx.room.emit('invite', {});
        chores();
        return emit();
      }
    } catch (e) {
      warn(e as Error);
    } finally {
      taking = false;
    }
  }

  /** 끊길 때 지우기 예약을 거둔다. 남이 잡은 자리를 내 예약이 지우지 않게 한다 */
  const forget = (i: number) =>
    void Promise.all([docs?.removeOnDisconnect(`slots/${i}`, false), docs?.removeOnDisconnect(`p/${i}`, false)]).catch(warn);

  function release() {
    if (!docs || held === null) return;
    const i = held;
    held = null;
    const last = slots.every((s, j) => j === i || !s || s.uid === me);
    const mine = { [`slots/${i}`]: null, [`p/${i}`]: null };
    // 마지막으로 나가는 사람이 세션을 지운다. 그사이 누가 자리를 잡아 거절되면 내 자리와 자세만 지운다
    const wipe = last ? docs.update('', { ...mine, cfg: null, shots: null }).catch(() => docs.update('', mine)) : docs.update('', mine);
    void wipe.catch(warn).finally(() => forget(i));
  }

  /** 진행자 일: 처음 설정 쓰기, 셔터 시각이 지난 컷 남기기, 끝난 촬영 정리 */
  function chores() {
    if (!isHost()) return;
    const t = now();
    if (cfgMissing && docs && !writing.has('cfg')) {
      writing.add('cfg');
      void docs.set('cfg', cfg).catch(warn).finally(() => writing.delete('cfg'));
    }
    if (!cfg.t0) return;
    for (const i of running(cfg, t) ? dueCuts(cfg, shots, t) : []) snap(i, t);
    if (!running(cfg, t) || fullRun(shots, cfg.t0)) setCfg({ t0: 0 });
  }

  function snap(i: number, t: number) {
    const id = `${cfg.t0}:${i}`;
    if (writing.has(id)) return;
    const { t0, o, n, bg, fl, fr, own } = cfg;
    const shot: Shot = {
      t0, o, n, bg, fl, fr, own,
      ppl: people().map((p) => ({ l: p.look ?? '', x: p.pose.x, f: p.pose.f, z: p.pose.z, y: Math.round(liftAt(p.pose.j, t) * 100) })),
    };
    if (!docs) {
      shots = { ...shots, [i]: shot };
      return deliver();
    }
    writing.add(id);
    // 진행자가 바뀌는 순간 두 PC가 같은 컷을 써도 먼저 쓴 것 하나만 남는다
    void docs.transaction<Shot>(`shots/${i}`, (cur) => (cur ? undefined : shot)).catch(warn).finally(() => writing.delete(id));
  }

  function deliver() {
    if (!seen || done === seen) return;
    const run = fullRun(shots, seen);
    if (!run) return;
    done = seen;
    onRun(run);
  }

  function setCfg(patch: Partial<Cfg>) {
    cfg = { ...cfg, ...patch };
    if (docs) void docs.update('cfg', patch).catch(warn);
    emit();
  }

  let lastSent = 0;
  let pending = false;
  function sendPose() {
    if (!docs || held === null) return;
    const wait = lastSent + POSE_MS - ctx.clock.now();
    if (wait > 0) {
      if (!pending) {
        pending = true;
        ctx.timers.at(wait, () => {
          pending = false;
          sendPose();
        });
      }
      return;
    }
    lastSent = ctx.clock.now();
    void docs.set(`p/${held}`, mine).catch(warn);
  }

  if (docs) {
    stops.push(
      docs.watch('slots', (v) => {
        slots = slotsOf(v);
        // 연결이 끊긴 사이 서버가 내 자리를 지웠거나 남이 잡았으면 다시 잡는다
        if (held !== null && slots[held]?.uid !== me) {
          forget(held);
          held = null;
        }
        emit();
        chores();
        void take();
      }),
      docs.watch('cfg', (v) => {
        const r = Cfg.safeParse(v);
        cfgMissing = v === null;
        if (r.success) cfg = r.data;
        if (running(cfg, now())) seen = cfg.t0;
        emit();
        chores();
        deliver();
      }),
      docs.watch('p', (v) => {
        poses = {};
        for (const [k, raw] of Object.entries((v ?? {}) as Record<string, unknown>)) {
          const r = Pose.safeParse(raw);
          if (r.success) poses[k] = r.data;
        }
        emit();
      }),
      docs.watch('shots', (v) => {
        shots = shotsOf(v);
        deliver();
        emit();
      }),
      ctx.room.onMembers(emit),
    );
    if (cap > 0) {
      stops.push(
        ctx.server.global().watch<QuotaRecord>('quota', (v) => {
          quota = v;
          emit();
        }),
      );
    }
  }
  // 촬영 중에는 카운트다운과 진행자 일을 0.2초마다 본다
  stops.push(
    ctx.timers.every(200, () => {
      if (!cfg.t0) return;
      chores();
      emit();
    }),
    // 창을 오래 열어 두어도 남이 덮지 못하게 내 자리 시각을 고친다
    ctx.timers.every(SLOT_REFRESH_MS, () => {
      const i = held;
      if (docs && i !== null) void docs.transaction<Slot>(`slots/${i}`, (cur) => (cur?.uid === me ? { uid: me, at: now() } : undefined)).catch(warn);
    }),
  );

  return {
    get: () => view,
    subscribe(fn: () => void): Dispose {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    /** 내 자세를 바꾼다. fn은 서버 시각을 받고 null이면 처리하지 않은 것이다. 자리가 없으면 움직이지 못한다 */
    pose(fn: (p: Pose, now: number) => Pose | null): boolean {
      const next = held === null ? null : fn(mine, now());
      if (!next) return false;
      if (next !== mine) {
        mine = next;
        emit();
        sendPose();
      }
      return true;
    },
    /** 진행자만 설정을 바꾼다 */
    setup(patch: Partial<Setup>) {
      if (isHost()) setCfg(patch);
    },
    /** 진행자가 촬영을 시작한다. 방에서 하루 한도를 세면 먼저 1을 올린다 */
    async start() {
      if (starting || !isHost() || running(cfg, now())) return;
      // 두 번 눌러도 한도를 한 번만 센다
      starting = true;
      try {
        if (cap > 0) {
          const r = await ctx.server.global().transaction<QuotaRecord>('quota', (cur) => nextQuota(cur, dayIndex(now()), cap));
          if (!r.committed) throw new Error(QUOTA_OUT);
        }
        const t0 = now();
        cfg = { ...cfg, t0 };
        seen = t0;
        emit();
        if (docs) await docs.update('', { 'cfg/t0': t0, shots: null });
        else shots = {};
      } finally {
        starting = false;
      }
    },
    close() {
      closed = true;
      stops.forEach((d) => d());
      release();
    },
  };
}
