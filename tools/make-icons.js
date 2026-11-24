// Draws the Ironday app icons (a white dumbbell on a mint-to-blue gradient) as PNGs.
// No dependencies: run `node tools/make-icons.js` from the project folder.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const C1 = [43, 199, 155], C2 = [31, 163, 131], C3 = [108, 140, 245];
function bg(u, v) { const t = (u + v) / 2; return t < 0.5 ? mix(C1, C2, t * 2) : mix(C2, C3, (t - 0.5) * 2); }
function inRoundRect(u, v, x0, y0, x1, y1, r) {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = Math.min(Math.max(u, x0 + r), x1 - r), cy = Math.min(Math.max(v, y0 + r), y1 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}
// dumbbell in unit space, scaled about the centre by k (smaller for maskable safe zone)
function dumbbell(u, v, k) {
  const U = 0.5 + (u - 0.5) / k, V = 0.5 + (v - 0.5) / k;
  return inRoundRect(U, V, 0.27, 0.465, 0.73, 0.535, 0.03) ||
    inRoundRect(U, V, 0.23, 0.30, 0.33, 0.70, 0.04) || inRoundRect(U, V, 0.67, 0.30, 0.77, 0.70, 0.04) ||
    inRoundRect(U, V, 0.15, 0.37, 0.235, 0.63, 0.035) || inRoundRect(U, V, 0.765, 0.37, 0.85, 0.63, 0.035);
}
function draw(size, { rounded, k }) {
  const out = Buffer.alloc(size * size * 4), SS = 3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
      if (rounded && !inRoundRect(u, v, 0, 0, 1, 1, 0.22)) continue;
      const c = dumbbell(u, v, k) ? [255, 255, 255] : bg(u, v);
      r += c[0]; g += c[1]; b += c[2]; a += 255;
    }
    const n = SS * SS, i = (y * size + x) * 4, cov = a / n / 255;
    out[i] = cov ? r / (a / 255) : 0; out[i + 1] = cov ? g / (a / 255) : 0; out[i + 2] = cov ? b / (a / 255) : 0; out[i + 3] = a / n;
  }
  return png(size, out);
}
const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
const jobs = [
  ['icon-192.png', 192, { rounded: true, k: 1 }],
  ['icon-512.png', 512, { rounded: true, k: 1 }],
  ['icon-maskable-512.png', 512, { rounded: false, k: 0.72 }],
  ['apple-touch-icon.png', 180, { rounded: false, k: 0.9 }]
];
for (const [name, size, opt] of jobs) { fs.writeFileSync(path.join(dir, name), draw(size, opt)); console.log('wrote', name); }

// Android launcher icons for the app in android/
const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  const d = path.join(res, 'mipmap-' + density);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'ic_launcher.png'), draw(size, { rounded: true, k: 1 }));
  console.log('wrote mipmap-' + density);
}
