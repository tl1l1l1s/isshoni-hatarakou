// gacha 모듈의 공개 계약. stickers 모듈이 보관함을 읽는다 (9.3 OUR-02, 10.9 GCH-01부터 GCH-08까지)
import type { Sha256 } from '@shared/schemas';

/** 보관함 항목. 뽑을 때의 이름과 그림 해시를 복사해 두어 아이템이나 방이 지워져도(남기기) 그대로 보인다 */
export interface InventoryItem {
  /** `방코드/아이템id`. 스티커 Equip.item에 그대로 쓴다 */
  key: string;
  room: string;
  itemId: string;
  name: string;
  file: Sha256;
  n: number;
  at: number;
}

export interface GachaApi {
  inventory(): InventoryItem[];
  onInventory(fn: (items: InventoryItem[]) => void): () => void;
  /** 같은 아이템을 이만큼(n) 모으면 스티커 색을 바꿀 수 있다 (GCH-05) */
  hueNeed(): number;
}

declare module '@core/types' {
  interface ModuleApis { gacha: GachaApi }
  interface EventMap {
    /** 방 주인이 함께 지우기를 골라 보관함에서 빠진 항목의 key 목록 */
    'gacha.revoked': { keys: string[] };
  }
}
