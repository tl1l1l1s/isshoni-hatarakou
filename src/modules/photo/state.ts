// 방 사람에게 받은 스티커 사진 목록과 촬영 창이 열려 있는지. 창이 inboxOf(ctx)로 찾아 쓴다
import type { Ctx, Dispose } from '@core/types';
import type { Sha256 } from '@shared/schemas';

export interface Received { from: string; file: Sha256; at: number }
// ponytail: 받은 사진은 이번 실행 동안 메모리에만 최근 10장 둔다. 다시 켠 뒤에도 보고 싶다는 말이 나오면 로컬에 남긴다
const KEEP = 10;

export type Inbox = ReturnType<typeof createInbox>;
const all = new WeakMap<Ctx, Inbox>();
export const inboxOf = (ctx: Ctx): Inbox => all.get(ctx)!;

export function createInbox(ctx: Ctx) {
  let list: Received[] = [];
  let unseen = 0;
  // 사진 창의 촬영 세션이 열려 있는 동안 참. 함께 찍자는 알림을 띄우지 않는다
  let open = false;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  const inbox = {
    list: () => list,
    unseen: () => unseen,
    add(r: Received) {
      list = [r, ...list].slice(0, KEEP);
      unseen++;
      emit();
    },
    shooting: () => open,
    setShooting(v: boolean) {
      open = v;
    },
    seen() {
      if (!unseen) return;
      unseen = 0;
      emit();
    },
    subscribe(fn: () => void): Dispose {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
  all.set(ctx, inbox);
  return inbox;
}
