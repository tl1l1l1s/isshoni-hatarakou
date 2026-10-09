// 코어 설정 (10.5 코어 설정). 스테이지 창과 창 관리자가 쓰는 값이라 모듈이 아니라 코어가 들고 PC마다 따로 둔다
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { SettingsDecl } from './types';
import type { CoreRuntime } from './runtime';

export const SCALE = { min: 0.6, max: 1.6, step: 0.1 };

export const coreSettings = {
  version: 1,
  scope: 'device',
  schema: z.object({
    /** 화면에 보여 주는 사본이고 기준은 OS 로그인 항목이다 (SET-01) */
    autoStart: z.boolean().default(false),
    /** 좌석과 이름표 크기 (SET-07, SET-17, AVT-12) */
    scale: z.number().min(SCALE.min).max(SCALE.max).default(1),
    /** 이름표 배지와 머리 위 말풍선 (SET-14) */
    showHead: z.boolean().default(true),
    /** 영상 겹침 우회 (NFR-04, SET-04) */
    opacity252: z.boolean().default(false),
    /** 표시 모드 (ctx.mode). hidden은 이번 실행에만 두므로 저장하지 않는다 */
    mode: z.enum(['normal', 'quiet']).default('normal'),
    /** 창 밝기. 무채색 안에서 밝게와 어둡게만 고른다 (SET-05) */
    theme: z.enum(['system', 'light', 'dark']).default('system'),
    /** 좌석 캐릭터를 낮은 해상도의 도트로 그린다 (SET-13) */
    pixel: z.boolean().default(false),
    /** 상태칩 자리 (SET-15) */
    chips: z.enum(['below', 'right', 'left']).default('below'),
  }),
  fields: {
    autoStart: { label: '컴퓨터 켤 때 자동 실행' },
    scale: { label: '캐릭터 크기', min: SCALE.min, max: SCALE.max },
    showHead: { label: '머리 위 표시 (레벨 배지와 말풍선)' },
    opacity252: { label: '영상 겹침 우회' },
    mode: { label: '표시 모드' },
    theme: { label: '테마', options: [{ value: 'system', label: '시스템 설정 따르기' }, { value: 'light', label: '밝게' }, { value: 'dark', label: '어둡게' }] },
    pixel: { label: '도트 그림으로 보기' },
    chips: { label: '상태칩 자리', options: [{ value: 'below', label: '이름표 아래' }, { value: 'right', label: '캐릭터 오른쪽' }, { value: 'left', label: '캐릭터 왼쪽' }] },
  },
} satisfies SettingsDecl;

export type CoreSettings = z.infer<typeof coreSettings.schema>;

const defaults = coreSettings.schema.parse({});
const noSubscribe = () => () => {};

/** 스테이지가 코어 설정을 읽는다. 코어 ctx가 없으면 기본값 */
export function useCoreSettings(core: CoreRuntime): CoreSettings {
  const s = core.ctxs.get('core')?.ctx.settings;
  return useSyncExternalStore(s?.onChange ?? noSubscribe, () => s?.get<CoreSettings>() ?? defaults);
}
