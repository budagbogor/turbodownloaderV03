import fs from "fs";
import path from "path";
import zlib from "zlib";

function crc32(buf) {
  let c = 0 ^ -1;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let curr = n;
    for (let k = 0; k < 8; k++) {
      curr = curr & 1 ? 0xedb88320 ^ (curr >>> 1) : curr >>> 1;
    }
    crcTable[n] = curr;
  }
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  const typeAndData = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

function createTdIconPng(size) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk("IHDR", ihdr);

  const rowSize = 1 + size * 4;
  const rawData = Buffer.alloc(size * rowSize);

  const center = size / 2;
  const radius = size / 2 - 1;

  // Bitmap for "TD" text + speed arrow logo at 32x32 resolution scale
  // T and D letters drawn on grid
  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;

    const ny = y / size; // 0 to 1

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const nx = x / size; // 0 to 1

      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Deep Indigo/Purple gradient background
        let r = Math.round(79 * (1 - ny) + 49 * ny);
        let g = Math.round(70 * (1 - ny) + 46 * ny);
        let b = Math.round(229 * (1 - ny) + 129 * ny);
        let a = 255;

        // Outer emerald ring border
        if (dist >= radius - 2) {
          r = 16; g = 185; b = 129; // Emerald green
        }

        // Draw "T D" logo glyphs in center
        // T bar: ny between 0.30 and 0.40, nx between 0.22 and 0.52
        // T stem: ny between 0.40 and 0.72, nx between 0.34 and 0.40
        const isTBar = ny >= 0.30 && ny <= 0.40 && nx >= 0.22 && nx <= 0.50;
        const isTStem = ny >= 0.40 && ny <= 0.72 && nx >= 0.33 && nx <= 0.39;

        // D stem: ny between 0.30 and 0.72, nx between 0.54 and 0.60
        // D top/bottom: nx 0.54 to 0.76 at top/bottom
        // D curve: dist from (0.60, 0.51)
        const isDStem = ny >= 0.30 && ny <= 0.72 && nx >= 0.54 && nx <= 0.60;
        const isDTop = ny >= 0.30 && ny <= 0.38 && nx >= 0.54 && nx <= 0.72;
        const isDBot = ny >= 0.64 && ny <= 0.72 && nx >= 0.54 && nx <= 0.72;
        const isDCurve = ny >= 0.34 && ny <= 0.68 && nx >= 0.68 && nx <= 0.76;

        // Lightning Bolt / Speed Arrow accent in emerald/gold
        // Arrow pointing down in the middle bottom
        const isArrow = ny >= 0.45 && ny <= 0.65 && (Math.abs(nx - 0.5) * 1.8 + ny * 0.4 <= 0.55) && ny >= (Math.abs(nx - 0.5) + 0.45);

        if (isTBar || isTStem || isDStem || isDTop || isDBot || isDCurve) {
          r = 255; g = 255; b = 255; // White TD text
        } else if (isArrow) {
          r = 16; g = 185; b = 129; // Emerald accent
        }

        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
        rawData[pxOffset + 3] = a;
      } else {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(process.cwd(), "extension", "icons");
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, "icon16.png"), createTdIconPng(16));
fs.writeFileSync(path.join(iconsDir, "icon48.png"), createTdIconPng(48));
fs.writeFileSync(path.join(iconsDir, "icon128.png"), createTdIconPng(128));

console.log("TD Logo PNG icons generated successfully!");
