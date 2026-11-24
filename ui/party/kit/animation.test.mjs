import test from 'node:test';
import assert from 'node:assert/strict';
import { createArcadeLoop, createJuice, createTimeline } from './animation.mjs';

test('draw interpolation is bounded and skips old rounds and reduced motion', () => {
  const timeline = createTimeline();
  const interpolate = (previous, current, fraction, lerp) => lerp(previous, current, fraction);
  timeline.push(10, 1, 100);
  timeline.push(20, 1, 150);
  assert.equal(timeline.sample(175, interpolate), 15);
  assert.equal(timeline.sample(250, interpolate), 20);
  assert.equal(timeline.sample(175, interpolate, true), 20);
  timeline.push(0, 2, 350);
  assert.equal(timeline.sample(360, interpolate), 0);
});

test('reduced motion clears active hit-stop, shake and squash and suppresses new effects', () => {
  const juice = createJuice();
  const impact = { x: 60, y: 60, colour: '#fff', label: 'Finish!', id: 'p1', time: 100, strong: true };
  juice.impact(impact);
  assert.equal(juice.frozen(110), true);
  assert.notDeepEqual(juice.offset(110), [0, 0]);
  assert.equal(juice.squash('p1', 110), 1);
  juice.setReducedMotion(true);
  juice.impact(impact);
  assert.equal(juice.frozen(110), false);
  assert.ok(juice.offset(110).every(value => value === 0));
  assert.equal(juice.squash('p1', 110), 0);
});

test('a stale snapshot cannot rewind a newer scene or round', () => {
  const timeline = createTimeline();
  const current = (previous, next) => next;
  timeline.push(10, 1, 100);
  timeline.push(20, 1, 150);
  timeline.push(15, 1, 125);
  assert.equal(timeline.sample(200, current), 20);
  timeline.push(0, 2, 300);
  timeline.push(40, 1, 350);
  assert.equal(timeline.sample(400, current), 0);
});

test('a burst of snapshots interpolates from the in-flight position', () => {
  const timeline = createTimeline();
  const interpolate = (previous, current, fraction, lerp) => lerp(previous, current, fraction);
  timeline.push(10, 1, 100);
  timeline.push(20, 1, 150);
  assert.equal(timeline.sample(175, interpolate), 15);
  timeline.push(30, 1, 175);
  assert.equal(timeline.sample(175, interpolate), 15);
  assert.equal(timeline.sample(300, interpolate), 30);
});

test('a hidden tab holds no frame request and a shown tab resumes once', t => {
  const doc = new EventTarget();
  doc.hidden = true;
  const media = new EventTarget();
  const callbacks = new Map();
  let nextId = 0;
  for (const [key, value] of Object.entries({
    document: doc,
    matchMedia: () => media,
    requestAnimationFrame: callback => { callbacks.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: id => callbacks.delete(id),
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  let frames = 0;
  const loop = createArcadeLoop(() => frames++);
  const visibility = hidden => {
    doc.hidden = hidden;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  assert.equal(callbacks.size, 0);
  visibility(false);
  visibility(false);
  assert.equal(callbacks.size, 1);
  const [id, callback] = callbacks.entries().next().value;
  callbacks.delete(id);
  callback(100);
  assert.equal(frames, 1);
  assert.equal(callbacks.size, 1);
  visibility(true);
  assert.equal(callbacks.size, 0);
  loop.dispose();
  visibility(false);
  assert.equal(callbacks.size, 0);
});
