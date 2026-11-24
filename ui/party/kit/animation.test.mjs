import test from 'node:test';
import assert from 'node:assert/strict';
import { createJuice, createTimeline } from './animation.mjs';

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
