// Rays advance in camera-forward distance q. The skyline is the occupancy mask:
// once a near sample covers a pixel, a farther sample cannot overwrite it.
export const WIDTH = 384, HEIGHT = 216;
const SIZE = 512, MASK = SIZE - 1;
export const cell = (x, y) => ((Math.floor(y) & MASK) << 9) | (Math.floor(x) & MASK);
export const wrapped = d => d - SIZE * Math.round(d / SIZE);
export const rgba = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
export const hex = value => rgba(parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5), 16));
const bands = ['#1d6ab5','#2a82c9','#6ad0d4','#ebd094','#7ac24c','#58a33c','#408234','#858f9c','#eef4f8'].map(hex);
const thresholds = [4,6,7,9,12,16,20,25,28];
const sky = Array.from({ length: HEIGHT }, (_, y) => rgba(65 + Math.min(150, y), 141 + Math.min(89, y), 210 + Math.min(34, y)));

export function colourTerrain(heights) {
  const colours = new Uint8Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    const sunlight = h > 7 && h > heights[cell((i & MASK) - 1, (i >> 9) - 1)];
    colours[i] = thresholds.findIndex(top => h <= top) * 2 + Number(sunlight);
  }
  return { heights, colours };
}

// Index the palette by height band, terrace highlight, wall and fog distance.
const palette = new Uint32Array(9 * 2 * 2 * 8);
for (let i = 0; i < palette.length; i++) {
  const base = bands[i >> 5], fog = (i & 7) * .075;
  const light = (i & 16 ? 1.09 : 1) * (i & 8 ? .74 : 1);
  const channel = (shift, haze) => Math.min(255, ((base >>> shift) & 255) * light * (1 - fog) + haze * fog);
  palette[i] = rgba(channel(0, 202), channel(8, 224), channel(16, 236));
}

export function createCamera(plane, chase, reduced = false) {
  const a = chase ? plane.a : -Math.PI / 2;
  const dx = Math.cos(a), dy = Math.sin(a);
  const phase = !reduced && chase ? Math.sin((plane.loop || 0) * 2 * Math.PI) : 0;
  const pitch = chase && !reduced ? (plane.pitch || 0) * .12 + phase * .23 : 0;
  const tilt = chase && !reduced ? (plane.bank || 0) * .10 : 0;
  const back = 56, focal = 142;
  const cx = chase ? plane.x - dx * back : 256, cy = chase ? plane.y - dy * back : 515;
  const cz = chase ? (plane.z || 0) + 16 - phase * 8 : 0;
  const horizon = 87 + pitch * focal;
  const scaleX = .66, scaleY = .285, scaleZ = .51;
  function project(x, y, z) {
    let vx = x - cx, vy = y - cy;
    if (chase) { vx = wrapped(vx); vy = wrapped(vy); }
    const q = vx * dx + vy * dy, side = -vx * dy + vy * dx;
    const scale = chase ? focal / Math.max(1, q) : scaleX;
    const sx = WIDTH / 2 + side * scale;
    const sy = chase ? horizon + (cz - z) * scale + side * scale * tilt : 211 - q * scaleY - z * scaleZ;
    return { x: sx, y: sy, q, scale };
  }
  return { project, chase, cx, cy, cz, dx, dy, focal, tilt, horizon, scaleX, scaleY, scaleZ };
}

export function createFrame(data = new Uint8ClampedArray(WIDTH * HEIGHT * 4)) {
  return { pixels: new Uint32Array(data.buffer, data.byteOffset, WIDTH * HEIGHT), depth: new Float32Array(WIDTH * HEIGHT), skyline: new Int16Array(WIDTH) };
}

export function renderTerrain(frame, terrain, camera) {
  const { pixels, depth, skyline } = frame;
  const { chase, cx, cy, cz, dx, dy, tilt, horizon, focal, scaleX, scaleY, scaleZ } = camera;
  for (let y = 0; y < HEIGHT; y++) pixels.fill(sky[y], y * WIDTH, (y + 1) * WIDTH);
  depth.fill(Infinity); skyline.fill(HEIGHT);
  const far = chase ? 253 : 516;
  for (let q = 3; q < far; q += chase ? Math.max(.9, q * .023) : 2) {
    const scale = chase ? focal / q : scaleX;
    const stepX = -dy / scale, stepY = dx / scale;
    let x = cx + dx * q - WIDTH / 2 * stepX, y = cy + dy * q - WIDTH / 2 * stepY;
    const fog = chase ? Math.min(7, Math.floor(q / 34)) : 0;
    for (let col = 0; col < WIDTH; col++, x += stepX, y += stepY) {
      if (!chase && (x < 0 || x >= SIZE || y < 0 || y >= SIZE)) continue;
      const index = cell(x, y), h = Math.max(7, terrain.heights[index]);
      const row = Math.max(0, Math.floor(chase ? horizon + (cz - h) * scale + (col - WIDTH / 2) * tilt : 211 - q * scaleY - h * scaleZ));
      if (row >= skyline[col]) continue;
      const colour = (terrain.colours[index] << 4) | fog;
      const surface = chase ? Math.max(1, Math.ceil((cz - h) * focal / (q * q))) : 1;
      for (let r = row; r < skyline[col]; r++) {
        const p = r * WIDTH + col;
        pixels[p] = palette[colour | (r - row >= surface && h > 7 ? 8 : 0)]; depth[p] = q;
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
