import { createElement } from 'react';
import { z } from 'zod';
import { defineModule } from '@core/types';
import { SERVER_TIME } from '@shared/constants';
import type {} from '@modules/home/api';
import ReportTab, { TEXT_MAX } from './ui/ReportTab';

/** 웹훅 주소와 켜짐을 메인에 다시 알리는 간격. 서버 조정값은 setup 뒤에 늦게 올 수 있다 */
const CONFIG_MS = 10 * 60_000;

// 버그 제보 (OPS-03). 마이홈 [버그제보] 탭에서 보낸 글은 본인과 선물하는 사람의 스크립트(scripts/ops.ts reports)만 읽고 디스코드 웹훅이 있으면 그 채널에도 간다.
// 저장소가 공개라서 GitHub 이슈 같은 공개 창구 대신 이 기록을 쓴다.
// 자동 오류 보고 (NFR-21)는 메인이 모아 웹훅에 올리고 이 모듈이 같은 기록에 [자동 오류 보고] 글로 남긴다
export default defineModule({
  id: 'report',
  title: '버그 제보',
  version: '0.1.0',
  specIds: ['OPS-03', 'NFR-21'],
  requires: ['home'],
  settings: {
    version: 1,
    scope: 'device',
    schema: z.object({ autoReport: z.boolean().default(true) }),
    fields: { autoReport: { label: '오류가 나면 자동으로 알리기', widget: 'toggle' } },
  },
  server: {
    version: 1,
    collections: {
      r: { scope: 'user', schema: z.object({ text: z.string().min(1).max(TEXT_MAX), ver: z.string().max(20), at: z.number(), v: z.literal(1) }), template: 'appendOnly' },
    },
  },
  // 선물하는 사람이 scripts/ops.ts tunable report webhook으로 디스코드 웹훅 주소를 넣으면 제보를 그 채널에도 올린다. 주소는 저장소에 두지 않는다
  tunables: { webhook: { schema: z.string().max(300), default: '' } },
  setup(ctx) {
    ctx.modules.get('home')!.addTab({ id: 'report', label: '버그제보', order: 40, component: () => createElement(ReportTab, { ctx }) });

    // 메인이 렌더러 없이도 보낼 수 있게 웹훅 주소와 켜짐을 알린다
    const config = () =>
      void ctx.crash
        .config({ hook: ctx.tunables.get<string>('webhook'), enabled: ctx.settings.get<{ autoReport: boolean }>().autoReport })
        .catch((e: Error) => ctx.log.warn(`오류 보고 설정 알리기 실패: ${e.message}`));
    config();
    ctx.settings.onChange(config);
    ctx.timers.every(CONFIG_MS, config);

    // 메인이 들고 있는 보고를 제보 기록으로 남기고 남긴 것만 뺀다
    const record = async () => {
      const list = await ctx.crash.pending();
      for (const [i, p] of list.entries()) {
        await ctx.server.user(['r']).set(String(ctx.clock.serverNow() + i), { text: p.text.slice(0, TEXT_MAX), ver: ctx.app.version, at: SERVER_TIME, v: 1 });
        await ctx.crash.ack([p.id]);
      }
    };
    const sync = () => void record().catch((e: Error) => ctx.log.warn(`자동 오류 보고 기록 실패: ${e.message}`));
    sync();
    ctx.crash.onAdded(sync);
  },
});
