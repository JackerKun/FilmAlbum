// Fixed QR version 3, error correction L, byte mode. ISO/IEC 18004 matrix layout.
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  if (bytes.length > 53) throw new Error('标签内容超过 53 字节');
  const bits = [];
  const push = (value, count) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(4, 4);
  push(bytes.length, 8);
  bytes.forEach((byte) => push(byte, 8));
  for (let i = 0; i < Math.min(4, 440 - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8)
    data.push(bits.slice(i, i + 8).reduce((n, b) => n * 2 + b, 0));
  let pad = 0;
  while (data.length < 55) data.push(pad++ % 2 === 0 ? 0xec : 0x11);
  const mul = (a, b) => {
    let n = 0;
    while (b) {
      if (b & 1) n ^= a;
      a <<= 1;
      if (a & 256) a ^= 0x11d;
      b >>= 1;
    }
    return n;
  };
  let gen = [1],
    root = 1;
  for (let i = 0; i < 15; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], root);
    }
    gen = next;
    root = mul(root, 2);
  }
  const ecc = new Array(15).fill(0);
  for (const byte of data) {
    const factor = byte ^ ecc.shift();
    ecc.push(0);
    for (let i = 0; i < 15; i++) ecc[i] ^= mul(gen[i + 1], factor);
  }
  const size = 29,
    m = Array.from({ length: size }, () => new Array(size).fill(false)),
    reserved = m.map((row) => row.map(() => false));
  const set = (x, y, value) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      m[y][x] = Boolean(value);
      reserved[y][x] = true;
    }
  };
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  for (let i = 8; i < size - 8; i++) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      set(22 + dx, 22 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  let fmt = 8 << 10;
  for (let i = 14; i >= 10; i--) if ((fmt >>> i) & 1) fmt ^= 0x537 << (i - 10);
  fmt = ((8 << 10) | fmt) ^ 0x5412;
  const fb = (i) => (fmt >>> i) & 1;
  for (let i = 0; i <= 5; i++) set(8, i, fb(i));
  set(8, 7, fb(6));
  set(8, 8, fb(7));
  set(7, 8, fb(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, fb(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, fb(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, fb(i));
  set(8, size - 8, true);
  const payload = [...data, ...ecc].flatMap((byte) =>
    Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1),
  );
  let at = 0,
    up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let i = 0; i < size; i++) {
      const y = up ? size - 1 - i : i;
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx;
        if (!reserved[y][x]) {
          m[y][x] = Boolean(payload[at++] || 0) !== ((x + y) % 2 === 0);
        }
      }
    }
    up = !up;
  }
  return m;
}
export function qrSvg(text) {
  const m = qrMatrix(text),
    path = m
      .flatMap((row, y) => row.flatMap((bit, x) => (bit ? [`M${x + 4},${y + 4}h1v1h-1z`] : [])))
      .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37" shape-rendering="crispEdges"><rect width="37" height="37" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
