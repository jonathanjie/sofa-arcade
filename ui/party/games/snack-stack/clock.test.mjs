import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCardClock } from './clock.mjs';

test('the card clock uses the synchronized host clock and tracks a corrected play anchor', () => {
  let now = null;
  const clock = createCardClock(() => now);
  assert.equal(clock.at(12_000), null, 'no timing claim before the phone has synchronized');
  now = 12_040.4;
  assert.equal(clock.at(12_000), 40);
  assert.equal(clock.at(12_200), -160, 'a correction moves the opening after a host stall');
  assert.equal(clock.at(undefined), null, 'score packets do not carry a playable anchor');
});
