// Rays advance in camera-forward distance q. The skyline is the occupancy mask:
// once a near sample covers a pixel, a farther sample cannot overwrite it.
export const WIDTH = 640, HEIGHT = 360;
const SIZE = 512, MASK = SIZE - 1;
export const cell = (x, y) => ((Math.floor(y) & MASK) << 9) | (Math.floor(x) & MASK);
export const wrapped = d => d - SIZE * Math.round(d / SIZE);
export const rgba = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
export const hex = value => rgba(parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5), 16));
const SEA = 7, FOG_STEPS = 16, TONES = 8, FACES = 4;
const bands = ['#206ba9','#2994ba','#61c9ca','#ebd59d','#a0c963','#74ad59','#518b58','#89939b','#edf5f3'].map(hex);
const thresholds = [4,6,7,9,12,16,20,25,28];
const horizonMist = hex('#dcf2fa');
const overviewBase = 394;

function blend(a, b, amount) {
  const channel = shift => ((a >>> shift) & 255) * (1 - amount) + ((b >>> shift) & 255) * amount;
  return rgba(channel(0), channel(8), channel(16));
}

export function colourTerrain(input) {
  const heights = input.heights ?? input;
  const colours = new Uint8Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    const x = i & MASK, y = i >> 9, h = heights[i];
    const nw = heights[cell(x - 1, y - 1)], se = heights[cell(x + 1, y + 1)];
    const hollow = Math.max(0, (nw + se) / 2 - h);
    // Stable grain belongs to the map cell, not the screen or animation clock.
    const grain = ((Math.imul(i ^ (i >>> 7), 0x9e3779b1) >>> 30) - 1.5) * .65;
    const tone = Math.max(0, Math.min(7, Math.round(3.5 + (se - nw) * 1.4 - hollow + grain)));
    colours[i] = thresholds.findIndex(top => h <= top) * TONES + tone;
  }
  return { heights, colours };
}

// Each tone has a cap and three sediment layers, each with sixteen haze levels.
// Two extra surface tones keep animated surf and glints in the same atmosphere.
const glint = bands.length * TONES, surf = glint + 1;
const palette = new Uint32Array((surf + 1) * FACES * FOG_STEPS);
for (let tone = 0; tone <= surf; tone++) {
  const base = tone === glint ? hex('#97dedb') : tone === surf ? hex('#c4ede6') : bands[tone >> 3];
  const tint = tone >= glint ? base : blend(base, tone % TONES < 4 ? hex('#284661') : hex('#ffe6ac'), Math.abs(tone % TONES - 3.5) * .046);
  for (let face = 0; face < FACES; face++) {
    const stone = face ? blend(tint, [0,hex('#725f53'),hex('#66565a'),hex('#434a52')][face], .53 + face * .07) : tint;
    for (let fog = 0; fog < FOG_STEPS; fog++) {
      palette[(tone * FACES + face) * FOG_STEPS + fog] = blend(stone, horizonMist, (fog / 15) ** 1.5 * .92);
    }
  }
}

// Cache sky scanlines and the translucent sun halo; neither needs per-frame blending.
const sky = Array.from({ length: HEIGHT }, (_, y) => blend(hex('#2b78c8'), horizonMist, Math.min(1, y / 155)));
const sunRadius = 38, sunY = 98;
const sunlight = Array.from({ length: sunRadius * 2 + 1 }, (_, row) => {
  const dy = row - sunRadius;
  return Uint32Array.from({ length: sunRadius * 2 + 1 }, (_, col) => {
    const radius = Math.hypot(col - sunRadius, dy);
    const glow = radius <= 9 ? .98 : .5 * Math.max(0, 1 - (radius - 9) / (sunRadius - 9)) ** 2;
    return blend(sky[sunY + dy], hex('#fff2c4'), glow);
  });
});

function drawSky(pixels, camera) {
  const offset = Math.round(camera.horizon - 144);
  for (let y = 0; y < HEIGHT; y++) pixels.fill(sky[Math.max(0, Math.min(HEIGHT - 1, y - offset))], y * WIDTH, (y + 1) * WIDTH);
  // The light source stays in the northwest as the plane turns.
  const forward = -(camera.dx + camera.dy) * Math.SQRT1_2;
  if (forward <= 0) return;
  const side = (camera.dy - camera.dx) * Math.SQRT1_2;
  const left = Math.round(WIDTH / 2 + camera.focal * side / forward) - sunRadius;
  const start = Math.max(0, -left), end = Math.min(2 * sunRadius + 1, WIDTH - left);
  if (start >= end) return;
  for (let i = 0; i < sunlight.length; i++) {
    const y = sunY + offset - sunRadius + i;
    if (y >= 0 && y < HEIGHT) pixels.set(sunlight[i].subarray(start, end), y * WIDTH + left + start);
  }
}

export function createCamera(plane, chase, reduced = false) {
  const a = chase ? plane.a : -Math.PI / 2;
  const dx = Math.cos(a), dy = Math.sin(a);
  const phase = !reduced && chase ? Math.sin((plane.loop || 0) * 2 * Math.PI) : 0;
  const pitch = chase && !reduced ? (plane.pitch || 0) * .12 + phase * .23 : 0;
  const tilt = chase && !reduced ? (plane.bank || 0) * .10 : 0;
  const back = 62, focal = 236;
  const cx = chase ? plane.x - dx * back : 256, cy = chase ? plane.y - dy * back : 558;
  const cz = chase ? (plane.z || 0) + 18 - phase * 8 : 0;
  const horizon = 144 + pitch * focal;
  const scaleX = 1.25, scaleY = .62, scaleZ = 1.05;
  function project(x, y, z) {
    let vx = x - cx, vy = y - cy;
    if (chase) { vx = wrapped(vx); vy = wrapped(vy); }
    const q = vx * dx + vy * dy, side = -vx * dy + vy * dx;
    const scale = chase ? focal / Math.max(1, q) : scaleX;
    const sx = WIDTH / 2 + side * scale;
    const sy = chase ? horizon + (cz - z) * scale + side * scale * tilt : overviewBase - q * scaleY - z * scaleZ;
    return { x: sx, y: sy, q, scale };
  }
  return { project, chase, cx, cy, cz, dx, dy, focal, tilt, horizon, scaleX, scaleY, scaleZ };
}

export function createFrame(data = new Uint8ClampedArray(WIDTH * HEIGHT * 4)) {
  return { pixels: new Uint32Array(data.buffer, data.byteOffset, WIDTH * HEIGHT), depth: new Float32Array(WIDTH * HEIGHT), skyline: new Int16Array(WIDTH) };
}

export function renderTerrain(frame, terrain, camera, time = 0) {
  const { pixels, depth, skyline } = frame;
  const { chase, cx, cy, cz, dx, dy, tilt, horizon, focal, scaleX, scaleY, scaleZ } = camera;
  if (chase) {
    drawSky(pixels, camera);
    depth.fill(Infinity);
  }
  skyline.fill(HEIGHT);
  const wave = Math.floor(time / 95); // milliseconds; zero time disables water motion
  const far = chase ? 253 : Math.ceil(overviewBase / scaleY) + 3;
  for (let q = 3; q < far; q += chase ? Math.max(.9, q * .023) : 2) {
    const scale = chase ? focal / q : scaleX;
    const stepX = -dy / scale, stepY = dx / scale;
    let x = cx + dx * q - WIDTH / 2 * stepX, y = cy + dy * q - WIDTH / 2 * stepY;
    const fog = chase ? Math.min(15, Math.floor(q / 16)) : 0;
    for (let col = 0; col < WIDTH; col++, x += stepX, y += stepY) {
      const index = cell(x, y), h = Math.max(SEA, terrain.heights[index]);
      const row = Math.max(0, Math.floor(chase ? horizon + (cz - h) * scale + (col - WIDTH / 2) * tilt : overviewBase - q * scaleY - h * scaleZ));
      if (row >= skyline[col]) continue;
      let tone = terrain.colours[index];
      if (time > 0 && h === SEA) {
        const ripple = ((index & MASK) + ((index >> 9) * 7) + wave) & 63;
        if (terrain.heights[index] === SEA && ripple < 5) tone = surf;
        else if (ripple < 2 && ((index >> 9) & 3) === 0) tone = glint;
      }
      const colour = tone * FACES * FOG_STEPS + fog;
      const surface = chase ? Math.max(1, Math.ceil((cz - h) * scale / q * Math.max(.9, q * .023))) : 2;
      const wall = h > SEA ? row + surface : HEIGHT;
      for (let r = row; r < skyline[col]; r++) {
        const p = r * WIDTH + col;
        const face = r < wall ? 0 : 1 + ((h + Math.floor((r - wall) / (chase ? scale : scaleZ))) % 3);
        pixels[p] = palette[colour + face * FOG_STEPS]; depth[p] = q;
      }
      skyline[col] = row;
    }
  }
}

// Mirror the engine lattice here: the portable TV serves only the UI module tree.
function hashSeed(seed) {
  let hash = 2166136261;
  for (const ch of String(seed)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return hash >>> 0;
}

// Mulberry32 keeps its single word in the round so a cloned tick replays exactly.
function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let word = Math.imul(state.rng ^ state.rng >>> 15, state.rng | 1);
  word ^= word + Math.imul(word ^ word >>> 7, word | 61);
  return ((word ^ word >>> 14) >>> 0) / 4294967296;
}

// Interpolate a periodic lattice cell by cell. Each row shares its two edge
// values; the inner loop needs no hashes, divisions or modulo operations.
function addOctave(field, rng, period, weight) {
  const cell = SIZE / period;
  const lattice = Float32Array.from({ length: period * period }, () => random(rng) - 0.5);
  const smooth = Float32Array.from({ length: cell }, (_, i) => (i / cell) ** 2 * (3 - 2 * i / cell));
  for (let y = 0; y < SIZE; y++) {
    const row = Math.floor(y / cell), v = smooth[y % cell];
    const top = row * period, bottom = ((row + 1) % period) * period;
    let index = y * SIZE;
    for (let col = 0; col < period; col++) {
      const next = (col + 1) % period;
      const left = lattice[top + col] * (1 - v) + lattice[bottom + col] * v;
      const right = lattice[top + next] * (1 - v) + lattice[bottom + next] * v;
      for (let i = 0; i < cell; i++) field[index++] += weight * (left + (right - left) * smooth[i]);
    }
  }
}

export function buildTerrain(seed) {
  const rng = { rng: hashSeed(seed) }, area = SIZE ** 2;
  const field = new Float32Array(area), heights = new Uint8Array(area), clouds = new Uint8Array(area);
  for (let octave = 0; octave < 4; octave++) addOctave(field, rng, 4 << octave, 24 / 2 ** octave);
  for (let i = 0; i < area; i++) heights[i] = Math.max(0, Math.min(28, Math.round(13 + field[i] * 1.5)));
  field.fill(0);
  addOctave(field, rng, 8, 180);
  addOctave(field, rng, 16, 74);
  for (let i = 0; i < area; i++) clouds[i] = Math.round(128 + field[i]);
  return { size: SIZE, heights, clouds };
}
