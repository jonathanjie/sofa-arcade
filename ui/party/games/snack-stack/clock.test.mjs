import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCardClock } from './clock.mjs';

test('the controller estimates a host offset and ignores ordinary delay spikes', () => {
  const clock = createCardClock();
  clock.sample(400, 10_000);
  clock.sample(600, 10_240);
  assert.equal(clock.at(11_100), 0);
  clock.sample(800, 10_380);
  assert.equal(clock.at(11_100), 20);
  clock.sample(950, 11_000);
  assert.equal(clock.at(11_550), 0, 'reacquire when a host stall loses simulation ticks');
  clock.reset();
  assert.equal(clock.at(12_000), -Infinity);
  clock.sample(1500, 40_000);
  assert.equal(clock.at(40_150), 150);
});
