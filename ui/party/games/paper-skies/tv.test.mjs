import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildTerrain, cell, createCamera } from './voxel.mjs';
import { mountPaperSkiesTv, paperSkiesPlayHintForMode, paperSkiesResultSummary } from './tv.mjs';

const hints = {
  'ring-rally': 'Climb, dive, roll and loop through glowing Sun chains—dodge spiky storms!',
  'balloon-pop': 'Swoop through 3D sky balloons at matching altitude and barrel-roll past storms!',
  'sky-tag': 'Snatch the 3D Sun Crown and out-maneuver rivals with rolls and loops!',
 };
function fixture(mode, solo = 0) {
  const item = { id: 0, x: 256, y: 220, z: 44 };
  return { mode, seed: 123, elapsedMs: 120, lv: 2, w: 512, h: 512, solo,
    storms: [{ ...item, y: 170 }], suns: mode === 'ring-rally' ? [{ ...item, gold: 1 }] : [],
    balloons: mode === 'balloon-pop' ? [{ ...item, r: 10, pts: 3, col: 1 }] : [],
    crowns: mode === 'sky-tag' ? [{ ...item, holder: 'p0' }] : [],
    events: [{ ...item, text: 'LOOP!', at: 120 }],
    planes: Array.from({ length: solo ? 1 : 16 }, (_, look) => ({ id: `p${look}`, look,
      x: 256 + look%4*45, y: 280 + Math.floor(look/4)*40, z: 38, a: -Math.PI/2,
      bank: .2, pitch: .1, roll: .3, loop: .2, score: look+1, fuel: 85, suns: 2, combo: 3 })),
  };
}
function board(t, upload = true) {
  const frames = new Map(), listeners = new Set(), surfaces = [];
  const handlers = {};
  const events = { addEventListener: (key, fn) => { handlers[key] = fn; listeners.add(fn); }, removeEventListener: (_, fn) => listeners.delete(fn) };
  const doc = { ...events, hidden: false, createElement() {
    const calls = [];
    const ctx = { createLinearGradient: gradient, createRadialGradient: gradient, measureText: s => ({ width: s.length * 8 }) };
    for (const op of 'beginPath rect roundRect ellipse closePath clip drawImage moveTo lineTo stroke fill save restore translate rotate scale fillText fillRect'.split(' ')) {
      ctx[op] = (...args) => calls.push([op, ...args]);
    }
    const canvas = { ownerDocument: doc, getContext: () => ctx, setAttribute() {}, calls };
    if (upload) ctx.putImageData = image => { canvas.hash = createHash('sha256').update(image.data).digest('hex'); };
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
  return { canvas: doc.createElement(), listeners, frames, surfaces, handlers };
}
test('camera defaults and V toggle render distinct frames for each mode and player count', t => {
  const { canvas, handlers, frames, surfaces, listeners } = board(t);
  const tv = mountPaperSkiesTv(canvas, { reducedMotion: true });
  const buffer = surfaces[1];
  let round = 0;
  for (const mode of Object.keys(hints)) for (const solo of [1,0]) {
    tv.resize({ width:1920, height:1080 });
    tv.push({ round: ++round, scene: fixture(mode,solo) }); tv.draw();
    const first = buffer.hash;
    assert.equal(canvas.getContext('2d').imageSmoothingEnabled,false);
    assert.deepEqual(canvas.calls.at(-1).slice(2),[0,0,1920,1080]);
    assert.ok(buffer.calls.some(([op,text]) => op === 'fillText' && text === (solo ? 'SUNS 2  x3' : '1 Dots 16')));
    handlers.keydown({key:'V'}); tv.draw(); assert.notEqual(buffer.hash,first);
    handlers.keydown({key:'v'}); tv.draw(); assert.equal(buffer.hash,first);
    tv.resize({ width: 800, height: 480, safe:{ x:16,y:10,width:768,height:432 } }); tv.draw();
    assert.deepEqual(canvas.calls.at(-1).slice(2),[16,10,768,432]);
    buffer.calls.length = 0;
  }
  assert.equal(frames.size,1); tv.dispose(); assert.equal(frames.size,0); assert.equal(listeners.size,0);
  const count = canvas.calls.length; tv.draw(); assert.equal(count,canvas.calls.length);
});
test('reduced motion freezes clouds, not flight updates', t => {
  const { canvas,surfaces } = board(t), tv = mountPaperSkiesTv(canvas);
  tv.resize({width:800,height:450}); const state = fixture('ring-rally',1);
  tv.update({state}); tv.setReducedMotion(true);
  const frame = at => { tv.draw(at); return surfaces[1].hash; };
  const now = performance.now(), first = frame(now);
  assert.equal(first,frame(now+800)); tv.setReducedMotion(false); assert.notEqual(first,frame(now+800));
  tv.setReducedMotion(true); tv.update({state:{...state,planes:[{...state.planes[0],x:310}]}});
  assert.notEqual(first,frame(now+900)); tv.dispose();
});
test('mock canvas without image data methods can still draw and dispose', t => {
  const {canvas} = board(t,false), tv = mountPaperSkiesTv(canvas);
  tv.resize({width:640,height:360}); tv.update({scene:fixture('sky-tag')}); tv.draw(); tv.dispose();
  assert.ok(canvas.calls.some(([op]) => op === 'drawImage'));
});
test('engine height signature, torus wrapping and chase projection', () => {
  assert.equal(createHash('sha256').update(buildTerrain(123).heights).digest('hex'),'296e9868f4bcb4c8725211f3617d0ee5cf04209b9612989735ec688ec7fb7ab0');
  assert.equal(cell(-1,512),cell(511,0));
  const p = { x:3,y:8,z:40,a:0 }, cam = createCamera(p,true);
  assert.ok(cam.project(p.x,p.y,p.z).q > 0); assert.equal(cam.project(510,p.y,p.z).q,cam.project(-2,p.y,p.z).q);
  assert.ok(cam.project(3,8,7).y > cam.project(3,8,40).y);
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
