import { hashSeed, random } from '../whiteout-drift/city.mjs';

export const WORLD_SIZE = 512;
export const SEA_LEVEL = 7;
export const MAX_HEIGHT = 28;
export const wrapCoord = v => ((v % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE;
// Displacement from a to b (the negative direction wins exact half-world ties).
export const wrapDelta = (a, b) => wrapCoord(b - a + 256) - 256;
export const sampleHeight = (terrain, x, y) => terrain.heights[Math.floor(wrapCoord(y)) * WORLD_SIZE + Math.floor(wrapCoord(x))];

// Interpolate a periodic lattice cell by cell. Each row shares its two edge
// values; the inner loop needs no hashes, divisions or modulo operations.
function addOctave(field, rng, period, weight) {
  const cell = WORLD_SIZE / period;
  const lattice = Float32Array.from({ length: period * period }, () => random(rng) - 0.5);
  const smooth = Float32Array.from({ length: cell }, (_, i) => (i / cell) ** 2 * (3 - 2 * i / cell));
  for (let y = 0; y < WORLD_SIZE; y++) {
    const row = Math.floor(y / cell), v = smooth[y % cell];
    const top = row * period, bottom = ((row + 1) % period) * period;
    let index = y * WORLD_SIZE;
    for (let col = 0; col < period; col++) {
      const next = (col + 1) % period;
      const left = lattice[top + col] * (1 - v) + lattice[bottom + col] * v;
      const right = lattice[top + next] * (1 - v) + lattice[bottom + next] * v;
      for (let i = 0; i < cell; i++) field[index++] += weight * (left + (right - left) * smooth[i]);
    }
  }
}

export function buildTerrain(seed) {
  const rng = { rng: hashSeed(seed) }, area = WORLD_SIZE ** 2;
  const field = new Float32Array(area), heights = new Uint8Array(area), clouds = new Uint8Array(area);
  for (let octave = 0; octave < 4; octave++) addOctave(field, rng, 4 << octave, 24 / 2 ** octave);
  for (let i = 0; i < area; i++) heights[i] = Math.max(0, Math.min(MAX_HEIGHT, Math.round(13 + field[i] * 1.5)));
  field.fill(0);
  addOctave(field, rng, 8, 180);
  addOctave(field, rng, 16, 74);
  for (let i = 0; i < area; i++) clouds[i] = Math.round(128 + field[i]);
  return { size: WORLD_SIZE, heights, clouds };
}
