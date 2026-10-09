import type { Ctx } from '@core/types';

/** 패널 창 문서 안에서 내려받기 링크를 눌러 저장 창을 띄운다. 서버에는 올리지 않는다 */
export function download(ctx: Ctx, doc: Document, blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(doc.createElement('a'), { href: url, download: name });
  doc.body.append(a);
  a.click();
  a.remove();
  ctx.timers.at(60_000, () => URL.revokeObjectURL(url));
}
