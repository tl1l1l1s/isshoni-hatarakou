// 친구 신청과 수락, 초대의 순수 계산 (FRD-01, FRD-02, FRD-04)
import { z } from 'zod';
import { CODE_ALPHABET, NAME_MAX_LENGTH } from '@shared/constants';

/** scripts/create-account.ts가 만드는 친구 코드 길이 */
export const FRIEND_CODE_LENGTH = 8;
/** 친구는 100명까지 둔다 (FRD-02) */
export const FRIEND_MAX = 100;
export const INBOX_MAX = 50;
/** 10분 지난 초대는 버린다 (FRD-04) */
export const INVITE_TTL_MS = 10 * 60_000;

export const Entry = z.object({ since: z.number(), v: z.literal(1) });
export const Req = z.object({ name: z.string().max(NAME_MAX_LENGTH), at: z.number() });
export const Ok = z.object({ at: z.number() });
export const Inv = z.object({ room: z.string(), name: z.string().max(NAME_MAX_LENGTH), at: z.number() });
/** 받은 기록에서 보낸 사람 한 명의 칸 in/{senderUid} */
export const Slot = z.object({ req: Req.optional(), ok: Ok.optional(), inv: Inv.optional() });
export type Entry = z.infer<typeof Entry>;
export type Req = z.infer<typeof Req>;
export type Inv = z.infer<typeof Inv>;
export type Slot = z.infer<typeof Slot>;

/** 넣은 친구 코드. 앞의 접두어(예: MATE-)와 대소문자, 앞뒤 공백을 무시한다. 형식이 틀리면 null */
export function friendCodeOf(input: string): string | null {
  const code = /[A-Z0-9]*$/.exec(input.trim().toUpperCase())![0];
  return code.length === FRIEND_CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

export type Effect =
  /** 내 목록 list/{uid}에 더한다 */
  | { kind: 'befriend'; uid: string; since: number }
  /** 상대 받은 기록의 내 칸에 수락 ok를 쓴다 */
  | { kind: 'reply'; uid: string }
  /** 상대 받은 기록의 내 칸에서 내 신청을 지운다 */
  | { kind: 'unsend'; uid: string }
  /** 내 받은 기록에서 그 사람 칸의 항목을 지운다. null이면 칸 전체 */
  | { kind: 'drop'; uid: string; item: 'ok' | 'inv' | null };

export interface Seen {
  /** 그 사람이 이미 내 목록에 있다 */
  friend: boolean;
  /** 내가 그 사람에게 남긴 신청이 아직 있다 (ok가 왔을 때만 확인한다) */
  requested: boolean;
  now: number;
}

/** 보낸 사람 한 명의 칸을 보고 할 일과 화면에 보여 줄 신청, 초대를 정한다.
 *  신청은 받은 쪽이 수락하면서 지우지 않고 남겨 두고, 신청한 쪽이 ok를 보고 자기 신청이 남아 있는지 확인한 뒤 양쪽 칸을 비운다.
 *  그래서 내가 신청하지 않은 사람이 ok만 보내서는 내 목록에 들어오지 못한다. */
export function plan(uid: string, slot: Slot, s: Seen): { effects: Effect[]; request: Req | null; invite: Inv | null } {
  if (slot.ok && s.requested) {
    const befriend: Effect[] = s.friend ? [] : [{ kind: 'befriend', uid, since: slot.ok.at }];
    return { effects: [...befriend, { kind: 'unsend', uid }, { kind: 'drop', uid, item: null }], request: null, invite: null };
  }
  const effects: Effect[] = [];
  if (slot.ok) effects.push({ kind: 'drop', uid, item: 'ok' });
  // 이미 친구인 사람의 신청: 내가 수락했는데 상대 앱이 아직 못 봤거나, 상대가 나를 끊었다가 다시 신청했다
  if (slot.req && s.friend) effects.push({ kind: 'reply', uid });
  const invite = slot.inv && s.friend && s.now - slot.inv.at < INVITE_TTL_MS ? slot.inv : null;
  if (slot.inv && !invite) effects.push({ kind: 'drop', uid, item: 'inv' });
  return { effects, request: slot.req && !s.friend ? slot.req : null, invite };
}

/** 공개 프로필 users/{uid}/public에서 이름과 레벨(growth가 m.growth.level에 씀) */
export function profileView(p: Record<string, unknown> | null): { name: string | null; level: number | null } {
  const level = (p?.m as { growth?: { level?: unknown } } | undefined)?.growth?.level;
  return { name: typeof p?.name === 'string' ? p.name : null, level: typeof level === 'number' ? level : null };
}
