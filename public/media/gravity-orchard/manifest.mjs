import data from './manifest-data.mjs';

export const FRUIT_TYPES = Object.freeze(['apple', 'plum', 'pear', 'starfruit']);
export const STAGE_IDS = Object.freeze(['morning-delivery', 'switchback-grove', 'moonlight-picnic']);
export const REQUIRED_STATES = Object.freeze({
  jon: Object.freeze(['idle', 'lean', 'brace', 'cheer']),
  lydia: Object.freeze(['idle', 'lean', 'brace', 'cheer']),
  lala: Object.freeze(['idle', 'forecast', 'gust', 'pleased']),
});
const validPath = path => typeof path === 'string' && /^[a-z0-9][a-z0-9/._-]*$/.test(path) &&
  !path.split('/').some(part => !part || part === '.' || part === '..');
const dimension = value => Number.isSafeInteger(value) && value > 0 && value <= 8192;
const has = (object, key) => Object.hasOwn(object || {}, key);
function fail(reason) { throw new TypeError(`Invalid Gravity Orchard manifest: ${reason}`); }
function pivot(value, width, height, name) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) ||
      value.x < 0 || value.x > width || value.y < 0 || value.y > height) fail(`${name} pivot`);
}

/** Validate untrusted JSON before a renderer uses its paths or atlas rectangles. */
export function validateManifest(value) {
  if (!value || value.schemaVersion !== 1 || value.gameId !== 'gravity-orchard') fail('identity');
  if (!value.assets || typeof value.assets !== 'object' || Array.isArray(value.assets)) fail('assets');
  if (!Array.isArray(value.runtimeFiles) || new Set(value.runtimeFiles).size !== value.runtimeFiles.length) fail('runtime inventory');
  for (const path of value.runtimeFiles) {
    if (!validPath(path) || !/^(public\/assets|ui\/media)\/gravity-orchard\//.test(path) ||
        /(?:^|\/)(sources|node_modules|evidence|tests)(?:\/|$)|\.test\.|package(?:-lock)?\.json|preview|gallery/.test(path)) fail(`non-runtime path ${path}`);
  }
  for (const path of ['public/assets/gravity-orchard/manifest.json',
    ...['manifest.mjs','manifest-data.mjs','fallbacks.mjs','score.mjs','events.mjs'].map(name => `ui/media/gravity-orchard/${name}`)]) {
    if (!value.runtimeFiles.includes(path)) fail(`missing runtime module ${path}`);
  }
  const required = ['cover', 'compost', 'gate-open', 'gate-forecast', 'gate-closed', 'gust-forecast', 'gust-active',
    'effect-impact', 'effect-capture', 'effect-compost', 'effect-order'];
  for (const stage of STAGE_IDS) for (const role of ['environment', 'tray', 'bridge', 'hedge', 'bumper']) required.push(`${role}-${stage}`);
  for (const type of FRUIT_TYPES) {
    required.push(`fruit-${type}`);
    for (const state of ['ordinary', 'accepting', 'rejecting', 'full']) required.push(`basket-${type}-${state}`);
  }
  for (const name of required) if (!has(value.assets, name)) fail(`missing ${name}`);
  const paths = new Set();
  for (const [key, asset] of Object.entries(value.assets)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || !asset || typeof asset !== 'object') fail(`asset ${key}`);
    if (!['image', 'atlas'].includes(asset.kind) || !dimension(asset.width) || !dimension(asset.height)) fail(`${key} kind/dimensions`);
    if (typeof asset.src !== 'string' || !asset.src.startsWith('/assets/gravity-orchard/') ||
        !validPath(asset.src.slice(1)) || !/\.(svg|webp|png)$/.test(asset.src)) fail(`${key} URL`);
    if (paths.has(asset.src)) fail(`duplicate source ${key}`);
    paths.add(asset.src);
    if (!value.runtimeFiles.includes(`public${asset.src}`)) fail(`${key} absent from inventory`);
    if (typeof asset.alt !== 'string' || !asset.alt.trim() || asset.placeholder || asset.status === 'placeholder') fail(`${key} unfinished`);
    if (asset.pivot) pivot(asset.pivot, asset.width, asset.height, key);
    if (asset.kind === 'atlas') {
      if (!asset.frames || typeof asset.frames !== 'object' || !Object.keys(asset.frames).length) fail(`${key} frames`);
      for (const [name, frame] of Object.entries(asset.frames)) {
        if (!frame || !Number.isSafeInteger(frame.x) || !Number.isSafeInteger(frame.y) || frame.x < 0 || frame.y < 0 ||
            !dimension(frame.width) || !dimension(frame.height) || frame.x + frame.width > asset.width ||
            frame.y + frame.height > asset.height || !Number.isFinite(frame.durationMs) || frame.durationMs < 16 || frame.durationMs > 10000) fail(`${key}/${name} bounds/duration`);
        pivot(frame.pivot, frame.width, frame.height, `${key}/${name}`);
      }
    } else if (asset.frames) fail(`${key} unexpected frames`);
  }
  for (const [actor, states] of Object.entries(REQUIRED_STATES)) {
    if (!value.characterStates?.[actor]) fail(`${actor} states`);
    for (const state of states) {
      const record = value.characterStates[actor][state];
      const atlas = value.assets[record?.asset];
      if (!atlas || atlas.kind !== 'atlas' || !Array.isArray(record.frames) || record.frames.length < 2 ||
          new Set(record.frames).size !== record.frames.length || record.frames.some(name => !has(atlas.frames, name))) fail(`${actor}/${state} state coverage`);
      if (!record.frames.includes(record.reducedMotionFrame) || typeof record.loop !== 'boolean') fail(`${actor}/${state} motion policy`);
    }
  }
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const MANIFEST = freeze(validateManifest(data));
export const ASSETS = MANIFEST.assets;
export const CHARACTER_STATES = MANIFEST.characterStates;
export const RUNTIME_FILES = MANIFEST.runtimeFiles;
export const manifest = MANIFEST;
export default MANIFEST;
export function getAsset(key) { return has(ASSETS, key) ? ASSETS[key] : null; }

/** Rectangles are source pixels. This clock selects artwork only; it never advances a game. */
export function getCharacterFrame(actor, state = 'idle', elapsedMs = 0, { reducedMotion = false } = {}) {
  if (!has(CHARACTER_STATES, actor)) return null;
  const states = CHARACTER_STATES[actor];
  const record = has(states, state) ? states[state] : states.idle;
  const asset = ASSETS[record.asset];
  let frameName = record.reducedMotionFrame;
  if (!reducedMotion) {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const total = record.frames.reduce((sum, name) => sum + asset.frames[name].durationMs, 0);
    let cursor = record.loop ? time % total : Math.min(time, total - .001);
    frameName = record.frames.at(-1);
    for (const name of record.frames) {
      if (cursor < asset.frames[name].durationMs) { frameName = name; break; }
      cursor -= asset.frames[name].durationMs;
    }
  }
  return { asset: record.asset, src: asset.src, atlasWidth: asset.width, atlasHeight: asset.height,
    frameName, ...asset.frames[frameName] };
}
