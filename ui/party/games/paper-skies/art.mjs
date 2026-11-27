import { compileStack, drawStack } from '../../kit/stack.mjs';
import { LOOKS } from '../../looks.mjs';

const TURN = Math.PI * 2;
const ink = '#38445a';
export const scarf = look => (LOOKS[look] ?? LOOKS[0]).colour;

function oval(c, x, y, rx, ry, colour, angle = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, 0, TURN);
  c.fillStyle = colour;
  c.fill();
}
function paper(c, colour, points) {
  c.beginPath();
  c.moveTo(...points[0]);
  for (const point of points.slice(1)) c.lineTo(...point);
  c.closePath();
  c.fillStyle = colour;
  c.fill();
}
function arc(c, x, y, rx, ry, angle, start, end, colour, width) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, start, end);
  c.strokeStyle = colour;
  c.lineWidth = width;
  c.stroke();
}

// Mirror a half-footprint across the longitudinal centreline (nose faces east).
function mirror(rows, width = 21) {
  const full = [...rows, ...rows.slice(0, -1).reverse()];
  return full.map(row => row.padEnd(width, '.'));
}

// 9-slice 3D folded paper plane (21x17): deep folded keel -> shaded underside -> wide coloured wings -> raised crest.
const keel = mirror([
  '', '', '', '', '', '', '',
  '..KKKKKKKKKKKKK......',
  '..KDDDDDDDDDDDDKKK...',
]);
const belly = mirror([
  '', '', '', '', '', '',
  '..KKKKKKKKKKK........',
  '.KSSSSSSSSSSSSKK.....',
  '.KDDDDDDDDDDDDDDKKK..',
]);
const lowerWing = mirror([
  '', '', '',
  '.KKKKKK..............',
  '.KSSSSSKKK...........',
  '..KSSSSSSSSKKK.......',
  '..KSSCCCCCCSSSSKK....',
  '...KSSCCCCCCCCSSSKK..',
  '...KDDDDDDDDDDDDDDDK.',
]);
const mainWing = mirror([
  'KKK..................',
  'KCCKKK...............',
  '.KCCCCKKK............',
  '.KPPCCCCPKKK.........',
  '..KPPPCCCCPPKKK......',
  '..KPPPPCCCCPPPPKK....',
  '...KPPPPCCCCPPPPPKK..',
  '...KPPPPPCCCCPPPPPPK.',
  '...KFFFFFFFFFFFFFFFFK',
]);
const upperWing = mirror([
  '', '',
  '.KKKK................',
  '.KCCPKKK.............',
  '..KPPCCPKKK..........',
  '..KPPPCCPPPKK........',
  '...KPPPCCPPPPKK......',
  '...KPPPPCCPPPPPKK....',
  '...KFFFFFFFFFFFFFFFFK',
]);
const ridge = mirror([
  '', '', '', '', '', '',
  '...KKKKKKK...........',
  '...KPPPPPPKKKKK......',
  '...KFFFFFFFFFFFFFFFFK',
]);
const crest = mirror([
  '', '', '', '', '', '', '',
  '....KKKKKKKKKKKK.....',
  '....FFFFFFFFFFFFFFFF.',
]);
const planeLayers = [keel, keel, belly, lowerWing, mainWing, mainWing, upperWing, ridge, crest];

// 7-slice 3D stacked balloon (11x11).
const b0 = ['...........', '...........', '...........', '....KKK....', '...KDDDK...', '...KDDDK...', '...KDDDK...', '....KKK....', '...........', '...........', '...........'];
const b1 = ['...........', '...........', '...KKKKK...', '..KDDDDDK..', '..KDBBBDK..', '..KDBBBDK..', '..KDBBBDK..', '..KDDDDDK..', '...KKKKK...', '...........', '...........'];
const b2 = ['...........', '...KKKKK...', '..KBBBBBK..', '.KBBBBBBBK.', '.KBBHHBBBK.', '.KBBHHBBBK.', '.KBBBBBBBK.', '.KBBBBBBBK.', '..KBBBBBK..', '...KKKKK...', '...........'];
const b3 = ['...KKKKK...', '..KBBBBBK..', '.KBBHHBBBK.', 'KBBHHHHBBBK', 'KBBHHHHBBBK', 'KBBBBBBBBBK', 'KBBBBBBBBBK', 'KBBBBBBBBBK', '.KBBBBBBBK.', '..KBBBBBK..', '...KKKKK...'];
const b4 = ['...........', '...KKKKK...', '..KBBHBBK..', '.KBBHHHBBK.', '.KBBHHHBBK.', '.KBBBBBBBK.', '.KBBBBBBBK.', '.KBBBBBBBK.', '..KBBBBBK..', '...KKKKK...', '...........'];
const b5 = ['...........', '...........', '...KKKKK...', '..KBBHBBK..', '..KBHHBBK..', '..KBBBBBK..', '..KBBBBBK..', '..KBBBBBK..', '...KKKKK...', '...........', '...........'];
const b6 = ['...........', '...........', '...........', '....KKK....', '...KHHBK...', '...KBBBK...', '...KBBBK...', '....KKK....', '...........', '...........', '...........'];
const balloonLayers = [b0, b1, b2, b3, b4, b5, b6];

// 6-slice 3D stacked Sun Crown (9x9).
const cBase = ['..KKKKK..', '.KGGGGGK.', 'KGGGGGGGK', 'KGDDDDDGK', 'KGDDDDDGK', 'KGDDDDDGK', 'KGGGGGGGK', '.KGGGGGK.', '..KKKKK..'];
const cJewel = ['..KKKKK..', '.KGRGRGK.', 'KGGGGGGGK', 'KG.....GK', 'KR.....RK', 'KG.....GK', 'KGGGGGGGK', '.KGRGRGK.', '..KKKKK..'];
const cSpikes = ['...KKK...', '...KHK...', 'KK.....KK', 'KH.....HK', 'KK.....KK', '.........', 'KK.....KK', '...KHK...', '...KKK...'];
const crownLayers = [cBase, cBase, cJewel, cJewel, cSpikes, cSpikes];

const propCaches = new WeakMap();
function getPropCache(document) {
  if (!propCaches.has(document)) propCaches.set(document, new Map());
  return propCaches.get(document);
}

export function createPlaneArt(document) {
  const models = new Map();
  return (c, plane, time, reduced) => {
    const { x, y, look, boost, wobble, bank, a } = plane;
    const angle = a + (wobble && !reduced ? Math.sin(time * 0.021) * 0.13 : 0);
    if (!models.has(look)) models.set(look, compileStack(document, planeLayers, {
      C: scarf(look), P: '#fff7e0', S: '#bfd0d8', D: '#6d8294', K: ink, F: '#ffffff',
    }));
    oval(c, x + 14, y + 22, 24, 10, '#32485848', angle);
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    const length = boost ? 84 : 36 + Math.min(20, Math.max(0, plane.spd * 0.08));
    const ripple = reduced ? 0 : Math.sin(time / 110) * 2;
    for (const side of [-1, 1]) {
      paper(c, boost ? '#fff2b6e0' : '#fffdf499', [[-18, side * 13], [-38, side * 14],
        [-length, side * 16 + ripple], [-37, side * 17], [-18, side * 17]]);
    }
    if (boost) paper(c, '#f2954b', [[-17, -4], [-52, ripple], [-17, 4]]);
    c.restore();
    drawStack(c, models.get(look), x, y, { angle, scale: 3, sliceGap: Math.abs(bank) > 0.25 ? 1.15 : 0.85 });
  };
}

export function paintSky(c, w, h) {
  const sky = c.createLinearGradient(0, 0, w * 0.3, h);
  for (const [at, colour] of [[0, '#72bac6'], [0.46, '#f6d6a3'], [0.74, '#ebb88a'], [1, '#a9c7b2']]) sky.addColorStop(at, colour);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  oval(c, w * 0.77, h * 0.17, 75, 75, '#fff0bf66');
  oval(c, w * 0.77, h * 0.17, 58, 58, '#fff1c8');
  const fields = ['#accabc', '#d1cfad', '#e4c5a8', '#bbd0b7'];
  for (let i = 0; i < 11; i++) oval(c, i * w / 9, h * 0.92, w / 6, h * (0.19 + 0.05 * Math.sin(i)), '#bdcebf');
  const corner = (col, row) => [(col - row * 0.19) * w / 9, h * (0.83 + 0.06 * row + 0.017 * Math.sin(col + row))];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 11; col++) {
    paper(c, fields[(col * 3 + row) % 4], [corner(col, row), corner(col + 1, row), corner(col + 1, row + 1), corner(col, row + 1)]);
  }
  paper(c, '#a9cbd0', [[w * 0.69, h * 0.78], [w * 0.58, h * 0.89], [w * 0.63, h * 0.91], [w * 0.48, h],
    [w * 0.40, h], [w * 0.60, h * 0.91], [w * 0.55, h * 0.89]]);
}

export function thermal(c, { x, y, r }, time) {
  for (let i = 0; i < 3; i++) {
    const phase = time / 800 + i * 2;
    arc(c, x, y - i * 3, r * (1 - i * 0.2), r * (0.66 - i * 0.13), -0.2, phase, phase + 4.7, '#bd8658aa', 2.5);
  }
}
export function cloud(c, { x, y, r, gust }) {
  oval(c, x, y + r * 0.13, r, r * 0.45, gust ? '#64748c' : '#dbcbb7');
  const colour = gust ? '#909bac' : '#fff1d9';
  oval(c, x, y, r, r * 0.43, colour);
  oval(c, x - r * 0.29, y - r * 0.21, r * 0.48, r * 0.44, colour);
  oval(c, x + r * 0.19, y - r * 0.24, r * 0.42, r * 0.54, colour);
  if (gust) for (let i = 0; i < 2; i++) arc(c, x - i * 9, y + i * 9, r * 0.7, r * 0.16, -0.1, 0.2, 2.8, '#e2e9ed', 2);
}
export function hoop(c, { x, y, r, a, gold }, time) {
  const band = gold ? '#ffc85b' : '#7fdcf1';
  arc(c, x, y + 3, r * 0.56, r, a, 0, TURN, gold ? '#a16939' : '#40748a', 10);
  arc(c, x, y, r * 0.56, r, a, 0, TURN, band, 6);
  const start = time / 680;
  arc(c, x, y, r * 0.56, r, a, start, start + 1.1, '#fff9df', 3);
}
const balloonColours = ['#df7376', '#639fd1', '#b38ac2', '#f6c445'];
const balloonDark = ['#9e464b', '#3f6e99', '#7a5489', '#b88322'];
export function balloon(c, { x, y, r, pts, col }) {
  arc(c, x - r * 0.21, y + r * 1.45, r * 0.23, r * 0.49, 0.12, -1, 1.6, ink, 1.6);
  const doc = c.canvas?.ownerDocument;
  if (doc) {
    const cache = getPropCache(doc);
    const key = `balloon-${col}`;
    if (!cache.has(key)) {
      cache.set(key, compileStack(doc, balloonLayers, {
        B: balloonColours[col] ?? balloonColours[0],
        D: balloonDark[col] ?? balloonDark[0],
        H: '#fff8e2',
        K: ink,
      }));
    }
    drawStack(c, cache.get(key), x, y + r * 0.35, { angle: 0, scale: Math.max(2, Math.round(r / 7)), sliceGap: 0.9 });
  } else {
    oval(c, x, y, r * 0.86, r, balloonColours[col]);
  }
  for (let i = 0; i < pts; i++) oval(c, x + (i - (pts - 1) / 2) * 6, y - r * 0.3, 2.2, 2.2, '#ffffff');
}
export function crown(c, x, y, time) {
  oval(c, x, y, 22, 18, '#fff29d88');
  const doc = c.canvas?.ownerDocument;
  if (doc) {
    const cache = getPropCache(doc);
    if (!cache.has('crown')) {
      cache.set('crown', compileStack(doc, crownLayers, {
        G: '#ffcf53', D: '#b07128', H: '#fff8d6', R: '#e85d5d', K: ink,
      }));
    }
    drawStack(c, cache.get('crown'), x, y + 6, { angle: time / 900, scale: 3, sliceGap: 1 });
    return;
  }
  paper(c, '#ffcf53', [[-13, -7], [-6, -1], [0, -12], [6, -1], [13, -7], [10, 5], [-10, 5]]);
}
export function dart(c, { x, y, a, look }) {
  c.save(); c.translate(x, y); c.rotate(a);
  paper(c, ink, [[-20, 0], [-5, -4], [12, 0], [-5, 4]]);
  paper(c, scarf(look), [[-14, 0], [-5, -2], [9, 0]]);
  c.restore();
}
export function burst(c, event, age) {
  if (age < 0 || age >= 480) return;
  const t = age / 480;
  c.globalAlpha = 1 - t;
  const colours = { crown: '#ffcc50', ring: '#ecffff', hit: '#c36152', pop: scarf(event.look) };
  for (let i = 0; i < 8; i++) {
    const a = i * TURN / 8, radius = 8 + t * 32;
    oval(c, event.x + Math.cos(a) * radius, event.y + Math.sin(a) * radius, 4, 2, colours[event.type], a);
  }
  c.globalAlpha = 1;
}
