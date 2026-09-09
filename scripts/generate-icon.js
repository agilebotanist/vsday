/* eslint-env node */
/**
 * Generates media/icon.png — the Marketplace / tab icon.
 *
 * Written as pure Node (zlib + a hand-rolled PNG writer) so the repo needs no image
 * dependency and CI can regenerate the icon deterministically. The mark is a warm-dark
 * rounded square holding a split disc: light left half, amber right half — day and night
 * in one glyph, still legible at 16px.
 *
 * Usage: node scripts/generate-icon.js [size]
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = Number(process.argv[2] ?? 256);
const SUPERSAMPLE = 4;
const OUTPUT = path.join(__dirname, '..', 'media', 'icon.png');

const BACKGROUND = [0x22, 0x20, 0x1d, 0xff];
const DAY = [0xf7, 0xef, 0xdc, 0xff];
const NIGHT = [0xe8, 0xa3, 0x3d, 0xff];
const TRANSPARENT = [0, 0, 0, 0];

/**
 * Whether a point falls inside a rounded rectangle centred on the canvas.
 *
 * The standard rounded-box distance: measure how far the point is past the inner box on
 * each axis, clamp those overshoots at zero, and compare their length to the radius. The
 * clamping is what keeps a point beyond one edge but level with the middle on the other
 * axis inside the shape.
 */
function insideRoundedRect(x, y, size, radius) {
  const half = size / 2;
  const dx = Math.max(Math.abs(x - half) - (half - radius), 0);
  const dy = Math.max(Math.abs(y - half) - (half - radius), 0);
  return Math.hypot(dx, dy) <= radius;
}

function colorAt(x, y) {
  const radius = SIZE * 0.18;
  if (!insideRoundedRect(x, y, SIZE, radius)) {
    return TRANSPARENT;
  }

  const centre = SIZE / 2;
  const discRadius = SIZE * 0.3;
  const distance = Math.hypot(x - centre, y - centre);

  if (distance <= discRadius) {
    // A hairline gutter down the middle keeps the two halves distinct when the icon is
    // scaled down to a 16px tab favicon.
    if (Math.abs(x - centre) < SIZE * 0.012) {
      return BACKGROUND;
    }
    return x < centre ? DAY : NIGHT;
  }

  return BACKGROUND;
}

function renderPixels() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const [cr, cg, cb, ca] = colorAt(
            x + (sx + 0.5) / SUPERSAMPLE,
            y + (sy + 0.5) / SUPERSAMPLE
          );
          const weight = ca / 255;
          r += cr * weight;
          g += cg * weight;
          b += cb * weight;
          a += ca;
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const coverage = a / (samples * 255);
      const offset = (y * SIZE + x) * 4;
      pixels[offset] = coverage === 0 ? 0 : Math.round(r / (samples * coverage));
      pixels[offset + 1] = coverage === 0 ? 0 : Math.round(g / (samples * coverage));
      pixels[offset + 2] = coverage === 0 ? 0 : Math.round(b / (samples * coverage));
      pixels[offset + 3] = Math.round(a / samples);
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte (0 = none) per scanline.
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * (SIZE * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, encodePng(renderPixels()));
console.log(`Wrote ${OUTPUT} (${SIZE}x${SIZE})`);
