// 다가오는 일정은 scheduler와 dday 공개 API에서 그때그때 계산한다
import { useEffect, useReducer } from 'react';
import { useToday } from '@shared/today';
import type { Ctx } from '@core/types';
import type {} from '@modules/dday/api';
import { calendarDay } from '@modules/scheduler/api';
import { dueToday, noticeText, upcoming, type Entry, type Local, type Settings } from './logic';

/** 오늘은 스케줄러와 D-day처럼 서버 시각으로 정한다 */
export const today = (ctx: Ctx) => calendarDay(ctx.clock.serverNow());

const entriesOn = (ctx: Ctx, day: string): Entry[] =>
  upcoming(ctx.modules.get('scheduler')?.items() ?? [], ctx.modules.get('dday')?.cards() ?? [], day);

export const entries = (ctx: Ctx): Entry[] => entriesOn(ctx, today(ctx));

/** 일정이 바뀌거나 날짜가 바뀌면 다시 그린다 */
export function useEntries(ctx: Ctx): Entry[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const day = useToday(ctx, calendarDay);
  useEffect(() => {
    const offs = [ctx.bus.on('scheduler.changed', bump), ctx.bus.on('dday.changed', bump)];
    return () => offs.forEach((off) => off());
  }, [ctx]);
  return entriesOn(ctx, day);
}

/** 오늘 날짜인 일정을 하루에 한 번씩 OS 알림으로 알린다 (HOM-22). 이 계정을 쓰는 기기에서만 알린다 (ACC-12) */
export function checkToday(ctx: Ctx): void {
  if (!ctx.settings.get<Settings>().notify || !ctx.self.activeDevice()) return;
  const { due, next } = dueToday(entries(ctx), today(ctx), ctx.local.get<Local>('account'));
  if (!due.length) return;
  ctx.local.update<Local>('account', () => next);
  ctx.notify({ title: '오늘 일정', body: noticeText(due), onClick: () => ctx.ui.open('upcoming.main') });
}
