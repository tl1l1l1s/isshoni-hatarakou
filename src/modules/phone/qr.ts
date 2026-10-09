// 연결 링크 QR 코드 (FOC-09). 바이트 모드, 오류 정정 L, 버전 1부터 5까지만 만든다.
// 이 범위는 블록이 하나이고 버전 정보 칸이 없어서 짧게 끝난다. 버전 5에 106바이트까지 담는다
// ponytail: 버전 5까지만. 링크가 106바이트를 넘으면 null이고 그때는 버전 표와 블록 나누기를 더한다

const DATA = [19, 34, 55, 80, 108];
const ECC = [7, 10, 15, 20, 26];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++, x = (x << 1) ^ (x & 0x80 ? 0x11d : 0)) [EXP[i], LOG[x]] = [x, i];
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a]! + LOG[b]!]! : 0);

/** 리드 솔로몬 오류 정정 코드워드 n개 */
export function rs(data: number[], n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    g.forEach((c, j) => {
      next[j]! ^= c;
      next[j + 1]! ^= mul(c, EXP[i]!);
    });
    g = next;
  }
  const r = new Array<number>(n).fill(0);
  for (const d of data) {
    const f = d ^ r.shift()!;
    r.push(0);
    for (let j = 0; j < n; j++) r[j]! ^= mul(g[j + 1]!, f);
  }
  return r;
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** 어두운 칸이 true인 정사각 행렬 [y][x]. 담지 못하면 null */
export function qr(text: string): boolean[][] | null {
  const bytes = new TextEncoder().encode(text);
  const v = DATA.findIndex((d) => bytes.length <= d - 2) + 1;
  if (!v) return null;
  const cap = DATA[v - 1]!;
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
  const words = [...data, ...rs(data, ECC[v - 1]!)];

  const size = 17 + 4 * v;
  const grid = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const m = grid();
  const fn = grid();
  const set = (x: number, y: number, dark: boolean) => {
    m[y]![x] = dark;
    fn[y]![x] = true;
  };
  // 찾기 무늬 셋과 둘레 빈 줄
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const [x, y, d] = [cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy))];
        if (x >= 0 && y >= 0 && x < size && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  if (v >= 2) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(size - 7 + dx, size - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  // 형식 정보 자리는 마스크를 고른 뒤 채운다
  const format = (mask: number, g: boolean[][]) => {
    const d = (1 << 3) | mask;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const f = ((d << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    const at = (x: number, y: number, b: boolean) => {
      g[y]![x] = b;
      fn[y]![x] = true;
    };
    for (let i = 0; i <= 5; i++) at(8, i, bit(i));
    at(8, 7, bit(6));
    at(8, 8, bit(7));
    at(7, 8, bit(8));
    for (let i = 9; i < 15; i++) at(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) at(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) at(8, size - 15 + i, bit(i));
    at(8, size - 8, true);
  };
  format(0, m);

  // 오른쪽 아래부터 두 칸씩 지그재그로 채운다
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < size; k++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - k : k;
        if (fn[y]![x] || i >= words.length * 8) continue;
        m[y]![x] = ((words[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }

  let best: boolean[][] = m;
  let score = Infinity;
  MASKS.forEach((mask, n) => {
    const g = m.map((row, y) => row.map((c, x) => (fn[y]![x] ? c : c !== mask(x, y))));
    format(n, g);
    const p = penalty(g);
    if (p < score) [best, score] = [g, p];
  });
  return best;
}

/** 마스크 고르기 점수 (규격의 네 규칙) */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let p = 0;
  let dark = 0;
  const lines = [...m.map((r) => r.map(Number).join('')), ...m.map((_, x) => m.map((r) => Number(r[x])).join(''))];
  for (const s of lines) {
    for (const run of s.match(/0{5,}|1{5,}/g) ?? []) p += run.length - 2;
    p += 40 * (s.match(/(?=10111010000|00001011101)/g)?.length ?? 0);
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = m[y]![x]!;
      dark += Number(c);
      if (x < n - 1 && y < n - 1 && c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) p += 3;
    }
  }
  return p + 10 * Math.floor(Math.abs((dark * 20) / (n * n) - 10));
}
