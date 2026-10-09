// D-day 카드 모양과 남은 날 계산 (HOM-21). ctx 없이 시험하는 순수 함수
import { z } from 'zod';
import { daysBetween } from '@modules/scheduler/api';

export const NAME_MAX = 20;
export const CARD_MAX = 20;
/** 카드 색. 사용자가 고르는 내용 색이다 */
export const COLORS: Array<[string, string]> = [['#e0559a', '분홍'], ['#e07b2a', '주황'], ['#2f9e5b', '초록'], ['#3a8fd9', '하늘'], ['#8a5cd0', '보라'], ['#1d1d1f', '검정']];

export const Card = z.object({
  name: z.string().min(1).max(NAME_MAX),
  date: z.iso.date(),
  /** 고른 날을 1일째로 센다 (사귄 날, 시작한 날) */
  fromOne: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  notify: z.boolean(),
  pub: z.boolean(),
  v: z.literal(1),
});
export type Card = z.infer<typeof Card>;
export type Row = Card & { id: string };

/** 카드 색 위에서 더 잘 읽히는 글자색. 흰 글자와 #1d1d1f 글자 가운데 WCAG 대비가 큰 쪽이다 */
export function inkOn(hex: string): string {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  // 흰 글자 대비 1.05 / (l + 0.05)와 #1d1d1f(밝기 0.0123) 대비 (l + 0.05) / 0.0623을 견준다
  return (l + 0.05) ** 2 > 1.05 * 0.0623 ? '#1d1d1f' : '#ffffff';
}

/** 서버 목록을 읽어 날짜 순서로 놓는다. 모양이 틀린 카드는 버린다 */
export const parseCards = (rows: Array<{ key: string; value: unknown }>): Row[] =>
  rows
    .flatMap(({ key, value }) => {
      const c = Card.safeParse(value);
      return c.success ? [{ ...c.data, id: key }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));

/** 오늘 기준 카드 글자. 앞날은 D-3, 오늘은 D-day, 지난날은 D+3이고 fromOne이면 고른 날부터 1일째로 센다 */
export function ddayLabel(date: string, today: string, fromOne: boolean): string {
  const d = daysBetween(today, date);
  if (d > 0) return `D-${d}`;
  if (fromOne) return `${1 - d}일째`;
  return d === 0 ? 'D-day' : `D+${-d}`;
}

/** 카드 하나를 쓰는 다중 경로 쓰기. 공개 카드는 pub에도 두고 비공개면 pub에서 지운다. card가 null이면 지우기 */
export const cardWrites = (id: string, card: Card | null): Record<string, unknown> => ({ [`cards/${id}`]: card, [`pub/${id}`]: card?.pub ? card : null });
