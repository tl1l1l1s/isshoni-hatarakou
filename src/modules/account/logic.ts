import { NAME_MAX_LENGTH } from '@shared/constants';

/** 닉네임 검사. 앞뒤 공백을 지우고 1자부터 20자까지 받는다 */
export function cleanName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.trim();
  if (!name) return { ok: false, reason: '닉네임을 적어 주세요' };
  if (name.length > NAME_MAX_LENGTH) return { ok: false, reason: `닉네임은 ${NAME_MAX_LENGTH}자까지 쓸 수 있습니다` };
  return { ok: true, name };
}

/** 프로필 사진 긴 변 (SCR-03). 화면에 쓰는 크기보다 넉넉하게 둔다 */
export const PHOTO_SIDE = 256;

/** 공개 프로필의 평생 레벨 (growth가 m.growth.level에 쓴다). 없으면 null */
export const levelOf = (p: Record<string, unknown> | null): number | null => {
  const lv = (p?.m as { growth?: { level?: unknown } } | undefined)?.growth?.level;
  return typeof lv === 'number' ? lv : null;
};

/** 친구 사이 순위 (SCR-03). 나보다 레벨이 높은 친구 수에 1을 더하므로 같은 레벨은 같은 순위다 */
export const rankOf = (mine: number, friends: readonly number[]): number => 1 + friends.filter((l) => l > mine).length;
