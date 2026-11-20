import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaPicture, fallbackBuilding, fallbackCharacter } from '../graphics.mjs';
import { guildLabel } from '../shared.mjs';
import { fixtureRules } from '../fixtures.mjs';

test('manifest entries resolve against the complete manifest URL, including relative parent paths', () => {
  const entry = { src: 'buildings/shop.svg', width: 512, height: 512, alt: 'Shop', status: 'placeholder' };
  const markup = mediaPicture(entry, '<svg data-fallback></svg>', 'https://local.example/assets/odd-laws/manifest.json');
  assert.match(markup, /src="https:\/\/local\.example\/assets\/odd-laws\/buildings\/shop\.svg"/);
  assert.match(markup, /width="512" height="512"/);
  assert.match(markup, /data-fallback/);
  const parentPath = mediaPicture({ ...entry, src: '../shared/coin.svg' }, '<svg></svg>', 'https://local.example/assets/odd-laws/manifest.json');
  assert.match(parentPath, /src="https:\/\/local\.example\/assets\/shared\/coin\.svg"/);
});

test('missing, malformed and executable media sources leave the code-native graphic available', () => {
  for (const [entry, url] of [
    [null, null], [{ src: 'image.svg' }, null], [{ src: 'image.svg' }, 'not-a-url'],
    [{ src: 'javascript:alert(1)' }, 'https://local.example/assets/manifest.json'],
  ]) {
    const markup = mediaPicture(entry, '<svg data-fallback="present"></svg>', url);
    assert.match(markup, /data-fallback="present"/);
    assert.doesNotMatch(markup, /<img/);
  }
});

test('every public building and character state has an offline SVG fallback', () => {
  for (const design of fixtureRules.buildings) {
    const markup = fallbackBuilding(design);
    assert.match(markup, /^<svg /);
    assert.doesNotMatch(markup, /https?:|<image|<text/);
  }
  for (const id of ['jon', 'lydia', 'lala']) for (const state of ['idle', 'thinking', 'acting', 'celebrate', 'disappointed', 'stamp']) {
    assert.match(fallbackCharacter(id, state), /^<svg /);
  }
});

test('each guild pairs its symbol with a visible textual name', () => {
  for (const guild of fixtureRules.guilds) {
    const markup = guildLabel(guild.id, fixtureRules);
    assert.ok(markup.includes(`<span>${guild.name}</span>`));
    assert.match(markup, /<svg /);
  }
});
