import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import type { SoundTrack } from '../api';
import type { Settings } from '../logic';
import { player, setPlayer, usePlayer } from '../state';
import css from './sound.module.css';
import { command, embedSrc, useYouTube } from './youtube';

/** 마이홈 배경음악 플레이어 (HOM-04, sound 공개 API Player). 플레이리스트 음량을 따르고 플레이리스트와 번갈아 재생해서
 *  두 곡이 겹치지 않는다. 유튜브 약관대로 창이 숨으면 멈춘다. 이 모듈의 ctx로 음량과 재생 상태를 읽는다 */
export const bgmFor = (ctx: Ctx) =>
  function SoundPlayer({ track }: { track: SoundTrack }) {
    const frame = useRef<HTMLIFrameElement>(null);
    const volume = useSyncExternalStore(ctx.settings.onChange, () => ctx.settings.get<Settings>().musicVolume);
    const { playing } = usePlayer(ctx);
    useYouTube(ctx, frame, track.v, (m) => {
      if (m.event === 'onReady') {
        command(frame, 'addEventListener', ['onStateChange']);
        command(frame, 'setVolume', [volume]);
        command(frame, 'playVideo');
      } else if (m.event === 'onStateChange' && m.info === 1 && player(ctx).playing) {
        setPlayer(ctx, { playing: false });
      }
    });
    useEffect(() => void command(frame, 'setVolume', [volume]), [volume]);
    useEffect(() => {
      if (playing) command(frame, 'pauseVideo');
    }, [playing]);
    useEffect(() => {
      const doc = frame.current!.ownerDocument;
      const onVis = () => doc.visibilityState === 'hidden' && command(frame, 'pauseVideo');
      doc.addEventListener('visibilitychange', onVis);
      return () => doc.removeEventListener('visibilitychange', onVis);
    }, []);
    return <iframe ref={frame} className={css.video} src={embedSrc(track.v)} title={track.title || '배경음악 플레이어'} allow="autoplay; encrypted-media" />;
  };
