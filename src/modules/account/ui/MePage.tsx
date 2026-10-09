import { useCallback, useEffect, useState } from 'react';
import type { Ctx, SlotProps } from '@core/types';
import type {} from '@modules/friends/api';
import type {} from '@modules/growth/api';
import { TRASH_KEEP_MS, type TrashRecord } from '@modules/wardrobe/api';
import { levelOf, rankOf } from '../logic';
import AccountTab from './AccountTab';
import Photo from './Photo';
import css from './account.module.css';

type Tab = 'box' | 'account' | 'trash';

/** 런처 안의 내 정보 화면 (SCR-03). 프로필과 친구 랭킹, 자리비움 그림, 보관함과 계정과 휴지통 탭.
 *  자리비움 그림과 보관함은 awaypic과 gacha가 account.away, account.box 슬롯에 넣는다 */
export default function MePage({ ctx }: SlotProps) {
  const [tab, setTab] = useState<Tab>('box');
  const [name, setName] = useState(ctx.self.name());
  useEffect(() => ctx.self.onChange((s) => setName(s.name)), [ctx]);
  const rank = useRank(ctx);
  const [trash, reload] = useTrash(ctx);
  const code = ctx.self.friendCode();
  const level = ctx.modules.get('growth')?.levelText();
  const copy = () => ctx.shell.copy(code ?? '').then(() => ctx.ui.toast('친구 코드를 복사했어요'), () => ctx.ui.toast('복사하지 못했어요'));
  // 친구가 있을 때만 왕관을 씌운다. 혼자서 1위는 뜻이 없다
  const first = rank !== null && rank.of > 1 && rank.at === 1;

  return (
    <div>
      <div className={css.head}>
        <span className={css.me} data-first={first}>
          <Photo ctx={ctx} uid={ctx.self.uid()} size={64} />
          {first && <span className={css.crown} role="img" aria-label="친구 랭킹 1위 왕관">👑</span>}
        </span>
        <div className={css.who}>
          <div className={css.line}>
            <strong className={css.name}>{name || '이름 없음'}</strong>
            {level !== undefined && <span className={css.lv}>{level}</span>}
            <button className={css.small} onClick={() => setTab('account')}>수정</button>
          </div>
          {code && (
            <div className={css.line}>
              <span className={css.hint}>친구 코드 {code}</span>
              <button className={css.small} onClick={() => void copy()}>복사</button>
            </div>
          )}
        </div>
        <div className={css.rank} aria-label="친구 랭킹">
          <small>친구 랭킹</small>
          {rank && rank.of > 1 ? (
            <>
              <strong>{rank.at}위</strong>
              <small>{rank.of}명 중</small>
            </>
          ) : (
            <small>친구를 등록하면 보여요</small>
          )}
        </div>
      </div>
      <hr />
      <h4>자리비움 그림</h4>
      <ctx.ui.Slot name="account.away" />
      <hr />
      <nav>
        <button aria-pressed={tab === 'box'} onClick={() => setTab('box')}>보관함</button>
        <button aria-pressed={tab === 'account'} onClick={() => setTab('account')}>계정</button>
        <button aria-pressed={tab === 'trash'} onClick={() => setTab('trash')}>휴지통 {trash?.length ?? 0}</button>
      </nav>
      {tab === 'box' && <ctx.ui.Slot name="account.box" />}
      {tab === 'account' && <AccountTab ctx={ctx} code={false} />}
      {tab === 'trash' && <Trash ctx={ctx} items={trash} reload={reload} />}
    </div>
  );
}

/** 나와 친구들의 평생 레벨 순위 (GRW-05 대신). 친구 목록이 바뀌면 다시 센다. 레벨을 읽지 못한 친구는 뺀다 */
function useRank(ctx: Ctx): { at: number; of: number } | null {
  const [rank, setRank] = useState<{ at: number; of: number } | null>(null);
  useEffect(() => {
    const friends = ctx.modules.get('friends');
    const mine = ctx.modules.get('growth')?.level();
    if (!friends || mine === undefined) return;
    let alive = true;
    const load = () =>
      void Promise.all(friends.list().map(({ uid }) => ctx.users.profile(uid).then(levelOf, () => null))).then((ls) => {
        const others = ls.filter((l): l is number => l !== null);
        if (alive) setRank({ at: rankOf(mine, others), of: others.length + 1 });
      });
    load();
    const off = friends.onChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [ctx]);
  return rank;
}

function useTrash(ctx: Ctx): [TrashRecord[] | null, () => void] {
  const [items, setItems] = useState<TrashRecord[] | null>(null);
  const reload = useCallback(() => {
    void ctx.modules.get('wardrobe')?.trashList().then(setItems, (e: Error) => ctx.log.warn(`휴지통 읽기 실패: ${e.message}`));
  }, [ctx]);
  useEffect(reload, [reload]);
  return [items, reload];
}

/** 휴지통 탭. 저장하거나 다른 PC와 맞출 때 덮어쓴 캐릭터(ACC-08)를 원래 칸에 되돌린다 */
function Trash({ ctx, items, reload }: { ctx: Ctx; items: TrashRecord[] | null; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const gone = (at: number) => {
    const d = new Date(at + TRASH_KEEP_MS);
    return `${d.getMonth() + 1}/${d.getDate()} 사라져요`;
  };
  const restore = (t: TrashRecord) => {
    const w = ctx.modules.get('wardrobe');
    if (!w) return;
    setBusy(true);
    w.restore(t)
      .then(() => ctx.ui.toast(`캐릭터 ${t.slot + 1}에 되돌렸어요`), (e: Error) => ctx.ui.toast(e.message))
      .finally(() => {
        setBusy(false);
        reload();
      });
  };
  if (!items) return <p className={css.hint}>불러오는 중이에요.</p>;
  return (
    <>
      <p className={css.hint}>저장하거나 다른 PC와 맞출 때 덮어쓴 캐릭터가 10일 동안 남아요. 복원하면 원래 칸으로 돌아가고 그 칸의 지금 모습은 휴지통으로 가요.</p>
      {items.length === 0 && <p className={css.hint}>휴지통이 비어 있어요.</p>}
      {/* ponytail: 항목마다 미리보기를 하나씩 그린다(최대 50개). 느려지면 보이는 항목만 그린다 */}
      <ul className={css.trash}>
        {items.map((t) => (
          <li key={`${t.mtime}_${t.slot}`}>
            <ctx.ui.CharacterPreview appearance={t.appearance} width={48} height={60} />
            <span className={css.who}>
              캐릭터 {t.slot + 1}
              <small className={css.hint}>{gone(t.at)}</small>
            </span>
            <button disabled={busy} onClick={() => restore(t)}>복원</button>
          </li>
        ))}
      </ul>
    </>
  );
}
