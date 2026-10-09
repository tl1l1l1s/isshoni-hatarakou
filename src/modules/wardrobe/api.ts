import type { Appearance } from '@shared/schemas';
import type { TrashRecord } from './logic';

export interface WardrobeApi {
  /** 지금 쓰는 캐릭터 슬롯의 외형 */
  appearance(): Appearance;
  /** 지금 쓰는 캐릭터의 외형을 고쳐 저장하고 내 좌석에 반영한다. 스티커 모듈이 sticker, desk.items, floor 슬롯을 고칠 때 쓴다 */
  update(fn: (a: Appearance) => Appearance): Promise<void>;
  /** 모든 캐릭터 슬롯(3개)에 fn을 적용해 저장하고 지금 쓰는 슬롯이 바뀌면 내 좌석에 반영한다. 스티커 모듈이 회수된 스티커를 뺄 때 쓴다 */
  updateAll(fn: (a: Appearance) => Appearance): Promise<void>;
  /** 외형이나 쓰는 슬롯이 바뀌면 부른다 */
  onChange(fn: (a: Appearance) => void): () => void;
  /** 휴지통(이전 모습) 목록. 최근 것부터. 내 정보의 휴지통 탭이 읽는다 (SCR-03) */
  trashList(): Promise<TrashRecord[]>;
  /** 휴지통의 모습을 원래 캐릭터 칸에 되돌리고 휴지통에서 뺀다. 그 칸의 지금 모습은 휴지통에 남는다 */
  restore(t: TrashRecord): Promise<void>;
}

/** 여럿이 함께 앉는 벤치 책상의 자리 수 (AVT-21). 책상 그림은 desks.ts에 있다 */
export const BENCH_SEATS: Readonly<Record<string, number>> = { 'wardrobe.desk.bench2': 2, 'wardrobe.desk.bench3': 3 };

/** 얼굴 그리기의 512px 그림판. 스티커 모듈이 직접 그리기와 칠판(AVT-09, AVT-10)에 쓴다 */
export { painter, type Op, type Painter } from './face';
export { FACE_SIZE as PAD_SIZE, type Pt } from './logic';
/** 휴지통 보관 기간과 항목 (ACC-08, SCR-03) */
export { TRASH_KEEP_MS, type TrashRecord } from './logic';

declare module '@core/types' {
  interface ModuleApis { wardrobe: WardrobeApi }
}
