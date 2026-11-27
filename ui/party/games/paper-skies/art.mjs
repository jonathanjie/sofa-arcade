import { compileStack, drawStack } from '../../kit/stack.mjs';
import { LOOKS } from '../../looks.mjs';

const TURN = Math.PI * 2;
const ink = '#141924';
export const scarf = look => (LOOKS[look] ?? LOOKS[0]).colour;

function seeded(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// Smooth 2D value noise for blocky voxel-style pixel island heightmaps.
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (ix, iy) => seeded(ix * 13.7 + iy * 71.3);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  return valueNoise(x, y) * 0.56 + valueNoise(x * 2.1 + 11, y * 2.1 + 7) * 0.3 + valueNoise(x * 4.3 + 23, y * 4.3 + 19) * 0.14;
}

function oval(c, x, y, rx, ry, colour, angle = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, 0, TURN);
  c.fillStyle = colour;
  c.fill();
}
function pxRect(c, colour, x, y, w, h) {
  c.fillStyle = colour;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Mirror a half-footprint across the longitudinal centreline (nose faces east).
function mirror(rows, width = 20) {
  const full = [...rows, ...rows.slice(0, -1).reverse()];
  return full.map(row => row.padEnd(width, '.'));
}

// 9-slice Pixel Skies style chunky 3D stacked aircraft (20x17):
// Black outline (K), player colour body/wings (C), orange-gold wingtips/nose (O), mint canopy (M), warm thruster (Y).
const planeUnder = mirror([
  '', '', '', '', '', '',
  '..KKKKKKKKKK........',
  '.KDDDDDDDDDDKKK.....',
  '.KDDDDDDDDDDDDDKK...',
]);
const planeLowerWing = mirror([
  '', '',
  '.KKKK...............',
  '.KOOOKKK............',
  '..KOOCCCKKK.........',
  '..KCCCCCCCKKK.......',
  '...KCCCCCCCCCKKK....',
  '...KDDDDDDDDDDDDKK..',
  '..YDDDDDDDDDDDDDOOK.',
]);
const planeMainWing = mirror([
  'KKKK................',
  'KOOOKKK.............',
  '.KOOCCCKKK..........',
  '.KCCCCCCCCKKK.......',
  '..KCCCCCCCCCCKKK....',
  '..KCCCCCCCCCCCCCKK..',
  '...KCCCCCCCCCCCCCCK.',
  '..YKCCCCCMMMCCCCCCOK',
  '.YYKCCCCCMMMMCCCCOOK',
]);
const planeUpperBody = mirror([
  '', '', '', '',
  '...KKKKKK...........',
  '...KCCCCCCKKK.......',
  '...KCCCCCMMMMKKK....',
  '..YKCCCCMMMMMMCCKK..',
  '..YKCCCCMMMMMMCCCOK.',
]);
const planeCanopy = mirror([
  '', '', '', '', '', '',
  '.....KKKKKK.........',
  '.....KMMMMMK........',
  '.....KMMHHMK........',
]);
const planeCrest = mirror([
  '', '', '', '', '', '', '',
  '......KKKKK.........',
  '......KHHHK.........',
]);
const planeLayers = [
  planeUnder, planeUnder, planeLowerWing,
  planeMainWing, planeMainWing, planeUpperBody,
  planeUpperBody, planeCanopy, planeCrest,
];

// 7-slice 3D pixel balloon (11x11) with crisp black outline & glossy highlight.
const b0 = ['...........', '...........', '...........', '....KKK....', '...KDDDK...', '...KDDDK...', '...KDDDK...', '....KKK....', '...........', '...........', '...........'];
const b1 = ['...........', '...........', '...KKKKK...', '..KDDDDDK..', '..KDBBBDK..', '..KDBBBDK..', '..KDBBBDK..', '..KDDDDDK..', '...KKKKK...', '...........', '...........'];
const b2 = ['...........', '...KKKKK...', '..KBBBBBK..', '.KBBBBBBBK.', '.KBBHHBBBK.', '.KBBHHBBBK.', '.KBBBBBBBK.', '.KBBBBBBBK.', '..KBBBBBK..', '...KKKKK...', '...........'];
const b3 = ['...KKKKK...', '..KBBBBBK..', '.KBBHHBBBK.', 'KBBHHHHBBBK', 'KBBHHHHBBBK', 'KBBBBBBBBBK', 'KBBBBBBBBBK', 'KBBBBBBBBBK', '.KBBBBBBBK.', '..KBBBBBK..', '...KKKKK...'];
const b4 = ['...........', '...KKKKK...', '..KBBHBBK..', '.KBBHHHBBK.', '.KBBHHHBBK.', '.KBBBBBBBK.', '.KBBBBBBBK.', '.KBBBBBBBK.', '..KBBBBBK..', '...KKKKK...', '...........'];
const b5 = ['...........', '...........', '...KKKKK...', '..KBBHBBK..', '..KBHHBBK..', '..KBBBBBK..', '..KBBBBBK..', '..KBBBBBK..', '...KKKKK...', '...........', '...........'];
const b6 = ['...........', '...........', '...........', '....KKK....', '...KHHBK...', '...KBBBK...', '...KBBBK...', '....KKK....', '...........', '...........', '...........'];
const balloonLayers = [b0, b1, b2, b3, b4, b5, b6];

// 6-slice 3D pixel Sun Crown (9x9).
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
    const angle = a + (wobble && !reduced ? Math.sin(time * 0.021) * 0.14 : 0);
    if (!models.has(look)) models.set(look, compileStack(document, planeLayers, {
      C: scarf(look), D: '#272c44', O: '#ffa933', M: '#c8f7ea', H: '#ffffff', Y: '#ffdc5c', K: ink,
    }));
    // Hard-edged pixel shadow directly beneath the aircraft on the ocean/land below.
    oval(c, x + 14, y + 24, 22, 10, '#10243b55', angle);
    // Pixel thruster puffs & wingtip trails.
    if (!reduced) {
      c.save();
      c.translate(x, y);
      c.rotate(angle);
      const trail = boost ? 5 : 3;
      for (let i = 0; i < trail; i++) {
        const phase = ((time / 95 + i / trail) % 1);
        const dist = 18 + phase * (boost ? 56 : 30);
        pxRect(c, boost ? '#ffb83d' : '#ffffffaa', -dist, -2 + Math.sin(i * 3) * 2, boost ? 6 : 4, boost ? 6 : 4);
      }
      c.restore();
    }
    drawStack(c, models.get(look), x, y, { angle, scale: 3, sliceGap: Math.abs(bank) > 0.25 ? 1.15 : 0.85 });
  };
}

// Bake a chunky Pixel Skies style voxel-stepped pixel archipelago (4px world pixels -> crisp retro look).
export function paintSky(c, w, h) {
  const step = 6;
  const cols = Math.ceil(w / step), rows = Math.ceil(h / step);
  const heights = new Float32Array(cols * rows);
  const centers = [
    [0.21, 0.30, 0.25], [0.15, 0.78, 0.22], [0.55, 0.63, 0.29],
    [0.83, 0.31, 0.22], [0.87, 0.82, 0.19], [0.42, 0.22, 0.13],
  ];

  // 1. Sample stepped voxel heightmap.
  for (let gy = 0; gy < rows; gy++) {
    const ny = gy / rows;
    for (let gx = 0; gx < cols; gx++) {
      const nx = gx / cols;
      let mound = 0;
      for (const [cx, cy, rad] of centers) {
        const d = Math.hypot((nx - cx) * 1.45, ny - cy) / rad;
        if (d < 1.25) mound = Math.max(mound, Math.max(0, 1 - d * d * 0.82));
      }
      const n = fbm(nx * 5.2 + 2.4, ny * 3.2 + 1.7);
      heights[gy * cols + gx] = mound * 0.82 + n * 0.42 - 0.18;
    }
  }

  // 2. Render ocean bands, turquoise shallows, beaches, terraced green hills, rocky peaks & cliff faces.
  c.imageSmoothingEnabled = false;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const e = heights[gy * cols + gx];
      const below = gy + 1 < rows ? heights[(gy + 1) * cols + gx] : e;
      const cliff = e > 0.44 && e - below > 0.032;
      let col;
      if (e < 0.24) col = '#1d6ab5';          // deep cobalt ocean
      else if (e < 0.33) col = '#2a82c9';     // mid royal blue ocean
      else if (e < 0.40) col = '#44aec4';     // coastal turquoise shallow
      else if (e < 0.44) col = '#6ad0d4';     // bright reef shallow
      else if (e < 0.50) col = cliff ? '#bfa062' : '#ebd094'; // warm pixel sand beach
      else if (e < 0.59) col = cliff ? '#438231' : '#7ac24c'; // bright lime meadow terrace
      else if (e < 0.69) col = cliff ? '#2e6328' : '#58a33c'; // lush green hill
      else if (e < 0.78) col = cliff ? '#224d22' : '#408234'; // deep forest slope
      else if (e < 0.86) col = cliff ? '#5b6470' : '#858f9c'; // stepped slate mountain rock
      else col = cliff ? '#7b8591' : '#b7c1cc';               // bright rocky peak
      c.fillStyle = col;
      c.fillRect(gx * step, gy * step, step, step);
    }
  }

  // 3. Crisp 1-block white ocean sparkles / wave foam flecks.
  for (let i = 0; i < 140; i++) {
    const gx = Math.floor(seeded(i * 11 + 3) * cols);
    const gy = Math.floor(seeded(i * 17 + 9) * rows);
    const e = heights[gy * cols + gx];
    if (e < 0.43) {
      c.fillStyle = e > 0.34 ? '#e6fbffaa' : '#b8e4ff77';
      c.fillRect(gx * step, gy * step, step * (i % 3 === 0 ? 2 : 1), Math.max(2, step / 2));
    }
  }

  // 4. Subtle sunlit sky haze toward the top horizon (Pixel Skies aerial perspective).
  const haze = c.createLinearGradient(0, 0, 0, h * 0.42);
  haze.addColorStop(0, '#c8e9ff44');
  haze.addColorStop(1, '#c8e9ff00');
  c.fillStyle = haze;
  c.fillRect(0, 0, w, h * 0.42);
}

// Updraft thermal: crisp pixel wind rings in bright cyan/white.
export function thermal(c, { x, y, r }, time) {
  c.save();
  for (let i = 0; i < 3; i++) {
    const rad = r * (0.45 + ((time / 900 + i / 3) % 1) * 0.55);
    c.beginPath();
    c.ellipse(x, y, rad, rad * 0.75, 0, 0, TURN);
    c.strokeStyle = i === 0 ? '#ffffffaa' : '#9ff5ff88';
    c.lineWidth = 4;
    c.stroke();
  }
  c.restore();
}

// Pixel Skies flat-topped white pixel clouds with pale blue-grey underside & cast shadows;
// gust clouds render as Pixel Skies spiky dark-purple storm mines with glowing red cores!
export function cloud(c, { x, y, r, gust }) {
  if (gust) {
    // Spiky dark-purple Pixel Skies storm hazard sphere with glowing red core.
    const rad = Math.min(34, r * 0.42);
    oval(c, x + 8, y + 14, rad * 0.9, rad * 0.65, '#10182855');
    for (let i = 0; i < 8; i++) {
      const a = i * TURN / 8;
      pxRect(c, ink, x + Math.cos(a) * rad - 4, y + Math.sin(a) * rad - 4, 8, 8);
    }
    oval(c, x, y, rad + 3, rad + 3, ink);
    oval(c, x, y, rad - 1, rad - 1, '#4c3463');
    oval(c, x - 3, y - 3, rad * 0.62, rad * 0.62, '#694a85');
    oval(c, x, y, rad * 0.36, rad * 0.36, '#ff4757');
    pxRect(c, '#ffd6d9', x - 3, y - 3, 4, 4);
    return;
  }
  // Crisp stepped flat-topped white pixel cloud sheet + dark cast shadow below.
  const b = 8;
  const spans = [
    [-0.55, 0.35, -0.45],
    [-0.85, 0.72, -0.25],
    [-1.00, 0.92, -0.05],
    [-0.88, 0.80, 0.15],
    [-0.62, 0.52, 0.32],
  ];
  for (const [l, ri, dy] of spans) {
    pxRect(c, '#12304d38', x + l * r + 14, y + dy * r + 24, (ri - l) * r, b * 2.2);
  }
  for (const [l, ri, dy] of spans) {
    pxRect(c, '#cfe0f0', x + l * r, y + dy * r + 6, (ri - l) * r, b * 2.2);
  }
  for (const [l, ri, dy] of spans) {
    pxRect(c, '#ffffff', x + l * r, y + dy * r, (ri - l) * r, b * 2.2);
  }
}

// Ring Rally targets: Pixel Skies glowing golden pixel Sun orbs (gold = big radiant Sun, normal = crisp cyan-gold Sun).
export function hoop(c, { x, y, gold }, time) {
  const pulse = 1 + 0.08 * Math.sin(time / 240);
  const rad = (gold ? 22 : 16) * pulse;
  oval(c, x + 6, y + 12, rad * 0.9, rad * 0.6, '#14263a44');
  oval(c, x, y, rad + 4, rad + 4, gold ? '#ffe97a55' : '#8ef0ff44');
  oval(c, x, y, rad + 2, rad + 2, ink);
  oval(c, x, y, rad - 1, rad - 1, gold ? '#ff9f1c' : '#35b7e8');
  oval(c, x, y, rad * 0.74, rad * 0.74, gold ? '#ffd94a' : '#8cf0ff');
  pxRect(c, '#fffef0', x - rad * 0.32, y - rad * 0.32, rad * 0.55, rad * 0.55);
}

const balloonColours = ['#ff5e6c', '#3ea6ff', '#b56bff', '#ffc933'];
const balloonDark = ['#a82e3c', '#1f64a8', '#6b32a8', '#b87d14'];
export function balloon(c, { x, y, r, pts, col }) {
  pxRect(c, ink, x - 1, y + r * 0.6, 2, r * 0.9);
  const doc = c.canvas?.ownerDocument;
  if (doc) {
    const cache = getPropCache(doc);
    const key = `balloon-${col}`;
    if (!cache.has(key)) {
      cache.set(key, compileStack(doc, balloonLayers, {
        B: balloonColours[col] ?? balloonColours[0],
        D: balloonDark[col] ?? balloonDark[0],
        H: '#ffffff',
        K: ink,
      }));
    }
    drawStack(c, cache.get(key), x, y + r * 0.35, { angle: 0, scale: Math.max(2, Math.round(r / 7)), sliceGap: 0.9 });
  } else {
    oval(c, x, y, r * 0.86, r, balloonColours[col]);
  }
  for (let i = 0; i < pts; i++) pxRect(c, '#ffffff', x + (i - (pts - 1) / 2) * 6 - 2, y - r * 0.35, 4, 4);
}

export function crown(c, x, y, time) {
  oval(c, x, y, 22, 18, '#ffe97a77');
  const doc = c.canvas?.ownerDocument;
  if (doc) {
    const cache = getPropCache(doc);
    if (!cache.has('crown')) {
      cache.set('crown', compileStack(doc, crownLayers, {
        G: '#ffd23f', D: '#b06d1a', H: '#fffbe0', R: '#ff4757', K: ink,
      }));
    }
    drawStack(c, cache.get('crown'), x, y + 6, { angle: time / 900, scale: 3, sliceGap: 1 });
    return;
  }
  pxRect(c, '#ffd23f', x - 10, y - 8, 20, 14);
}

export function dart(c, { x, y, a, look }) {
  c.save(); c.translate(x, y); c.rotate(a);
  pxRect(c, ink, -14, -4, 24, 8);
  pxRect(c, scarf(look), -11, -2, 16, 4);
  pxRect(c, '#fffbe0', 2, -2, 6, 4);
  c.restore();
}

export function burst(c, event, age) {
  if (age < 0 || age >= 480) return;
  const t = age / 480;
  c.globalAlpha = 1 - t;
  const colours = { crown: '#ffd23f', ring: '#ffe97a', hit: '#ff4757', pop: scarf(event.look) };
  for (let i = 0; i < 8; i++) {
    const a = i * TURN / 8, radius = 8 + t * 34;
    oval(c, event.x + Math.cos(a) * radius, event.y + Math.sin(a) * radius, 4, 4, colours[event.type] ?? '#ffffff', a);
  }
  c.globalAlpha = 1;
}
