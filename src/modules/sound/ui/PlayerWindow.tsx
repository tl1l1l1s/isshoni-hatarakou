import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { Ctx } from '@core/types';
import type {} from '@modules/growth/api';
import type {} from '@modules/account/api';
import {
  BIO_MAX, KINDS, KIND_LABEL, MAX_TRACKS, nextIndex, PLAYER, playerTitle, playOrder, presetLabel, PRESET_NAME_MAX, youTubeId,
  type Playlist, type Settings, type Track,
} from '../logic';
import { friends, openFriend, play, player, savePlaylist, setPlayer, surf, usePlayer, WINDOW, type Friend, type Guest } from '../state';
import css from './sound.module.css';
import { command, embedSrc, useYouTube } from './youtube';

const titleOf = (info: unknown) => (info as { videoData?: { title?: unknown } } | null)?.videoData?.title;
/** 제목은 더할 때 유튜브 oEmbed에서 받고 받지 못하면 처음 재생할 때 플레이어가 알려 준다. 그 전에는 영상 id로 줄을 나눠 보인다 */
const trackName = (t: { v: string; title: string }) => t.title || `제목 없는 곡 (${t.v})`;

/** 플레이리스트와 백색소음 창 (SND-01..SND-09). 닫으면 숨기고 재생을 멈춘다.
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
  const [pinned, setPinned] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [seed, setSeed] = useState(() => ctx.clock.now());
  // 회사원 모드에서는 백색소음이 나지 않으므로 고르기를 막고 안내를 바꾼다 (SND-08)
  const quiet = useSyncExternalStore(ctx.mode.on, () => ctx.mode.get() === 'quiet');
  const frame = useRef<HTMLIFrameElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // 연달아 재생하지 못한 곡 수 (목록 반복이 모두 막힌 곡에서 끝없이 돌지 않게 센다)
  const fails = useRef(0);

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
  const send = (func: string, args: unknown[] = []) => command(frame, func, args);
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
  const pin = async () => {
    setPinning(true);
    try {
      await ctx.ui.setAlwaysOnTop(WINDOW, !pinned);
      setPinned(!pinned);
    } catch {
      ctx.ui.toast('창 고정을 바꾸지 못했어요. 다시 눌러 주세요.');
    } finally {
      setPinning(false);
    }
  };

  /** 친구 목록으로 바꾸고 첫 곡부터 튼다 (SND-06, SND-07) */
  const listen = (g: Guest | null) => {
    setPicking(null);
    if (!g) return setError('들을 수 있는 친구 플리가 없어요.');
    setError(null);
    setGuest(g);
    const t = g.shared.presets[g.preset]!.tracks;
    const first = t[playOrder(t.length, list.shuffle, seed)[0] ?? 0];
    if (first) play(ctx, first);
  };
  const open = (p: Promise<Guest | null>) => void p.then(listen, () => setError('친구 플리를 불러오지 못했어요. 다시 눌러 주세요.'));
  const surfNow = () => open(surf(ctx, guest ? `${guest.uid}:${guest.preset}` : null));
  const pickFriend = () => {
    setError(null);
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
      command(frame, 'pauseVideo');
      setPlayer(ctx, { playing: false });
    };
    doc.addEventListener('visibilitychange', onVis);
    return () => doc.removeEventListener('visibilitychange', onVis);
  }, [ctx]);

  // 마이홈 배경음악이나 촬영 음악이 틀기 시작해 재생 상태를 끄면(SoundApi.claim) 플레이어도 멈춘다
  useEffect(() => {
    if (!playing) send('pauseVideo');
  }, [playing]);

  /** 받은 제목을 그 곡 줄과 재생 중인 곡에 적는다. 늦게 오므로 이 PC에 저장된 지금 목록에 적는다 */
  const nameTrack = (k: string, title: string) => {
    const named = title.slice(0, 200);
    const cur = player(ctx).current;
    if (cur?.k === k && !cur.title) setPlayer(ctx, { current: { ...cur, title: named } });
    const now = ctx.local.get<Playlist>('device');
    if (!now.presets.some((p) => p.tracks.some((t) => t.k === k && !t.title))) return;
    const next = { ...now, presets: now.presets.map((p) => ({ ...p, tracks: p.tracks.map((t) => (t.k === k ? { ...t, title: named } : t)) })) };
    setList(next);
    savePlaylist(ctx, next);
  };

  // 플레이어 이벤트: 준비되면 음량을 맞추고 재생, 곡이 끝나면 다음 곡, 처음 받은 제목은 목록에 적는다
  useYouTube(ctx, frame, `${track?.v}:${load}`, (m) => {
    if (m.event === 'onReady') {
      send('addEventListener', ['onStateChange']);
      send('addEventListener', ['onError']);
      send('setVolume', [s.musicVolume]);
      if (playing) send('playVideo');
    } else if (m.event === 'onStateChange') {
      if (m.info === 1) fails.current = 0;
      // 목록 밖의 곡(마이홈 배경음악)은 끝나면 멈춘다
      if (m.info === 0 && idx < 0) setPlayer(ctx, { playing: false });
      else if (m.info === 0) go(1, list.repeat);
      else if (m.info === 1 || m.info === 2) setPlayer(ctx, { playing: m.info === 1 });
    } else if (m.event === 'onError') {
      setPlayer(ctx, { playing: false });
      // 목록 안의 곡이면 2초 뒤 다음 곡으로 넘어간다. 연달아 모든 곡이 재생되지 않으면 한 바퀴 돈 뒤 멈춘다. 유튜브 오류 번호는 로그에만 남긴다
      ctx.log.warn(`유튜브 재생 오류 ${String(m.info)}`);
      const k = track?.k;
      const skip = idx >= 0 && ++fails.current < tracks.length;
      setError(skip ? '이 곡은 여기서 재생할 수 없어서 다음 곡으로 넘어가요.' : '이 곡은 여기서 재생할 수 없어요. 다른 곡을 골라 주세요.');
      if (skip) ctx.timers.at(2000, () => player(ctx).current?.k === k && go(1, list.repeat));
    }
    const got = titleOf(m.info);
    if (track && !track.title && typeof got === 'string' && got) nameTrack(track.k, got);
  });

  useEffect(() => void send('setVolume', [s.musicVolume]), [s.musicVolume]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const v = youTubeId(link);
    if (!v) return setError('유튜브 영상 링크를 넣어 주세요.');
    const k = ctx.clock.now().toString(36);
    saveTracks([...tracks, { k, v, title: '' }]);
    setLink('');
    setError(null);
    // 제목은 유튜브 oEmbed에서 받아 적는다. 받지 못하면(끊김, 비공개 영상) 처음 재생할 때 플레이어가 알려 준다
    void ctx.net.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v}`)}&format=json`).then(
      (r) => {
        const t = (r.json as { title?: unknown } | null)?.title;
        if (typeof t === 'string' && t) nameTrack(k, t);
      },
      () => undefined,
    );
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
          src={embedSrc(track.v)}
          title={track.title || '유튜브 플레이어'}
          allow="autoplay; encrypted-media"
        />
      ) : (
        <div className={`${css.video} ${css.empty}`}>곡을 누르면 여기에 플레이어가 나와요. ▶는 첫 곡부터 틀어요.</div>
      )}
      <div className={css.side}>
        <div className={css.now}>{track ? trackName(track) : '재생 중인 곡 없음'}</div>
        <div className={css.buttons}>
          <button title="이전 곡" onClick={() => go(-1)}>⏮</button>
          <button title={playing && track ? '일시정지' : '재생'} onClick={toggle}>{playing && track ? '⏸' : '▶'}</button>
          <button title="다음 곡" onClick={() => go(1)}>⏭</button>
          <button aria-label="항상 위에 고정" title={pinned ? '고정 해제' : '항상 위에 고정'} aria-pressed={pinned} disabled={pinning} onClick={() => void pin()}>📌</button>
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
            title="파도타기. 아무 친구 플리로 넘어가요"
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
        {!mini && <button onClick={pickFriend}>친구 플리 듣기</button>}
        <div className={css.vol}>
          <span>음량 {s.musicVolume}%</span>
          <button aria-label={mini ? '크게 보기' : '작게 보기'} onClick={() => resize(!mini)}>{mini ? '크게' : '작게'}</button>
        </div>
        <input
          type="range"
          aria-label="플레이리스트 음량"
          min={0}
          max={100}
          value={s.musicVolume}
          onChange={(e) => ctx.settings.set({ musicVolume: Number(e.target.value) })}
        />
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
          <button
            onClick={() => {
              setError(null);
              setGuest(null);
            }}
          >
            내 플리로
          </button>
        ) : (
          <label className={css.pub} title="켜면 내 플리를 듣는 친구가 내 마이홈에 올 수 있어요">
            <input type="checkbox" checked={list.home} onChange={(e) => save({ home: e.target.checked })} />
            마이홈 공개
          </label>
        )}
      </div>
      {guest ? (
        <p className={css.bio}>{guest.shared.bio || '소개글이 없어요.'}</p>
      ) : (
        <input
          className={css.bioInput}
          aria-label="소개글"
          placeholder="오늘의 한마디"
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
        {!guest && naming === null && <button aria-label="프리셋 이름 바꾸기" onClick={() => setNaming(list.presets[list.cur]!.name)}>이름 바꾸기</button>}
      </div>
      {/* 파도타기 잠금 (SND-06). 잠가도 친구가 나를 골라 듣는 것은 막지 않는다. 파도타기와 마이홈 공개는 툴팁 대신 글로 풀어 둔다 */}
      {!guest && (
        <>
          <label className={css.share}>
            친구의 🌊 파도타기에 내 플리 넣기
            <input type="checkbox" checked={!list.locked} onChange={(e) => save({ locked: !e.target.checked })} />
          </label>
          <p className={css.hint}>파도타기는 친구 플리를 아무거나 틀어요. 마이홈 공개를 켜 두면 내 플리를 듣는 친구가 내 마이홈에 올 수 있어요.</p>
        </>
      )}
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
          {/* 닫기는 첫 줄에 두어 친구가 많거나 이름이 길어도 스크롤 없이 보인다 */}
          <div className={css.pickHead}>
            <p className={css.hint}>{picking.length ? '누구의 플리를 들을까요?' : '아직 친구가 없어요.'}</p>
            <button onClick={() => setPicking(null)}>닫기</button>
          </div>
          {picking.length > 0 && <button onClick={surfNow}>아무 친구나</button>}
          {picking.map((f) => (
            <button key={f.uid} onClick={() => open(openFriend(ctx, f))}>{f.name}</button>
          ))}
        </div>
      ) : (
        <ol className={css.list}>
          {tracks.length === 0 && <li className={css.hint}>{guest ? '이 플리에는 곡이 없어요.' : '아직 곡이 없어요. 위 칸에 유튜브 링크를 넣어 주세요.'}</li>}
          {tracks.map((t, i) => (
            <li
              key={t.k}
              className={i === idx ? css.on : undefined}
              tabIndex={0}
              title="누르면 이 곡부터 재생해요"
              // 줄 안의 ▲ ▼ × 단추를 누른 것은 재생으로 보지 않는다
              onClick={(e) => !(e.target as HTMLElement).closest('button') && playAt(i)}
              onKeyDown={(e) => e.key === 'Enter' && playAt(i)}
            >
              <span className={css.no}>{i === idx ? '▶' : i + 1}</span>
              <span className={css.title}>{trackName(t)}</span>
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
            <button key={k} aria-pressed={s.noise === k} disabled={quiet} onClick={() => ctx.settings.set({ noise: k })}>
              {k === 'off' ? '끄기' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label>
          음량 {s.noiseVolume}%
          <input type="range" min={0} max={100} value={s.noiseVolume} disabled={quiet} onChange={(e) => ctx.settings.set({ noiseVolume: Number(e.target.value) })} />
        </label>
        <label>
          같은 방 사람의 백색소음도 듣기
          <input type="checkbox" checked={s.shareOthers} onChange={(e) => ctx.settings.set({ shareOthers: e.target.checked })} />
        </label>
        <p className={css.hint}>{quiet ? '회사원 모드에서는 백색소음과 알림음이 나지 않아요.' : '집중 앱에서 키보드나 마우스, 펜을 쓰는 동안만 소리가 나요.'}</p>
      </section>
    </>
  );

  return (
    <div ref={root} className={css.root}>
      {!mini && head}
      {top}
      {error && <p className={css.error}>{error}</p>}
      {!mini && rest}
    </div>
  );
}
