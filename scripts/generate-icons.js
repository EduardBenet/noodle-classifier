// Generates the PWA launcher icons.
//
// Android will not accept the inline SVG-emoji favicon the site uses in the
// browser tab, so the launcher needs real PNGs. Rather than commit binaries
// nobody can regenerate, the art is drawn here from geometry and encoded with
// nothing but Node's own zlib — no image library, no build-time dependency.
//
//   node scripts/generate-icons.js
//
// Shapes are evaluated per pixel in painter order at 4x and box-downsampled,
// which is what gives the curves their antialiasing.

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SS = 4;  // supersampling factor

/* ========== PNG encoding ========== */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// 8-bit RGBA, no interlacing. Each scanline is prefixed with filter type 0
// (None) — the art is flat colour over few gradients, so a smarter filter
// would buy very little and cost clarity here.
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ========== The art ========== */

const BROWN = [0x8a, 0x6a, 0x4a];
const CREAM = [0xfd, 0xf9, 0xf4];
const BROTH = [0x6d, 0x52, 0x38];

const inEllipse = (x, y, cx, cy, rx, ry) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// Near-vertical wavy stroke, used for the steam. Horizontal distance to the
// curve is a good enough stand-in for true distance at this angle.
function inSteam(x, y, cx, amp, phase, y0, y1, halfWidth) {
  if (y < y0 || y > y1) return false;
  const t = (y - y0) / (y1 - y0);
  return Math.abs(x - (cx + amp * Math.sin(t * Math.PI * 2 + phase))) <= halfWidth;
}

// `scale` shrinks the art about the centre for the maskable variant, whose
// outer ~20% may be cropped away by the launcher's mask.
function colourAt(x, y, scale) {
  const sx = (x - 0.5) / scale + 0.5;
  const sy = (y - 0.5) / scale + 0.5;

  // Painter order, front to back.
  if (inEllipse(sx, sy, 0.5, 0.5, 0.26, 0.042)) return BROTH;          // broth
  if (inEllipse(sx, sy, 0.5, 0.5, 0.34, 0.062)) return CREAM;          // bowl lip
  if (sy >= 0.5 && inEllipse(sx, sy, 0.5, 0.5, 0.30, 0.30)) return CREAM; // bowl body
  if (inSteam(sx, sy, 0.38, 0.035, 0.0, 0.14, 0.40, 0.022)) return CREAM;
  if (inSteam(sx, sy, 0.50, 0.035, 2.1, 0.10, 0.40, 0.022)) return CREAM;
  if (inSteam(sx, sy, 0.62, 0.035, 4.2, 0.14, 0.40, 0.022)) return CREAM;
  return BROWN;
}

function render(size, scale) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colourAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, scale);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = 255;  // opaque: a maskable icon must fill its whole canvas
    }
  }
  return encodePng(size, size, out);
}

const dir = path.join(__dirname, '..', 'src', 'assets', 'icons');
fs.mkdirSync(dir, { recursive: true });

for (const [file, size, scale] of [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.72]
]) {
  const png = render(size, scale);
  fs.writeFileSync(path.join(dir, file), png);
  console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
