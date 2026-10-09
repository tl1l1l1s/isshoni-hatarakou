// RoomSession: 방 입장과 퇴장, 멤버 기록 쓰기, 멤버 목록 거름 (10.7.2 방 접속 상태).
// 기록 키는 {uid}_{deviceId}이고 seenAt은 60초마다 batch 필드와 함께 쓴다. 따로 하트비트는 보내지 않는다.
// 방 이벤트(10.5 roomEvents)도 여기서 보내고 받는다.
import { PRESENCE_MODULE_MAX_BYTES, PRESENCE_SEEN_MS, PRESENCE_STALE_MS } from '@shared/constants';
import { randomCode } from '@shared/codes';
import type { MemberRecord } from '@shared/schemas';
import { ROOM_EVENT_MAX_CHARS, ROOM_EVENT_TTL_MS, SERVER_TIME, type Dispose, type RoomEvent, type ServerPort } from '@server/port';
import type { PresenceFieldDecl } from '@core/types';

export type { JoinResult } from '../types';
import type { JoinResult } from '../types';
/** 거른 멤버 기록과 기록 키. look, mods, m은 비어 있어도 채워 준다 (Firebase는 null과 빈 객체를 저장하지 않는다) */
export type RoomMember = MemberRecord & { key: string };
export interface CoreFields { name: string; look: string | null; state: string }
/** 받은 방 이벤트. payload는 JSON을 푼 값이고 schema 검사는 부른 쪽이 한다 */
export interface RoomEventIn { uid: string; at: number; payload: unknown; self: boolean }

export interface RoomSessionDeps {
  server: ServerPort;
  deviceId: string;
  proto: number;
  mods(): Record<string, number>;
  core(): CoreFields;
  /** 모듈 id → 필드 이름 → 선언 */
  presence: Record<string, Record<string, PresenceFieldDecl>>;
  clock: { now(): number };
  timers: { every(ms: number, fn: () => void): Dispose; at(ms: number, fn: () => void): Dispose };
}

const CANCELLED: JoinResult = { ok: false, reason: '방 입장을 취소했어요.', kind: 'cancelled' };
const byteLength = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

export class RoomSession {
  private readonly d: RoomSessionDeps;
  private code: string | null = null;
  private key = '';
  private joinedAt = 0;
  private paused: string | null = null;
  private recovering = false;
  private joinSeq = 0;
  /** 들어가는 중인 방 코드 */
  private joining: string | null = null;
  /** 방에 있는 동안의 구독과 타이머 */
  private stops: Dispose[] = [];
  private expiry: Dispose | null = null;
  private raw: Record<string, MemberRecord> = {};
  private view: RoomMember[] = [];
  private viewJson = '[]';
  /** 내 m.<moduleId> 값. 입장 기록에 함께 쓴다 */
  private readonly mine: Record<string, Record<string, unknown>> = {};
  /** 다음 seenAt 쓰기에 실을 batch 필드 ('m/<id>/<field>' → 값) */
  private batch: Record<string, unknown> = {};
  private readonly lastSent = new Map<string, number>();
  private readonly trailing = new Map<string, Dispose>();
  /** 지우기를 이미 시도한 남의 오래된 기록 */
  private readonly tried = new Set<string>();
  private readonly checks = new Set<(code: string) => Promise<string | null>>();
  private readonly changeFns = new Set<(code: string | null, reason?: string) => void>();
  private readonly memberFns = new Set<(members: RoomMember[]) => void>();
  private readonly eventFns = new Map<string, Set<(e: RoomEventIn) => void>>();
  /** 이미 전한 이벤트 키와 서버 시각. 60초가 지나면 나이로 거르므로 뺀다 */
  private readonly seenEvents = new Map<string, number>();
  /** 이벤트 이름마다 최근 1분 동안 보낸 시각 */
  private readonly sentAt = new Map<string, number[]>();

  constructor(deps: RoomSessionDeps) {
    this.d = deps;
  }

  current(): string | null {
    return this.code;
  }

  /** reason은 방에서 밀려났을 때만 있다 (주인이 방을 지움 등) */
  onChange(fn: (code: string | null, reason?: string) => void): Dispose {
    return this.listen(this.changeFns, fn);
  }

  /** 들어온 순서. 150초 넘은 기록은 빼고 같은 uid는 seenAt이 가장 최근인 기록 하나만 준다 */
  members(): RoomMember[] {
    return this.view;
  }

  onMembers(fn: (members: RoomMember[]) => void): Dispose {
    return this.listen(this.memberFns, fn);
  }

  beforeJoin(fn: (code: string) => Promise<string | null>): Dispose {
    return this.listen(this.checks, fn);
  }

  async join(code: string): Promise<JoinResult> {
    // 입장마다 번호를 받는다. 기다리는 동안 다른 입장, 나가기, 절전이 오면 번호가 바뀌어 이 입장은 취소된다
    const seq = ++this.joinSeq;
    this.joining = this.code === code ? null : code;
    if (!this.joining) return { ok: true };
    try {
      return await this.enter(code, () => seq !== this.joinSeq);
    } finally {
      if (seq === this.joinSeq) this.joining = null;
    }
  }

  private async enter(code: string, stale: () => boolean): Promise<JoinResult> {
    const { server, proto } = this.d;
    try {
      for (const check of this.checks) {
        const reason = await check(code);
        if (reason) return { ok: false, reason, kind: 'blocked' };
      }
      if ((await server.config.minProtocol()) > proto) {
        return { ok: false, reason: '앱을 새 버전으로 업데이트해야 방에 들어갈 수 있습니다.', kind: 'proto' };
      }
      const meta = await server.room.getMeta(code);
      if (stale()) return CANCELLED;
      if (!meta) return { ok: false, reason: '없는 방 코드입니다. 코드를 다시 확인해 주세요.', kind: 'missing' };
      if (meta.deletedAt !== undefined) return { ok: false, reason: '주인이 지운 방입니다.', kind: 'gone' };
      const uid = server.identity.current();
      if (!uid) return { ok: false, reason: '로그인한 뒤에 방에 들어갈 수 있습니다.', kind: 'auth' };
      await this.exit();
      const now = server.time.serverNow();
      await server.room.ensureRoster(code, uid, now);
      if (stale()) return CANCELLED;
      this.key = `${uid}_${this.d.deviceId}`;
      this.joinedAt = now;
      this.batch = {};
      await server.room.join(code, this.key, this.record());
    } catch {
      return stale() ? CANCELLED : { ok: false, reason: '방에 들어가지 못했습니다. 연결을 확인하고 다시 시도해 주세요.', kind: 'network' };
    }
    if (stale()) {
      // 기록을 쓰는 동안 취소됐으면 방금 쓴 기록을 지운다
      server.room.leave(code, this.key).catch(() => {});
      return CANCELLED;
    }
    this.code = code;
    this.paused = null;
    this.stops.push(
      this.d.timers.every(PRESENCE_SEEN_MS, () => this.tick()),
      server.room.watchMembers(code, (m) => this.onRaw(m)),
      server.room.watchEvents(code, (evs) => this.onEvents(evs), this.joinedAt),
    );
    for (const fn of this.changeFns) fn(code);
    return { ok: true };
  }

  /** 기다리는 중인 입장을 취소한다 */
  private cancelJoin(): void {
    this.joinSeq++;
    this.joining = null;
  }

  leave(): Promise<void> {
    this.paused = null;
    this.cancelJoin();
    return this.exit();
  }

  /** 방을 만들고 주인이 된다. 들어가는 것은 부른 쪽이 join으로 한다 */
  async create(): Promise<string> {
    const { server } = this.d;
    const uid = server.identity.current();
    if (!uid) throw new Error('로그인한 뒤에 방을 만들 수 있습니다.');
    // 코드가 10억 가지라 겹칠 일이 거의 없지만 지운 방 코드도 남으므로 몇 번 다시 뽑는다
    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      if (await server.room.createMeta(code, { kind: 'work', owner: uid, createdAt: server.time.serverNow() })) return code;
    }
    throw new Error('방을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }

  /** 주인만 지운다. 삭제 표시를 쓰고 멤버 기록을 지운 뒤 나간다 */
  async remove(code: string): Promise<void> {
    const uid = this.d.server.identity.current();
    if (!uid || (await this.owner(code)) !== uid) throw new Error('방 주인만 방을 지울 수 있습니다.');
    await this.d.server.room.markDeleted(code, this.d.server.time.serverNow());
    if (this.code === code) await this.exit();
  }

  async owner(code: string): Promise<string | null> {
    return (await this.d.server.room.getMeta(code))?.owner ?? null;
  }

  /** 절전에 들어갈 때. 타이머를 멈추고 나간 뒤 resume에서 같은 방에 다시 들어간다 */
  async pause(): Promise<void> {
    const code = this.joining ?? this.code;
    this.cancelJoin();
    await this.exit();
    if (code) this.paused = code;
  }

  async resume(): Promise<JoinResult | null> {
    const code = this.paused;
    this.paused = null;
    return code ? this.join(code) : null;
  }

  /** 이 모듈의 presence 필드를 쓴다. 선언하지 않은 키, schema에 맞지 않는 값, 128바이트 초과는 예외 */
  setMine(moduleId: string, fields: Record<string, unknown>): void {
    const decls = this.d.presence[moduleId];
    if (!decls) throw new Error(`${moduleId}: presence 필드를 선언하지 않은 모듈입니다`);
    for (const [k, v] of Object.entries(fields)) {
      const decl = decls[k];
      if (!decl) throw new Error(`${moduleId}.${k}: 선언하지 않은 presence 필드입니다`);
      if (!decl.schema.safeParse(v).success) throw new Error(`${moduleId}.${k}: schema에 맞지 않는 값입니다`);
    }
    const prev = this.mine[moduleId] ?? {};
    const next = { ...prev, ...fields };
    if (byteLength(next) > PRESENCE_MODULE_MAX_BYTES) {
      throw new Error(`${moduleId}: presence 필드가 ${PRESENCE_MODULE_MAX_BYTES}바이트를 넘습니다`);
    }
    this.mine[moduleId] = next;
    for (const [k, v] of Object.entries(fields)) {
      if (JSON.stringify(prev[k]) === JSON.stringify(v)) continue;
      const decl = decls[k] as PresenceFieldDecl;
      if (decl.sync === 'batch') this.batch[`m/${moduleId}/${k}`] = v;
      else this.sendNow(moduleId, k, decl.minIntervalMs ?? 0);
    }
  }

  /** 방 이벤트를 보낸다. 방 밖이거나 이 이름으로 최근 1분 안에 perMinute번 보냈으면 보내지 않고 false.
   *  보낸 앱이 60초 뒤에 지운다. payload JSON이 1024자를 넘으면 예외 */
  emit(type: string, payload: unknown, perMinute: number): boolean {
    const code = this.code;
    if (!code) return false;
    const p = JSON.stringify(payload ?? null);
    if (p.length > ROOM_EVENT_MAX_CHARS) throw new Error(`${type}: payload가 ${ROOM_EVENT_MAX_CHARS}자를 넘습니다`);
    const now = this.d.clock.now();
    const sent = (this.sentAt.get(type) ?? []).filter((t) => now - t < 60_000);
    this.sentAt.set(type, sent);
    if (sent.length >= perMinute) return false;
    sent.push(now);
    const { server, timers } = this.d;
    server.room
      .emit(code, { t: type, uid: server.identity.current() ?? '', p })
      .then((key) => timers.at(ROOM_EVENT_TTL_MS, () => void server.room.removeEvent(code, key).catch(() => {})))
      .catch(() => {});
    return true;
  }

  /** 이름이 type인 방 이벤트를 받는다. 내가 보낸 것도 self: true로 온다 */
  onEvent(type: string, fn: (e: RoomEventIn) => void): Dispose {
    let fns = this.eventFns.get(type);
    if (!fns) this.eventFns.set(type, (fns = new Set()));
    return this.listen(fns, fn);
  }

  /** 들어온 뒤에 보낸 60초 안의 이벤트만 한 번씩 전한다. 처리 함수가 없는 이름은 무시한다 */
  private onEvents(evs: RoomEvent[]): void {
    const now = this.d.server.time.serverNow();
    const me = this.d.server.identity.current();
    for (const [key, at] of this.seenEvents) if (now - at > ROOM_EVENT_TTL_MS) this.seenEvents.delete(key);
    for (const ev of evs) {
      if (typeof ev.at !== 'number' || typeof ev.p !== 'string' || this.seenEvents.has(ev.key)) continue;
      if (ev.at < this.joinedAt || now - ev.at > ROOM_EVENT_TTL_MS) continue;
      this.seenEvents.set(ev.key, ev.at);
      const fns = this.eventFns.get(ev.t);
      if (!fns?.size) continue;
      let payload: unknown;
      try {
        payload = JSON.parse(ev.p);
      } catch {
        continue;
      }
      for (const fn of fns) fn({ uid: ev.uid, at: ev.at, payload, self: ev.uid === me });
    }
  }

  /** 코어 필드(name, look, state)가 바뀌면 바로 쓴다. 방 밖이면 다음 입장 기록에 core()로 들어간다 */
  setCore(patch: Partial<CoreFields>): void {
    const own = this.raw[this.key] as Partial<CoreFields> | undefined;
    const changed = Object.entries(patch).filter(([k, v]) => own?.[k as keyof CoreFields] !== v);
    if (this.code && changed.length) this.write(Object.fromEntries(changed));
  }

  private record(): MemberRecord {
    const { name, look, state } = this.d.core();
    const uid = this.d.server.identity.current() ?? '';
    return {
      uid, name, look, state, proto: this.d.proto, mods: this.d.mods(),
      joinedAt: this.joinedAt, seenAt: this.d.server.time.serverNow(), m: structuredClone(this.mine),
    };
  }

  /** onChange 필드: 바로 쓰되 minIntervalMs보다 자주 쓰지 않고 마지막 값을 뒤에 쓴다 */
  private sendNow(moduleId: string, field: string, minMs: number): void {
    const path = `m/${moduleId}/${field}`;
    if (!this.code || this.trailing.has(path)) return;
    const send = () => {
      this.trailing.delete(path);
      this.lastSent.set(path, this.d.clock.now());
      this.write({ [path]: this.mine[moduleId]?.[field] });
    };
    const wait = (this.lastSent.get(path) ?? -Infinity) + minMs - this.d.clock.now();
    if (wait <= 0) send();
    else this.trailing.set(path, this.d.timers.at(wait, send));
  }

  private tick(): void {
    const patch = { seenAt: SERVER_TIME, ...this.batch };
    this.batch = {};
    this.write(patch);
    this.refresh();
  }

  private write(patch: Record<string, unknown>): void {
    const code = this.code;
    if (!code) return;
    // 기록이 지워졌거나(150초 거름, 연결 끊김) 방이 지워졌으면 recover가 다시 쓰거나 나간다
    this.d.server.room.writeMine(code, this.key, patch).catch(() => this.recover());
  }

  private onRaw(members: Record<string, MemberRecord>): void {
    this.raw = members;
    if (this.code && !(this.key in members) && this.d.server.connection.online()) void this.recover();
    this.refresh();
  }

  private async recover(): Promise<void> {
    const code = this.code;
    if (!code || this.recovering) return;
    this.recovering = true;
    try {
      const meta = await this.d.server.room.getMeta(code);
      if (this.code !== code) return;
      if (!meta || meta.deletedAt !== undefined) return await this.exit('주인이 방을 지웠습니다.');
      await this.d.server.room.join(code, this.key, this.record());
    } catch {
      // 다음 seenAt 쓰기가 실패하면 다시 시도한다
    } finally {
      this.recovering = false;
    }
  }

  /** 오래된 기록을 빼고 같은 uid는 seenAt이 가장 최근인 기록만 남긴다. 내 기록은 거르지 않는다 */
  private refresh(): void {
    const { server, timers } = this.d;
    const now = server.time.serverNow();
    const best = new Map<string, [string, MemberRecord]>();
    let nextStale = Infinity;
    for (const [key, rec] of Object.entries(this.raw)) {
      const age = now - (typeof rec.seenAt === 'number' ? rec.seenAt : 0);
      if (key !== this.key && age > PRESENCE_STALE_MS) {
        // 남의 오래된 기록은 한 번만 지워 본다. 규칙이 150초 넘은 기록만 허용한다
        if (this.code && !this.tried.has(key)) {
          this.tried.add(key);
          server.room.removeStale(this.code, key).catch(() => {});
        }
        continue;
      }
      this.tried.delete(key);
      if (key !== this.key) nextStale = Math.min(nextStale, PRESENCE_STALE_MS - age);
      const prev = best.get(rec.uid);
      if (!prev || rec.seenAt > prev[1].seenAt) best.set(rec.uid, [key, rec]);
    }
    // 가장 먼저 오래되는 기록이 150초를 넘는 순간에 다시 거른다
    this.expiry?.();
    this.expiry = this.code && nextStale < Infinity ? timers.at(nextStale + 1, () => this.refresh()) : null;
    const view = [...best.values()]
      // 모든 클라이언트가 같은 순서로 그리도록 들어온 시각이 같으면 키 순서
      .sort(([ka, a], [kb, b]) => a.joinedAt - b.joinedAt || (ka < kb ? -1 : 1))
      .map(([key, r]): RoomMember => ({ ...r, key, look: r.look ?? null, mods: r.mods ?? {}, m: r.m ?? {} }));
    this.view = view;
    // seenAt만 바뀐 갱신은 알리지 않는다
    const json = JSON.stringify(view.map(({ seenAt: _, ...r }) => r));
    if (json === this.viewJson) return;
    this.viewJson = json;
    for (const fn of this.memberFns) fn(view);
  }

  private async exit(reason?: string): Promise<void> {
    const code = this.code;
    if (!code) return;
    this.code = null;
    for (const stop of this.stops.splice(0)) stop();
    for (const stop of this.trailing.values()) stop();
    this.trailing.clear();
    this.raw = {};
    this.tried.clear();
    this.seenEvents.clear();
    this.refresh();
    for (const fn of this.changeFns) fn(null, reason);
    // 오프라인이면 Firebase 쓰기가 연결될 때까지 끝나지 않으므로 기다리지 않는다
    this.d.server.room.leave(code, this.key).catch(() => {});
  }

  private listen<F>(set: Set<F>, fn: F): Dispose {
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }
}
