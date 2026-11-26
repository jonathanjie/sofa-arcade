import assert from 'node:assert/strict';
import test from 'node:test';
import { mountWhiteoutTv, whiteoutPlayHintForMode, whiteoutResultSummary } from './tv.mjs';

const modes = ['getaway', 'cops-and-robbers', 'freeze-tag', 'drift-king'];
function fixture(mode, round) {
  const car = {
    id: 'p1',
    x: 80,
    y: 50,
    a: 3.1,
    ai: 0,
    look: 1,
    role: mode === 'drift-king' ? 3 : 0,
    drift: 1,
    spin: 0,
    boost: 1,
    hp: 2,
    pin: 5,
    score: 12,
  };
  return {
    round,
    mode,
    phase: 'playing',
    roster: [{ id: 'p1', name: 'Pip' }],
    scene: {
      mode,
      w: 960,
      h: 540,
      elapsedMs: 0,
      cars: [car, { ...car, id: 'ai1', ai: 1, role: 1, x: 1 }, { ...car, id: 'out', role: 2 }],
      lamps: [[30, 30]],
      blocks: [[40, 90, 100, 50, 1]],
      cones: [[1, 24, 35, 1]],
      hydrants: [{ x: 30, y: 35, cd: 10 }],
      ice: [{ x: 55, y: 60, r: 15, seed: 2, ms: 300 }],
      pings: [{ x: 80, y: 40, ms: 100 }],
      checkpoint: mode === 'cops-and-robbers' ? { x: 970, y: 30, r: 12 } : null,
      team: mode === 'cops-and-robbers' ? { cops: 2, robbers: 3, winner: 'cops' } : null,
      crown: mode === 'drift-king' ? { x: 80, y: 50, holder: 'p1' } : null,
      events: ['hydrant', 'ice-spin', 'bust', 'crown', 'dispatch', 'ram', 'boost', 'checkpoint', 'cone'].map(
        (kind, id) => ({ kind, id, x: 50, y: 50 }),
      ),
    },
  };
}
function harness(t) {
  const surfaces = [],
    listeners = new Set(),
    frames = new Map();
  let next = 0;
  const events = {
    addEventListener: (_, cb) => listeners.add(cb),
    removeEventListener: (_, cb) => listeners.delete(cb),
  };
  const doc = { ...events, createElement: makeCanvas, hidden: false };
  function makeCanvas() {
    const calls = [];
    const gradient = { addColorStop() {} };
    const ctx = {
      createRadialGradient: () => gradient,
      createLinearGradient: () => gradient,
      measureText: (text) => ({ width: text.length * 8 }),
    };
    for (const op of 'drawImage fillText save restore translate scale rotate clip rect beginPath closePath moveTo lineTo arc stroke fill clearRect fillRect'.split(
      ' ',
    )) {
      ctx[op] = (...args) => calls.push([op, ...args]);
    }
    const canvas = { ownerDocument: doc, calls, getContext: () => ctx, setAttribute() {} };
    surfaces.push(canvas);
    return canvas;
  }
  for (const [key, value] of Object.entries({
    document: doc,
    matchMedia: () => ({ ...events, matches: false }),
    requestAnimationFrame: (cb) => {
      frames.set(++next, cb);
      return next;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() =>
      original ? Object.defineProperty(globalThis, key, original) : Reflect.deleteProperty(globalThis, key),
    );
  }
  return {
    canvas: makeCanvas(),
    surfaces,
    listeners,
    frames,
    draw(time) {
      const [id, cb] = frames.entries().next().value;
      frames.delete(id);
      cb(time);
    },
  };
}
test('all four modes draw, deduplicate audio, keep tracks and clean up', (t) => {
  const h = harness(t),
    sounds = [];
  const tv = mountWhiteoutTv(h.canvas, { sound: { effect: (cue) => sounds.push(cue) } });
  const [, city, tracks] = h.surfaces;
  tv.resize({ width: 1000, height: 610, safe: { x: 20, y: 10, width: 960, height: 578 } });
  for (const [round, mode] of modes.entries()) {
    const view = fixture(mode, round);
    tv.push(view);
    const cached = city.calls.length;
    const next = structuredClone(view);
    next.scene.elapsedMs = 50;
    next.scene.cars[0].x += 6;
    next.scene.cars[0].a = -3.1;
    tv.push(next);
    h.draw(performance.now() + 25);
    assert.ok(
      h.canvas.calls.some(([op, a]) => op === 'rotate' && Math.abs(Math.abs(a) - Math.PI) < 0.1),
      'heading takes the short arc',
    );
    assert.equal(city.calls.length, cached);
    assert.ok(tracks.calls.some(([op]) => op === 'stroke'));
    assert.deepEqual(sounds.slice(round * 9), [
      'swipe',
      'move',
      'error',
      'collect',
      'join',
      'pounce',
      'lure',
      'bank',
      'move',
    ]);
    tv.setReducedMotion(true);
    h.canvas.calls.length = 0;
    h.draw(performance.now() + 60);
    const still = structuredClone(h.canvas.calls.filter(([op]) => op === 'fillRect'));
    h.canvas.calls.length = 0;
    h.draw(performance.now() + 160);
    assert.deepEqual(
      h.canvas.calls.filter(([op]) => op === 'fillRect'),
      still,
    );
    assert.ok(h.canvas.calls.some(([op, text]) => op === 'fillText' && text === 'CROWN SNATCHED'));
    tv.setReducedMotion(false);
  }
  tv.resize({ width: 480, height: 275, safe: { x: 14, y: 0, width: 452, height: 265 } });
  h.draw(performance.now());
  tv.dispose();
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.size, 0);
});
test('team winner labels are restricted to the team mode; each mode has its own hint', () => {
  assert.equal(new Set(modes.map(whiteoutPlayHintForMode)).size, 4);
  for (const mode of modes) {
    const view = fixture(mode, 2);
    if (mode === 'cops-and-robbers') {
      assert.equal(whiteoutResultSummary(view).label, 'Police Patrol Wins!');
      view.scene.team.winner = 'robbers';
      assert.equal(whiteoutResultSummary(view).label, 'Getaway Crew Wins!');
      view.scene.team.winner = null;
    }
    assert.equal(whiteoutResultSummary(view), null);
  }
});
