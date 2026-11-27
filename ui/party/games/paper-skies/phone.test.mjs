import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPaperSkiesPhone } from './phone.mjs';

class Node {
  constructor(document) {
    this.ownerDocument = document;
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.children = [];
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, fields = {}) { for (const handler of this.listeners.get(type) ?? []) handler({ preventDefault() {}, ...fields }); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  toggleAttribute(key, value) { if (value) this.attributes.set(key, ''); else this.attributes.delete(key); }
  append(node) { this.children.push(node); }
  prepend(node) { this.children.unshift(node); }
  remove() {}
  replaceChildren() { this.children = []; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = undefined; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}

function fixture() {
  const document = new Node();
  document.createElement = () => new Node(document);
  const view = document.defaultView = new Node(document);
  view.isSecureContext = true;
  view.DeviceOrientationEvent = function Orientation() {};
  let time = 0;
  const timers = new Set();
  view.performance = { now: () => time };
  view.setInterval = callback => { timers.add(callback); return callback; };
  view.clearInterval = callback => timers.delete(callback);
  const root = new Node(document);
  const nodes = new Map();
  root.querySelector = key => {
    if (!nodes.has(key)) nodes.set(key, new Node(document));
    return nodes.get(key);
  };
  const inputs = [];
  const phone = mountPaperSkiesPhone(root, { input: payload => { inputs.push(payload); return true; } });
  return { phone, inputs, root, view, document, timers, find: root.querySelector,
    tick(ms = 50) { time += ms; for (const callback of timers) callback(); } };
}

const state = { m: 0, s: 12, f: 6, z: 73, c: 4, k: 1, rl: 1, lp: 1, r: -5, t: 90 };
const pointer = { pointerId: 1, button: 0, clientX: 120, clientY: -20 };
const neutral = { kind: 'fly', x: 0, y: 0, b: 0, r: 0, l: 0 };
const waitForStick = () => new Promise(resolve => setTimeout(resolve, 60));

test('HUD, modes and practice controls', () => {
  const f = fixture();
  assert.equal(f.phone.practiceWhileWaiting, true);
  f.phone.update(null, false, { practice: true });
  const [stick, tilt] = f.find('.ps-steer').children;
  assert.equal(stick.disabled, false);
  assert.equal(tilt.textContent, 'Enable tilt');
  assert.equal(tilt.hidden, false);
  const boost = f.find('.ps-boost');
  boost.emit('pointerdown', pointer);
  f.tick();
  assert.equal(boost.attributes.get('aria-pressed'), 'true');
  assert.deepEqual(f.inputs, []);
  f.phone.update(state, true);
  assert.equal(boost.attributes.get('aria-pressed'), 'false');
  assert.equal(f.find('[data-mode]').textContent, 'Sun Chains');
  assert.equal(f.find('[data-score]').textContent, '12');
  assert.equal(f.find('[data-context]').textContent, 'Streak x4');
  assert.equal(f.find('.ps-fuel progress').value, 6);
  assert.equal(f.find('.ps-alt progress').value, 73);
  assert.equal(f.find('.ps-fuel').attributes.has('data-low'), true);
  assert.equal(f.find('.ps-phone').style['--ps-bank'], '-14deg');
  assert.equal(f.find('.ps-phone').style['--ps-target'], '90deg');
  assert.equal(f.find('[data-arrow]').hidden, false);
  assert.equal(boost.attributes.has('data-boosting'), true);
  assert.equal(f.find('.ps-roll').attributes.has('data-cooldown'), true);
  f.phone.update({ ...state, m: 1, f: 100, k: 0, rl: 0, lp: 0, t: undefined }, true);
  assert.equal(f.find('[data-mode]').textContent, 'Sky Balloons');
  assert.equal(f.find('[data-context]').textContent, 'Popped 4');
  assert.equal(f.find('.ps-fuel').attributes.has('data-low'), false);
  assert.equal(f.find('.ps-loop').attributes.has('data-cooldown'), false);
  assert.equal(f.find('[data-arrow]').hidden, true);
  f.phone.update({ ...state, m: 2, c: 1 }, true);
  assert.equal(f.find('[data-mode]').textContent, 'Sun Crown');
  assert.equal(f.find('[data-context]').textContent, 'Crown!');
  f.phone.update({ ...state, m: 2, c: 0 }, true);
  assert.equal(f.find('[data-context]').hidden, true);
  f.phone.dispose();
});

test('multi-touch holds, short maneuver taps, and neutral releases', async () => {
  const f = fixture();
  f.phone.update(state, true);
  const [stick] = f.find('.ps-steer').children;
  const boost = f.find('.ps-boost');
  const roll = f.find('.ps-roll');
  stick.emit('pointerdown', pointer);
  await waitForStick();
  boost.emit('pointerdown', { ...pointer, pointerId: 2 });
  roll.emit('pointerdown', { ...pointer, pointerId: 3 });
  assert.equal(f.inputs.length, 1);
  f.tick();
  assert.deepEqual(f.inputs.at(-1), { kind: 'fly', x: 1, y: -1, b: 1, r: 1, l: 0 });
  roll.emit('pointerup', { ...pointer, pointerId: 3 });
  boost.emit('pointercancel', { ...pointer, pointerId: 2 });
  stick.emit('lostpointercapture', pointer);
  await waitForStick();
  f.tick();
  assert.deepEqual(f.inputs.at(-1), neutral);
  roll.emit('pointerdown', { ...pointer, pointerId: 4 });
  roll.emit('pointerup', { ...pointer, pointerId: 4 });
  const loop = f.find('.ps-loop');
  loop.emit('pointerdown', { ...pointer, pointerId: 5 });
  loop.emit('pointerup', { ...pointer, pointerId: 5 });
  f.tick();
  assert.deepEqual(f.inputs.at(-1), { ...neutral, r: 1, l: 1 });
  f.tick();
  assert.deepEqual(f.inputs.at(-1), neutral);
  f.phone.update(state, false);
  assert.deepEqual(f.inputs.at(-1), neutral);
  f.phone.dispose();
});

test('dispose releases captures, cancels steering and removes timers and listeners', async () => {
  const f = fixture();
  f.phone.update(state, true);
  const [stick, tilt] = f.find('.ps-steer').children;
  tilt.emit('click');
  f.view.emit('deviceorientation', { beta: 5, gamma: 5 });
  f.find('.ps-boost').emit('pointerdown', pointer);
  f.phone.dispose();
  assert.equal(f.find('.ps-boost').capture, undefined);
  assert.equal(f.timers.size, 0);
  assert.equal(f.root.children.length, 0);
  assert.ok([...f.view.listeners.values()].every(set => set.size === 0));
  assert.ok([...f.document.listeners.values()].every(set => set.size === 0));
  assert.equal(stick.disabled, true);
  const count = f.inputs.length;
  await waitForStick();
  f.tick();
  assert.equal(f.inputs.length, count);
  assert.deepEqual(f.inputs.at(-1), neutral);
});

test('landscape tilt rotates axes and returns to touch', async () => {
  const f = fixture();
  f.view.screen = { orientation: { angle: 90 } };
  f.phone.update(state, true);
  const [stick, tilt] = f.find('.ps-steer').children;
  tilt.emit('click');
  f.view.emit('deviceorientation', { beta: 0, gamma: 0 });
  f.view.emit('deviceorientation', { beta: 30, gamma: 30 });
  await waitForStick();
  assert.equal(tilt.textContent, 'Tilt active · Use touch');
  assert.equal(stick.disabled, true);
  assert.deepEqual(f.inputs.at(-1), { ...neutral, x: 1, y: -1 });
  tilt.emit('click');
  f.tick();
  assert.equal(tilt.textContent, 'Enable tilt');
  assert.deepEqual(f.inputs.at(-1), neutral);
  f.phone.dispose();
});
