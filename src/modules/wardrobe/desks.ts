// 기본 책상 그림. 외부 에셋 없이 코드로 그린 자체 제작 그림이다 (AVT-11, assets.json).
// 좌석(160x200)과 같은 4:5 캔버스 아래쪽에 그려서 자세 그림처럼 맞추면 캐릭터 아랫몸 앞에 놓인다.
type G = OffscreenCanvasRenderingContext2D;

const INK = '#4a3b47';

function shape(g: G, fill: string, path: () => void) {
  g.beginPath();
  path();
  g.fillStyle = fill;
  g.fill();
  g.stroke();
}

// ponytail: 올린 해시를 로컬에 캐시하므로 그림을 고치면 id도 바꾼다. 자주 고치게 되면 캐시 키에 판 번호를 넣는다
export const DESKS: Array<{ id: string; label: string; draw: (g: G) => void }> = [
  {
    id: 'wardrobe.desk.wood',
    label: '나무 책상',
    draw: (g) => {
      shape(g, '#b9814a', () => g.rect(14, 160, 132, 42));
      shape(g, '#d9a066', () => g.roundRect(6, 148, 148, 12, 4));
      shape(g, '#d9a066', () => g.roundRect(94, 170, 40, 16, 3));
      shape(g, INK, () => g.arc(114, 178, 2, 0, Math.PI * 2));
    },
  },
  {
    id: 'wardrobe.desk.white',
    label: '하얀 책상',
    draw: (g) => {
      shape(g, '#c4c8cf', () => g.rect(14, 158, 7, 44));
      shape(g, '#c4c8cf', () => g.rect(139, 158, 7, 44));
      shape(g, '#f7f7f4', () => g.roundRect(4, 150, 152, 9, 3));
    },
  },
  {
    id: 'wardrobe.desk.table',
    label: '작은 탁자',
    draw: (g) => {
      shape(g, '#9ccbb3', () => g.rect(74, 160, 12, 36));
      shape(g, '#9ccbb3', () => g.ellipse(80, 196, 26, 3.5, 0, 0, Math.PI * 2));
      shape(g, '#bfe3d0', () => g.ellipse(80, 156, 60, 8, 0, 0, Math.PI * 2));
    },
  },
  { id: 'wardrobe.desk.bench2', label: '2인 벤치', draw: (g) => bench(g, '#c98f55', '#a8743f') },
  { id: 'wardrobe.desk.bench3', label: '3인 벤치', draw: (g) => bench(g, '#9ccbb3', '#7fae97') },
];

/** 여럿이 앉는 벤치 (AVT-21). 벤치에 앉은 좌석이 이 그림을 겹쳐 그리므로 판은 칸 끝까지 닿고 세로 테두리를 긋지 않는다 */
function bench(g: G, top: string, side: string) {
  shape(g, side, () => g.rect(18, 166, 9, 36));
  shape(g, side, () => g.rect(133, 166, 9, 36));
  g.fillStyle = side;
  g.fillRect(0, 160, 160, 8);
  g.fillStyle = top;
  g.fillRect(0, 150, 160, 10);
  for (const y of [150, 168]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(160, y);
    g.stroke();
  }
}

/** 160x200 좌표로 그리고 두 배 해상도 PNG로 굽는다 */
export async function deskPng(id: string): Promise<Uint8Array> {
  const c = new OffscreenCanvas(320, 400);
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  DESKS.find((d) => d.id === id)?.draw(g);
  return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
