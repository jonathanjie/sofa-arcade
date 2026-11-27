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
  // Deep curb shadow + dark recessed sidewalk border so snowy streets pop brightly.
  rect(c, '#1c2537', x - 7, y - 7, w + 14, h + 14);
  rect(c, '#56677d', x - 5, y - 5, w + 10, h + 10);
  rect(c, '#8da0b5', x - 5, y - 5, w + 10, 2);
  const height = 16 + seed % 6;
  // Each higher course steps north, and every second course steps west.
  for (let z = 0; z <= height; z++) {
    const left = x - Math.floor(z / 2), top = y - z;
    const band = Math.floor(18 * z / height);
    rect(c, `rgb(${24 + band} ${31 + band} ${49 + band})`, left, top, w, h);
    rect(c, `rgb(${36 + band} ${44 + band} ${64 + band})`, left, top + h - 1, w, 1);
    const floor = Math.floor(z / 7);
    if (z % 7 < 2 || z % 7 > 5) continue;
    for (let i = 5; i < w - 7; i += 10) {
      const n = noise(seed + i * 3 + floor * 17);
      const lit = n > 0.32;
      const colour = n > 0.78 ? '#fff4cf' : lit ? '#ffd470' : '#182233';
      rect(c, colour, left + i, top + h - 1, 5, 1);
    }
    for (let j = 6; j < h - 7; j += 12) {
      const n = noise(seed + j * 5 + floor * 13);
      rect(c, n > 0.48 ? '#f5c26b' : '#151e2e', left + w - 1, top + j, 1, 5);
    }
  }
  x -= Math.floor(height / 2);
  y -= height;
  // Crisp frosted parapet lip around a deep midnight slate rooftop.
  rect(c, '#6a7f99', x - 1, y - 1, w + 2, h + 2);
  rect(c, '#1c2638', x + 2, y + 2, w - 4, h - 4);
  const slate = ['#28354c', '#243045', '#2c3a54', '#222d42'][seed % 4];
  rect(c, slate, x + 4, y + 4, w - 8, h - 8);
  // Subtle frost drift tucked against the north parapet.
  for (let i = 5; i < w - 6; i += 6) {
    rect(c, '#475c77', x + i, y + 4, 6, 2 + Math.floor(5 * noise(seed + Math.floor(i / 20))));
  }
  // Subtle roof panel seams.
  for (let seam = 19; seam < w - 8; seam += 24) {
    rect(c, '#99b4d41a', x + seam, y + 10, 1, h - 16);
  }
  // Glowing lit pixel window strip along the south rooftop edge for unmistakable night-city glow.
  for (let i = 8; i < w - 10; i += 11) {
    const n = noise(seed + i * 7);
    if (n > 0.35) rect(c, n > 0.76 ? '#fff2c4' : '#ffcf66', x + i, y + h - 3, 6, 2);
  }
  const vx = x + w * (.12 + .29 * noise(seed)), vy = y + h * (.44 + .28 * noise(seed + 1));
  rect(c, '#161e2e', vx + 3, vy + 4, 23, 14);
  rect(c, '#42536b', vx, vy, 23, 14);
  for (let i = 3; i < 21; i += 4) rect(c, '#1d283b', vx + i, vy + 2, 2, 9);
  const tx = x + w * (.52 + .23 * noise(seed + 2)), ty = y + h * (.17 + .48 * noise(seed + 3));
  if (seed % 3 === 0) {
    rect(c, '#151e2d', tx + 2, ty + 4, 25, 18);
    rect(c, '#3d4f68', tx, ty, 25, 18);
    for (let i = 0; i < 3; i++) rect(c, '#587291', tx + 2 + 8 * i, ty + 2, 6, 13);
    return;
  }
  rect(c, '#161f2f', tx + 4, ty + 7, 20, 14);
  rect(c, '#202b3d', tx + 2, ty + 13, 3, 6);
  rect(c, '#202b3d', tx + 14, ty + 13, 3, 6);
  rect(c, '#594a52', tx, ty, 19, 14);
  rect(c, '#413740', tx + 13, ty, 6, 14);
  rect(c, '#252c3b', tx, ty + 9, 19, 2);
  rect(c, '#9eb5c9', tx - 1, ty - 2, 21, 4);
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
  const points = Array.from({ length: 36 }, (_, i) => {
    const angle = (i * TAU) / 36,
      edge = 0.72 + 0.16 * Math.sin(angle * 5 + seed) + 0.2 * noise(seed + i);
    return [Math.cos(angle) * edge, Math.sin(angle) * edge];
  });
  c.save();
  c.translate(x, y);
  c.scale(radius, radius);
  // Dark jagged frozen puddle contrasting sharply against the pale snowy road.
  glow(c, 0, 0, 1.15, '#1b2b4266');
  for (const [size, colour] of [
    [1.02, '#6d8aa8'],
    [0.95, '#30435c'],
    [0.84, '#213147'],
    [0.64, '#1b283b'],
  ]) {
    polygon(
      c,
      colour,
      points.map(([px, py]) => [px * size, py * size]),
    );
  }
  // Jagged icy frost chunks and glinting specular cracks.
  for (let i = 0; i < 28; i++) {
    const a = noise(seed + i + 63) * TAU,
      d = noise(seed + i + 42) * 0.74;
    rect(
      c,
      i % 3 ? '#4c6785' : `rgba(218,244,255,${0.65 + 0.3 * Math.sin(ms / 420 + i)})`,
      Math.cos(a) * d,
      Math.sin(a) * d,
      0.075,
      0.055,
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
  // Crisp volumetric white-ice headlight beam cutting across the snow.
  const cone = c.createLinearGradient(10, 0, 108, 0);
  cone.addColorStop(0, '#ffffffcc');
  cone.addColorStop(0.45, '#e8f4ff66');
  cone.addColorStop(1, '#d8ecff00');
  polygon(c, cone, [
    [10, -5],
    [108, -32],
    [108, 32],
    [10, 5],
  ]);
  for (const y of [-4, 4]) {
    const beam = c.createLinearGradient(10, y, 86, y);
    beam.addColorStop(0, '#fff9d6aa');
    beam.addColorStop(0.55, '#eef7ff38');
    beam.addColorStop(1, '#ffffff00');
    polygon(c, beam, [
      [10, y - 1.5],
      [86, y - 16],
      [86, y + 16],
      [10, y + 1.5],
    ]);
  }
  if (cop) {
    // Bold red & blue police siren bloom washing across the snow.
    glow(c, -2, -10, 58, phase ? '#ff2442cc' : '#ff244238');
    glow(c, -2, 10, 58, phase ? '#2b7fff38' : '#2b7fffdd');
  }
  c.restore();
}
