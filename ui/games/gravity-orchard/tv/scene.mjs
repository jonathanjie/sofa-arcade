import { sceneStyles } from './scene-style.mjs';

/**
 * A retained SVG projection of public orchard coordinates. There is deliberately
 * no engine, transport, scheduler or sound dependency here. The TV mount supplies
 * already-interpolated fruit positions and fresh, deduplicated public events.
 *
 * Media: pass the GO5 manifest ({ assets, characterStates }), or its adapter with
 * resolve(key)/getAsset(key). Canonical keys are fruit.apple, basket.apple,
 * environment.morning-delivery and character.jon.idle (hyphen keys also work).
 * characterStates.jon.idle may reference an asset key or an entry directly.
 * Images must use explicit root-relative paths. Missing/failed images leave the
 * diagnostic silhouette visible. Atlas frames are clipped in a nested SVG.
 */
const NS = 'http://www.w3.org/2000/svg';
const TYPES = ['apple', 'plum', 'pear', 'starfruit'];
const NAMES = { apple: 'Apple', plum: 'Plum', pear: 'Pear', starfruit: 'Starfruit' };
const COLORS = { apple: '#d67858', plum: '#86719f', pear: '#a9b866', starfruit: '#e2b451' };
const OWNERS = { jon: '#356e63', lydia: '#a75c55' };
const STAGES = {
  'morning-delivery': 'Morning Delivery',
  'switchback-grove': 'Switchback Grove',
  'moonlight-picnic': "Lala’s Moonlight Picnic",
};
const EVENT_LIFETIME = 1300;
let instance = 0;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const numeric = (value, fallback = 0) => finite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const cap = value => String(value ?? '').slice(0, 120);
const same = (node, key, value) => {
  const text = String(value);
  if (node.getAttribute(key) !== text) node.setAttribute(key, text);
};

function node(document, tag, attrs = {}, parent) {
  const item = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) item.setAttribute(key, String(value));
  }
  if (parent) parent.append(item);
  return item;
}

function label(document, parent, text, x, y, className = 'go-scene-label', attrs = {}) {
  // SVG presentation attributes lose to the scoped class rules; retain explicit
  // per-label sizes/colours for hazard, owner and basket legibility.
  const override = [attrs.fill ? `fill:${attrs.fill}` : '', attrs['font-size'] ? `font-size:${attrs['font-size']}px` : ''].filter(Boolean).join(';');
  const item = node(document, 'text', { x, y, class: className, ...attrs, ...(override ? { style: override } : {}) }, parent);
  item.textContent = text;
  return item;
}

function title(document, parent, text) {
  const item = node(document, 'title', {}, parent);
  item.textContent = text;
  return item;
}

function validRect(value) {
  return value && ['x', 'y', 'width', 'height'].every(key => finite(value[key]))
    && value.width > 0 && value.height > 0
    && Math.abs(value.x) <= 10000 && Math.abs(value.y) <= 10000
    && value.width <= 10000 && value.height <= 10000;
}

function resolveLevel(geometry, id) {
  try {
    const source = typeof geometry?.getLevel === 'function' ? geometry.getLevel(id)
      : geometry?.id === id ? geometry
        : Array.isArray(geometry?.LEVELS) ? geometry.LEVELS.find(level => level?.id === id)
          : geometry?.LEVELS?.[id]
            ?? (Array.isArray(geometry) ? geometry.find(level => level?.id === id) : geometry?.[id]);
    if (!source || !validRect(source.bounds) || !Array.isArray(source.trays)
      || source.trays.length !== 2 || new Set(source.trays.map(tray => tray?.id)).size !== 2
      || !source.trays.every(tray => ['jon', 'lydia'].includes(tray.id) && validRect(tray.bounds))
      || !validRect(source.bridge)
      || !['baskets', 'bumpers', 'compost', 'gates'].every(key => Array.isArray(source[key]) && source[key].length <= 128)) return null;
    return source;
  } catch { return null; }
}

function fruitShape(document, parent, type, size = 20) {
  const group = node(document, 'g', { transform: `scale(${size / 20})`, 'data-fruit-shape': type }, parent);
  const shared = { fill: COLORS[type] ?? '#c5ba91', stroke: '#3e4635', 'stroke-width': 1.8, 'stroke-linejoin': 'round' };
  if (type === 'apple') {
    node(document, 'path', { d: 'M0-14C-8-23-22-14-19 0C-17 14-9 22 0 17C9 22 17 14 19 0C22-14 8-23 0-14Z', ...shared }, group);
    node(document, 'path', { d: 'M0-14Q-3-23 1-25', fill: 'none', stroke: '#504630', 'stroke-width': 3 }, group);
    node(document, 'path', { d: 'M2-18Q7-28 16-21Q12-12 2-18Z', fill: '#59815b', stroke: '#3e4635', 'stroke-width': 1.2 }, group);
    node(document, 'path', { d: 'M-13-5Q-15 2-10 7', fill: 'none', stroke: '#fbe1bc', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, group);
  } else if (type === 'plum') {
    node(document, 'ellipse', { cx: 0, cy: 1, rx: 15, ry: 20, ...shared }, group);
    node(document, 'path', { d: 'M1-18Q-4 0 1 19', fill: 'none', stroke: '#e2cbea', 'stroke-width': 2 }, group);
    node(document, 'path', { d: 'M0-18V-24M0-22Q-13-29-14-20Q-7-16 0-22M0-22Q10-28 12-21Q5-16 0-22', fill: '#59815b', stroke: '#3e4635', 'stroke-width': 1.2 }, group);
    node(document, 'circle', { cx: -7, cy: -7, r: 2.4, fill: '#f0e1ec' }, group);
    node(document, 'circle', { cx: -8, cy: 0, r: 1.8, fill: '#f0e1ec' }, group);
  } else if (type === 'pear') {
    node(document, 'path', { d: 'M0-22C-9-22-7-10-13-3C-29 16-9 25 0 22C9 25 29 16 13-3C7-10 9-22 0-22Z', ...shared }, group);
    node(document, 'path', { d: 'M0-22Q-2-28 3-30', fill: 'none', stroke: '#504630', 'stroke-width': 3 }, group);
    node(document, 'path', { d: 'M2-25Q12-31 15-24Q8-19 2-25Z', fill: '#59815b', stroke: '#3e4635', 'stroke-width': 1.2 }, group);
    node(document, 'circle', { cx: -9, cy: 8, r: 1.5, fill: '#667242' }, group);
    node(document, 'circle', { cx: -3, cy: 13, r: 1.5, fill: '#667242' }, group);
    node(document, 'circle', { cx: -10, cy: 15, r: 1.5, fill: '#667242' }, group);
  } else {
    node(document, 'path', { d: 'M0-24 7-8 24-6 12 6 15 23 0 14-15 23-12 6-24-6-7-8Z', ...shared }, group);
    node(document, 'path', { d: 'M0-24V14M24-6 0 3-24-6M15 23 0 3-15 23', fill: 'none', stroke: '#fff0ba', 'stroke-width': 2 }, group);
    node(document, 'circle', { cx: 0, cy: 3, r: 3, fill: '#715429' }, group);
  }
  return group;
}

function characterShape(document, parent, id, pose) {
  const cat = id === 'lala';
  const lydia = id === 'lydia';
  const fur = cat ? '#d99a5e' : '#e4cba4';
  const scarf = lydia ? '#cf785f' : '#54877b';
  const cheering = pose === 'cheer' || pose === 'pleased';
  const bracing = pose === 'brace';
  const g = node(document, 'g', { transform: 'translate(50 50)' }, parent);
  node(document, 'ellipse', { cx: 0, cy: 42, rx: 31, ry: 5, fill: '#2d4233', opacity: .13 }, g);
  node(document, 'path', { d: cat ? 'M20 31Q56 33 37 9' : 'M-19 30Q-48 31-39 13', fill: 'none', stroke: fur, 'stroke-width': cat ? 10 : 5, 'stroke-linecap': 'round' }, g);
  node(document, 'path', { d: cat ? 'M-23 38V6Q0-13 23 6V38Z' : 'M-23 39V8Q0-6 23 8V39Z', fill: cat ? fur : lydia ? '#f1d7ae' : '#795c45', stroke: '#5a4736', 'stroke-width': 1.6 }, g);
  if (cat) {
    node(document, 'path', { d: 'M-27-17-27-42-6-27M27-17 27-42 6-27', fill: fur, stroke: '#5a4736', 'stroke-width': 1.6 }, g);
    node(document, 'path', { d: 'M-22-25-22-34-12-26M22-25 22-34 12-26', fill: '#e7b0a0' }, g);
  } else {
    for (const x of [-25, 25]) {
      node(document, 'circle', { cx: x, cy: -30, r: 16, fill: fur, stroke: '#5a4736', 'stroke-width': 1.6 }, g);
      node(document, 'circle', { cx: x, cy: -30, r: 10, fill: '#dcaaa0' }, g);
    }
    if (lydia) node(document, 'path', { d: 'M22-10Q48-2 35 27Q47 12 32 8', fill: '#8c5d40', stroke: '#5a4736', 'stroke-width': 1.4 }, g);
  }
  node(document, 'ellipse', { cx: 0, cy: -13, rx: 29, ry: 27, fill: fur, stroke: '#5a4736', 'stroke-width': 1.6 }, g);
  if (!cat) {
    node(document, 'path', { d: lydia ? 'M-28-18Q-30-43 4-39Q33-33 28-18Q15-23 10-34Q-9-17-28-18Z' : 'M-27-25Q-26-38-10-38L-14-43Q0-44 5-36L13-42Q23-34 28-24Q10-32-2-30Q-15-23-27-25Z', fill: lydia ? '#8c5d40' : '#70543d', stroke: '#5a4736', 'stroke-width': 1.4 }, g);
  }
  node(document, 'ellipse', { cx: 0, cy: -2, rx: 18, ry: 12, fill: '#fae9cc' }, g);
  if (cheering) {
    node(document, 'path', { d: 'M-17-16Q-12-23-7-16M7-16Q12-23 17-16', fill: 'none', stroke: '#443d32', 'stroke-width': 2.8, 'stroke-linecap': 'round' }, g);
  } else {
    for (const x of [-12, 12]) node(document, 'ellipse', { cx: x, cy: -17, rx: 2.4, ry: pose === 'forecast' ? 4.2 : 3.2, fill: '#443d32' }, g);
  }
  if (!cat) {
    for (const x of [-13, 13]) {
      node(document, lydia ? 'circle' : 'rect', lydia
        ? { cx: x, cy: -16, r: 10, fill: 'none', stroke: '#604f40', 'stroke-width': 2.2 }
        : { x: x - 11, y: -25, width: 22, height: 18, rx: 4, fill: 'none', stroke: '#284252', 'stroke-width': 2.4 }, g);
    }
    node(document, 'path', { d: 'M-3-17H3', stroke: lydia ? '#604f40' : '#284252', 'stroke-width': 2.4 }, g);
  }
  node(document, 'path', { d: 'M-4-6Q0-9 4-6L0-1Z', fill: '#b87568' }, g);
  node(document, 'path', { d: pose === 'gust' ? 'M-3 3a3 4 0 1 0 6 0a3 4 0 1 0-6 0' : 'M-6 3Q0 10 6 3', fill: pose === 'gust' ? '#6c4933' : 'none', stroke: '#6c4933', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
  node(document, 'path', { d: 'M-22-4-34-7M-22 0-34 2M22-4 34-7M22 0 34 2', stroke: '#846f55', 'stroke-width': 1.2 }, g);
  if (cat) {
    node(document, 'path', { d: 'M-9-35-6-28M0-37V-29M9-35 6-28M-21 17-11 20M21 17 11 20', stroke: '#ad6939', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, g);
  } else {
    node(document, 'path', { d: 'M-21 8Q0 18 21 8L18 15Q0 24-18 15ZM6 16 10 35 19 30 14 15', fill: scarf, stroke: '#516348', 'stroke-width': 1.1 }, g);
  }
  const arm = cheering ? 'M-21 17-34-4M21 17 34-4' : bracing ? 'M-22 15-30 28-12 25M22 15 30 28 12 25' : 'M-22 15-26 30M22 15 26 30';
  node(document, 'path', { d: arm, fill: 'none', stroke: fur, 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
  node(document, 'path', { d: 'M-14 36-17 43M14 36 17 43', stroke: fur, 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
}

function findMedia(assets, keys) {
  if (!assets) return null;
  for (const key of keys) {
    try {
      const value = typeof key === 'object' ? key : assets.assets?.[key]
        ?? assets[key] ?? assets.resolve?.(key) ?? assets.getAsset?.(key);
      const entry = typeof value === 'string' ? assets.assets?.[value] ?? assets[value] : value;
      if (!entry || typeof entry.src !== 'string' || !entry.src.startsWith('/') || entry.src.startsWith('//')
        || /[\u0000-\u001f\\]/.test(entry.src) || !finite(entry.width) || entry.width <= 0
        || !finite(entry.height) || entry.height <= 0) continue;
      return entry;
    } catch { /* A bad/missing adapter entry must not hide the fallback. */ }
  }
  return null;
}

function mediaKeys(category, id, pose) {
  return pose
    ? [`${category}.${id}.${pose}`, `${id}.${pose}`, `${category}-${id}-${pose}`, `${id}-${pose}`]
    : [`${category}.${id}`, `${category}-${id}`, `${id}-${category}`, id];
}

function characterKeys(assets, id, pose) {
  const states = assets?.characterStates?.[id];
  const aliases = pose === 'cheer' ? ['cheer', 'celebrate'] : pose === 'pleased' ? ['pleased', 'celebrate'] : [pose];
  const mapped = aliases.map(name => states?.[name] ?? states?.states?.[name]).filter(Boolean);
  const idle = states?.idle ?? states?.states?.idle;
  return [...mapped, ...aliases.flatMap(name => mediaKeys('character', id, name)), ...(idle ? [idle] : []), ...mediaKeys('character', id, 'idle')];
}

/** Load/animation callbacks are tied to this slot and detached on replacement. */
function mediaSlot(document, parent, assets, initialKeys, box, fallback) {
  const group = node(document, 'g', {}, parent);
  const backing = node(document, 'g', { 'data-go-media-fallback': '' }, group);
  fallback(backing);
  let image = null;
  let viewport = null;
  let entry = null;
  let frames = [];
  let loaded = false;
  let dead = false;
  let load = null;
  let error = null;
  function detach() {
    if (image) {
      image.removeEventListener('load', load);
      image.removeEventListener('error', error);
    }
    viewport?.remove();
    image = viewport = null;
    loaded = false;
    backing.removeAttribute('visibility');
  }
  function setKeys(keys) {
    if (dead) return;
    const next = findMedia(assets, keys);
    if (next === entry) return;
    detach();
    entry = next;
    frames = [];
    if (!entry) return;
    const candidates = Array.isArray(entry.frames) ? entry.frames : Object.values(entry.frames ?? {});
    frames = candidates.filter(frame => validRect(frame) && frame.x >= 0 && frame.y >= 0
      && frame.x + frame.width <= entry.width && frame.y + frame.height <= entry.height)
      .map(frame => ({ ...frame, durationMs: clamp(numeric(frame.durationMs, 120), 16, 5000) })).slice(0, 128);
    viewport = node(document, 'svg', { ...box, viewBox: `0 0 ${entry.width} ${entry.height}`, preserveAspectRatio: 'xMidYMid meet', overflow: 'hidden', 'aria-hidden': 'true' }, group);
    image = node(document, 'image', { x: 0, y: 0, width: entry.width, height: entry.height, href: entry.src, preserveAspectRatio: 'none', visibility: 'hidden' }, viewport);
    const currentImage = image;
    load = () => {
      if (dead || image !== currentImage) return;
      loaded = true;
      image.removeAttribute('visibility');
      backing.setAttribute('visibility', 'hidden');
    };
    error = () => {
      if (dead || image !== currentImage) return;
      loaded = false;
      image.setAttribute('visibility', 'hidden');
      backing.removeAttribute('visibility');
    };
    image.addEventListener('load', load);
    image.addEventListener('error', error);
  }
  setKeys(initialKeys);
  return {
    group, backing,
    setKeys,
    draw(time, reduced) {
      if (dead || !entry || !viewport || !frames.length) return;
      let frame = frames[0];
      if (!reduced && frames.length > 1) {
        let offset = Math.max(0, time) % frames.reduce((total, candidate) => total + candidate.durationMs, 0);
        for (const candidate of frames) {
          frame = candidate;
          if (offset < candidate.durationMs) break;
          offset -= candidate.durationMs;
        }
      }
      same(viewport, 'viewBox', `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
    },
    isLoaded: () => loaded,
    dispose() { if (dead) return; dead = true; detach(); group.remove(); },
  };
}

/** Exported only as a small public-geometry presentation utility for tests. */
export function directionLabel(x, y) {
  if (Math.abs(numeric(x)) < .001 && Math.abs(numeric(y)) < .001) return 'steady';
  const horizontal = x > .001 ? 'right' : x < -.001 ? 'left' : '';
  const vertical = y > .001 ? 'down' : y < -.001 ? 'up' : '';
  return [vertical, horizontal].filter(Boolean).join(' and ');
}

export function mountScene(root, { geometry, assets, reducedMotion = false } = {}) {
  if (!root?.ownerDocument) throw new TypeError('A scene root element is required.');
  const document = root.ownerDocument;
  const prefix = `go-scene-${++instance}`;
  const host = document.createElement('div');
  host.className = 'go-scene-root';
  const style = document.createElement('style');
  style.dataset.goSceneStyle = '';
  style.textContent = sceneStyles;
  host.append(style);
  const svg = node(document, 'svg', { 'data-go-scene': '', viewBox: '0 0 1280 720', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Waiting for the garden', 'data-reduced-motion': Boolean(reducedMotion) }, host);
  root.append(host);
  let disposed = false;
  let reduced = Boolean(reducedMotion);
  let level = null;
  let levelId = null;
  let matchId = null;
  let epoch = null;
  let priorView = null;
  let lastTime = 0;
  let layers = {};
  let bridgeRing = null;
  let gustUI = null;
  let environmentMedia = null;
  const fruits = new Map();
  const baskets = new Map();
  const actors = new Map();
  const gates = new Map();
  const media = new Set();
  const effects = new Map();
  const seenEvents = new Set();
  const cheering = new Map();
  let bridgeUntil = 0;

  function clearScene() {
    for (const item of media) item.dispose();
    media.clear();
    fruits.clear(); baskets.clear(); actors.clear(); gates.clear(); effects.clear();
    cheering.clear(); bridgeUntil = 0;
    svg.replaceChildren();
    layers = {}; bridgeRing = gustUI = environmentMedia = null;
  }

  function createMedia(parent, keys, box, fallback) {
    const slot = mediaSlot(document, parent, assets, keys, box, fallback);
    media.add(slot);
    return slot;
  }

  function createActor(id, x, y, size = 84) {
    const group = node(document, 'g', { 'data-player': id, 'data-character': id, 'data-pose': 'idle', transform: `translate(${x} ${y})` }, layers.actors);
    const moving = node(document, 'g', { class: 'go-scene-character' }, group);
    const glyph = createMedia(moving, characterKeys(assets, id, 'idle'), { x: 0, y: 0, width: size, height: size }, fallback => {
      const scaled = node(document, 'g', { transform: `scale(${size / 100})` }, fallback);
      characterShape(document, scaled, id, 'idle');
    });
    const actor = { id, group, moving, glyph, size, pose: 'idle', baseX: x, baseY: y, title: title(document, group, id === 'lala' ? 'Lala' : `${id === 'jon' ? 'Jon' : 'Lydia'} steady`) };
    actors.set(id, actor);
    return actor;
  }

  function build(id) {
    clearScene();
    levelId = id;
    level = resolveLevel(geometry, id);
    same(svg, 'data-level-id', cap(id));
    if (!level) {
      same(svg, 'viewBox', '0 0 1280 720');
      same(svg, 'data-geometry-state', 'missing');
      node(document, 'rect', { width: 1280, height: 720, rx: 24, fill: '#e8ebda' }, svg);
      label(document, svg, 'Garden view is not available yet', 640, 346, 'go-scene-missing', { 'text-anchor': 'middle' });
      label(document, svg, 'Waiting for the orchard layout', 640, 384, 'go-scene-small', { 'text-anchor': 'middle' });
      return;
    }
    same(svg, 'data-geometry-state', 'ready');
    const b = level.bounds;
    same(svg, 'viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
    const defs = node(document, 'defs', {}, svg);
    const gradient = node(document, 'linearGradient', { id: `${prefix}-sky`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    node(document, 'stop', { offset: '0%', 'stop-color': id === 'moonlight-picnic' ? '#d8e1df' : '#e7eddb' }, gradient);
    node(document, 'stop', { offset: '100%', 'stop-color': '#f4eddb' }, gradient);
    const hatch = node(document, 'pattern', { id: `${prefix}-compost`, width: 16, height: 16, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    node(document, 'rect', { width: 16, height: 16, fill: '#dbc09a' }, hatch);
    node(document, 'path', { d: 'M0 0V16', stroke: '#5c4b38', 'stroke-width': 5 }, hatch);
    const marker = node(document, 'marker', { id: `${prefix}-arrow`, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs);
    node(document, 'path', { d: 'M0 0 10 5 0 10 2 5Z', fill: 'context-stroke' }, marker);
    node(document, 'rect', { ...b, rx: 24, fill: `url(#${prefix}-sky)` }, svg);
    layers.background = node(document, 'g', { 'aria-hidden': 'true' }, svg);
    environmentMedia = createMedia(layers.background, mediaKeys('environment', id), { ...b }, () => {});
    same(environmentMedia.group, 'opacity', .3);
    layers.terrain = node(document, 'g', { 'data-terrain': '' }, svg);
    layers.baskets = node(document, 'g', {}, svg);
    layers.gates = node(document, 'g', {}, svg);
    layers.fruits = node(document, 'g', { 'data-fruit-layer': '' }, svg);
    layers.effects = node(document, 'g', { class: 'go-scene-fx', 'aria-hidden': 'true' }, svg);
    layers.actors = node(document, 'g', {}, svg);
    layers.cues = node(document, 'g', {}, svg);

    // Every surface and collider uses the supplied geometry, including the
    // bridge. Decorative edges never move or rotate the logical playing field.
    const bridge = level.bridge;
    node(document, 'rect', { ...bridge, y: bridge.y + 8, rx: 8, fill: '#715d45', opacity: .35 }, layers.terrain);
    node(document, 'rect', { ...bridge, rx: 6, fill: '#c6ae7e', stroke: '#756748', 'stroke-width': 4 }, layers.terrain);
    const slats = Math.max(1, Math.floor(bridge.width / 22));
    for (let i = 1; i < slats; i++) {
      const x = bridge.x + bridge.width * i / slats;
      node(document, 'path', { d: `M${x} ${bridge.y + 3}V${bridge.y + bridge.height - 3}`, stroke: '#8c7855', 'stroke-width': 2, opacity: .7 }, layers.terrain);
    }
    bridgeRing = node(document, 'rect', { ...bridge, rx: 7, fill: 'none', stroke: '#e9c558', 'stroke-width': 6, opacity: 0, 'data-bridge-transfer': '' }, layers.cues);
    label(document, layers.terrain, 'BRIDGE', bridge.x + bridge.width / 2, bridge.y - 14, 'go-scene-micro', { 'text-anchor': 'middle' });

    for (const tray of level.trays) {
      const area = tray.bounds;
      const group = node(document, 'g', { 'data-tray': tray.id }, layers.terrain);
      title(document, group, `${tray.id === 'jon' ? 'Jon' : 'Lydia'}’s garden tray`);
      node(document, 'rect', { ...area, y: area.y + 11, rx: 30, fill: '#8e7856', stroke: '#6e654b', 'stroke-width': 3 }, group);
      node(document, 'rect', { ...area, rx: 30, fill: tray.id === 'jon' ? '#cddbb0' : '#dce0b5', stroke: '#8d8964', 'stroke-width': 7 }, group);
      node(document, 'rect', { x: area.x + 7, y: area.y + 7, width: Math.max(0, area.width - 14), height: Math.max(0, area.height - 14), rx: 24, fill: 'none', stroke: '#edf0cc', 'stroke-width': 3 }, group);
      // Small non-colliding surface marks differentiate regions without adding
      // invented walls, routes, spawn locations or basket targets.
      for (const [rx, ry] of [[.2, .32], [.76, .25], [.38, .77], [.84, .73]]) {
        node(document, 'path', { d: `M${area.x + area.width * rx - 5} ${area.y + area.height * ry}l4-5 3 5 4-4`, fill: 'none', stroke: '#8da271', 'stroke-width': 2, opacity: .45 }, group);
      }
      const badgeY = clamp(area.y - 65, b.y + 8, b.y + b.height - 100);
      const actor = createActor(tray.id, area.x + 7, badgeY - 12, 85);
      const badge = node(document, 'g', { transform: `translate(${area.x + 94} ${badgeY + 19})`, 'data-control': tray.id }, layers.actors);
      node(document, 'rect', { x: -4, y: -26, width: Math.min(245, area.width - 110), height: 48, rx: 20, fill: '#fbf5df', stroke: '#d0c8aa', 'stroke-width': 1.6 }, badge);
      label(document, badge, tray.id === 'jon' ? 'JON' : 'LYDIA', 12, 3, 'go-scene-label', { fill: OWNERS[tray.id], 'font-size': 20 });
      actor.control = label(document, badge, 'BRAKE', 94, 2, 'go-scene-small', { fill: '#4e624a', 'font-size': 16 });
      actor.controlGroup = badge;
      actor.force = node(document, 'g', { transform: 'translate(211 -2)', 'data-force': tray.id }, badge);
      node(document, 'circle', { cx: 0, cy: 0, r: 17, fill: '#e6ead4', stroke: '#7c8c67', 'stroke-width': 1.3 }, actor.force);
      actor.forceLine = node(document, 'path', { d: 'M0 0L0 0', fill: 'none', stroke: OWNERS[tray.id], 'stroke-width': 2.5, 'stroke-linecap': 'round', 'marker-end': `url(#${prefix}-arrow)` }, actor.force);
      actor.brakeMark = node(document, 'path', { d: 'M-4-6V6M4-6V6', stroke: OWNERS[tray.id], 'stroke-width': 3, 'stroke-linecap': 'round' }, actor.force);
    }

    for (const bumper of level.bumpers ?? []) {
      if (!bumper || !finite(bumper.x) || !finite(bumper.y)) continue;
      const group = node(document, 'g', { 'data-bumper': cap(bumper.id) }, layers.terrain);
      title(document, group, 'Soft garden bumper');
      if (bumper.kind === 'circle' && finite(bumper.radius) && bumper.radius > 0) {
        node(document, 'circle', { cx: bumper.x, cy: bumper.y, r: bumper.radius, fill: '#84a274', stroke: '#53754f', 'stroke-width': 3 }, group);
        node(document, 'path', { d: `M${bumper.x - bumper.radius * .4} ${bumper.y}q${bumper.radius * .4} ${-bumper.radius * .7} ${bumper.radius * .8} 0`, fill: 'none', stroke: '#c9d7a8', 'stroke-width': 3, 'stroke-linecap': 'round' }, group);
      } else if (bumper.kind === 'rect' && validRect(bumper)) {
        node(document, 'rect', { x: bumper.x, y: bumper.y, width: bumper.width, height: bumper.height, rx: Math.min(12, bumper.width / 2, bumper.height / 2), fill: '#84a274', stroke: '#53754f', 'stroke-width': 3 }, group);
        node(document, 'path', { d: `M${bumper.x + 6} ${bumper.y + 6}H${bumper.x + bumper.width - 6}`, stroke: '#c9d7a8', 'stroke-width': 3, 'stroke-linecap': 'round' }, group);
      }
    }
    for (const pit of level.compost ?? []) {
      if (!validRect(pit)) continue;
      const group = node(document, 'g', { 'data-compost': cap(pit.id) }, layers.terrain);
      title(document, group, 'Compost opening: fruit is removed here');
      node(document, 'rect', { x: pit.x, y: pit.y, width: pit.width, height: pit.height, rx: 6, fill: '#4f4839', stroke: `url(#${prefix}-compost)`, 'stroke-width': 9 }, group);
      label(document, group, pit.width >= 100 ? 'COMPOST' : '×', pit.x + pit.width / 2, pit.y + pit.height / 2 + 6, 'go-scene-small', { 'text-anchor': 'middle', fill: '#f3dcb9', 'font-size': pit.width >= 100 ? 16 : 23 });
    }

    for (const basket of level.baskets) {
      if (!basket || !TYPES.includes(basket.fruitType) || ![basket.x, basket.y, basket.radius].every(finite) || basket.radius <= 0) continue;
      const radius = basket.radius;
      const group = node(document, 'g', { transform: `translate(${basket.x} ${basket.y})`, class: 'go-scene-basket', 'data-basket': cap(basket.id), 'data-basket-type': basket.fruitType, 'data-basket-state': 'accepting' }, layers.baskets);
      const info = title(document, group, `${NAMES[basket.fruitType]} basket`);
      node(document, 'circle', { cx: 0, cy: 0, r: radius, fill: '#f6dfb0', stroke: '#8f7450', 'stroke-width': 3, class: 'go-scene-basket-ring' }, group);
      node(document, 'path', { d: `M${-radius * .82} ${radius * .18}Q0 ${radius * .65} ${radius * .82} ${radius * .18}M${-radius * .64} ${radius * .54}Q0 ${radius * .94} ${radius * .64} ${radius * .54}`, fill: 'none', stroke: '#b28b50', 'stroke-width': 2 }, group);
      const glyph = createMedia(group, mediaKeys('basket', basket.fruitType), { x: -radius, y: -radius, width: radius * 2, height: radius * 2 }, backing => {
        fruitShape(document, backing, basket.fruitType, radius * .5);
      });
      const nameY = clamp(basket.y + radius + 26, b.y + 24, b.y + b.height - 33) - basket.y;
      const plateWidth = 154;
      const plateX = clamp(basket.x - plateWidth / 2, b.x + 4, b.x + b.width - plateWidth - 4) - basket.x;
      node(document, 'rect', { x: plateX, y: nameY - 23, width: plateWidth, height: 53, rx: 14, fill: '#fbf5df', stroke: '#c8bd99', 'stroke-width': 1.5 }, group);
      const textX = plateX + plateWidth / 2;
      const name = label(document, group, NAMES[basket.fruitType], textX, nameY - 4, 'go-scene-small', { 'text-anchor': 'middle', 'font-size': 18 });
      const slots = [];
      for (let i = 0; i < 3; i++) {
        const slot = node(document, 'g', { transform: `translate(${textX - 26 + i * 26} ${nameY + 14})`, 'data-buffer-slot': i }, group);
        node(document, 'circle', { r: 9, fill: '#eee8ce', stroke: '#8b8c6a', 'stroke-width': 1.3 }, slot);
        const filled = fruitShape(document, slot, basket.fruitType, 6.2);
        slots.push(filled);
      }
      const state = label(document, group, '', radius + 9, -radius + 5, 'go-scene-small', { 'font-size': 16 });
      baskets.set(basket.id, { group, info, name, state, slots, type: basket.fruitType, glyph, flash: null, until: 0, x: basket.x, y: basket.y, radius });
    }

    for (const gate of level.gates ?? []) {
      if (!validRect(gate)) continue;
      const group = node(document, 'g', { 'data-gate': cap(gate.id), 'data-state': 'open' }, layers.gates);
      const info = title(document, group, 'Bridge gate open');
      node(document, 'rect', { x: gate.x, y: gate.y, width: gate.width, height: gate.height, rx: 4, class: 'go-scene-gate-body', 'stroke-width': 4 }, group);
      const cross = node(document, 'path', { d: `M${gate.x + 3} ${gate.y + 3}L${gate.x + gate.width - 3} ${gate.y + gate.height - 3}M${gate.x + gate.width - 3} ${gate.y + 3}L${gate.x + 3} ${gate.y + gate.height - 3}`, stroke: '#f2dab0', 'stroke-width': 4, visibility: 'hidden' }, group);
      // Keep the local badge inside the bridge gap. A wide sentence here would
      // obscure authored compost openings beside the bridge; the TV's hazard
      // status supplies the full explanation outside the playing field.
      const plateWidth = Math.max(1, Math.min(160, level.bridge.width - 12));
      const center = clamp(gate.x + gate.width / 2, b.x + plateWidth / 2 + 4, b.x + b.width - plateWidth / 2 - 4);
      const top = clamp(gate.y - 43, b.y + 6, b.y + b.height - 70);
      const plate = node(document, 'g', { transform: `translate(${center} ${top})`, 'data-gate-caption': cap(gate.id), visibility: plateWidth < 28 ? 'hidden' : 'visible' }, layers.cues);
      const background = node(document, 'rect', { x: -plateWidth / 2, y: -20, width: plateWidth, height: 34, rx: 15, fill: '#f9edc4', stroke: '#ad8a4e', 'stroke-width': 1.5 }, plate);
      const message = label(document, plate, 'Gate open', 0, 3, 'go-scene-small', { 'text-anchor': 'middle', 'font-size': plateWidth < 64 ? 18 : plateWidth < 100 ? 16 : 17 });
      gates.set(gate.id, { group, info, cross, message, plate, background, compact: plateWidth < 100, symbolOnly: plateWidth < 64 });
    }

    const lalaX = clamp(bridge.x + bridge.width / 2 - 42, b.x + 4, b.x + b.width - 88);
    const lalaY = clamp(Math.min(...level.trays.map(tray => tray.bounds.y)) - 100, b.y + 2, b.y + b.height - 90);
    createActor('lala', lalaX, lalaY, 84);
    const banner = node(document, 'g', { 'data-gust-cue': '', visibility: 'hidden' }, layers.cues);
    const bannerX = clamp(bridge.x + bridge.width / 2, b.x + 165, b.x + b.width - 165);
    const bannerY = clamp(lalaY + 113, b.y + 70, b.y + b.height - 70);
    same(banner, 'transform', `translate(${bannerX} ${bannerY})`);
    node(document, 'rect', { x: -165, y: -25, width: 330, height: 60, rx: 19, fill: '#fbebbd', stroke: '#aa813a', 'stroke-width': 2 }, banner);
    const headline = label(document, banner, '', 0, -2, 'go-scene-warning', { 'text-anchor': 'middle' });
    const subtitle = label(document, banner, '', 0, 21, 'go-scene-small', { 'text-anchor': 'middle', 'font-size': 16 });
    const gustArrows = level.trays.map(tray => {
      const center = { x: tray.bounds.x + tray.bounds.width / 2, y: tray.bounds.y + tray.bounds.height / 2 };
      const arrow = node(document, 'g', { transform: `translate(${center.x} ${center.y})`, visibility: 'hidden', 'data-gust-arrow': tray.id, 'aria-hidden': 'true' }, layers.cues);
      node(document, 'path', { d: 'M-60-14H22V-31L62 0 22 31V14H-60', fill: '#fbf3d2', stroke: '#97733c', 'stroke-width': 3, opacity: .7 }, arrow);
      return { node: arrow, center };
    });
    gustUI = { banner, headline, subtitle, arrows: gustArrows };
  }

  function freshEffects(events, view, time) {
    for (const event of (Array.isArray(events) ? events : []).slice(-64)) {
      if (!event || typeof event.id !== 'string' || seenEvents.has(event.id)) continue;
      seenEvents.add(event.id);
      if (seenEvents.size > 256) seenEvents.delete(seenEvents.values().next().value);
      if (event.kind === 'transfer') bridgeUntil = time + EVENT_LIFETIME;
      if (event.kind === 'order-complete' || event.kind === 'stage-complete') {
        for (const id of ['jon', 'lydia', 'lala']) cheering.set(id, time + 1600);
      }
      if (event.kind === 'catch' || event.kind === 'reject') {
        const candidate = event.data?.basketId ?? event.data?.fruitType ?? event.data?.type ?? event.entityId;
        let basket = baskets.get(candidate);
        if (!basket && finite(event.x) && finite(event.y)) {
          basket = [...baskets.values()].find(item => Math.hypot(item.x - event.x, item.y - event.y) <= item.radius + 35);
        }
        if (basket) { basket.flash = event.kind; basket.until = time + 950; }
      }
      if (!['transfer', 'catch', 'reject', 'compost', 'order-complete', 'stage-complete'].includes(event.kind)) continue;
      const world = level?.bounds;
      if (!world || !layers.effects) continue;
      const anchor = finite(event.x) && finite(event.y) ? { x: event.x, y: event.y }
        : event.kind === 'transfer' ? { x: level.bridge.x + level.bridge.width / 2, y: level.bridge.y + level.bridge.height / 2 }
          : { x: world.x + world.width / 2, y: world.y + world.height - 45 };
      const x = clamp(anchor.x, world.x + 50, world.x + world.width - 50);
      const y = clamp(anchor.y, world.y + 30, world.y + world.height - 25);
      const g = node(document, 'g', { 'data-effect-id': cap(event.id), 'data-effect-kind': event.kind }, layers.effects);
      const stroke = event.kind === 'reject' || event.kind === 'compost' ? '#a4563c' : '#397658';
      const ring = node(document, 'circle', { cx: x, cy: y, r: 24, fill: 'none', stroke, 'stroke-width': 3 }, g);
      const message = { transfer: 'Handoff', catch: '✓', reject: '↩', compost: 'Compost', 'order-complete': 'Order filled!', 'stage-complete': 'Stage complete' }[event.kind];
      const caption = label(document, g, message, x, y - 31, 'go-scene-label', { 'text-anchor': 'middle', fill: stroke, stroke: '#fff5d9', 'stroke-width': 4, 'font-size': message.length > 2 ? 21 : 30 });
      effects.set(event.id, { g, ring, caption, start: time, end: time + EVENT_LIFETIME, x, y });
      if (effects.size > 32) {
        const oldest = effects.keys().next().value;
        effects.get(oldest).g.remove(); effects.delete(oldest);
      }
    }
  }

  function updateActors(view, time) {
    for (const [id, actor] of actors) {
      const input = view.players?.[id]?.input ?? { x: 0, y: 0, brake: true };
      const x = clamp(numeric(input.x), -1, 1);
      const y = clamp(numeric(input.y), -1, 1);
      const cheeringNow = (cheering.get(id) ?? 0) > time;
      const pose = id === 'lala' ? (view.gust?.phase === 'active' ? 'gust' : view.gust?.phase === 'forecast' ? 'forecast' : cheeringNow ? 'pleased' : 'idle')
        : cheeringNow ? 'cheer' : input.brake ? 'brace' : Math.hypot(x, y) > .03 ? 'lean' : 'idle';
      if (pose !== actor.pose) {
        actor.pose = pose;
        same(actor.group, 'data-pose', pose);
        actor.glyph.backing.replaceChildren();
        const scaled = node(document, 'g', { transform: `scale(${actor.size / 100})` }, actor.glyph.backing);
        characterShape(document, scaled, id, pose);
        actor.glyph.setKeys(characterKeys(assets, id, pose));
      }
      const lean = !reduced && pose === 'lean' ? x * 10 : 0;
      const bounce = !reduced && (pose === 'cheer' || pose === 'pleased') ? -Math.abs(Math.sin(time / 130)) * 5 : 0;
      const brace = !reduced && pose === 'brace' ? .96 : 1;
      same(actor.moving, 'transform', `translate(0 ${bounce + (1 - brace) * actor.size}) rotate(${lean} ${actor.size / 2} ${actor.size}) scale(1 ${brace})`);
      actor.glyph.draw(time, reduced || view.phase !== 'playing');
      if (id === 'lala') {
        actor.title.textContent = view.gust ? `Lala: ${view.gust.phase === 'forecast' ? 'gust approaching' : 'gust active'}, ${directionLabel(view.gust.x, view.gust.y)}` : 'Lala watches the picnic';
        continue;
      }
      const control = input.brake ? 'BRAKE' : Math.hypot(x, y) > .03 ? 'STEERING' : 'STEADY';
      actor.control.textContent = control;
      same(actor.controlGroup, 'data-control-state', input.brake ? 'brake' : Math.hypot(x, y) > .03 ? 'steering' : 'neutral');
      same(actor.forceLine, 'd', `M0 0L${x * 11} ${y * 11}`);
      same(actor.forceLine, 'visibility', input.brake || Math.hypot(x, y) <= .03 ? 'hidden' : 'visible');
      same(actor.brakeMark, 'visibility', input.brake ? 'visible' : 'hidden');
      actor.title.textContent = `${id === 'jon' ? 'Jon' : 'Lydia'}: ${input.brake ? 'Brake held' : directionLabel(x, y)}`;
    }
  }

  function updateBaskets(view, time) {
    for (const [id, item] of baskets) {
      const source = view.baskets?.[item.type];
      const count = clamp(Math.floor(numeric(source?.count)), 0, 3);
      const full = count === 3;
      const flash = item.until > time ? item.flash : null;
      same(item.group, 'data-basket-state', flash ?? (full ? 'full' : 'accepting'));
      same(item.group, 'data-count', count);
      item.info.textContent = `${NAMES[item.type]} basket: ${count} of 3${full ? ', full' : ''}${flash === 'reject' ? ', fruit rejected' : flash === 'catch' ? ', fruit caught' : ''}`;
      item.name.textContent = `${NAMES[item.type]} · ${count}/3`;
      item.state.textContent = flash === 'reject' ? '↩' : flash === 'catch' ? '✓' : full ? 'FULL' : '';
      item.slots.forEach((slot, i) => same(slot, 'visibility', i < count ? 'visible' : 'hidden'));
      item.glyph.draw(time, reduced);
    }
  }

  function updateGates(view) {
    for (const [id, item] of gates) {
      const state = view.gateStates?.find(gate => gate.id === id);
      const name = ['open', 'closed', 'forecast'].includes(state?.state) ? state.state : 'unknown';
      same(item.group, 'data-state', name);
      same(item.group, 'data-closure-deferred', Boolean(state?.closureDeferred));
      const message = name === 'forecast' && state.closureDeferred ? 'Gate waiting · fruit crossing'
        : name === 'forecast' ? `Gate closes in ${Math.ceil(numeric(state.ticksToChange) / 60)}s`
          : name === 'closed' ? `Gate closed · ${Math.ceil(numeric(state.ticksToChange) / 60)}s`
            : name === 'open' ? 'Gate open' : 'Gate state unavailable';
      const short = name === 'forecast' && state.closureDeferred ? 'Waiting'
        : name === 'forecast' ? 'Closing' : name === 'closed' ? 'Closed' : name === 'open' ? 'Open' : '?';
      item.message.textContent = item.symbolOnly ? ({ forecast: '!', closed: '×', open: '✓' }[name] ?? '?')
        : item.compact ? short : name === 'forecast' && state.closureDeferred ? 'Waiting'
          : name === 'forecast' ? `Closes in ${Math.ceil(numeric(state.ticksToChange) / 60)}s`
            : name === 'closed' ? `Closed · ${Math.ceil(numeric(state.ticksToChange) / 60)}s`
              : name === 'open' ? 'Gate open' : 'Gate unknown';
      item.info.textContent = message;
      same(item.cross, 'visibility', name === 'closed' ? 'visible' : 'hidden');
      same(item.plate, 'opacity', name === 'open' ? .82 : 1);
      same(item.background, 'fill', name === 'closed' ? '#f0dfc6' : name === 'forecast' ? '#fae5ab' : '#edf0dc');
    }
  }

  function updateGust(view, time) {
    if (!gustUI) return;
    const gust = view.gust;
    same(gustUI.banner, 'visibility', gust ? 'visible' : 'hidden');
    same(gustUI.banner, 'data-state', gust?.phase ?? 'none');
    if (!gust) {
      for (const item of gustUI.arrows) same(item.node, 'visibility', 'hidden');
      return;
    }
    const direction = directionLabel(gust.x, gust.y);
    const seconds = Math.ceil(numeric(gust.ticksRemaining) / 60);
    gustUI.headline.textContent = gust.phase === 'forecast' ? `Lala’s gust in ${seconds}s` : 'Lala’s gust!';
    gustUI.subtitle.textContent = `${direction.charAt(0).toUpperCase()}${direction.slice(1)} · ${gust.phase === 'forecast' ? 'get ready to Brake' : 'Brake steadies the trays'}`;
    const angle = Math.atan2(numeric(gust.y), numeric(gust.x)) * 180 / Math.PI;
    for (const item of gustUI.arrows) {
      same(item.node, 'visibility', 'visible');
      same(item.node, 'transform', `translate(${item.center.x} ${item.center.y}) rotate(${angle})`);
      same(item.node, 'opacity', reduced || gust.phase === 'forecast' ? .7 : .5 + .15 * Math.sin(time / 150));
    }
  }

  function updateFruits(list, time, phase) {
    const visible = new Set();
    for (const fruit of (Array.isArray(list) ? list : []).slice(0, 8)) {
      if (!fruit || typeof fruit.id !== 'string' || !TYPES.includes(fruit.type)
        || ![fruit.x, fruit.y, fruit.radius].every(finite) || fruit.radius <= 0) continue;
      visible.add(fruit.id);
      let item = fruits.get(fruit.id);
      if (item && (item.type !== fruit.type || item.radius !== fruit.radius)) {
        item.glyph.dispose(); media.delete(item.glyph); item.group.remove(); fruits.delete(fruit.id); item = null;
      }
      if (!item) {
        const group = node(document, 'g', { class: 'go-scene-fruit', 'data-fruit-id': cap(fruit.id), 'data-fruit-type': fruit.type }, layers.fruits);
        const info = title(document, group, NAMES[fruit.type]);
        node(document, 'ellipse', { cx: 0, cy: fruit.radius * .8, rx: fruit.radius * .85, ry: fruit.radius * .35, fill: '#43583a', opacity: .18 }, group);
        // An outline helps distinguish overlapping fruit, but its centre and
        // silhouette remain on the authoritative/interpolated coordinates.
        node(document, 'circle', { cx: 0, cy: 0, r: fruit.radius + 3, fill: '#fff8e3', opacity: .65 }, group);
        const rolling = node(document, 'g', {}, group);
        const glyph = createMedia(rolling, mediaKeys('fruit', fruit.type), { x: -fruit.radius, y: -fruit.radius, width: fruit.radius * 2, height: fruit.radius * 2 }, backing => fruitShape(document, backing, fruit.type, fruit.radius * .86));
        item = { group, info, rolling, glyph, type: fruit.type, radius: fruit.radius };
        fruits.set(fruit.id, item);
      }
      same(item.group, 'transform', `translate(${fruit.x} ${fruit.y})`);
      same(item.group, 'data-x', fruit.x);
      same(item.group, 'data-y', fruit.y);
      same(item.group, 'data-motion', reduced || phase !== 'playing' ? 'still' : 'rolling');
      const roll = reduced || phase !== 'playing' ? 0 : ((fruit.x + fruit.y) / Math.max(8, fruit.radius) * 25) % 360;
      same(item.rolling, 'transform', `rotate(${roll})`);
      item.glyph.draw(time, reduced || phase !== 'playing');
    }
    for (const [id, item] of fruits) {
      if (visible.has(id)) continue;
      item.glyph.dispose(); media.delete(item.glyph); item.group.remove(); fruits.delete(id);
    }
  }

  function updateEffects(time) {
    for (const [id, effect] of effects) {
      if (effect.end <= time) { effect.g.remove(); effects.delete(id); continue; }
      const progress = clamp((time - effect.start) / EVENT_LIFETIME, 0, 1);
      same(effect.ring, 'r', reduced ? 29 : 24 + progress * 30);
      same(effect.g, 'opacity', reduced ? 1 : 1 - progress * .65);
      same(effect.caption, 'y', effect.y - 31 - (reduced ? 0 : progress * 12));
    }
    if (bridgeRing) same(bridgeRing, 'opacity', bridgeUntil > time ? reduced ? 1 : .6 + .3 * Math.sin(time / 100) : 0);
  }

  function update(view, { fruits: positions = view?.fruits, now = 0, events = [] } = {}) {
    if (disposed || !view || view.gameId !== 'gravity-orchard') return;
    const time = Math.max(lastTime, numeric(now, lastTime));
    lastTime = time;
    const newMatch = matchId !== view.matchId;
    const newEpoch = epoch !== view.runEpoch;
    if (newMatch) { matchId = view.matchId; seenEvents.clear(); }
    if (newMatch || newEpoch) {
      epoch = view.runEpoch;
      for (const effect of effects.values()) effect.g.remove();
      effects.clear(); cheering.clear(); bridgeUntil = 0;
      for (const item of baskets.values()) { item.flash = null; item.until = 0; }
    }
    if (levelId !== view.levelId || !priorView) build(view.levelId);
    priorView = view;
    same(svg, 'data-phase', cap(view.phase));
    same(svg, 'data-match-id', cap(view.matchId));
    same(svg, 'data-run-epoch', numeric(view.runEpoch));
    if (!level) return;
    freshEffects(events, view, time);
    updateFruits(positions, time, view.phase);
    updateBaskets(view, time);
    updateActors(view, time);
    updateGates(view);
    updateGust(view, time);
    updateEffects(time);
    environmentMedia?.draw(time, reduced || view.phase !== 'playing');
    const summary = `${STAGES[view.levelId] ?? 'Gravity Orchard'}. Jon’s garden on the left, Lydia’s on the right, connected by a bridge. ${fruits.size} active fruit. ${TYPES.map(type => `${NAMES[type]} basket ${numeric(view.baskets?.[type]?.count)} of 3`).join('; ')}.${view.gust ? ` Lala’s ${view.gust.phase === 'forecast' ? 'approaching' : 'active'} gust points ${directionLabel(view.gust.x, view.gust.y)}.` : ''}`;
    same(svg, 'aria-label', summary);
  }

  return {
    update,
    setReducedMotion(value) {
      if (disposed) return;
      reduced = Boolean(value);
      same(svg, 'data-reduced-motion', reduced);
      if (priorView) {
        updateActors(priorView, lastTime);
        updateGust(priorView, lastTime);
        updateEffects(lastTime);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearScene(); seenEvents.clear(); priorView = null; level = null;
      host.remove();
    },
  };
}
