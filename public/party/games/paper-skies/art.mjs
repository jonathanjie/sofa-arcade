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

function seeded(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export function paintSky(c, w, h) {
  // 1. Sunlit coastal sea base with turquoise shallows & subtle wave glints.
  const sea = c.createLinearGradient(0, 0, w, h);
  for (const [at, colour] of [[0, '#5a9fb4'], [0.45, '#6db3c4'], [0.8, '#83c3cc'], [1, '#68aab9']]) sea.addColorStop(at, colour);
  c.fillStyle = sea;
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const wx = seeded(i + 1) * w, wy = seeded(i + 301) * h;
    oval(c, wx, wy, 10 + seeded(i + 7) * 18, 2, '#d8f4f738');
  }

  // 2. Sculpted islands & coastal headlands (shallow reef -> sandy beach -> layered meadows).
  const islands = [
    { x: w * 0.22, y: h * 0.32, rx: 310, ry: 210, rot: -0.18 },
    { x: w * 0.14, y: h * 0.78, rx: 270, ry: 175, rot: 0.22 },
    { x: w * 0.56, y: h * 0.68, rx: 360, ry: 230, rot: -0.12 },
    { x: w * 0.85, y: h * 0.34, rx: 240, ry: 175, rot: 0.3 },
    { x: w * 0.88, y: h * 0.84, rx: 210, ry: 145, rot: -0.25 },
  ];
  for (const isl of islands) oval(c, isl.x, isl.y, isl.rx + 28, isl.ry + 24, '#95d6d666', isl.rot);
  for (const isl of islands) oval(c, isl.x, isl.y, isl.rx + 10, isl.ry + 8, '#edd9ae', isl.rot);
  for (const isl of islands) oval(c, isl.x, isl.y, isl.rx - 4, isl.ry - 6, '#82b682', isl.rot);
  for (const isl of islands) oval(c, isl.x - 14, isl.y - 10, isl.rx * 0.72, isl.ry * 0.68, '#95c489', isl.rot);
  for (const isl of islands) oval(c, isl.x - 24, isl.y - 18, isl.rx * 0.44, isl.ry * 0.42, '#accf90', isl.rot);

  // 3. Patchwork golden wheat, sage, and lavender farmland on the main islands.
  const patches = [
    [w * 0.11, h * 0.24, 92, 54, '#e0c98a', -0.15],
    [w * 0.20, h * 0.34, 86, 48, '#c8cf8d', 0.08],
    [w * 0.45, h * 0.62, 110, 62, '#e2ca8c', -0.1],
    [w * 0.57, h * 0.58, 96, 54, '#b8c98e', 0.14],
    [w * 0.52, h * 0.74, 84, 48, '#c9b3c4', -0.06],
    [w * 0.78, h * 0.30, 74, 44, '#e1cb8d', 0.2],
  ];
  for (const [px, py, pw, ph, col, rot] of patches) {
    c.save();
    c.translate(px, py);
    c.rotate(rot);
    c.fillStyle = col;
    c.fillRect(-pw / 2, -ph / 2, pw, ph);
    c.fillStyle = '#ffffff24';
    for (let row = -ph / 2 + 6; row < ph / 2; row += 8) c.fillRect(-pw / 2 + 4, row, pw - 8, 2);
    c.restore();
  }

  // 4. Winding sunlit river cutting across the central island with a tiny stone bridge.
  c.save();
  c.strokeStyle = '#73bac9';
  c.lineWidth = 24;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(w * 0.36, h * 0.88);
  c.lineTo(w * 0.44, h * 0.77);
  c.lineTo(w * 0.52, h * 0.69);
  c.lineTo(w * 0.60, h * 0.62);
  c.lineTo(w * 0.68, h * 0.54);
  c.stroke();
  c.strokeStyle = '#bce6ec66';
  c.lineWidth = 6;
  c.stroke();
  // Tiny stone bridge across the river.
  c.translate(w * 0.51, h * 0.69);
  c.rotate(-0.62);
  c.fillStyle = '#d9ccb4';
  c.fillRect(-16, -8, 32, 16);
  c.fillStyle = '#8b7b6a';
  c.fillRect(-16, -8, 32, 3);
  c.fillRect(-16, 5, 32, 3);
  c.restore();

  // 5. Miniature pine & orchard tree groves with soft afternoon shadows.
  const groves = [
    [w * 0.27, h * 0.23, 14], [w * 0.16, h * 0.42, 12], [w * 0.65, h * 0.73, 16],
    [w * 0.43, h * 0.75, 11], [w * 0.87, h * 0.41, 12], [w * 0.15, h * 0.74, 12],
  ];
  for (const [gx, gy, count] of groves) {
    for (let i = 0; i < count; i++) {
      const a = seeded(gx + i * 7) * TURN;
      const dist = 10 + seeded(gy + i * 13) * 58;
      const tx = gx + Math.cos(a) * dist, ty = gy + Math.sin(a) * dist * 0.75;
      const tr = 6 + seeded(i * 19 + gx) * 6;
      oval(c, tx + 3, ty + 4, tr, tr * 0.85, '#3b5a4a44');
      oval(c, tx, ty, tr, tr * 0.9, i % 3 ? '#4c865b' : '#5e9b64');
      oval(c, tx - tr * 0.25, ty - tr * 0.25, tr * 0.45, tr * 0.4, '#88be7e');
    }
  }

  // 6. Miniature coastal villages (terracotta cottages) + red/white striped lighthouse + sailboats.
  const houses = [
    [w * 0.23, h * 0.29, '#cf6a52'], [w * 0.25, h * 0.31, '#d98456'], [w * 0.21, h * 0.32, '#c86050'],
    [w * 0.56, h * 0.66, '#cf6a52'], [w * 0.58, h * 0.68, '#d98a52'], [w * 0.59, h * 0.65, '#68829e'],
    [w * 0.61, h * 0.67, '#cf6a52'], [w * 0.84, h * 0.32, '#d87a56'], [w * 0.86, h * 0.34, '#cf6a52'],
  ];
  for (const [hx, hy, roof] of houses) {
    c.fillStyle = '#33465255';
    c.fillRect(hx - 6, hy - 4, 18, 13);
    c.fillStyle = '#f8eed8';
    c.fillRect(hx - 8, hy - 6, 16, 11);
    c.fillStyle = roof;
    c.fillRect(hx - 9, hy - 7, 18, 6);
    c.fillStyle = '#ffffff44';
    c.fillRect(hx - 9, hy - 7, 18, 2);
  }
  // Striped coastal lighthouse on the eastern headland.
  const lx = w * 0.77, ly = h * 0.40;
  oval(c, lx + 4, ly + 5, 11, 8, '#2d404c55');
  oval(c, lx, ly, 9, 9, '#fff7e6');
  oval(c, lx, ly, 6, 6, '#d9574c');
  oval(c, lx, ly, 3, 3, '#ffe794');

  // Tiny sailboats dotting the bays.
  for (const [bx, by] of [[w * 0.42, h * 0.26], [w * 0.68, h * 0.24], [w * 0.33, h * 0.55], [w * 0.75, h * 0.70]]) {
    oval(c, bx + 2, by + 3, 9, 4, '#2a566644');
    paper(c, '#a86b46', [[bx - 8, by], [bx + 8, by], [bx + 4, by + 4], [bx - 5, by + 4]]);
    paper(c, '#fff9eb', [[bx - 1, by - 1], [bx - 1, by - 13], [bx + 7, by - 2]]);
  }

  // 7. High-altitude atmospheric golden-hour mist + warm sunbeams so the 3D planes pop cleanly above.
  const mist = c.createLinearGradient(0, 0, w * 0.85, h);
  mist.addColorStop(0, '#c8ecf048');
  mist.addColorStop(0.5, '#fae4bd52');
  mist.addColorStop(1, '#f4d3a438');
  c.fillStyle = mist;
  c.fillRect(0, 0, w, h);

  // Soft golden sun glow in the upper right.
  oval(c, w * 0.82, h * 0.14, 120, 120, '#fff2c244');
  oval(c, w * 0.82, h * 0.14, 62, 62, '#fff5cf99');
  oval(c, w * 0.82, h * 0.14, 34, 34, '#fffbe6cc');
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
