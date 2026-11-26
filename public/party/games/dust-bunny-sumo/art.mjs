import { compileSprite, drawSprite } from '../../kit/sprites.mjs';
import { compileStack, drawStack } from '../../kit/stack.mjs';
import { LOOKS } from '../../looks.mjs';

export const INK = '#251e28';
export const CREAM = '#fff1d6';
export const GOLD = '#ffd782';

// Plan views face east. Raised ears sit behind the eyes and nose.
const feet = ['.........', '....pp...', '....pp...', '.........', '.........', '....pp...', '....pp...', '.........', '.........'];
const belly = ['.........', '...fff...', '..fffff..', '.ffffff..', '.ffffff..', '.fffffff.', '..fffff..', '...fff...', '.........'];
const fleece = ['...fff...', '..hffff..', '.hhfffff.', 'ffhfffff.', '.fffffff.', 'ffffffhff', '.fffffhh.', '..fffff..', '...ff....'];
const scarf = fleece.map(row => row.replace(/[fh]/g, 's'));
const head = ['.........', '...fff...', '..ffffk..', '.ffffffm.', '..fffffmn', '.ffffffm.', '..ffffk..', '...fff...', '.........'];
const ears = ['.........', '..pp.....', '..pe.....', '.........', '.........', '.........', '..pe.....', '..pp.....', '.........'];
const tips = ears.map(row => row.replaceAll('e', 'p'));
const layers = [feet, feet, belly, fleece, fleece, scarf, scarf, head, head, ears, ears, tips];
export const BUNNY_SIZE = { width: 13, height: 19 };
const FUR = { p: '#efdbc8', e: '#e69bab', f: '#d4c4d6', h: '#ffeddc', m: '#fff0db', n: '#da8197', k: INK };

const LALA = [
  '.....oo.........oo....',
  '....owfo.......ofwo...',
  '....offfooooooofffo...',
  '....odfffdffdfffdo....',
  '...offffdffffdfffo....',
  '...offfffffffffffo....',
  '...offkfffffkffffo....',
  '...ofwfwfnwfwfffo.....',
  '....owwwwwwwfffo......',
  '.....oowwwwoooo.......',
  '....offfffffofo..oo...',
  '...offdfffdffofooffo..',
  '..offfffffffdofffo....',
  '..owffwfffffdoooo.....',
  '...ooowwooooo.........',
];
const LALA_PALETTE = { o: INK, f: '#f19a53', d: '#b95b43', w: '#fff0d0',
  k: '#251b27', n: '#e38285' };

function changedRow(rows, index, value) {
  return rows.map((row, rowIndex) => rowIndex === index ? value : row);
}

export function createSumoArt(document) {
  const sprites = LOOKS.map(look => {
    const palette = { ...FUR, s: look.colour };
    return {
      awake: compileStack(document, layers, palette),
      blink: compileStack(document, layers, { ...palette, k: palette.f }),
    };
  });
  const cats = [
    compileSprite(document, LALA, LALA_PALETTE),
    compileSprite(document, changedRow(LALA, 6, '...offdfffffdffffo....'), LALA_PALETTE),
    compileSprite(document, [...LALA.slice(0, 13), '..owffwfffffdoooo.....', '.ooww.ooooooo.........'], LALA_PALETTE),
    compileSprite(document, changedRow(LALA, 8, '....owwwwkwwwffo......'), LALA_PALETTE),
  ];
  return {
    bunny(context, look, pose, x, y, scale, squash, angle) {
      context.save();
      context.translate(x, y);
      context.scale(1.32 + squash * .07, 1 - squash * .06);
      const lift = pose === 2 ? -scale : 0;
      drawStack(context, pose === 1 ? sprites[look].blink : sprites[look].awake, 0, lift, { angle, scale, sliceGap: 1.05 });
      context.restore();
    },
    lala(context, pose, x, y, scale) {
      drawSprite(context, cats[pose], x, y, scale);
    },
  };
}

function surface(document, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function makeFloor(document, width, height, x, y) {
  const floor = surface(document, width, height);
  const context = floor.getContext('2d');
  const planks = ['#51374a', '#59394b', '#5e3d4d', '#543849', '#603f50', '#503546'];
  for (let index = 0; index * 82 - 17 < height; index++) {
    const y = index * 82 - 17;
    context.fillStyle = planks[index % planks.length];
    context.fillRect(0, y, width, 82);
    context.fillStyle = '#402b3d';
    context.fillRect(0, y + 79, width, 3);
    context.fillStyle = '#7d5264';
    context.fillRect(0, y, width, 2);
    context.strokeStyle = '#f6b78418';
    context.lineWidth = 2;
    context.beginPath();
    for (let mark = 0; mark < 31; mark++) {
      const x = (mark * 137 + index * 59) % width;
      const grain = y + 13 + ((mark * 37) % 64);
      context.moveTo(x, grain);
      context.bezierCurveTo(x + 22, grain + 6, x + 41, grain - 3, x + 77, grain);
    }
    context.stroke();
    context.fillStyle = '#362739';
    context.fillRect((index * 347 + 583) % width, y + 2, 3, 77);
  }
  const light = context.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * .58);
  light.addColorStop(0, '#ffce9424');
  light.addColorStop(.30, '#281d2a00');
  light.addColorStop(1, '#1c1428de');
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);
  return floor;
}

function disc(context, x, y, radius, colour) {
  context.fillStyle = colour;
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fill();
}

const WEAVE = ['#478474', '#478273', '#417c6d', '#478473', '#4b8774', '#44806e'];
const BORDER = ['#ae7059', '#e3ae76', '#774f50', '#d69963'];

export function makeRug(document, radius) {
  const centre = Math.ceil(radius + 24);
  const rug = surface(document, 2 * centre, 2 * centre);
  const context = rug.getContext('2d');
  context.translate(centre, centre);
  disc(context, 0, 12, radius + 7, '#211a28b8');
  for (const [index, colour] of ['#543a44', '#af7258', '#65454b', '#cb9366'].entries()) {
    disc(context, 0, 12 - 3 * index, radius + 1, colour);
  }
  const rim = radius - 3;
  context.strokeStyle = '#e0a568';
  context.lineWidth = 3;
  context.beginPath();
  const count = Math.ceil(2 * Math.PI * rim / 9);
  for (let index = 0; index < count; index++) {
    const angle = index * 2 * Math.PI / count;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    context.moveTo(rim * x, rim * y);
    context.lineTo((rim + 9 + index % 4) * x - 3 * y, (rim + 9 + index % 4) * y + 3 * x);
  }
  context.stroke();
  disc(context, 0, 0, radius + 1, '#322635');
  for (let ring = 0, r = radius - 3; r > 3; ring++, r -= 7) {
    disc(context, 0, 0, r, ring < 4 ? BORDER[ring] : WEAVE[ring % WEAVE.length]);
    context.strokeStyle = ring < 4 ? '#7e4f465e' : '#d1d7a02b';
    context.lineWidth = 1.5;
    context.beginPath();
    const stitches = Math.ceil(2 * Math.PI * r / 7);
    for (let i = 0; i < stitches; i++) {
      const angle = (i + ring % 2 / 2) * 2 * Math.PI / stitches;
      context.moveTo((r - 6) * Math.cos(angle - .006), (r - 6) * Math.sin(angle - .006));
      context.lineTo((r - 1) * Math.cos(angle + .005), (r - 1) * Math.sin(angle + .005));
    }
    context.stroke();
  }
  if (radius > 26) {
    context.lineWidth = 2;
    context.strokeStyle = '#f9d790a8';
    context.beginPath();
    context.moveTo(0, -16);
    context.lineTo(14, 0);
    context.lineTo(0, 16);
    context.lineTo(-14, 0);
    context.closePath();
    context.stroke();
    disc(context, 0, 0, 3, GOLD);
  }
  return rug;
}
