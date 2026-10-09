// wardrobe 모듈의 상태와 동작. 창과 런처 카드는 wardrobeOf(ctx)로 찾아 쓴다
import type { Ctx, Dispose } from '@core/types';
import type {} from '@modules/growth/api';
import { Appearance } from '@shared/schemas';
import type { Sha256 } from '@shared/schemas';
import {
  activeOf, animalUnlocked, CharRecord, expiredTrash, fileRefs, fromExport, lockedText, mergeChars, remapFiles,
  SLOT_COUNT, toExport, toTrash, trashKey, TrashRecord, TRASH_KEEP_MS, UnlockRecord, type Local,
} from './logic';
import { conflictsOf, syncedAfter, withSynced, type Conflict } from './sync';

export type Wardrobe = ReturnType<typeof createWardrobe>;
const all = new WeakMap<Ctx, Wardrobe>();
export const wardrobeOf = (ctx: Ctx): Wardrobe => all.get(ctx)!;

export function createWardrobe(ctx: Ctx) {
  const subs = new Set<() => void>();
  const get = () => ctx.local.get<Local>('account');
  const set = (fn: (l: Local) => Local) => {
    ctx.local.update<Local>('account', fn);
    subs.forEach((f) => f());
  };
  const subscribe = (fn: () => void): Dispose => {
    subs.add(fn);
    return () => void subs.delete(fn);
  };
  const appearance = () => activeOf(get());
  const warn = (what: string) => (e: Error) => ctx.log.warn(`${what}: ${e.message}`);
  const user = ctx.server.user();
  const trashDoc = () => ctx.server.user(['trash']);

  // 늦게 시작한 올리기가 먼저 끝나도 마지막에는 지금 외형이 남도록 차례로 올린다
  let chain: Promise<void> = Promise.resolve();
  const publish = () => (chain = chain.catch(() => undefined).then(() => ctx.self.setAppearance(appearance())));

  // 두 PC에서 다르게 고친 슬롯. 고르기 창이 읽는다 (ACC-13).
  // 새 슬롯이 생기면 창을 띄우고 always면 남은 슬롯이 있을 때도 띄운다 (고르기를 미루고 창을 닫은 경우)
  let conflicts: Conflict[] = [];
  const setConflicts = (next: Conflict[], always = false) => {
    const fresh = next.some((c) => !conflicts.some((o) => o.slot === c.slot));
    conflicts = next;
    subs.forEach((f) => f());
    if (fresh || (always && next.length)) ctx.ui.open('wardrobe.conflict');
  };
  const markSynced = (i: number, mtime: number) => set((l) => ({ ...l, synced: withSynced(l.synced, SLOT_COUNT, i, mtime) }));

  /** 슬롯 i를 올린다. 마지막으로 맞춘 뒤 다른 PC가 서버 쪽을 바꿨으면 덮어쓰지 않고 고르게 한다 (ACC-13) */
  const push = (i: number) => {
    const c = get().chars[i]!;
    const base = get().synced?.[i] ?? null;
    void user
      .transaction<unknown>(`chars/${i}`, (cur) => {
        const r = CharRecord.safeParse(cur);
        return r.success && base !== null && r.data.mtime !== base && r.data.mtime !== c.mtime ? undefined : { ...c, v: 1 };
      })
      .then(({ committed, value }) => {
        if (committed) return markSynced(i, c.mtime);
        const r = CharRecord.safeParse(value);
        if (r.success) setConflicts([...conflicts.filter((x) => x.slot !== i), { slot: i, remote: { appearance: r.data.appearance, mtime: r.data.mtime } }]);
      })
      .catch(warn('캐릭터 올리기 실패'));
  };
  const trash = (t: TrashRecord) => void trashDoc().set(trashKey(t), t).catch(warn('이전 모습 남기기 실패'));

  const need = () => ctx.tunables.get<number>('animalUnlockLevel');
  /** 동물 해금 조건을 확인하고 처음 채우면 시각을 남긴다. 한 번 열리면 닫히지 않는다 (GRW-03) */
  const unlocked = () => {
    if (get().unlockedAt !== null) return true;
    if (!animalUnlocked(null, ctx.modules.get('growth')?.level() ?? null, need())) return false;
    const at = ctx.clock.serverNow();
    set((l) => ({ ...l, unlockedAt: at }));
    void user.set('unlock', { at, v: 1 }).catch(warn('해금 기록 실패'));
    return true;
  };

  /** 슬롯 i를 a로 바꿔 저장하고 서버에 올린다. keep이면 덮어쓴 옛 모습을 휴지통에 남긴다 (ACC-08) */
  const write = async (i: number, next: Appearance, keep: boolean) => {
    // 잘못된 값이 로컬에 들어가면 다음 부팅에 데이터를 버리게 되므로 먼저 검사한다
    const a = Appearance.parse(next);
    const old = get().chars[i]!;
    if (a.body === 'animal' && old.appearance.body !== 'animal' && !unlocked()) throw new Error(lockedText(need()));
    if (JSON.stringify(old.appearance) === JSON.stringify(a)) return;
    const now = ctx.clock.serverNow();
    if (keep && old.mtime > 0) trash(toTrash(old, i, now));
    set((l) => ({ ...l, chars: l.chars.map((c, j) => (j === i ? { appearance: a, mtime: now } : c)) }));
    push(i);
    if (i === get().active) await publish();
  };

  const setActive = async (i: number) => {
    if (i === get().active) return;
    set((l) => ({ ...l, active: i }));
    await publish();
  };

  /** 부팅 때 서버와 맞춘다. 슬롯마다 늦게 고친 쪽이 이기고 진 쪽은 휴지통에 간다. 10일 지난 휴지통은 지운다 */
  // ponytail: 켤 때 한 번만 맞춘다. 두 PC를 동시에 켜 두는 일이 잦아지면 chars를 watch한다
  const sync = async () => {
    const [chars, unlock] = await Promise.all([user.get<Record<number, unknown>>('chars'), user.get('unlock')]);
    const remote = get().chars.map((_, i) => {
      const r = CharRecord.safeParse(chars?.[i]);
      return r.success ? { appearance: r.data.appearance, mtime: r.data.mtime } : null;
    });
    const before = appearance();
    // 두 쪽이 모두 바뀐 슬롯은 합치지 않고 고르기로 넘긴다 (ACC-13)
    const found = conflictsOf(get().chars, remote, get().synced);
    const waiting = found.map((c) => c.slot);
    const m = mergeChars(get().chars, remote.map((r, i) => (waiting.includes(i) ? get().chars[i]! : r)), ctx.clock.serverNow());
    set((l) => ({ ...l, chars: m.chars, synced: syncedAfter(m.chars, remote, l.synced, m.upload, waiting) }));
    m.upload.forEach(push);
    m.trash.forEach(trash);
    setConflicts(found, true);

    const u = UnlockRecord.safeParse(unlock);
    const at = get().unlockedAt;
    if (u.success && (at === null || u.data.at < at)) set((l) => ({ ...l, unlockedAt: u.data.at }));
    else if (!u.success && at !== null) void user.set('unlock', { at, v: 1 }).catch(warn('해금 기록 실패'));
    unlocked();
    if (appearance() !== before) await publish();

    const rows = await trashDoc().list({ limit: 50 });
    await Promise.all(expiredTrash(rows, ctx.clock.serverNow()).map((k) => trashDoc().remove(k)));
  };

  /** 고르기 (ACC-13). 고르지 않은 쪽은 휴지통(이전 모습)에 10일 동안 남는다 */
  const resolve = async (slot: number, keepLocal: boolean) => {
    const c = conflicts.find((x) => x.slot === slot);
    if (!c) return;
    const now = ctx.clock.serverNow();
    const mine = get().chars[slot]!;
    // 서버 쪽 mtime을 기준으로 삼아야 이 PC 쪽을 올릴 때 다시 고르기로 넘어가지 않는다
    const synced = withSynced(get().synced, SLOT_COUNT, slot, c.remote.mtime);
    setConflicts(conflicts.filter((x) => x !== c));
    if (keepLocal) {
      trash(toTrash(c.remote, slot, now));
      set((l) => ({ ...l, synced, chars: l.chars.map((x, j) => (j === slot ? { ...x, mtime: now } : x)) }));
      push(slot);
      return;
    }
    trash(toTrash(mine, slot, now));
    set((l) => ({ ...l, synced, chars: l.chars.map((x, j) => (j === slot ? c.remote : x)) }));
    if (slot === get().active) await publish();
  };

  /** 이전 모습 목록. 키가 시각 순서라서 마지막 50개를 한 번만 읽는다. 최근 것부터 */
  const trashList = async (): Promise<TrashRecord[]> => {
    let off = () => {};
    const rows = await new Promise<Array<{ key: string; value: unknown }>>((res) => (off = trashDoc().watchList('', { limit: 50, last: true }, res)));
    off();
    const now = ctx.clock.serverNow();
    return rows
      .flatMap((r) => {
        const t = TrashRecord.safeParse(r.value);
        return t.success && now - t.data.at <= TRASH_KEEP_MS ? [t.data] : [];
      })
      .sort((a, b) => b.at - a.at);
  };

  /** 휴지통의 모습을 원래 칸에 되돌리고 휴지통에서 뺀다. 그 칸의 지금 모습은 휴지통에 남는다 (SCR-03) */
  const restore = async (t: TrashRecord) => {
    await write(t.slot, t.appearance, true);
    await trashDoc().remove(trashKey(t));
  };

  /** 외형과 그림을 캐릭터 파일 글자로 만든다 (AVT-17) */
  const exportText = async (a: Appearance) => {
    const files: Record<Sha256, Uint8Array> = {};
    for (const h of fileRefs(a)) {
      const b = await ctx.files.get(h);
      if (b) files[h] = b;
    }
    return toExport(a, files);
  };

  /** 캐릭터 파일을 읽고 그림을 내 서버에 올린 외형을 돌려준다 */
  const importText = async (text: string) => {
    const { appearance: a, files } = fromExport(text);
    if (a.body === 'animal' && !unlocked()) throw new Error(lockedText(need()));
    const map: Record<string, Sha256> = {};
    for (const [h, b] of files) map[h] = await ctx.files.upload(b);
    return remapFiles(a, map);
  };

  const w = {
    local: get,
    subscribe,
    appearance,
    publish,
    write,
    setActive,
    unlocked,
    need,
    sync,
    conflicts: () => conflicts,
    resolve,
    trashList,
    restore,
    exportText,
    importText,
    update: async (fn: (a: Appearance) => Appearance) => write(get().active, fn(appearance()), false),
    /** 모든 슬롯에 fn을 적용한다. 회수 알림마다 세 슬롯을 모두 올리지 않도록 바뀐 슬롯만 쓴다 */
    updateAll: async (fn: (a: Appearance) => Appearance) => {
      for (let i = 0; i < SLOT_COUNT; i++) {
        const cur = get().chars[i]!.appearance;
        const next = fn(cur);
        if (JSON.stringify(next) !== JSON.stringify(cur)) await write(i, next, false);
      }
    },
    onChange: (fn: (a: Appearance) => void): Dispose => {
      let last = appearance();
      return subscribe(() => {
        const a = appearance();
        if (a !== last) fn((last = a));
      });
    },
  };
  all.set(ctx, w);
  return w;
}
