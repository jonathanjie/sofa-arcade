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
  const height = 18 + seed % 7;
  // Each higher course steps north, and every second course steps west.
  for (let z = 0; z <= height; z++) {
    const left = x - Math.floor(z / 2), top = y - z;
    const band = Math.floor(28 * z / height);
    rect(c, `rgb(${51 + band} ${59 + band} ${81 + band})`, left, top, w, h);
    rect(c, `rgb(${83 + band} ${78 + band} ${92 + band})`, left, top + h - 1, w, 1);
    const floor = Math.floor(z / 9);
    if (z % 9 < 2 || z % 9 > 6) continue;
    for (let i = 5; i < w - 7; i += 13) {
      const lit = noise(seed + i + floor) > .25;
      rect(c, lit ? '#ffd991' : '#344359', left + i, top + h - 1, 6, 1);
    }
    for (let j = 7; j < h - 7; j += 15) {
      rect(c, noise(seed + j + floor) > .45 ? '#cfa878' : '#273447', left + w - 1, top + j, 1, 7);
    }
  }
  x -= Math.floor(height / 2);
  y -= height;
  rect(c, '#d8edf0', x - 1, y - 1, w + 2, h + 2);
  rect(c, '#51687d', x + 2, y + 2, w - 4, h - 4);
  const slate = ['#718797', '#62788b', '#758895', '#697e90'][seed % 4];
  rect(c, slate, x + 5, y + 5, w - 10, h - 10);
  // Wind leaves stepped banks against the parapet.
  for (let i = 5; i < w - 6; i += 6) {
    rect(c, '#cbdde5', x + i, y + 5, 6, 3 + Math.floor(7 * noise(seed + Math.floor(i / 20))));
  }
  // Raised seams catch light along alternating standing-seam roof panels.
  for (let seam = 19; seam < w - 8; seam += 24) {
    rect(c, '#c9dfe42f', x + seam, y + 12, 1, h - 18);
  }
  const vx = x + w * (.12 + .29 * noise(seed)), vy = y + h * (.44 + .28 * noise(seed + 1));
  rect(c, '#526479', vx + 3, vy + 4, 23, 14);
  rect(c, '#b1c5d1', vx, vy, 23, 14);
  for (let i = 3; i < 21; i += 4) rect(c, '#566a7f', vx + i, vy + 2, 2, 9);
  const tx = x + w * (.52 + .23 * noise(seed + 2)), ty = y + h * (.17 + .48 * noise(seed + 3));
  if (seed % 3 === 0) {
    rect(c, '#4b6073', tx + 2, ty + 4, 25, 18);
    rect(c, '#d5e5e9', tx, ty, 25, 18);
    for (let i = 0; i < 3; i++) rect(c, '#7094ab', tx + 2 + 8 * i, ty + 2, 6, 13);
    return;
  }
  rect(c, '#54667a', tx + 4, ty + 7, 20, 14);
  rect(c, '#394856', tx + 2, ty + 13, 3, 6);
  rect(c, '#394856', tx + 14, ty + 13, 3, 6);
  rect(c, '#986f59', tx, ty, 19, 14);
  rect(c, '#735650', tx + 13, ty, 6, 14);
  rect(c, '#444c58', tx, ty + 9, 19, 2);
  rect(c, '#d8e9e9', tx - 1, ty - 2, 21, 5);
  rect(c, '#d8e9e9', tx + 3, ty - 4, 13, 2);
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
const lampBase = ['.mmm.', 'mmmmm', 'mmmmm', '.mmm.'];
const pole = ['.....', '..m..', '..m..', '.....'];
const lantern = ['.mmm.', '.lll.', '.lll.', '.mmm.'];
const lamp = [lampBase, lampBase, ...Array(8).fill(pole), lantern, lantern, lampBase];
export function drawLamp(c, x, y) {
  drawStack(c, model(c, 'lamp', lamp, { m: '#556778', l: '#ffdf91' }), x, y, { scale: 2 });
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
    ? model(c, `patrol-${ai ? 'ai' : colour}-${sirenPhase}`, cruiser, { ...palette, B: ai ? '#385178' : colour, R: '#e6e7de',
      r: sirenPhase ? '#ff4757' : '#ac3040', b: sirenPhase ? '#376bcc' : '#83cbff' })
    : model(c, colour, coupe, { ...palette, B: colour, R: colour });
  drawStack(c, car, 0, 0, { angle: a, scale: 3, sliceGap: 0.72 });
  if (hp === 0) rect(c, '#686375', 9 * Math.cos(a), 9 * Math.sin(a) - 4, 3, 2);
}
export function drawHydrant(c, x, y, cd, scale = 1) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  drawStack(c, model(c, 'hydrant', hydrant, propColours), 0, 0, { scale: 2 });
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
  drawStack(c, model(c, 'cone', cone, propColours), 0, 0, { scale: 2 });
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
