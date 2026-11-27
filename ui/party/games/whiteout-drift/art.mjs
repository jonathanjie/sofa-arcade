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
function drawSubBuilding(c, x, y, w, h, seed) {
  const height = 14 + (seed % 9);
  for (let z = 0; z <= height; z++) {
    const left = x - Math.floor(z / 2), top = y - z;
    const band = Math.floor(18 * z / height);
    rect(c, `rgb(${22 + band} ${29 + band} ${47 + band})`, left, top, w, h);
    rect(c, `rgb(${33 + band} ${41 + band} ${62 + band})`, left, top + h - 1, w, 1);
    const floor = Math.floor(z / 6);
    if (z % 6 < 2 || z % 6 > 4) continue;
    for (let i = 4; i < w - 6; i += 8) {
      const n = noise(seed + i * 3 + floor * 17);
      if (n > 0.36) rect(c, n > 0.78 ? '#fff4cf' : '#ffcf66', left + i, top + h - 1, 4, 1);
    }
    for (let j = 5; j < h - 6; j += 10) {
      const n = noise(seed + j * 5 + floor * 13);
      if (n > 0.45) rect(c, n > 0.8 ? '#ffeeb8' : '#f2b85c', left + w - 1, top + j, 1, 4);
    }
  }
  x -= Math.floor(height / 2);
  y -= height;
  // Crisp frosted parapet lip around a deep midnight-indigo rooftop.
  rect(c, '#7c92ad', x - 1, y - 1, w + 2, h + 2);
  rect(c, '#192234', x + 2, y + 2, w - 4, h - 4);
  const slate = ['#26334a', '#212d42', '#2b3952', '#1f2a3e'][seed % 4];
  rect(c, slate, x + 4, y + 4, w - 8, h - 8);
  // Uneven wind-blown snowdrifts banked along the north and west parapets.
  for (let i = 4; i < w - 6; i += 5) {
    const drift = 2 + Math.floor(6 * noise(seed + Math.floor(i / 14)));
    rect(c, '#6a829e', x + i, y + 4, 5, drift);
    if (drift > 4) rect(c, '#9eb5cc', x + i, y + 4, 5, 2);
  }
  for (let j = 4; j < h - 6; j += 6) {
    const drift = 2 + Math.floor(4 * noise(seed + 99 + Math.floor(j / 16)));
    rect(c, '#566d87', x + 4, y + j, drift, 6);
  }
  // Subtle standing-seam roof lines.
  for (let seam = 16; seam < w - 8; seam += 20) {
    rect(c, '#99b4d416', x + seam, y + 10, 1, h - 16);
  }
  // Stepped rooftop penthouse or skylight + HVAC units.
  if (w > 54 && h > 54) {
    const px = x + Math.floor(w * (0.14 + 0.22 * noise(seed + 5)));
    const py = y + Math.floor(h * (0.2 + 0.22 * noise(seed + 6)));
    const pw = Math.min(34, Math.floor(w * 0.36));
    const ph = Math.min(26, Math.floor(h * 0.32));
    rect(c, '#121928', px + 4, py + 5, pw, ph);
    rect(c, '#3a4c66', px, py, pw, ph);
    rect(c, '#29374f', px + 2, py + 2, pw - 4, ph - 4);
    rect(c, '#8ba3bd', px, py, pw, 2);
    if (seed % 2 === 0) {
      for (let i = 4; i < pw - 6; i += 8) rect(c, '#6389ab', px + i, py + 5, 5, ph - 10);
    } else {
      for (let i = 4; i < pw - 6; i += 6) rect(c, '#1b2638', px + i, py + 4, 3, ph - 8);
    }
  }
  if (w > 46 && h > 42) {
    const tx = x + Math.floor(w * (0.58 + 0.14 * noise(seed + 2)));
    const ty = y + Math.floor(h * (0.48 + 0.2 * noise(seed + 3)));
    if (tx + 20 < x + w - 4 && ty + 16 < y + h - 4) {
      rect(c, '#141c2b', tx + 3, ty + 5, 18, 13);
      rect(c, '#594850', tx, ty, 17, 12);
      rect(c, '#3e333c', tx + 11, ty, 6, 12);
      rect(c, '#a8bfd4', tx - 1, ty - 2, 19, 3);
    }
  }
}

export function drawBuildingBlock(c, x, y, w, h, seed) {
  // Deep curb shadow + paved sidewalk frame around the whole block.
  rect(c, '#192233aa', x - 6, y - 5, w + 16, h + 16);
  rect(c, '#4b5c73', x - 6, y - 6, w + 12, h + 12);
  rect(c, '#8ca1b8', x - 6, y - 6, w + 12, 2);
  rect(c, '#7489a1', x - 6, y - 6, 2, h + 12);
  // Subtle sidewalk curb joints.
  for (let i = 0; i < w + 8; i += 18) {
    rect(c, '#354459', x - 5 + i, y - 6, 1, 5);
    rect(c, '#354459', x - 5 + i, y + h + 1, 1, 5);
  }
  // Split each block with a lit midnight alley (like the original snow-chase city).
  const alley = 14;
  if (seed % 2 === 0 && h > 95) {
    const split = Math.floor(h * (0.44 + 0.12 * noise(seed + 11)));
    rect(c, '#151d2d', x, y + split - 2, w, alley + 4);
    for (let i = 6; i < w - 8; i += 9) {
      const n = noise(seed + i * 5);
      if (n > 0.34) rect(c, n > 0.75 ? '#fff2c2' : '#ffcf66', x + i, y + split + 2, 5, 3);
      const n2 = noise(seed + i * 9 + 41);
      if (n2 > 0.42) rect(c, n2 > 0.78 ? '#fff2c2' : '#f5b856', x + i, y + split + alley - 5, 5, 3);
    }
    drawSubBuilding(c, x, y, w, split - 2, seed + 1);
    drawSubBuilding(c, x, y + split + alley, w, h - split - alley, seed + 7);
  } else if (w > 110) {
    const split = Math.floor(w * (0.45 + 0.1 * noise(seed + 13)));
    rect(c, '#151d2d', x + split - 2, y, alley + 4, h);
    for (let j = 6; j < h - 8; j += 10) {
      const n = noise(seed + j * 7);
      if (n > 0.36) rect(c, n > 0.76 ? '#fff2c2' : '#ffcf66', x + split + 2, y + j, 3, 5);
      const n2 = noise(seed + j * 11 + 29);
      if (n2 > 0.42) rect(c, n2 > 0.78 ? '#fff2c2' : '#f5b856', x + split + alley - 5, y + j, 3, 5);
    }
    drawSubBuilding(c, x, y, split - 2, h, seed + 3);
    drawSubBuilding(c, x + split + alley, y, w - split - alley, h, seed + 11);
  } else {
    drawSubBuilding(c, x, y, w, h, seed);
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
