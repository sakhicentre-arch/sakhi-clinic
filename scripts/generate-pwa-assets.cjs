const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return ~crc >>> 0;
}
const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[i] = c >>> 0;
}

function makePNG(width, height, pixelFn) {
  const header = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = chunk('IHDR', ihdr);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  const idatChunk = chunk('IDAT', idat);
  const iendChunk = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcData = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePNG(name, width, height, fn) {
  const buf = makePNG(width, height, fn);
  const filePath = path.join(__dirname, '..', 'public', 'img', 'icons', name);
  fs.writeFileSync(filePath, buf);
  console.log('wrote', name);
}

function iconFn(color, borderColor) {
  return (x, y, w, h) => {
    const dx = x - w / 2;
    const dy = y - h / 2;
    const inCircle = dx * dx + dy * dy < (w * 0.32) ** 2;
    const inPlus = (Math.abs(dx) < w * 0.08 && Math.abs(dy) < w * 0.32) ||
      (Math.abs(dy) < w * 0.08 && Math.abs(dx) < w * 0.32);
    if (inCircle || inPlus) return [255, 255, 255, 255];
    if (x < 12 || x >= w - 12 || y < 12 || y >= h - 12) return borderColor;
    return color;
  };
}

const dark = [15, 23, 42, 255];

writePNG('icon-192x192.png', 192, 192, iconFn(dark, [15, 23, 42, 255]));
writePNG('icon-512x512.png', 512, 512, iconFn(dark, [15, 23, 42, 255]));
writePNG('icon-192x192-maskable.png', 192, 192, (x, y, w, h) => {
  const safe = x > 28 && x < w - 28 && y > 28 && y < h - 28;
  if (!safe) return [0, 0, 0, 0];
  return iconFn(dark, [15, 23, 42, 255])(x, y, w, h);
});
writePNG('icon-512x512-maskable.png', 512, 512, (x, y, w, h) => {
  const safe = x > 75 && x < w - 75 && y > 75 && y < h - 75;
  if (!safe) return [0, 0, 0, 0];
  return iconFn(dark, [15, 23, 42, 255])(x, y, w, h);
});

const src = path.join(__dirname, '..', 'public', 'img', 'icons', 'icon-192x192.png');
const dst = path.join(__dirname, '..', 'public', 'apple-touch-icon.png');
fs.copyFileSync(src, dst);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), 'User-agent: *\nDisallow:\n');
console.log('wrote apple-touch-icon.png and robots.txt');
