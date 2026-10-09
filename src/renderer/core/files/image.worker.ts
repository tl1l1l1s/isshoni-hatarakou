// 그림 줄이기 (10.5 모듈 규칙 7: 50ms 넘을 수 있는 작업은 Web Worker에서)
// 긴 변을 maxSide부터 줄여 가며 PNG, 그다음 WebP 품질을 낮춰 maxBytes 안에 드는 첫 결과를 돌려준다.
interface Req { id: number; bytes: Uint8Array; maxSide: number; maxBytes: number }

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, bytes, maxSide, maxBytes } = e.data;
  try {
    const src = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]));
    for (const side of [maxSide, Math.round(maxSide * 0.8), Math.round(maxSide * 0.6)]) {
      const s = Math.min(1, side / Math.max(src.width, src.height));
      const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, w, h);
      for (const [type, quality] of [['image/png', undefined], ['image/webp', 0.92], ['image/webp', 0.8]] as const) {
        const out = new Uint8Array(await (await c.convertToBlob({ type, quality })).arrayBuffer());
        if (out.byteLength <= maxBytes) return postMessage({ id, bytes: out }, { transfer: [out.buffer] });
      }
    }
    postMessage({ id, error: '그림이 너무 복잡해서 64KB 안으로 줄이지 못했습니다. 더 작거나 단순한 그림을 넣어 주세요.' });
  } catch {
    postMessage({ id, error: '그림 파일을 읽지 못했습니다. PNG, WebP, GIF, JPG 파일인지 확인해 주세요.' });
  }
};
