import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { OFFLINE, type Ctx } from '@core/types';
import type {} from '@modules/sound/api';
import type {} from '@modules/account/api';
import {
  ACCENTS, addSticker, BG_SIDE, CLAP_DAILY, CLAP_EMOJI_MAX, countClap, DEFAULT_BG, DEFAULT_CLAP, lastAt, linkify, moveSticker,
  POST_MAX, PROFILE_MAX, resizeSticker, restack, rotateSticker, SPEED_MAX, SPEED_MIN, STICKER_CAP, STICKER_SIDE, unread, VIEW,
} from '../logic';
import type { Anim, Bgm, Home, Local, Pt, Sticker } from '../logic';
import { pickImage, run, sendClap, useFiles, useHomeDoc, useHomeState, useInbox, useOnline, useShelf } from '../state';
import { BookPanel, GiftPanel, MallangiPanel, ShelfPanel } from './panels';
import Walkers, { type Herd } from './Walkers';
import css from './home.module.css';

type Mode = 'view' | 'edit' | 'preview';
type Panel = 'book' | 'gifts' | 'mallangi' | 'shelf' | null;
interface Drag { i: number; kind: 'move' | 'size' | 'turn'; s0: Sticker; p0: Pt }
interface Spark { id: number; text: string; x: number; y: number; dx: number; dy: number }

const ANIMS: Array<[Anim, string]> = [['none', '없음'], ['bob', '둥실'], ['spin', '빙글']];
/** 박수 이모지 빨리 고르기. 칸에 직접 적을 수도 있다 */
const CLAPS = ['👏', '🎉', '❤️', '👍', '🔥', '✨'];
let sparkId = 0;

/** 마이홈 보기 화면 하나. 내 마이홈이면 편집 도구를 겹쳐 보여 주고 미리보기는 도구를 끈 모습이다 (HOM-02, HOM-10) */
export default function HomeView({ ctx, uid, name }: { ctx: Ctx; uid: string; name: string }) {
  const mine = uid === ctx.self.uid();
  const { home, error } = useHomeDoc(ctx, uid);
  const { gifts } = useHomeState(ctx);
  const { book, claps, more, loadMore } = useInbox(ctx, uid, mine);
  const shelf = useShelf(ctx, uid, mine);
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<Home | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [seen, setSeen] = useState(() => ctx.local.get<Local>('account').bookSeen);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const herd = useRef<Herd>(null);

  // 방명록을 열어 둔 동안 온 글은 읽은 것으로 친다 (HOM-09 배지)
  useEffect(() => {
    if (!mine || panel !== 'book' || !unread(book, seen)) return;
    const at = lastAt(book, seen);
    ctx.local.update<Local>('account', (s) => ({ ...s, bookSeen: Math.max(s.bookSeen, at) }));
    setSeen(at);
  }, [ctx, mine, panel, book, seen]);

  // 편집한 것을 저장하지 않고 ESC, 창 닫기 단추, 탭으로 떠나려 하면 코어가 묻는다. 편집을 시작하면 draft가 home과 같고 고칠 때마다 새 값이 된다
  const dirty = mode !== 'view' && draft !== home;
  useEffect(() => (dirty ? ctx.ui.guard('home.main', () => '마이홈 편집을 저장하지 않았어요. 나갈까요?') : undefined), [ctx, dirty]);

  const shown = (mode !== 'view' && draft) || home;
  const files = useFiles(ctx, shown ? [...shown.stickers.map((s) => s.file), ...('file' in shown.bg ? [shown.bg.file] : []), ...(shown.wall ? [shown.wall] : [])] : []);
  const online = useOnline(ctx);

  if (error) return <p className={css.hint}>이 마이홈을 볼 수 없어요. 친구의 마이홈만 볼 수 있어요.</p>;
  // 끊긴 동안에는 읽기가 끝나지 않는다. 끊김은 코어가 창 위쪽 띠로 알리고 연결되면 이어서 불러온다
  if (!home || !shown) return <p className={css.hint}>{online ? '불러오는 중이에요.' : '연결되면 불러와요.'}</p>;

  const tools = mode === 'edit';
  const edit = (fn: (d: Home) => Home) => setDraft((d) => (d ? fn(d) : d));
  const setStickers = (fn: (l: Sticker[]) => Sticker[]) => edit((d) => ({ ...d, stickers: fn(d.stickers) }));
  const patchSel = (fn: (s: Sticker) => Sticker) => setStickers((l) => l.map((s, j) => (j === sel ? fn(s) : s)));
  const close = () => {
    setDraft(null);
    setMode('view');
    setSel(null);
  };
  const save = () =>
    run(ctx, async () => {
      const d = draft!;
      const text = d.post?.text ?? '';
      const post = !text ? null : home.post?.text === text ? home.post : { text, at: ctx.clock.serverNow() };
      const clap = d.clap?.trim() || null;
      await ctx.server.user().update('home', {
        profile: d.profile, post, bg: d.bg, stickers: d.stickers, bgm: d.bgm ?? null, accent: d.accent ?? null, wall: d.wall ?? null, clap, v: 1,
      });
      ctx.ui.toast('마이홈을 저장했어요.');
      close();
    });
  const addOne = () =>
    run(ctx, async () => {
      if (shown.stickers.length >= STICKER_CAP) throw new Error(`스티커는 ${STICKER_CAP}개까지 붙일 수 있어요.`);
      const file = await pickImage(ctx, STICKER_SIDE);
      if (!file) return;
      setStickers((l) => addSticker(l, file) ?? l);
      setSel(shown.stickers.length);
    });
  const pickBg = () =>
    run(ctx, async () => {
      const file = await pickImage(ctx, BG_SIDE);
      if (file) edit((d) => ({ ...d, bg: { file } }));
    });
  const pickWall = () =>
    run(ctx, async () => {
      const wall = await pickImage(ctx, BG_SIDE);
      if (wall) edit((d) => ({ ...d, wall }));
    });
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const startEdit = () => {
    setDraft(home);
    setMode('edit');
    setPanel(null);
  };
  const openLink = (url: string) => void ctx.shell.openExternal(url).catch((e: Error) => ctx.ui.toast(e.message));

  /** 글자들이 (x, y)에서 사방으로 흩어진다. 1초 뒤에 지운다 */
  const scatter = (glyphs: string[], x: number, y: number, n: number, spread: number) => {
    const made = Array.from({ length: n }, (_, i): Spark => {
      const a = Math.random() * Math.PI * 2;
      const r = spread * (0.5 + Math.random() / 2);
      return { id: ++sparkId, text: glyphs[i % glyphs.length]!, x, y, dx: Math.cos(a) * r, dy: Math.sin(a) * r - spread / 2 };
    });
    setSparks((s) => [...s, ...made]);
    ctx.timers.at(1000, () => setSparks((s) => s.filter((p) => !made.includes(p))));
  };

  // 웹박수: 주인이 고른 이모지가 터진다. 방문자는 하루 5번까지 보낸다 (HOM-15)
  const emoji = shown.clap || DEFAULT_CLAP;
  const clap = () => {
    const glyphs = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(emoji)].map((g) => g.segment).filter((g) => g.trim());
    if (mine) {
      scatter(glyphs, VIEW.width / 2, VIEW.height / 2, 14, 220);
      // 편집 중에는 고른 이모지를 미리 보는 것이라 설명하지 않는다
      return mode === 'view' && ctx.ui.toast('친구가 놀러 와서 박수를 치면 수가 올라요.');
    }
    // 끊긴 동안에는 오늘 보낸 수를 세지 않는다
    if (!ctx.connection.online()) return ctx.ui.toast(OFFLINE);
    const next = countClap(ctx.local.get<Local>('account').claps, uid, ctx.clock.dayKey());
    if (!next) return ctx.ui.toast(`박수는 한 마이홈에 하루 ${CLAP_DAILY}번까지 보낼 수 있어요.`);
    ctx.local.update<Local>('account', (s) => ({ ...s, claps: next }));
    scatter(glyphs, VIEW.width / 2, VIEW.height / 2, 14, 220);
    run(ctx, () => sendClap(ctx, uid));
  };

  // 끌기는 보기 화면 기준 픽셀로 계산한다. 포인터를 잡아 두어 화면 밖으로 나가도 이어진다
  const at = (ev: PointerEvent): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const down = (ev: PointerEvent, i: number, kind: Drag['kind']) => {
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setSel(i);
    drag.current = { i, kind, s0: shown.stickers[i]!, p0: at(ev) };
  };
  const move = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(ev);
    const next = (s: Sticker) =>
      d.kind === 'move' ? moveSticker(s, { x: s.x + p.x - d.p0.x, y: s.y + p.y - d.p0.y }) : d.kind === 'size' ? resizeSticker(s, d.p0, p) : rotateSticker(s, p);
    setStickers((l) => l.map((s, j) => (j === d.i ? next(d.s0) : s)));
  };
  const up = () => (drag.current = null);

  const bg = shown.bg;
  const bgUrl = 'file' in bg ? files[bg.file] : undefined;
  const bgStyle: CSSProperties = { backgroundColor: 'color' in bg ? bg.color : DEFAULT_BG, backgroundImage: bgUrl ? `url(${bgUrl})` : undefined };
  const wallUrl = shown.wall ? files[shown.wall] : undefined;
  // 마이홈 색은 이 화면 안의 강조와 채움과 선 색을 바꾼다 (HOM-07)
  const viewStyle = { width: VIEW.width, height: VIEW.height, '--home': shown.accent, backgroundImage: wallUrl ? `url(${wallUrl})` : undefined } as CSSProperties;
  const cur = tools && sel !== null ? shown.stickers[sel] : undefined;
  const badge = mine ? unread(book, seen) : 0;
  const postText = shown.post?.text ?? '';
  const tracks = ctx.modules.get('sound')?.tracks() ?? [];
  const account = ctx.modules.get('account');
  const Photo = account?.Photo;
  // 사진은 바로 서버에 올라가므로 편집의 취소로 되돌리지 않는다. 사진 칸이 사진을 구독해 바뀐 사진을 그린다
  const pickPhoto = account && (() => run(ctx, account.pickPhoto));

  return (
    <div
      ref={box}
      className={css.view}
      style={viewStyle}
      data-themed={!!shown.accent}
      data-wall={!!shown.wall}
      onPointerDown={() => setSel(null)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <aside className={css.profile}>
        {Photo && pickPhoto && mine && mode === 'view' ? (
          <button className={css.photo} aria-label="사진 넣기" title="눌러서 프로필 사진 넣기" onClick={pickPhoto}>
            <Photo uid={uid} size={88} />
          </button>
        ) : (
          Photo && <Photo uid={uid} size={88} />
        )}
        {tools && pickPhoto && (
          <>
            <button className={css.photoPick} onClick={pickPhoto}>사진 넣기</button>
            <small className={css.count}>프로필 사진은 친구만 봐요.</small>
          </>
        )}
        <h3>{name}</h3>
        {tools ? (
          <>
            <select
              aria-label="배경음악"
              value={shown.bgm?.v ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                const title = (tracks.find((t) => t.v === v)?.title ?? shown.bgm?.title ?? '').slice(0, 200);
                edit((d) => ({ ...d, bgm: v ? { v, title } : undefined }));
              }}
            >
              <option value="">배경음악 없음</option>
              {shown.bgm && !tracks.some((t) => t.v === shown.bgm!.v) && <option value={shown.bgm.v}>{shown.bgm.title || `제목 없는 곡 (${shown.bgm.v})`}</option>}
              {tracks.map((t, i) => (
                <option key={i} value={t.v}>{t.title || `제목 없는 곡 (${t.v})`}</option>
              ))}
            </select>
            {!tracks.length && <small className={css.count}>플레이리스트에 곡을 넣으면 배경음악으로 고를 수 있어요.</small>}
            <textarea maxLength={PROFILE_MAX} value={shown.profile} placeholder="자기소개" onChange={(e) => edit((d) => ({ ...d, profile: e.target.value }))} />
            <small className={css.count}>{shown.profile.length} / {PROFILE_MAX}</small>
            <div className={css.theme}>
              <small className={css.count}>마이홈 색</small>
              <div className={css.swatches}>
                <button className={css.swatch} data-plain aria-label="기본 색" aria-pressed={!shown.accent} onClick={() => edit((d) => ({ ...d, accent: undefined }))} />
                {ACCENTS.map(([c, label]) => (
                  <button key={c} className={css.swatch} style={{ background: c }} aria-label={`${label} 색`} aria-pressed={shown.accent === c} onClick={() => edit((d) => ({ ...d, accent: c }))} />
                ))}
              </div>
              <div className={css.row}>
                <button onClick={pickWall}>창 바탕 그림</button>
                {shown.wall && <button onClick={() => edit((d) => ({ ...d, wall: undefined }))}>그림 빼기</button>}
              </div>
              <label>
                박수 이모지
                <input value={shown.clap ?? ''} placeholder={DEFAULT_CLAP} maxLength={CLAP_EMOJI_MAX} onChange={(e) => edit((d) => ({ ...d, clap: e.target.value || undefined }))} />
              </label>
              <div className={css.claps}>
                {CLAPS.map((e) => (
                  <button key={e} aria-label={`박수 ${e}`} aria-pressed={emoji === e} onClick={() => edit((d) => ({ ...d, clap: e }))}>{e}</button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <BgmBar ctx={ctx} bgm={shown.bgm} />
            <p className={css.pre}>{shown.profile || '아직 자기소개가 없어요.'}</p>
          </>
        )}
      </aside>

      <section className={css.main}>
        <div className={css.bar}>
          {/* 편집하는 동안에는 꾸미기 도구만 남기고 박수는 고른 이모지를 미리 보려고 둔다 */}
          {!tools && <button onClick={() => toggle('book')}>방명록{badge > 0 && <span data-unread>{badge}</span>}</button>}
          <button title={mine ? '눌러서 미리보기' : `하루 ${CLAP_DAILY}번까지 보낼 수 있어요.`} onClick={clap}>
            {emoji} 박수 {claps}
          </button>
          {mine && !tools && <button onClick={() => toggle('gifts')}>선물함{gifts.length > 0 && <span data-unread>{gifts.length}</span>}</button>}
          {home.mallangi.length > 0 && !tools && <button onClick={() => herd.current?.call()}>말랑이 부르기</button>}
          {mine && !tools && <button onClick={() => toggle('mallangi')}>말랑이 관리</button>}
          <span className={css.grow} />
          {mine && mode === 'view' && <button onClick={startEdit}>편집</button>}
          {tools && (
            <>
              <button onClick={addOne}>+ 스티커</button>
              <button onClick={() => setMode('preview')}>미리보기</button>
              <button onClick={close}>취소</button>
              <button type="submit" onClick={save}>저장</button>
            </>
          )}
          {mode === 'preview' && <button onClick={() => setMode('edit')}>편집으로 돌아가기</button>}
        </div>

        <div className={css.desk} style={bgStyle}>
          {(mine || shelf.length > 0) && (
            <button className={css.icon} aria-pressed={panel === 'shelf'} onClick={() => toggle('shelf')}>
              <span aria-hidden>📚</span>
              <small>북마크</small>
            </button>
          )}
          {tools && (
            <div className={css.deskTools}>
              <label>
                배경색
                <input type="color" value={'color' in bg ? bg.color : DEFAULT_BG} onChange={(e) => edit((d) => ({ ...d, bg: { color: e.target.value } }))} />
              </label>
              <button onClick={pickBg}>그림 넣기</button>
              <button onClick={() => edit((d) => ({ ...d, bg: { color: DEFAULT_BG } }))}>기본 배경</button>
            </div>
          )}
        </div>

        <article className={css.post}>
          <h4>게시글 {!tools && shown.post && <small className={css.count}>{new Date(shown.post.at).toLocaleDateString('ko-KR')}</small>}</h4>
          {tools ? (
            <>
              <textarea
                maxLength={POST_MAX}
                value={postText}
                placeholder="하고 싶은 말이나 링크"
                onChange={(e) => edit((d) => ({ ...d, post: { text: e.target.value, at: d.post?.at ?? 0 } }))}
              />
              <small className={css.count}>{postText.length} / {POST_MAX}</small>
            </>
          ) : (
            <p className={css.pre}>
              {postText
                ? linkify(postText).map((part, i) =>
                    part.url ? (
                      <button key={i} className={css.link} title="브라우저로 열기" onClick={() => openLink(part.url!)}>
                        {part.text}
                      </button>
                    ) : (
                      part.text
                    ),
                  )
                : '아직 게시글이 없어요.'}
            </p>
          )}
        </article>
      </section>

      <div className={css.layer} data-edit={tools}>
        {shown.stickers.map((s, i) => (
          <div
            key={i}
            className={css.sticker}
            data-on={tools && i === sel}
            style={{ left: s.x, top: s.y, width: s.w, zIndex: s.z, transform: `translate(-50%, -50%) rotate(${s.rot}deg)` }}
            onPointerDown={tools ? (ev) => down(ev, i, 'move') : undefined}
          >
            {files[s.file] && (
              <img src={files[s.file]} alt="" draggable={false} className={s.anim === 'none' ? undefined : css[s.anim]} style={{ animationDuration: `${(s.anim === 'spin' ? 4 : 2) / s.speed}s` }} />
            )}
            {tools && i === sel && (
              <>
                <span className={css.size} title="끌어서 크기 바꾸기" onPointerDown={(ev) => down(ev, i, 'size')} />
                <span className={css.turn} title="끌어서 돌리기" onPointerDown={(ev) => down(ev, i, 'turn')} />
              </>
            )}
          </div>
        ))}
      </div>

      <Walkers ctx={ctx} box={box} mallangi={home.mallangi} ref={herd} onHeart={(x, y) => scatter(['💗'], x, y, 3 + Math.floor(Math.random() * 3), 50)} />

      <div className={css.sparks} aria-hidden>
        {sparks.map((p) => (
          <span key={p.id} style={{ left: p.x, top: p.y, '--dx': `${p.dx}px`, '--dy': `${p.dy}px` } as CSSProperties}>{p.text}</span>
        ))}
      </div>

      {cur && (
        <div className={css.stickerBar} onPointerDown={(ev) => ev.stopPropagation()}>
          <label>
            움직임
            <select value={cur.anim} onChange={(e) => patchSel((s) => ({ ...s, anim: e.target.value as Anim }))}>
              {ANIMS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            속도
            <input type="range" min={SPEED_MIN} max={SPEED_MAX} step={0.5} value={cur.speed} disabled={cur.anim === 'none'} onChange={(e) => patchSel((s) => ({ ...s, speed: Number(e.target.value) }))} />
          </label>
          <button onClick={() => setStickers((l) => restack(l, sel!, 1))}>맨 앞으로</button>
          <button onClick={() => setStickers((l) => restack(l, sel!, -1))}>맨 뒤로</button>
          <button
            onClick={() => {
              setStickers((l) => l.filter((_, j) => j !== sel));
              setSel(null);
            }}
          >
            빼기
          </button>
        </div>
      )}

      {panel && (
        <div className={css.panel} onPointerDown={(ev) => ev.stopPropagation()}>
          {panel === 'book' && <BookPanel ctx={ctx} owner={uid} mine={mine} book={book} more={more} onMore={loadMore} onClose={() => setPanel(null)} />}
          {panel === 'gifts' && <GiftPanel ctx={ctx} home={home} gifts={gifts} onClose={() => setPanel(null)} />}
          {panel === 'mallangi' && <MallangiPanel ctx={ctx} home={home} onClose={() => setPanel(null)} />}
          {panel === 'shelf' && <ShelfPanel ctx={ctx} mine={mine} list={shelf} onClose={() => setPanel(null)} />}
        </div>
      )}
    </div>
  );
}

/** 배경음악 막대. 누를 때만 플레이어를 띄워 재생한다. 유튜브 약관에 따라 플레이어는 200x200으로 보이게 둔다 (HOM-04).
 *  플레이어는 sound 모듈이 그려서 플레이리스트 음량을 따르고 플레이리스트와 겹쳐 나지 않는다.
 *  곡이 없으면 누를 것이 없으니 막대 대신 글만 보인다 */
function BgmBar({ ctx, bgm }: { ctx: Ctx; bgm: Bgm | undefined }) {
  const [on, setOn] = useState(false);
  const Player = ctx.modules.get('sound')?.Player;
  if (!bgm) return <small className={css.count}>배경음악 없음</small>;
  return (
    <>
      <div className={css.bgm}>
        <button aria-label={on ? '배경음악 끄기' : '배경음악 듣기'} disabled={!Player} onClick={() => setOn(!on)}>{on ? '■' : '▶'}</button>
        <span className={css.bgmTitle}>{bgm.title || '제목 없는 곡'}</span>
      </div>
      {on && Player && <Player track={bgm} />}
    </>
  );
}
