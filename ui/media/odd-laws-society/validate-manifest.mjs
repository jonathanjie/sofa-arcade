import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { BUILDINGS, LAWS, GUILDS, STATES, PROPS, imageEntries } from './contract.mjs';

export const DEFAULT_MANIFEST = fileURLToPath(new URL('../../../public/assets/odd-laws-society/manifest.json', import.meta.url));
const sameKeys = (value, wanted, name) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...wanted].sort(), `${name} keys differ from the frozen contract`);
};

export function validateShape(manifest, { allowPlaceholders = false } = {}) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.gameId, 'odd-laws-society');
  sameKeys(manifest.buildings, BUILDINGS.map(x => x.id), 'buildings');
  sameKeys(manifest.laws, LAWS.map(x => x.id), 'laws');
  sameKeys(manifest.guilds, GUILDS, 'guilds');
  sameKeys(manifest.characters, Object.keys(STATES), 'characters');
  sameKeys(manifest.props, PROPS, 'props');
  for (const section of ['buildings', 'laws', 'guilds', 'props']) {
    for (const [id, entry] of Object.entries(manifest[section])) {
      assert.ok(entry && typeof entry === 'object' && typeof entry.src === 'string', `${section}.${id} requires a normal flat image`);
    }
  }
  for (const [character, states] of Object.entries(STATES)) {
    const actual = manifest.characters[character].states;
    assert.ok(actual && typeof actual === 'object', `characters.${character}.states required`);
    for (const state of states) assert.ok(actual[state]?.src, `${character}.${state} requires a normal flat image`);
  }
  for (const [name, entry] of imageEntries(manifest)) {
    assert.equal(typeof entry.src, 'string', `${name}: src must be a string`);
    assert.match(entry.src, /^[a-z0-9][a-z0-9/._-]*\.(?:png|webp|svg)$/, `${name}: use a local manifest-relative image URL`);
    assert.ok(!entry.src.split('/').some(part => part === '..' || part === '.' || part === ''), `${name}: src escapes the manifest directory`);
    for (const key of ['width', 'height']) assert.ok(Number.isInteger(entry[key]) && entry[key] > 0 && entry[key] <= 4096, `${name}: invalid ${key}`);
    assert.ok(typeof entry.alt === 'string' && entry.alt.trim().length >= 12, `${name}: useful alt text required`);
    assert.ok(['final', 'placeholder'].includes(entry.status), `${name}: accurate final/placeholder status required`);
    if (!allowPlaceholders) assert.equal(entry.status, 'final', `${name}: placeholder is a draft-PR gate`);
    if (entry.anchors) for (const [anchor, point] of Object.entries(entry.anchors)) {
      assert.ok(Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1), `${name}.${anchor}: anchors must use normalized coordinates inside the image`);
    }
    // Optional atlas entries must remain strictly inside their decoded image.
    if (entry.frame) {
      const { x, y, width, height } = entry.frame;
      assert.ok([x, y, width, height].every(Number.isInteger) && x >= 0 && y >= 0 && width > 0 && height > 0);
      assert.ok(x + width <= entry.width && y + height <= entry.height, `${name}: atlas frame leaves its image`);
    }
  }
  return imageEntries(manifest);
}

export async function validateManifest(manifestPath = DEFAULT_MANIFEST, options = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entries = validateShape(manifest, options);
  const root = await realpath(dirname(manifestPath));
  const inspected = new Map();
  for (const [name, entry] of entries) {
    if (inspected.has(entry.src)) {
      const prior = inspected.get(entry.src);
      assert.equal(entry.width, prior.width, `${name}: shared source width mismatch`);
      assert.equal(entry.height, prior.height, `${name}: shared source height mismatch`);
      continue;
    }
    const filename = await realpath(resolve(root, entry.src));
    const rel = relative(root, filename);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), `${name}: symlink leaves media pack`);
    const fileStat = await stat(filename);
    assert.ok(fileStat.isFile() && fileStat.size > 100 && fileStat.size <= 1048576, `${name}: image must exist and fit 1 MiB`);
    const bytes = await readFile(filename);
    if (entry.src.endsWith('.svg')) {
      const svg = bytes.toString('utf8');
      assert.ok(!/<(?:script|foreignObject|text|style)\b|\son\w+\s*=|@import|<!ENTITY/i.test(svg), `${name}: SVG must be inert, text-free, and self-contained`);
      for (const href of svg.matchAll(/(?:href|xlink:href)\s*=\s*["']([^"']+)/gi)) {
        assert.ok(href[1].startsWith('#') || /^data:image\/(?:png|webp);base64,/.test(href[1]), `${name}: external SVG reference`);
      }
      for (const url of svg.matchAll(/url\(\s*["']?([^)'"\s]+)/gi)) assert.ok(url[1].startsWith('#'), `${name}: external SVG paint`);
    }
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, entry.width, `${name}: declared image width differs from decoded file`);
    assert.equal(meta.height, entry.height, `${name}: declared image height differs from decoded file`);
    assert.equal(meta.hasAlpha, true, `${name}: transparency is required for cutouts/overlays`);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1, transparent = 0, visible = 0, edgePixels = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + info.channels - 1];
      if (alpha === 0) transparent++;
      if (alpha > 8) {
        visible++;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) edgePixels++;
      }
    }
    assert.ok(transparent > 0 && visible > 100, `${name}: blank asset or opaque background`);
    assert.equal(edgePixels, 0, `${name}: visible art touches the canvas edge; inspect for clipping`);
    inspected.set(entry.src, { src: entry.src, width: info.width, height: info.height, bytes: fileStat.size,
      alphaBounds: [minX, minY, maxX + 1, maxY + 1], transparentFraction: Number((transparent / (info.width * info.height)).toFixed(4)),
      sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  // Reusing a character pose is legitimate only when its reuse is disclosed.
  for (const [character, value] of Object.entries(manifest.characters)) {
    const seen = new Map();
    for (const [state, entry] of Object.entries(value.states)) {
      const hash = inspected.get(entry.src).sha256;
      if (seen.has(hash)) assert.ok(entry.poseReuse || entry.reusedFrom || entry.reuse, `${character}.${state}: identical pose must disclose reuse`);
      else seen.set(hash, state);
    }
  }
  const assets = [...inspected.values()];
  const bytes = assets.reduce((sum, x) => sum + x.bytes, 0);
  assert.ok(bytes <= 12 * 1024 * 1024, 'Runtime image pack exceeds 12 MiB; optimize before shipping');
  return { schemaVersion: 1, status: 'passed', entries: entries.length, uniqueImages: assets.length,
    catalog: { buildings: 18, laws: 12, guilds: 4, characterStates: 14, props: 6 },
    placeholders: entries.filter(([, e]) => e.status === 'placeholder').length, runtimeImageBytes: bytes, assets };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await validateManifest(process.argv[2] || DEFAULT_MANIFEST), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
