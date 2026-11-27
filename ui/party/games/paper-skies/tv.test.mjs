import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPaperSkiesTv, paperSkiesPlayHintForMode, paperSkiesResultSummary } from './tv.mjs';

const hints = {
  'ring-rally': 'Bank through glowing sky rings. Gold rings score triple!',
  'balloon-pop': 'Fire paper darts or swoop through drifting balloons to pop them.',
  'sky-tag': 'Snatch the Sun Crown and stay aloft—tag the leader with a dart to steal it.',
};
function fixture(mode) {
  const target = { id: 0, x: 200, y: 250, r: 30, a: 0.4 };
  return { mode, w: 1600, h: 960, elapsedMs: 120,
    thermals: [target], clouds: [0, 1].map(gust => ({ ...target, gust })),
    rings: mode === 'ring-rally' ? [0, 1].map(gold => ({ ...target, gold })) : [],
    balloons: mode === 'balloon-pop' ? [1, 2, 3].map(pts => ({ ...target, pts, col: pts })) : [],
    crowns: mode === 'sky-tag' ? [null, 'p0'].map(holder => ({ ...target, holder })) : [],
    darts: [{ ...target, look: 2 }],
    events: ['hit','ring','pop','crown'].map((type, id) => ({ ...target, type, id, look: 3, at: 80 })),
    planes: Array.from({ length: 16 }, (_, look) => ({ id: `p${look}`, look, x: 50 + look % 4 * 380,
      y: 90 + Math.floor(look / 4) * 220, a: look / 2, bank: look % 2, spd: 15, boost: look % 2,
      wobble: look % 3 === 0 ? 1 : 0, crown: mode === 'sky-tag' && look === 0 ? 1 : 0, score: look })),
  };
}
function board(t) {
  const frames = new Map(), listeners = new Set(), surfaces = [];
  const events = { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const doc = { ...events, hidden: false, createElement() {
    const calls = [];
    const ctx = { createLinearGradient: gradient, createRadialGradient: gradient, measureText: s => ({ width: s.length * 8 }) };
    for (const op of 'beginPath rect roundRect ellipse closePath clip drawImage moveTo lineTo stroke fill save restore translate rotate scale fillText fillRect'.split(' ')) {
      ctx[op] = (...args) => calls.push([op, ...args]);
    }
    const canvas = { ownerDocument: doc, getContext: () => ctx, setAttribute() {}, calls };
    ctx.canvas = canvas; surfaces.push(canvas); return canvas;
  } };
  function gradient() { return { addColorStop() {} }; }
  let token = 0;
  for (const [key, value] of Object.entries({ document: doc, matchMedia: () => ({ ...events, matches: false }),
    requestAnimationFrame: cb => { frames.set(++token, cb); return token; }, cancelAnimationFrame: id => frames.delete(id) })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : Reflect.deleteProperty(globalThis, key));
  }
  return { canvas: doc.createElement(), listeners, frames, surfaces };
}
test('host renders every look and mode, reuses cached art, and releases its loop', t => {
  const { canvas, listeners, frames, surfaces } = board(t);
  const tv = mountPaperSkiesTv(canvas);
  tv.resize({ width: 1920, height: 1080, safe: { x: 20, y: 12, width: 1880, height: 1056 } });
  for (const [round, mode] of Object.keys(hints).entries()) {
    const scene = fixture(mode);
    tv.push({ round, scene });
    canvas.calls.length = 0;
    tv.draw(performance.now());
    assert.equal(canvas.calls.filter(([op]) => op === 'drawImage').length, 17);
    assert.equal(canvas.calls.filter(([op]) => op === 'fillText').length, 16);
    const count = surfaces.length, skyOps = surfaces[1].calls.length;
    tv.resize({ width: 800, height: 480 });
    tv.draw(performance.now());
    assert.equal(surfaces.length, count);
    assert.equal(surfaces[1].calls.length, skyOps);
    assert.ok(canvas.calls.some(([op,x,y]) => op === 'scale' && x === 0.5 && y === 0.5));
  }
  assert.equal(frames.size, 1);
  tv.dispose();
  assert.equal(frames.size, 0); assert.equal(listeners.size, 0);
  const count = canvas.calls.length;
  tv.draw(5000); assert.equal(canvas.calls.length, count);
});
test('reduced motion freezes decorative motion and drops event particles, not position updates', t => {
  const { canvas } = board(t);
  const tv = mountPaperSkiesTv(canvas, { reducedMotion: true });
  tv.resize({ width: 1600, height: 960 });
  const state = fixture('sky-tag');
  tv.update({ state });
  const now = performance.now();
  function sample(at) { canvas.calls.length = 0; tv.draw(at); return canvas.calls.slice(); }
  const first = sample(now);
  assert.deepEqual(sample(now + 140), first);
  tv.setReducedMotion(false);
  const moving = sample(now + 140);
  const ellipses = calls => calls.filter(([op]) => op === 'ellipse').length;
  assert.equal(ellipses(moving) - ellipses(first), state.events.length * 8);
  tv.setReducedMotion(true);
  tv.update({ state: { ...state, planes: state.planes.map(p => ({ ...p, x: p.x + 20 })) } });
  assert.notDeepEqual(sample(now + 150), first);
  tv.dispose();
});
test('each mode has its exact hint and a mode-specific podium with safe tie and empty copy', () => {
  for (const [mode, hint] of Object.entries(hints)) {
    assert.equal(paperSkiesPlayHintForMode(mode), hint);
    const view = { state: fixture(mode), results: [{ playerId: 'p2', score: 19 }], roster: [{ id: 'p2', name: 'Lydia' }] };
    const title = { 'ring-rally': 'Ring Rally', 'balloon-pop': 'Balloon Pop', 'sky-tag': 'Sky Tag' }[mode];
    assert.equal(paperSkiesResultSummary(view), `Lydia wins ${title} with 19. Nice flying!`);
    view.results.push({ playerId: 'p1', score: 19 });
    assert.equal(paperSkiesResultSummary(view), `2 pilots share the ${title} lead with 19!`);
    assert.equal(paperSkiesResultSummary({ scene: { mode } }), `A soft landing after ${title}.`);
  }
});
