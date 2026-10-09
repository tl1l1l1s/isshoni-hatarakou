import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Ctx } from '@core/types';
import type { Appearance, Sha256 } from '@shared/schemas';
import { DESKS, deskPng } from '../desks';
import { bakeFace, faceEdit } from '../face';
import { CUSTOM_DESK, EXPORT_MAX_CHARS, EXPORT_NAME, faceOf, lockedText, SLOT_COUNT, trashKey, withDesk, withFace, withPoseFile } from '../logic';
import type { Face, PoseId, TrashRecord } from '../logic';
import { wardrobeOf, type Wardrobe } from '../state';
import FacePanel, { PoseThumb } from './FacePanel';
import css from './wardrobe.module.css';

const POSES: Array<[PoseId, string]> = [['idle', '기본'], ['typing', '타이핑'], ['sleep', '잠듦']];

/** 얼굴 그리기를 쓰는 자세가 있으면 얼굴 그리기로 연다. 편집 데이터가 없는 옛 캐릭터는 그림이 하나도 없을 때만 */
const startMode = (a: Appearance): 'face' | 'file' =>
  (a.bodyExt?.face ? Object.values(faceOf(a).use).some(Boolean) : Object.values(a.poses).every((p) => !p)) ? 'face' : 'file';

/** 캐릭터 만들기 창. 슬롯과 종류를 고르고 1단계 얼굴 그리기나 자세 그림 넣기, 2단계 책상, 3단계 이전 모습
 *  (AVT-01, AVT-03, AVT-04, AVT-15, AVT-17, AVT-18, OUR-03) */
export default function WardrobeWindow({ ctx }: { ctx: Ctx }) {
  const w = wardrobeOf(ctx);
  const local = useSyncExternalStore(w.subscribe, w.local);
  const [draft, setDraft] = useState(w.appearance);
  const [edit, setEdit] = useState(() => faceEdit(ctx, draft));
  const [mode, setMode] = useState(() => startMode(draft));
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const desk = draft.slots.desk?.[0];
  const unlocked = local.unlockedAt !== null;
  const face = faceOf(draft);

  /** 외형을 통째로 바꾼다 (슬롯 바꾸기, 파일, 이전 모습). 얼굴 그림판도 새로 받는다 */
  const load = (a: Appearance) => {
    setDraft(a);
    setEdit(faceEdit(ctx, a));
    setMode(startMode(a));
  };
  const setFace = (f: Face) => {
    edit.touched = true;
    setDraft((a) => withFace(a, f));
  };
  const setBody = (body: Appearance['body']) => {
    edit.touched = true;
    setDraft((a) => ({ ...a, body }));
  };

  // 창을 열 때 동물 해금 조건을 확인한다 (GRW-03)
  useEffect(() => void w.unlocked(), [w]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    setNote('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  // 고른 그림을 64KB 안으로 줄여 올린다. 고르지 않으면 null
  const upload = async (): Promise<Sha256 | null> => {
    const f = await ctx.files.openImage();
    return f && ctx.files.upload(await ctx.files.prepareImage(f.bytes));
  };
  const pickDesk = (id: string) =>
    run(async () => {
      const cached = w.local().desks[id];
      const file = cached ?? (await ctx.files.upload(await deskPng(id)));
      if (!cached) ctx.local.update<typeof local>('account', (d) => ({ ...d, desks: { ...d.desks, [id]: file } }));
      setDraft((a) => withDesk(a, { item: id, file }));
    });
  const pickSlot = (i: number) =>
    run(async () => {
      const done = w.setActive(i);
      load(w.appearance());
      await done;
    });
  const save = () =>
    run(async () => {
      await w.write(local.active, await bakeFace(ctx, draft, edit), true);
      ctx.ui.toast('캐릭터를 저장했습니다');
      ctx.ui.close('wardrobe.create');
    });
  // 패널 창 문서 안에서 내려받기 링크를 눌러 저장 창을 띄운다
  const exportFile = () =>
    run(async () => {
      const url = URL.createObjectURL(new Blob([await w.exportText(draft)], { type: 'application/json' }));
      const doc = root.current!.ownerDocument;
      const a = Object.assign(doc.createElement('a'), { href: url, download: EXPORT_NAME });
      doc.body.append(a);
      a.click();
      a.remove();
      ctx.timers.at(60_000, () => URL.revokeObjectURL(url));
    });
  const importFile = (f: File) =>
    run(async () => {
      if (f.size > EXPORT_MAX_CHARS) throw new Error('파일이 너무 큽니다.');
      load(await w.importText(await f.text()));
      setNote('캐릭터 파일을 불러왔습니다. 저장하면 지금 캐릭터에 들어갑니다.');
    });
  const restore = (a: Appearance) => {
    load(a);
    setNote('이전 모습을 불러왔습니다. 저장하면 지금 캐릭터에 들어갑니다.');
  };

  return (
    <div ref={root}>
      <nav className={css.steps} aria-label="캐릭터 슬롯">
        {Array.from({ length: SLOT_COUNT }, (_, i) => (
          <button key={i} aria-pressed={local.active === i} disabled={busy} onClick={() => void pickSlot(i)}>캐릭터 {i + 1}</button>
        ))}
      </nav>
      {/* 얼굴 그리기에는 자세 미리보기가 따로 있어서 위 미리보기를 접는다 */}
      {!(step === 1 && mode === 'face') && (
        <div className={css.preview}>
          <ctx.ui.CharacterPreview appearance={draft} width={128} height={160} />
        </div>
      )}
      <nav className={css.steps} aria-label="캐릭터 종류">
        <button aria-pressed={draft.body === 'human'} onClick={() => setBody('human')}>사람</button>
        <button aria-pressed={draft.body === 'animal'} disabled={!unlocked} onClick={() => setBody('animal')}>동물</button>
      </nav>
      {!unlocked && <p className={css.hint}>{lockedText(w.need())}</p>}
      <nav className={css.steps}>
        <button aria-pressed={step === 1} onClick={() => setStep(1)}>1 캐릭터</button>
        <button aria-pressed={step === 2} onClick={() => setStep(2)}>2 책상</button>
        <button aria-pressed={step === 3} onClick={() => setStep(3)}>이전 모습</button>
      </nav>
      {step === 1 && (
        <nav className={css.steps} aria-label="만드는 방법">
          <button aria-pressed={mode === 'face'} onClick={() => setMode('face')}>얼굴 그리기</button>
          <button aria-pressed={mode === 'file'} onClick={() => setMode('file')}>자세 그림 넣기</button>
        </nav>
      )}
      {step === 1 && mode === 'face' && <FacePanel ctx={ctx} edit={edit} face={face} body={draft.body} onFace={setFace} onError={setMsg} />}
      {step === 1 && mode === 'file' && (
        <>
          <p className={css.hint}>배경이 투명한 PNG를 권장합니다. 큰 그림은 앱이 64KB 안으로 줄여서 저장합니다.</p>
          <div className={css.cards}>
            {POSES.map(([pose, label]) => (
              <div key={pose} className={css.card}>
                <b>{label}</b>
                {face.use[pose]
                  ? <div className={css.pic}><PoseThumb edit={edit} body={draft.body} color={face.color} pose={pose} /></div>
                  : <Pic id={draft.poses[pose]} load={ctx.files.get} empty="기본 그림" />}
                <button disabled={busy} onClick={() => void run(async () => {
                  const h = await upload();
                  if (h) setDraft((a) => withPoseFile(a, pose, h));
                })}>그림 넣기</button>
                <button disabled={busy || face.use[pose]} onClick={() => setFace({ ...face, use: { ...face.use, [pose]: true } })}>얼굴 그림으로</button>
              </div>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <p className={css.hint}>내 책상 그림은 자세 그림과 같은 크기의 캔버스 아래쪽에 그리면 자리가 맞습니다.</p>
          <div className={css.cards}>
            <button className={css.card} aria-pressed={!desk} disabled={busy} onClick={() => setDraft((a) => withDesk(a, null))}>
              <Pic id={null} load={ctx.files.get} empty="" />
              책상 없음
            </button>
            {DESKS.map((d) => (
              <button key={d.id} className={css.card} aria-pressed={desk?.item === d.id} disabled={busy} onClick={() => void pickDesk(d.id)}>
                <Pic id={d.id} load={deskPng} empty="" />
                {d.label}
              </button>
            ))}
            <div className={css.card} data-on={desk?.item === CUSTOM_DESK}>
              <Pic id={desk?.item === CUSTOM_DESK ? desk.file : null} load={ctx.files.get} empty="내 책상 그림" />
              <button disabled={busy} onClick={() => void run(async () => {
                const h = await upload();
                if (h) setDraft((a) => withDesk(a, { item: CUSTOM_DESK, file: h }));
              })}>책상 그림 넣기</button>
            </div>
          </div>
        </>
      )}
      {step === 3 && <TrashList w={w} onPick={restore} />}
      {note && <p className={css.hint}>{note}</p>}
      {msg && <p role="alert" className={css.error}>{msg}</p>}
      <div className={css.foot}>
        <button disabled={busy} onClick={() => void exportFile()}>파일로 내보내기</button>
        <button disabled={busy} onClick={() => file.current?.click()}>파일에서 불러오기</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importFile(f);
        }} />
        <button disabled={busy} onClick={() => void save()}>저장</button>
      </div>
    </div>
  );
}

/** 덮어쓴 옛 모습 목록 (ACC-08) */
function TrashList({ w, onPick }: { w: Wardrobe; onPick: (a: Appearance) => void }) {
  const [items, setItems] = useState<TrashRecord[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    w.trashList().then((xs) => alive && setItems(xs), (e: Error) => alive && setErr(e.message));
    return () => void (alive = false);
  }, [w]);
  const when = (at: number) => new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <p className={css.hint}>저장하거나 다른 PC와 맞출 때 덮어쓴 모습을 10일 동안 남깁니다.</p>
      {err && <p role="alert" className={css.error}>{err}</p>}
      {!err && !items && <p className={css.hint}>불러오는 중입니다.</p>}
      {items?.length === 0 && <p className={css.hint}>남아 있는 이전 모습이 없습니다.</p>}
      <ul className={css.trash}>
        {items?.map((t) => (
          <li key={trashKey(t)}>
            <span>캐릭터 {t.slot + 1} · {when(t.at)}</span>
            <button onClick={() => onPick(t.appearance)}>불러오기</button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** 그림 바이트를 blob URL로 보여 준다. id가 바뀌거나 화면에서 빠지면 URL을 돌려준다 */
function Pic({ id, load, empty }: { id: string | null; load: (id: string) => Promise<Uint8Array | null>; empty: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!id) return;
    let u = '', alive = true;
    load(id).then(
      (b) => alive && b && setUrl((u = URL.createObjectURL(new Blob([b as Uint8Array<ArrayBuffer>])))),
      () => undefined,
    );
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return <div className={css.pic}>{url ? <img src={url} alt="" /> : empty}</div>;
}
