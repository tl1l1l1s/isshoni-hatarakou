import { createElement } from 'react';
import { z } from 'zod';
import { defineModule } from '@core/types';
import type {} from '@modules/home/api';
import ReportTab, { TEXT_MAX } from './ui/ReportTab';

// 버그 제보 (OPS-03). 마이홈 [버그제보] 탭에서 보낸 글은 본인과 선물하는 사람의 스크립트(scripts/ops.ts reports)만 읽고 디스코드 웹훅이 있으면 그 채널에도 간다.
// 저장소가 공개라서 GitHub 이슈 같은 공개 창구 대신 이 기록을 쓴다
export default defineModule({
  id: 'report',
  title: '버그 제보',
  version: '0.1.0',
  specIds: ['OPS-03'],
  requires: ['home'],
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
  },
});
