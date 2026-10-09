// sound 공개 타입. 다른 모듈은 @modules/sound/api만 import한다

export interface SoundTrack { v: string; title: string }

export interface SoundApi {
  /** 내 플레이리스트의 모든 곡 (프리셋 순서). 마이홈 배경음악을 고를 때 쓴다 (HOM-04) */
  tracks(): SoundTrack[];
  /** 플레이리스트 창을 열고 이 곡을 재생한다. 목록 밖의 곡이면 끝난 뒤 멈춘다 (HOM-04 방문자가 누를 때) */
  play(track: SoundTrack): void;
}

declare module '@core/types' {
  interface ModuleApis { sound: SoundApi }
}
