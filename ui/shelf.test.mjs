import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../games/catalog.mjs';
import { shelfModeFromHash, shelfTabForKey, featuredGames, nextHeroIndex, canAdvanceHero } from './shelf.mjs';

test('the shelf uses the Party hash and defaults to two players for other hashes', () => {
  assert.equal(shelfModeFromHash('#party'), 'party');
  for (const hash of ['', '#two-player', '#unknown', '#PARTY', '#party=join']) {
    assert.equal(shelfModeFromHash(hash), 'two-player');
  }
});

test('tab navigation wraps horizontally and supports Home and End', () => {
  assert.equal(shelfTabForKey('two-player', 'ArrowLeft'), 'party');
  assert.equal(shelfTabForKey('party', 'ArrowRight'), 'two-player');
  assert.equal(shelfTabForKey('party', 'Home'), 'two-player');
  assert.equal(shelfTabForKey('two-player', 'End'), 'party');
  assert.equal(shelfTabForKey('party', 'Tab'), null);
});

test('the featured order follows the selected mode and excludes drawing-board games', () => {
  assert.deepEqual(featuredGames(GAME_CATALOG, 'two-player').map(game => game.id), [
    'sofa-kingdoms', 'gravity-orchard', 'odd-laws-society',
  ]);
  // Local-host-only games stay in the rotation so hosted visitors can discover them.
  assert.deepEqual(featuredGames(GAME_CATALOG, 'party').map(game => game.id), [
    'tap-race', 'dont-wake-lala', 'dust-bunny-sumo', 'wall-of-paddles', 'tug-of-yarn', 'snack-stack', 'whiteout-drift',
  ]);
});

test('the carousel wraps in both directions', () => {
  assert.equal(nextHeroIndex(2, 3, 1), 0);
  assert.equal(nextHeroIndex(0, 6, -1), 5);
});

test('automatic rotation stops for each pause reason and never rotates a single slide', () => {
  assert.equal(canAdvanceHero({count: 3}), true);
  for (const reason of ['hovered', 'focused', 'hidden', 'reducedMotion', 'paused', 'modalOpen']) {
    assert.equal(canAdvanceHero({count: 3, [reason]: true}), false, reason);
  }
  assert.equal(canAdvanceHero({count: 1}), false);
});
