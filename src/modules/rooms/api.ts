// rooms 모듈의 공개 타입. 다른 모듈은 @modules/rooms/api만 import한다
export interface RoomInfo {
  /** 지금 들어가 있는 방 코드. 혼자 모드면 null */
  code: string | null;
  owner: boolean;
  /** 정원. cfg가 아직 없으면 최대 정원 */
  cap: number;
  /** 나를 포함한 좌석 수 */
  count: number;
}

export interface RoomsApi {
  current(): string | null;
  isOwner(): boolean;
}

declare module '@core/types' {
  interface ModuleApis { rooms: RoomsApi }
  interface EventMap { 'rooms.changed': RoomInfo }
}
