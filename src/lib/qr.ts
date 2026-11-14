/**
 * Minimal QR encoder for bin stickers: byte mode, version 3, error correction M (up to 42 bytes),
 * mask 2. Enough for https://swachhgrid.vercel.app/bin?id=G101 and keeps the app dependency-free.
 */
const SIZE = 29;
const DATA_CW = 44;
const EC_CW = 26;

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function ecc(data: number[]): number[] {
  let gen = [1];
  for (let i = 0; i < EC_CW; i++) {
    const ng = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((g, j) => {
      ng[j] ^= g;
      ng[j + 1] ^= gmul(g, EXP[i]);
    });
    gen = ng;
  }
  let rem = new Array<number>(EC_CW).fill(0);
  for (const d of data) {
    const f = d ^ rem[0];
    rem = [...rem.slice(1), 0];
    for (let j = 0; j < EC_CW; j++) rem[j] ^= gmul(gen[j + 1], f);
  }
  return rem;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 42) throw new Error("QR text too long");
  const bits: number[] = [0, 1, 0, 0];
  const push = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  for (let i = 0; i < 4 && bits.length < DATA_CW * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let k = 0; data.length < DATA_CW; k++) data.push(k % 2 ? 0x11 : 0xec);
  const cw = [...data, ...ecc(data)];

  const m = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const fn = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const set = (x: number, y: number, v: boolean) => {
    m[y][x] = v;
    fn[y][x] = true;
  };
  for (let i = 0; i < SIZE; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(SIZE - 4, 3);
  finder(3, SIZE - 4);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(22 + dx, 22 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);

  const mask = 2;
  let rem = mask; // EC level M = 00
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const fb = ((mask << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((fb >> i) & 1) === 1;
  for (let i = 0; i < 6; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(SIZE - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, SIZE - 15 + i, bit(i));
  set(8, SIZE - 8, true);

  let i = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < SIZE; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? SIZE - 1 - vert : vert;
        if (!fn[y][x] && i < cw.length * 8) {
          m[y][x] = ((cw[i >> 3] >> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!fn[y][x] && x % 3 === 0) m[y][x] = !m[y][x];
  return m;
}

/** An SVG path string for the dark modules, with a 4-module quiet zone. */
export function qrPath(text: string): { d: string; size: number } {
  const m = qrMatrix(text);
  let d = "";
  m.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x + 4} ${y + 4}h1v1h-1z`)));
  return { d, size: SIZE + 8 };
}
