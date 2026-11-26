import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWhiteoutPhone } from './phone.mjs';

class Node {
  constructor(document) {
    this.ownerDocument = document;
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.style = { setProperty() {} };
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
  const phone = mountWhiteoutPhone(root, { input: payload => { inputs.push(payload); return true; } });
  return { phone, inputs, root, view, document, timers, find: root.querySelector,
    tick(ms = 75) { time += ms; for (const callback of timers) callback(); } };
}

const state = { r: 0, h: 2, s: 123, c: 0, i: 2, b: 6 };
const pointer = { pointerId: 1, button: 0, clientX: 100, clientY: 100 };

test('role updates, practice, status and cooldown', () => {
  const f = fixture();
  assert.equal(f.phone.practiceWhileWaiting, true);
  f.phone.update(null, false, { practice: true });
  assert.equal(f.find('[data-role]').textContent, 'Practice');
  assert.equal(f.find('.wd-drift').disabled, false);
  f.phone.update(state, true);
  assert.equal(f.find('[data-role]').textContent, 'Getaway');
  assert.equal(f.find('[data-score]').textContent, '123');
  assert.equal(f.find('[data-hp]').attributes.get('aria-label'), '2 of 3 integrity');
  assert.equal(f.find('[data-spin]').hidden, false);
  assert.equal(f.find('.wd-action progress').value, 6);
  f.phone.update({ ...state, r: 1, c: 15 }, true);
  assert.equal(f.find('.wd-drift').textContent, 'SIREN RAM');
  assert.equal(f.find('.wd-drift').disabled, true);
  assert.equal(f.find('.wd-action progress').value, 25);
  f.phone.update({ ...state, r: 3 }, true);
  assert.equal(f.find('[data-role]').textContent, 'Most Wanted');
  f.phone.dispose();
});

test('steering, hold, release and dispatch obey wire bounds', async () => {
  const f = fixture();
  f.phone.update(state, true);
  const stick = f.find('.wd-stick').children[0];
  stick.emit('pointerdown', pointer);
  await new Promise(resolve => setTimeout(resolve, 60));
  f.tick();
  const drift = f.find('.wd-drift');
  drift.emit('pointerdown', pointer);
  f.tick();
  drift.emit('pointerup', pointer);
  f.tick();
  assert.ok(f.inputs.some(p => p.d === 1));
  assert.equal(f.inputs.at(-1).d, 0);
  assert.ok(f.inputs.some(p => p.x > 0 && p.y > 0));
  for (const p of f.inputs) { assert.equal(p.kind, 'drive'); assert.ok(Math.hypot(p.x, p.y) <= 1); }
  f.phone.update({ ...state, r: 2 }, true);
  f.tick();
  assert.equal(f.find('.wd-driving').hidden, true);
  const radar = f.find('.wd-radar');
  radar.emit('pointerdown', pointer);
  radar.emit('pointerup', pointer);
  const ping = f.inputs.at(-1);
  assert.equal(ping.kind, 'dispatch');
  assert.ok(Math.hypot(ping.x, ping.y) >= .1 && Math.hypot(ping.x, ping.y) <= 1);
  f.phone.update(state, true);
  drift.emit('pointerdown', pointer);
  f.phone.update(state, false);
  assert.equal(drift.disabled, true);
  assert.equal(drift.attributes.get('aria-pressed'), 'false');
  f.phone.dispose();
  assert.equal(f.timers.size, 0);
  assert.equal(f.root.children.length, 0);
  assert.ok([...f.view.listeners.values()].every(set => set.size === 0));
});
