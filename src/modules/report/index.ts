import { createElement } from 'react';
import { z } from 'zod';
import { defineModule } from '@core/types';
import type {} from '@modules/home/api';
import ReportTab, { TEXT_MAX } from './ui/ReportTab';

// 버그 제보 (OPS-03). 마이홈 [버그제보] 탭에서 보낸 글은 본인과 선물하는 사람의 스크립트(scripts/ops.ts reports)만 읽는다.
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
  setup(ctx) {
    ctx.modules.get('home')!.addTab({ id: 'report', label: '버그제보', order: 40, component: () => createElement(ReportTab, { ctx }) });
  },
});
