// 자리비움 그림 (CHR-07). ctx 없이 시험하는 순수 함수
import { z } from 'zod';
import { Sha256 } from '@shared/schemas';
import type { SeatView } from '@core/types';

/** 좌석에 세우는 크기. 60, 80, 100px 가운데 고르고 기본은 80px */
export const SIZES = [60, 80, 100] as const;
const Size = z.literal(SIZES);

/** 그림 긴 변. Spark 파일 한도가 64KB(base64)라서
 *  prepareImage가 500, 400, 300px 순서로 줄여 보고 그래도 넘으면 등록을 거절한다 (10.7.6) */
export const MAX_SIDE = 500;

/** 방 사람들에게 보내는 값 */
export const Pic = z.object({ file: Sha256, size: Size });
export type Pic = z.infer<typeof Pic>;

export const Local = z.object({ file: Sha256.nullable(), size: Size });
export type Local = z.infer<typeof Local>;

export const toPresence = (l: Local): Pic | null => (l.file ? { file: l.file, size: l.size } : null);

/** 좌석에 세울 그림. 자리비움이고 조용한 모드가 아닐 때만 보인다. 남이 보낸 값이라 검사한다 */
export function seatPic(seat: Pick<SeatView, 'state' | 'm'>, quiet: boolean): Pic | null {
  if (seat.state !== 'away' || quiet) return null;
  const r = Pic.safeParse(seat.m.awaypic?.pic);
  return r.success ? r.data : null;
}
