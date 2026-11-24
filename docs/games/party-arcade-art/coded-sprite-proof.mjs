/**
 * Proof that party-game characters can be pixel art written as code.
 *
 * Each sprite frame is a grid of letters. Each letter names a colour role.
 * One sprite therefore serves all 16 players: only the scarf colour changes.
 * No image file and no image generator is used. Run:
 *
 *   node docs/games/party-arcade-art/coded-sprite-proof.mjs
 *
 * It writes coded-sprite-proof.png beside this file (no dependencies).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SPRITE_SIZE = 16;

// Letters: o outline, e ear, f fur, b belly, s scarf, k eye, n nose, t tail, . transparent
const BODY_ROWS = [
  '................',
  '...oo....oo.....',
  '..oeeo..oeeo....',
  '..oeeeooeeeo....',
  '..oeefffffeo....',
  '...offffffffo...',
  '..offfkfffkfo...',
  '..offffffffnno..',
  '..ofbbbbbbffo...',
  '..ossssssssso...',
  '...osssssssoso..',
  '..offbbbbffoso..',
  't.offbbbbffo.o..',
  'ttoffbbbbffo....',
];

// A frame is the shared body plus two rows of legs. A run cycle only moves the legs
// and bobs the body, so the character cannot drift between frames.
const LEG_ROWS = {
  stand: ['..ooffooffoo....', '...oo..oo.......'],
  stepA: ['..offo..offoo...', '..oo......oo....'],
  stepB: ['...ooffooffo....', '....oo.oo.......'],
  tuck: ['...oooooooo.....', '................'],
};

const FRAMES = [
  { name: 'stand', legs: 'stand', bob: 0 },
  { name: 'run 1', legs: 'stepA', bob: 0 },
  { name: 'run 2', legs: 'stand', bob: 1 },
  { name: 'run 3', legs: 'stepB', bob: 0 },
  { name: 'jump', legs: 'tuck', bob: -1 },
];

const SHARED_COLOURS = {
  o: [58, 42, 34],
  e: [240, 160, 160],
  f: [196, 176, 150],
  b: [246, 236, 214],
  k: [30, 24, 22],
  n: [226, 120, 130],
  t: [226, 150, 150],
};

// Sixteen scarf colours, one per player.
const SCARF_COLOURS = [
  [38, 150, 140], [226, 96, 96], [240, 180, 50], [96, 120, 220],
  [150, 96, 200], [110, 180, 80], [240, 130, 50], [230, 110, 170],
  [60, 180, 220], [150, 110, 70], [200, 60, 60], [40, 110, 90],
  [250, 220, 120], [120, 120, 130], [90, 60, 150], [255, 255, 255],
];

function frameRows(frame) {
  const rows = [...BODY_ROWS, ...LEG_ROWS[frame.legs]];
  const empty = '.'.repeat(SPRITE_SIZE);
  if (frame.bob > 0) return [empty, ...rows.slice(0, SPRITE_SIZE - 1)];
  if (frame.bob < 0) return [...rows.slice(1), empty];
  return rows;
}

function drawSheet(scale) {
  const playersPerRow = 2;
  const cell = SPRITE_SIZE * scale;
  const width = cell * FRAMES.length * playersPerRow;
  const height = cell * (SCARF_COLOURS.length / playersPerRow);
  const background = [245, 236, 220];
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) pixels.set(background, i * 3);

  SCARF_COLOURS.forEach((scarf, player) => {
    const colours = { ...SHARED_COLOURS, s: scarf };
    const originY = Math.floor(player / playersPerRow) * cell;
    FRAMES.forEach((frame, frameIndex) => {
      const originX = ((player % playersPerRow) * FRAMES.length + frameIndex) * cell;
      frameRows(frame).forEach((row, y) => {
        [...row].forEach((letter, x) => {
          const colour = colours[letter];
          if (!colour) return;
          for (let dy = 0; dy < scale; dy += 1) {
            for (let dx = 0; dx < scale; dx += 1) {
              pixels.set(colour, ((originY + y * scale + dy) * width + originX + x * scale + dx) * 3);
            }
          }
        });
      });
    });
  });
  return { width, height, pixels };
}

// Minimal PNG writer (8-bit RGB) so that the proof needs no packages.
function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function encodePng({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits per channel, RGB
  const rowLength = width * 3;
  const scanlines = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y += 1) {
    pixels.copy(scanlines, y * (rowLength + 1) + 1, y * rowLength, (y + 1) * rowLength);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const output = fileURLToPath(new URL('./coded-sprite-proof.png', import.meta.url));
writeFileSync(output, encodePng(drawSheet(6)));
console.log(output);
