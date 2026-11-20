import test from 'node:test';
import assert from 'node:assert/strict';
import { publicChanges, createMotion } from '../motion.mjs';
import { makeFixture } from '../fixtures.mjs';

test('initial snapshots and rematches do not fabricate reward events', () => {
  const view = makeFixture('actions').state;
  assert.deepEqual(publicChanges(null, view), []);
  const freshMatch = structuredClone(view);
  freshMatch.matchId = 'new-match';
  freshMatch.players.jon.coins += 50;
  assert.deepEqual(publicChanges(view, freshMatch), []);
});

test('a first sealed commitment reveals readiness only, including under malformed balance changes', () => {
  const before = makeFixture('council').state;
  const first = structuredClone(before);
  first.council.ready.jon = true;
  first.council.ownCommitment = { choiceId: 'honest-wages', bid: 2 };
  first.players.jon.influence = 0;
  const events = publicChanges(before, first);
  assert.deepEqual(events.map(event => event.type), ['seal']);
  const second = structuredClone(first);
  second.council.ownCommitment = { choiceId: 'small-shop-supremacy', bid: 1 };
  second.players.jon.influence = 1;
  assert.deepEqual(publicChanges(before, second), events);
});

test('both revealed commitments produce one stable reveal event and no replay for an identical snapshot', () => {
  const before = makeFixture('council').state;
  const after = makeFixture('reveal').state;
  const events = publicChanges(before, after);
  assert.equal(events.filter(event => event.type === 'reveal').length, 1);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
  assert.deepEqual(publicChanges(after, structuredClone(after)), []);
});

function motionHost() {
  const effects = [], animations = [];
  const row = {
    dataset: { street: '0' },
    animate(frames, options) {
      const entry = { frames, options, cancelled: false };
      animations.push(entry);
      return { finished: Promise.resolve(), cancel() { entry.cancelled = true; } };
    },
  };
  const player = { querySelectorAll(selector) { return selector === '.ols-street' ? [row] : []; } };
  const root = { querySelectorAll(selector) { return selector === '[data-player-id="jon"]' ? [player] : []; } };
  return { root, effects, animations, sound: { effect(name) { effects.push(name); } } };
}

function streetTransition() {
  const before = makeFixture('actions').state;
  const after = structuredClone(before);
  after.players.jon.score.streets += 2;
  after.players.jon.streetEvaluated[0] = true;
  return { before, after };
}

test('repeat transitions, silent reconnect baselines and dispose cannot replay street rewards', () => {
  const host = motionHost();
  const motion = createMotion(host.root, { sound: host.sound });
  const { before, after } = streetTransition();
  assert.equal(motion.consume(before, after).length, 1);
  assert.deepEqual(host.effects, ['street']);
  assert.deepEqual(motion.consume(before, after), []);
  assert.deepEqual(host.effects, ['street']);
  const later = structuredClone(after);
  later.phaseId += ':later';
  later.players.jon.score.streets += 2;
  motion.consume(after, later, { animate: false });
  assert.deepEqual(motion.consume(after, later), []);
  assert.deepEqual(host.effects, ['street']);
  motion.dispose();
  assert.deepEqual(motion.consume(null, later), []);
});

test('reduced motion uses a brief fade even when an event requests a longer duration', () => {
  const host = motionHost();
  const motion = createMotion(host.root, { sound: host.sound, reducedMotion: true });
  const { before, after } = streetTransition();
  motion.consume(before, after);
  assert.ok(host.animations.length > 0);
  for (const animation of host.animations) {
    assert.ok(animation.options.duration <= 200);
    assert.ok(animation.frames.every(frame => !('transform' in frame)));
  }
  motion.dispose();
});
