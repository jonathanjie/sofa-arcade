/** Reproducible packing only: image generation authored the poses and alpha. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
let sharp;
try { sharp = (await import('sharp')).default; }
catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  sharp = (await import(join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp', 'dist', 'index.mjs'))).default;
}
const output = join(root, 'public/assets/gravity-orchard/characters');
await mkdir(output, { recursive: true });
await mkdir(join(here, 'evidence'), { recursive: true });
const size = 256;
const pivot = { x: 128, y: 240 };
const palettes = ['#f8efd9', '#213e36'];
const stateNames = {
  jon: ['idle', 'lean', 'brace', 'cheer'],
  lydia: ['idle', 'lean', 'brace', 'cheer'],
  lala: ['idle', 'forecast', 'gust', 'pleased'],
};
const timings = {
  idle: [1800, 180], lean: [420, 420], brace: [500, 500], cheer: [300, 300],
  forecast: [650, 450], gust: [240, 240], pleased: [800, 800],
};

function opaqueBounds(raw, threshold = 32) {
  const { data, info: { width, height } } = raw;
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > threshold) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
  }
  assert(right > left && bottom > top, 'A sprite must contain opaque pixels');
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function stanceCenter(raw, bounds) {
  const { data, info: { width } } = raw;
  let left = width, right = 0;
  const band = Math.max(8, Math.round(bounds.height * .04));
  for (let y = bounds.bottom - band; y < bounds.bottom; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 64) {
      left = Math.min(left, x); right = Math.max(right, x + 1);
    }
  }
  return (left + right) / 2;
}

const result = { assets: {}, characterStates: {} };
const report = { schemaVersion: 1, sourceMethod: 'Generated poses; deterministic crop, baseline registration and WebP encoding.', atlases: {} };
const contactFrames = [];
for (const [name, states] of Object.entries(stateNames)) {
  const source = join(here, `${name}-source.png`);
  const metadata = await sharp(source).metadata();
  assert.equal(metadata.channels, 4);
  const rawCells = [];
  for (let row = 0; row < 2; row++) for (let column = 0; column < 4; column++) {
    const left = Math.round(metadata.width * column / 4), top = Math.round(metadata.height * row / 2);
    const width = Math.round(metadata.width * (column + 1) / 4) - left;
    const height = Math.round(metadata.height * (row + 1) / 2) - top;
    const raw = await sharp(source).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = opaqueBounds(raw);
    rawCells.push({ raw, bounds, anchorX: stanceCenter(raw, bounds), name: `${states[column]}-${row + 1}`, sourceCell: { left, top, width, height } });
  }
  const maxHeight = Math.max(...rawCells.map(cell => cell.bounds.height));
  const maxOffset = Math.max(...rawCells.flatMap(cell => [cell.anchorX - cell.bounds.left, cell.bounds.right - cell.anchorX]));
  const uniformScale = Math.min(216 / maxHeight, 116 / maxOffset);
  // A focused image-generation correction preserves Lydia's first lean stance.
  // Register it against that stance rather than alternating opposite body tilts.
  if (name === 'lydia') {
    const raw = await sharp(join(here, 'lydia-lean-source.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = opaqueBounds(raw);
    rawCells[5] = { raw, bounds, anchorX: stanceCenter(raw, bounds), name: 'lean-2',
      scale: uniformScale * rawCells[1].bounds.height / bounds.height, sourceCell: 'lydia-lean-source.png (full alpha bounds)' };
  }
  const composites = [];
  const frames = {};
  const checks = [];
  for (let i = 0; i < rawCells.length; i++) {
    const cell = rawCells[i], { raw, bounds } = cell;
    const scale = cell.scale || uniformScale;
    const left = Math.max(0, bounds.left - 4), top = Math.max(0, bounds.top - 4);
    const right = Math.min(raw.info.width, bounds.right + 4), bottom = Math.min(raw.info.height, bounds.bottom + 4);
    const width = Math.round((right - left) * scale), height = Math.round((bottom - top) * scale);
    const cropped = await sharp(raw.data, { raw: raw.info }).extract({ left, top, width: right - left, height: bottom - top })
      .resize(width, height, { kernel: 'lanczos3' }).png().toBuffer();
    const pasteX = pivot.x - Math.round((cell.anchorX - left) * scale);
    const pasteY = pivot.y - Math.round((bounds.bottom - top) * scale);
    assert(pasteX >= 6 && pasteX + width <= size - 6, `${name}/${cell.name} horizontal padding`);
    assert(pasteY >= 6 && pasteY + height <= size - 6, `${name}/${cell.name} vertical padding`);
    const frame = await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
      .composite([{ input: cropped, left: pasteX, top: pasteY }]).png().toBuffer();
    const frameRaw = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const frameBounds = opaqueBounds(frameRaw, 0);
    assert(frameBounds.left >= 6 && frameBounds.top >= 6 && frameBounds.right <= 250 && frameBounds.bottom <= 250);
    const x = i % 4 * size, y = Math.floor(i / 4) * size;
    const state = states[i % 4];
    frames[cell.name] = { x, y, width: size, height: size, durationMs: timings[state][Math.floor(i / 4)], pivot: { ...pivot } };
    composites.push({ input: frame, left: x, top: y });
    checks.push({ frame: cell.name, sourceCell: cell.sourceCell, sourceBounds: bounds, scale, pixelBounds: frameBounds,
      sha256: createHash('sha256').update(frameRaw.data).digest('hex') });
    contactFrames.push({ character: name, name: cell.name, data: frame });
  }
  assert.equal(new Set(checks.map(check => check.sha256)).size, 8, `${name}: all eight frames must be distinct`);
  const file = join(output, `${name}-atlas.webp`);
  await sharp({ create: { width: size * 4, height: size * 2, channels: 4, background: '#00000000' } })
    .composite(composites).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(file);
  const final = await sharp(file).metadata();
  const bytes = (await readFile(file)).length;
  assert.equal(final.width, 1024); assert.equal(final.height, 512); assert(final.hasAlpha);
  const decodedChecks = [];
  for (let i = 0; i < 8; i++) {
    const raw = await sharp(file).extract({ left: i % 4 * size, top: Math.floor(i / 4) * size, width: size, height: size })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = opaqueBounds(raw, 0);
    assert(bounds.left >= 6 && bounds.top >= 6 && bounds.right <= 250 && bounds.bottom <= 250, `${name}: decoded frame gutter`);
    let opaque = 0, nearOpaque = 0, empty = 0;
    for (let pixel = 3; pixel < raw.data.length; pixel += 4) {
      if (raw.data[pixel] === 0) empty++;
      if (raw.data[pixel] === 255) opaque++;
      if (raw.data[pixel] > 240) nearOpaque++;
    }
    assert(empty > size * size * .35, `${name}: expected transparent padding and silhouette`);
    assert(nearOpaque > size * size * .1, `${name}: expected usable near-opaque artwork`);
    decodedChecks.push({ frame: rawCells[i].name, bounds, emptyPixels: empty, opaquePixels: opaque, nearOpaquePixels: nearOpaque,
      sha256: createHash('sha256').update(raw.data).digest('hex') });
  }
  assert.equal(new Set(decodedChecks.map(check => check.sha256)).size, 8);
  const assetKey = `character-${name}`;
  result.assets[assetKey] = {
    src: `/assets/gravity-orchard/characters/${name}-atlas.webp`, width: 1024, height: 512, kind: 'atlas', frames,
    label: name[0].toUpperCase() + name.slice(1),
    transparent: true, pivot: { ...pivot }, frameWidth: size, frameHeight: size,
    alt: `${name[0].toUpperCase() + name.slice(1)}: ${states.join(', ')} orchard poses`,
  };
  result.characterStates[name] = Object.fromEntries(states.map(state => [state, {
    asset: assetKey, frames: [`${state}-1`, `${state}-2`], reducedMotionFrame: `${state}-1`, loop: true,
  }]));
  report.atlases[name] = { src: result.assets[assetKey].src, bytes, width: final.width, height: final.height,
    hasAlpha: final.hasAlpha, pivot, uniformScale, frames: checks, decodedFrames: decodedChecks,
    sha256: createHash('sha256').update(await readFile(file)).digest('hex') };
}

// A literal asset contact sheet, with labels outside images and two backgrounds.
const reviewWidth = 1280, reviewHeight = 860;
const overlays = [];
let svg = `<svg width="${reviewWidth}" height="${reviewHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f8efd9"/><style>text{font-family:DejaVu Sans,sans-serif;fill:#42392e} .small{font-size:13px}</style><text x="24" y="32" font-size="23">Gravity Orchard · 24 distinct character poses</text><text x="24" y="56" font-size="14">80 px game scale above · 128 px inspection below · common foot pivot and transparent padding</text>`;
for (let row = 0; row < 3; row++) {
  const name = Object.keys(stateNames)[row];
  const top = 80 + row * 252;
  const background = palettes[row % 2];
  svg += `<rect x="0" y="${top}" width="1280" height="244" fill="${background}"/><text x="22" y="${top + 24}" font-size="17" style="fill:${row % 2 ? '#f8efd9' : '#42392e'}">${name.toUpperCase()}</text>`;
  const frames = contactFrames.filter(frame => frame.character === name);
  for (let column = 0; column < 8; column++) {
    const x = 112 + column * 142;
    overlays.push({ input: await sharp(frames[column].data).resize(80, 80).png().toBuffer(), left: x + 24, top: top + 30 });
    overlays.push({ input: await sharp(frames[column].data).resize(128, 128).png().toBuffer(), left: x, top: top + 106 });
    svg += `<text x="${x + 64}" y="${top + 240}" text-anchor="middle" class="small" style="fill:${row % 2 ? '#f8efd9' : '#42392e'}">${frames[column].name}</text>`;
  }
}
svg += '</svg>';
await sharp(Buffer.from(svg)).composite(overlays).png().toFile(join(here, 'evidence', 'character-states-80-128.png'));
await writeFile(join(here, 'fragment.json'), JSON.stringify(result, null, 2) + '\n');
await writeFile(join(here, 'evidence', 'atlas-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.atlases).map(([name, atlas]) => [name, { bytes: atlas.bytes, frames: atlas.frames.length, hasAlpha: atlas.hasAlpha }]))));
