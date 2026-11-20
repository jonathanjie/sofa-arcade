import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDrawer } from '../drawers.mjs';
import { fixtureRules, makeFixture } from '../fixtures.mjs';

function context(scene = 'income', playerId = 'jon') {
  const viewer = { role: 'player', playerId };
  return {
    viewer, view: makeFixture(scene, viewer).state, rules: fixtureRules, media: {},
    ui: { drawer: { type: 'city' }, drawerStack: [], choiceId: 'diversity-parade', bid: 2,
      phonePanel: 'placement', selectedDesignId: 'public-library', selectedPlot: { row: 0, col: 2 } },
  };
}

test('city inspection reads the authenticated borough and leaves every draft and public field unchanged', () => {
  for (const playerId of ['jon', 'lydia']) {
    const ctx = context('income', playerId);
    const before = structuredClone({ view: ctx.view, ui: ctx.ui });
    const markup = renderDrawer(ctx);
    assert.match(markup, new RegExp(`data-city-owner="${playerId}"`));
    assert.match(markup, /Guilds in your city/);
    assert.match(markup, /Considering · Civic law/);
    assert.match(markup, /Diversity Parade/);
    assert.match(markup, /Small-Shop Supremacy/);
    assert.match(markup, /Current city law effects/);
    assert.doesNotMatch(markup, /data-action="phone-/);
    assert.deepEqual({ view: ctx.view, ui: ctx.ui }, before);
  }
});

test('sealed inspection uses the acknowledged choice and never restores an unacknowledged draft', () => {
  const ctx = context('locked');
  ctx.ui.choiceId = 'honest-wages';
  ctx.ui.bid = 2;
  const locked = renderDrawer(ctx);
  assert.match(locked, /Sealed choice · Economy law/);
  assert.match(locked, /Small-Shop Supremacy/);
  assert.doesNotMatch(locked, /Honest Wages|data-action="phone-/);
  ctx.view.council.ownCommitment = null;
  const missingOwnCommitment = renderDrawer(ctx);
  assert.doesNotMatch(missingOwnCommitment, /Considering|Sealed choice|Honest Wages/);
});

test('current and hypothetical Civic awards follow live city contents and keep resolves the current law', () => {
  const ctx = context();
  assert.match(renderDrawer(ctx), /\+0 at session end with this city/);
  ctx.view.players.jon.city[2] = { instanceId: 'new-civic', designId: 'petition-kiosk' };
  assert.match(renderDrawer(ctx), /\+1 at session end with this city/);
  ctx.view.players.jon.city[3] = { instanceId: 'new-culture', designId: 'pocket-theatre' };
  ctx.view.activeLaws.civic = 'diversity-parade';
  ctx.ui.choiceId = 'keep';
  const updated = renderDrawer(ctx);
  assert.match(updated, /Keep Diversity Parade/);
  assert.equal((updated.match(/\+2 at session end with this city/g) || []).length, 2);
  assert.match(updated, /4 \/ 9 plots/);
});

test('host/public drawers never show a private city shortcut or a forged own commitment', () => {
  for (const role of ['host', 'public']) {
    const ctx = context('locked');
    ctx.viewer = { role };
    ctx.ui.drawer = { type: 'agenda' };
    const agenda = renderDrawer(ctx);
    assert.doesNotMatch(agenda, /data-action="open-city"|Sealed choice/);
    ctx.ui.drawer = { type: 'city' };
    assert.doesNotMatch(renderDrawer(ctx), /data-city-owner|Considering|Sealed choice/);
  }
});
