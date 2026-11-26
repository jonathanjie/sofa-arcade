import { compileStack, drawStack } from '../../kit/stack.mjs';

// World units are pixels. Cars face east before the caller applies their heading.
const TAU = 2 * Math.PI;
export function noise(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
export function rect(c, colour, x, y, w, h) {
  c.fillStyle = colour;
  c.fillRect(x, y, w, h);
}
export function polygon(c, colour, points) {
  c.fillStyle = colour;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
export function glow(c, x, y, r, colour) {
  const light = c.createRadialGradient(x, y, 0, x, y, r);
  light.addColorStop(0, colour);
  light.addColorStop(1, 'transparent');
  rect(c, light, x - r, y - r, r * 2, r * 2);
}
export function drawBuildingBlock(c, x, y, w, h, seed) {
  rect(c, '#778493', x - 5, y - 5, w + 10, h + 10);
  rect(c, '#b3c4ce', x - 5, y - 5, w + 10, 2);
  // Static, axis-aligned wall slices are baked into the city canvas.
  for (const [level, colour] of ['#172336', '#263246', '#39495d', '#506178'].entries()) {
    rect(c, colour, x, y - level * 2, w, h);
  }
  y -= 6;
  rect(c, '#adc5d2', x, y, w, h - 11);
  rect(c, '#53657b', x + 2, y + 3, w - 4, h - 16);
  rect(c, '#34435a', x + 5, y + 6, w - 10, h - 21);
  for (let i = 0; i < (w * h) / 70; i++) {
    rect(
      c,
      '#8497a949',
      x + 6 + noise(seed + i) * Math.max(0, w - 15),
      y + 7 + noise(seed + i + 450) * Math.max(0, h - 26),
      3,
      1,
    );
  }
  if (w > 40 && h > 40) {
    const vx = x + 8 + noise(seed) * (w - 35),
      vy = y + h * 0.32;
    rect(c, '#202d40', vx + 2, vy + 3, 17, 11);
    rect(c, '#72849a', vx, vy, 17, 10);
    for (let i = 2; i < 16; i += 3) rect(c, '#35435a', vx + i, vy + 2, 1, 6);
  }
  for (let i = 5; i < w - 6; i += 10) {
    const tint = noise(seed + i);
    const colour = tint > 0.53 ? '#ffce81' : tint > 0.22 ? '#b9dcf2' : '#4d5c75';
    rect(c, colour, x + i, y + h - 9, 5, 5);
    rect(c, '#293042', x + i + 2, y + h - 9, 1, 5);
    if (tint > 0.72) glow(c, x + i + 2, y + h - 5, 10, '#ffb04c42');
  }
}
// Mirror each half across the longitudinal centreline. The nose faces east.
function footprint(...rows) {
  return [...rows, ...rows.toReversed()];
}
const wheels = footprint('..WW......WW....', '..WW......WW....', '.KKKKKKKKKKKKK..', '.KKKKKKKKKKKKKK.');
const sill = footprint('..WW......WW....', '.KDDDDDDDDDDDDK.', 'KDDDDDDDDDDDDDDK', 'KDDDDDDDDDDDDDDK');
const deck = footprint('................', '.TBBBBBBBBBBBBH.', 'TBBBBBBBBBBBBBBH', 'TBBSSSSSSSSSSBBH');
const glass = footprint('................', '................', '...gGGGGGIIg....', '...gGGGGGGIIg...');
const roof = footprint('................', '................', '....RRRRg.......', '....RRRRRg......');
const bar = footprint('................', '................', '......rr........', '......rr........');
const lightBar = [...bar.slice(0, 4), ...bar.slice(4).map(row => row.replaceAll('r', 'b'))];
const coupe = [wheels, wheels, sill, deck, deck, glass, glass, roof];
const cruiser = [...coupe, lightBar];
const palette = { W: '#141a28', K: '#263343', D: '#435568', G: '#243c52', g: '#496c7e',
  I: '#abdce4', S: '#fff1cb', T: '#fa675d', H: '#fff3b8' };

const hydrantFoot = ['.dddd.', 'dddddd', 'dddddd', '.dddd.'];
const barrel = ['..hh..', '.hHHh.', '.hHHh.', '..hh..'];
const outlets = ['..hh..', 'hhHHhh', 'hhHHhh', '..hh..'];
const cap = ['..hh..', '.hLLh.', '.hHHh.', '..hh..'];
const hydrant = [hydrantFoot, barrel, barrel, outlets, outlets, barrel, cap];
const base = ['ddddd', 'ddddd', 'ddddd', 'ddddd', 'ddddd'];
const orange = ['.....', '.ooo.', '.ooo.', '.ooo.', '.....'];
const stripe = ['.....', '..w..', '.www.', '..w..', '.....'];
const tip = ['.....', '.....', '..o..', '.....', '.....'];
const cone = [base, orange, orange, stripe, tip, tip];
const propColours = { d: '#583b46', h: '#c64044', H: '#f56d52', L: '#ffcb97', o: '#ff843c', w: '#fff1ca' };

// The TV has sixteen seat colours, two patrol phases and two street props.
const models = new WeakMap();
function model(c, key, layers, colours) {
  const doc = c.canvas.ownerDocument;
  if (!models.has(doc)) models.set(doc, new Map());
  const cache = models.get(doc);
  if (!cache.has(key)) cache.set(key, compileStack(doc, layers, colours));
  return cache.get(key);
}
export function drawCarSprite(c, { colour, role, ai, sirenPhase, boost, hp, a = 0 }) {
  const cop = ai === 1 || role === 1;
  if (role === 3) glow(c, 0, 0, 22, '#ffc94388');
  if (boost) {
    c.save();
    c.rotate(a);
    polygon(c, '#85efff', [[-12, -3], [-23, 0], [-12, 3]]);
    c.restore();
  }
  const car = cop
    ? model(c, 'patrol-' + sirenPhase, cruiser, { ...palette, B: '#385178', R: '#e6e7de',
      r: sirenPhase ? '#ff4757' : '#ac3040', b: sirenPhase ? '#376bcc' : '#83cbff' })
    : model(c, colour, coupe, { ...palette, B: colour, R: colour });
  drawStack(c, car, 0, 0, { angle: a, scale: 2, sliceGap: 0.5 });
  if (hp === 0) rect(c, '#686375', 9 * Math.cos(a), 9 * Math.sin(a) - 4, 3, 2);
}
export function drawHydrant(c, x, y, cd, scale = 1) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  drawStack(c, model(c, 'hydrant', hydrant, propColours), 0, 0);
  if (cd > 0) {
    polygon(c, '#a5d9e6', [
      [-2, -3],
      [-7, -11],
      [-3, -9],
      [-2, -18],
      [1, -10],
      [6, -15],
      [2, -3],
    ]);
  }
  c.restore();
}
export function drawIcePatch(c, x, y, r, seed, ms, scale = 1) {
  const radius = r * scale;
  const points = Array.from({ length: 40 }, (_, i) => {
    const angle = (i * TAU) / 40,
      edge = 0.77 + 0.13 * Math.sin(angle * 5 + seed) + 0.16 * noise(seed + i);
    return [Math.cos(angle) * edge, Math.sin(angle) * edge];
  });
  c.save();
  c.translate(x, y);
  c.scale(radius, radius);
  glow(c, 0, 0, 1.12, '#aae6ff77');
  for (const [size, colour] of [
    [1, '#b2d9ed'],
    [0.94, '#59738e'],
    [0.86, '#35485f'],
  ]) {
    polygon(
      c,
      colour,
      points.map(([px, py]) => [px * size, py * size]),
    );
  }
  for (let i = 0; i < 24; i++) {
    const a = noise(seed + i + 63) * TAU,
      d = noise(seed + i + 42) * 0.68;
    rect(
      c,
      i % 4 ? '#aec5d4' : `rgba(229,250,255,${0.7 + 0.25 * Math.sin(ms / 450 + i)})`,
      Math.cos(a) * d,
      Math.sin(a) * d,
      0.044,
      0.024,
    );
  }
  c.restore();
}
export function drawCone(c, x, y, hit, scale = 1) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  if (hit) {
    c.rotate(1.1);
    c.translate(2, -2);
  }
  drawStack(c, model(c, 'cone', cone, propColours), 0, 0);
  c.restore();
}
export function headlights(c, cop, phase) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const y of [-4, 4]) {
    const beam = c.createLinearGradient(10, y, 75, y);
    beam.addColorStop(0, '#ffedb082');
    beam.addColorStop(0.6, '#f6edc72c');
    beam.addColorStop(1, '#fff4c600');
    polygon(c, beam, [
      [10, y - 1],
      [75, y - 19],
      [75, y + 19],
      [10, y + 1],
    ]);
  }
  if (cop) {
    glow(c, 0, -7, 37, phase ? '#ff243e99' : '#ff243e39');
    glow(c, 0, 7, 37, phase ? '#287bff39' : '#287bffac');
  }
  c.restore();
}
