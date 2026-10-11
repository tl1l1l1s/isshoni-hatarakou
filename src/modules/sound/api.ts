// sound 공개 타입. 다른 모듈은 @modules/sound/api만 import한다
import type { ComponentType } from 'react';
import type { Dispose } from '@core/types';

export interface SoundTrack { v: string; title: string }

export interface SoundApi {
  /** 내 플레이리스트의 모든 곡 (프리셋 순서). 마이홈 배경음악을 고를 때 쓴다 (HOM-04) */
  tracks(): SoundTrack[];
  /** 플레이리스트 창을 열고 이 곡을 재생한다. 목록 밖의 곡이면 끝난 뒤 멈춘다 (HOM-04 방문자가 누를 때) */
  play(track: SoundTrack): void;
  /** 음악은 한 번에 하나만 난다. 음악을 틀기 시작할 때 자기 이름으로 부르면 다른 음악(플레이리스트, 마이홈 배경음악,
   *  스티커 사진 촬영 음악)이 onClaim으로 듣고 멈춘다 (HOM-04, SND-02, COM-15) */
  claim(who: string): void;
  /** who가 아닌 음악이 claim하면 fn을 부른다. 틀고 있던 음악을 멈추는 데 쓴다 */
  onClaim(who: string, fn: () => void): Dispose;
  /** 이 곡 하나를 바로 트는 200x200 유튜브 플레이어 (HOM-04 배경음악). 플레이리스트 음량을 따르고
   *  재생을 시작하면 claim해서 다른 음악을 멈추며 다른 음악이 claim하거나 창이 숨으면 멈춘다 */
  Player: ComponentType<{ track: SoundTrack }>;
}

declare module '@core/types' {
  interface ModuleApis { sound: SoundApi }
}
