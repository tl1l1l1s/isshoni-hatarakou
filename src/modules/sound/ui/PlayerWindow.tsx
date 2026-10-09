import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Ctx } from '@core/types';
import type {} from '@modules/growth/api';
import type {} from '@modules/account/api';
import {
  BIO_MAX, KINDS, KIND_LABEL, MAX_TRACKS, nextIndex, PLAYER, playerTitle, playOrder, presetLabel, PRESET_NAME_MAX, youTubeId,
  type Playlist, type Settings, type Track,
} from '../logic';
import { friends, openFriend, play, player, savePlaylist, setPlayer, surf, usePlayer, type Friend, type Guest } from '../state';
import css from './sound.module.css';

// embed 주소에 origin을 붙이지 않으면 플레이어가 app:// 창에서 온 명령을 무시한다
const YT = 'https://www.youtube-nocookie.com';
type YtMsg = { event?: string; info?: unknown };
const titleOf = (info: unknown) => (info as { videoData?: { title?: unknown } } | null)?.videoData?.title;

/** 플레이리스트와 백색소음 창 (SND-01..SND-09). 닫아도 숨기기만 해서 재생이 이어진다.
 *  유튜브 스크립트 없이 embed iframe에 postMessage 명령을 보낸다 (CSP script-src 'self') */
export default function PlayerWindow({ ctx }: { ctx: Ctx }) {
  const [list, setList] = useState(() => ctx.local.get<Playlist>('device'));
  const [s, setS] = useState(() => ctx.settings.get<Settings>());
  useEffect(() => ctx.settings.onChange(() => setS(ctx.settings.get<Settings>())), [ctx]);
  const { current: track, playing, load } = usePlayer(ctx);
  // 듣고 있는 친구 목록 (SND-06, SND-07). null이면 내 목록
  const [guest, setGuest] = useState<Guest | null>(null);
  const [picking, setPicking] = useState<Friend[] | null>(null);
  const [mini, setMini] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [seed, setSeed] = useState(() => ctx.clock.now());
  const frame = useRef<HTMLIFrameElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const presets = guest ? guest.shared.presets : list.presets;
  const at = guest ? guest.preset : list.cur;
  const { tracks } = presets[at]!;
  const idx = track ? tracks.findIndex((t) => t.k === track.k) : -1;
  const order = playOrder(tracks.length, list.shuffle, seed);
  const title = playerTitle(presets[at]!, at, guest?.name);
  const level = guest ? guest.level : (ctx.modules.get('growth')?.level() ?? null);
  // 프로필 사진 (SND-05). account 모듈이 없으면 빼고 그린다
  const Photo = ctx.modules.get('account')?.Photo;
  const visit = () => guest && void ctx.commands.run('home.visit', { uid: guest.uid, name: guest.name }).catch((e: Error) => ctx.ui.toast(e.message));

  const save = (patch: Partial<Playlist>) => {
    const next = { ...list, ...patch };
    setList(next);
    savePlaylist(ctx, next);
  };
  const saveTracks = (next: Track[]) => save({ presets: list.presets.map((p, i) => (i === list.cur ? { ...p, tracks: next } : p)) });
  const send = (func: string, args: unknown[] = []) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT);
  const playAt = (i: number | null) => {
    setError(null);
    play(ctx, (i === null ? undefined : tracks[i]) ?? null);
  };
  const go = (dir: 1 | -1, repeat = true) => playAt(nextIndex(order, idx, dir, repeat));
  const toggle = () => {
    if (!track) return go(1);
    send(playing ? 'pauseVideo' : 'playVideo');
    setPlayer(ctx, { playing: !playing });
  };

  /** 친구 목록으로 바꾸고 첫 곡부터 튼다 (SND-06, SND-07) */
  const listen = (g: Guest | null) => {
    setPicking(null);
    if (!g) return setError('들을 수 있는 친구 플리가 없어요');
    setError(null);
    setGuest(g);
    const t = g.shared.presets[g.preset]!.tracks;
    const first = t[playOrder(t.length, list.shuffle, seed)[0] ?? 0];
    if (first) play(ctx, first);
  };
  const open = (p: Promise<Guest | null>) => void p.then(listen, () => setError('친구 플리를 읽지 못했어요'));
  const surfNow = () => open(surf(ctx, guest ? `${guest.uid}:${guest.preset}` : null));
  const pickFriend = () => {
    if (mini) resize(false);
    void friends(ctx).then(setPicking);
  };

  // 축소 플레이어 (SND-04). YouTube 약관 때문에 영상은 줄이지 않고 플레이어 줄만 남긴다
  const resize = (m: boolean) => {
    setMini(m);
    setPicking(null);
    const w = root.current?.ownerDocument.defaultView;
    w?.resizeTo(w.outerWidth, (m ? PLAYER.miniHeight : PLAYER.height) + w.outerHeight - w.innerHeight);
  };
  // 창 제목은 고른 프리셋 이름이나 친구 이름 (SND-03, SND-04)
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (doc) doc.title = title;
  }, [title]);

  const rename = () => {
    if (naming === null) return;
    save({ presets: list.presets.map((p, i) => (i === list.cur ? { ...p, name: naming.trim() } : p)) });
    setNaming(null);
  };

  // YouTube 약관은 플레이어를 가리거나 숨긴 채 재생하는 것을 막는다. 창을 닫아 숨기면 멈추고 목록과 위치는 그대로 둔다
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!doc) return;
    const onVis = () => {
      if (doc.visibilityState !== 'hidden' || !player(ctx).playing) return;
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), YT);
      setPlayer(ctx, { playing: false });
    };
    doc.addEventListener('visibilitychange', onVis);
    return () => doc.removeEventListener('visibilitychange', onVis);
  }, [ctx]);

  // 플레이어 이벤트: 준비되면 음량을 맞추고 재생, 곡이 끝나면 다음 곡, 처음 받은 제목은 목록에 적는다
  const onMsg = useRef<(m: YtMsg) => void>(() => undefined);
  onMsg.current = (m) => {
    if (m.event === 'onReady') {
      send('addEventListener', ['onStateChange']);
      send('addEventListener', ['onError']);
      send('setVolume', [s.musicVolume]);
      if (playing) send('playVideo');
    } else if (m.event === 'onStateChange') {
      // 목록 밖의 곡(마이홈 배경음악)은 끝나면 멈춘다
      if (m.info === 0 && idx < 0) setPlayer(ctx, { playing: false });
      else if (m.info === 0) go(1, list.repeat);
      else if (m.info === 1 || m.info === 2) setPlayer(ctx, { playing: m.info === 1 });
    } else if (m.event === 'onError') {
      setError(`이 곡은 여기서 재생할 수 없어요 (오류 ${String(m.info)})`);
      setPlayer(ctx, { playing: false });
    }
    const got = titleOf(m.info);
    if (track && !track.title && typeof got === 'string' && got) {
      const named = got.slice(0, 200);
      setPlayer(ctx, { current: { ...track, title: named } });
      if (list.presets.some((p) => p.tracks.some((t) => t.k === track.k))) {
        save({ presets: list.presets.map((p) => ({ ...p, tracks: p.tracks.map((t) => (t.k === track.k ? { ...t, title: named } : t)) })) });
      }
    }
  };

  // iframe이 뜨면 이벤트를 받겠다고 알린다. 첫 응답이 올 때까지 0.5초마다 다시 알린다.
  // 플레이어는 메시지를 보낸 창으로 답하는데 이 코드는 패널이 아니라 스테이지 창에서 돈다
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const hello = () => f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT);
    let stopHello = () => {};
    const onLoad = () => {
      stopHello();
      stopHello = ctx.timers.every(500, hello);
      hello();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== f.contentWindow || e.origin !== YT || typeof e.data !== 'string') return;
      stopHello();
      let m: YtMsg;
      try {
        m = JSON.parse(e.data) as YtMsg;
      } catch {
        return;
      }
      onMsg.current(m);
    };
    f.addEventListener('load', onLoad);
    window.addEventListener('message', onMessage);
    return () => {
      stopHello();
      f.removeEventListener('load', onLoad);
      window.removeEventListener('message', onMessage);
    };
  }, [ctx, track?.v, load]);

  useEffect(() => void send('setVolume', [s.musicVolume]), [s.musicVolume]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const v = youTubeId(link);
    if (!v) return setError('유튜브 영상 링크를 넣어 주세요');
    saveTracks([...tracks, { k: ctx.clock.now().toString(36), v, title: '' }]);
    setLink('');
    setError(null);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= tracks.length) return;
    const next = [...tracks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    saveTracks(next);
  };

  const top = (
    <div className={css.top}>
      {track ? (
        <iframe
          key={`${track.v}:${load}`}
          ref={frame}
          className={css.video}
          src={`${YT}/embed/${track.v}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`}
          title={track.title || '유튜브 플레이어'}
          allow="autoplay; encrypted-media"
        />
      ) : (
        <div className={`${css.video} ${css.empty}`}>곡을 더블클릭하면 여기에 플레이어가 나와요</div>
      )}
      <div className={css.side}>
        <div className={css.now}>{track ? track.title || track.v : '재생 중인 곡 없음'}</div>
        <div className={css.buttons}>
          <button title="이전 곡" onClick={() => go(-1)}>⏮</button>
          <button title={playing && track ? '일시정지' : '재생'} onClick={toggle}>{playing && track ? '⏸' : '▶'}</button>
          <button title="다음 곡" onClick={() => go(1)}>⏭</button>
        </div>
        <div className={css.buttons}>
          <button title="목록 반복" aria-pressed={list.repeat} onClick={() => save({ repeat: !list.repeat })}>🔁</button>
          <button
            title="섞어 듣기"
            aria-pressed={list.shuffle}
            onClick={() => {
              save({ shuffle: !list.shuffle });
              setSeed(ctx.clock.now());
            }}
          >
            🔀
          </button>
          <button
            title="파도타기. 우클릭하면 친구를 골라 들어요"
            aria-label="파도타기"
            onClick={surfNow}
            onContextMenu={(e) => {
              e.preventDefault();
              pickFriend();
            }}
          >
            🌊
          </button>
        </div>
        <input
          type="range"
          aria-label="플레이리스트 음량"
          min={0}
          max={100}
          value={s.musicVolume}
          onChange={(e) => ctx.settings.set({ musicVolume: Number(e.target.value) })}
        />
        <button className={css.size} title={mini ? '크게 보기' : '작게 보기'} aria-label={mini ? '크게 보기' : '작게 보기'} onClick={() => resize(!mini)}>{mini ? '□' : '－'}</button>
      </div>
    </div>
  );

  // 축소와 원래 크기를 오가도 플레이어 iframe은 같은 자리에 두어 다시 읽지 않는다
  const head = (
    <>
      <div className={css.profile}>
        {/* 친구가 마이홈 공개를 켰으면 사진과 이름을 눌러 그 마이홈으로 간다 (SND-05, HOM-10) */}
        {guest?.shared.home ? (
          <>
            {Photo && (
              <button className={css.face} title="마이홈 보기" aria-label="마이홈 보기" onClick={visit}>
                <Photo uid={guest.uid} size={28} />
              </button>
            )}
            <button className={css.who} title="마이홈 보기" onClick={visit}>{guest.name}</button>
          </>
        ) : (
          <>
            {Photo && <Photo uid={guest?.uid ?? ctx.self.uid()} size={28} />}
            <strong className={css.who}>{guest ? guest.name : ctx.self.name() || '이름 없음'}</strong>
          </>
        )}
        {level !== null && <span className={css.lv}>Lv.{level}</span>}
        {guest ? (
          <button onClick={() => setGuest(null)}>내 플리로</button>
        ) : (
          <label className={css.pub} title="켜면 내 플리를 듣는 친구가 사진이나 이름을 눌러 내 마이홈으로 와요">
            <input type="checkbox" checked={list.home} onChange={(e) => save({ home: e.target.checked })} />
            마이홈 공개
          </label>
        )}
      </div>
      {guest ? (
        <p className={css.bio}>{guest.shared.bio || '소개글이 없어요'}</p>
      ) : (
        <input
          className={css.bioInput}
          aria-label="소개글"
          placeholder="오늘의 bio 한마디를 적어주세요"
          maxLength={BIO_MAX}
          value={list.bio}
          onChange={(e) => save({ bio: e.target.value })}
        />
      )}

      <div className={css.presets}>
        {naming === null ? (
          <select
            aria-label="프리셋"
            value={at}
            onChange={(e) => (guest ? setGuest({ ...guest, preset: Number(e.target.value) }) : save({ cur: Number(e.target.value) }))}
          >
            {presets.map((p, i) => (
              <option key={i} value={i}>{presetLabel(p, i)}</option>
            ))}
          </select>
        ) : (
          <input
            aria-label="프리셋 이름"
            autoFocus
            maxLength={PRESET_NAME_MAX}
            placeholder={`프리셋 ${list.cur + 1}`}
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && rename()}
          />
        )}
        {!guest && naming === null && <button title="프리셋 이름 바꾸기" aria-label="프리셋 이름 바꾸기" onClick={() => setNaming(list.presets[list.cur]!.name)}>✎</button>}
        {!guest && (
          <button
            title={list.locked ? '잠금 켜짐. 파도타기에 내 플리가 나오지 않아요' : '잠금 꺼짐. 파도타기에 내 플리가 나와요'}
            aria-label="파도타기 잠금"
            aria-pressed={list.locked}
            onClick={() => save({ locked: !list.locked })}
          >
            {list.locked ? '🔒' : '🔓'}
          </button>
        )}
      </div>
    </>
  );

  const rest = (
    <>
      {!guest && (
        <form className={css.add} onSubmit={add}>
          <input aria-label="유튜브 링크" placeholder="유튜브 링크" value={link} onChange={(e) => setLink(e.target.value)} />
          <button type="submit" disabled={tracks.length >= MAX_TRACKS || !link.trim()}>+ 추가</button>
          <span className={css.count}>{tracks.length}/{MAX_TRACKS}</span>
        </form>
      )}

      {picking ? (
        <div className={css.pick}>
          <p className={css.hint}>{picking.length ? '누구의 플리를 들을까요?' : '친구로 등록한 사람이 없어요.'}</p>
          {picking.map((f) => (
            <button key={f.uid} onClick={() => open(openFriend(ctx, f))}>{f.name}</button>
          ))}
          <button onClick={() => setPicking(null)}>닫기</button>
        </div>
      ) : (
        <ol className={css.list}>
          {tracks.length === 0 && <li className={css.hint}>{guest ? '비어 있는 목록이에요.' : '아직 비어 있어요. 유튜브 링크를 넣어 보세요.'}</li>}
          {tracks.map((t, i) => (
            <li
              key={t.k}
              className={i === idx ? css.on : undefined}
              tabIndex={0}
              title="더블클릭하면 이 곡부터 재생해요"
              onDoubleClick={() => playAt(i)}
              onKeyDown={(e) => e.key === 'Enter' && playAt(i)}
            >
              <span className={css.no}>{i === idx ? '▶' : i + 1}</span>
              <span className={css.title}>{t.title || t.v}</span>
              {!guest && (
                <>
                  <button title="위로" onClick={() => move(i, -1)}>▲</button>
                  <button title="아래로" onClick={() => move(i, 1)}>▼</button>
                  <button title="빼기" onClick={() => saveTracks(tracks.filter((x) => x.k !== t.k))}>×</button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <section className={css.noise}>
        <h4>🌙 백색소음</h4>
        <div className={css.kinds}>
          {(['off', ...KINDS] as const).map((k) => (
            <button key={k} aria-pressed={s.noise === k} onClick={() => ctx.settings.set({ noise: k })}>
              {k === 'off' ? '끄기' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label>
          음량 {s.noiseVolume}%
          <input type="range" min={0} max={100} value={s.noiseVolume} onChange={(e) => ctx.settings.set({ noiseVolume: Number(e.target.value) })} />
        </label>
        <label>
          같은 방 사람들 소리도 함께 듣기
          <input type="checkbox" checked={s.shareOthers} onChange={(e) => ctx.settings.set({ shareOthers: e.target.checked })} />
        </label>
        <p className={css.hint}>타이핑하는 동안만 소리가 나요.</p>
      </section>
    </>
  );

  return (
    <div ref={root}>
      {!mini && head}
      {top}
      {error && <p className={css.error}>{error}</p>}
      {!mini && rest}
    </div>
  );
}
