import type { SlotProps } from '@core/types';
import { useRoom } from '../state';
import css from './rooms.module.css';

/** 상태칩 옆 방 코드. 혼자 모드면 그리지 않는다 (ROM-06) */
export function RoomChip({ ctx }: SlotProps) {
  const room = useRoom(ctx);
  if (!room.code) return null;
  return (
    <button className={css.pill} title="방 정보 열기" onClick={() => ctx.ui.open('rooms.join')}>
      {room.code}
    </button>
  );
}

/** 런처 워킹룸 카드 */
export function RoomCard({ ctx }: SlotProps) {
  const room = useRoom(ctx);
  return (
    <div className={css.card}>
      <strong>워킹룸</strong>
      <span className={css.muted}>{room.code ? `${room.code} 방에 ${room.count}명이 있습니다.` : '지금은 혼자 모드입니다.'}</span>
      <button onClick={() => ctx.ui.open('rooms.join')}>{room.code ? '방 정보' : '방 만들기 / 참여하기'}</button>
    </div>
  );
}
