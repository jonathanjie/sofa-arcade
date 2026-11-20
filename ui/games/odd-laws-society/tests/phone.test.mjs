import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePhoneAction, renderPhone } from '../phone.mjs';
import { fixtureRules, makeFixture } from '../fixtures.mjs';

function context(scene = 'council') {
  const viewer = { role: 'player', playerId: 'jon' };
  const ctx = {
    viewer, view: makeFixture(scene, viewer).state, rules: fixtureRules,
    ui: { busy: false, phonePanel: 'actions', choiceId: 'keep', bid: 0, selectedPlot: null, selectedDesignId: null },
    status: { state: 'connected' }, media: {}, commands: [],
    setState(patch) { Object.assign(ctx.ui, patch); },
    submit(action) { ctx.commands.push(action); },
    openDrawer() {},
  };
  return ctx;
}
const press = (ctx, action, dataset = {}) => handlePhoneAction(action, { dataset }, ctx);

test('private council controls change local draft only and reject unavailable bids/options', () => {
  const ctx = context();
  const publicBefore = structuredClone(ctx.view);
  press(ctx, 'phone-law', { choiceId: 'honest-wages' });
  press(ctx, 'phone-bid', { bid: '2' });
  press(ctx, 'phone-bid', { bid: '3' });
  press(ctx, 'phone-bid', { bid: '1.2' });
  press(ctx, 'phone-law', { choiceId: 'not-an-offered-law' });
  assert.equal(ctx.ui.choiceId, 'honest-wages');
  assert.equal(ctx.ui.bid, 2);
  assert.deepEqual(ctx.commands, []);
  assert.deepEqual(ctx.view, publicBefore);
  press(ctx, 'phone-seal');
  assert.deepEqual(ctx.commands, [{ type: 'commitCouncil', choiceId: 'honest-wages', bid: 2 }]);
});

test('a locked or pending commitment cannot be changed or dispatched twice', () => {
  for (const mode of ['locked', 'pending']) {
    const ctx = context(mode === 'locked' ? 'locked' : 'council');
    ctx.ui.busy = mode === 'pending';
    press(ctx, 'phone-bid', { bid: '1' });
    press(ctx, 'phone-law', { choiceId: 'honest-wages' });
    press(ctx, 'phone-seal');
    assert.deepEqual(ctx.commands, []);
  }
});

test('Build is a design-and-plot draft; occupied plots or changed turns cannot commit', () => {
  const ctx = context('actions');
  press(ctx, 'phone-build');
  press(ctx, 'phone-design', { designId: 'public-library' });
  press(ctx, 'phone-plot', { row: '0', col: '0' });
  assert.equal(ctx.ui.selectedPlot, null);
  press(ctx, 'phone-confirm-build');
  assert.deepEqual(ctx.commands, []);
  press(ctx, 'phone-plot', { row: '0', col: '2' });
  assert.deepEqual(ctx.ui.selectedPlot, { row: 0, col: 2 });
  assert.deepEqual(ctx.commands, []);
  ctx.view.activePlayer = 'lydia';
  press(ctx, 'phone-confirm-build');
  assert.deepEqual(ctx.commands, []);
  ctx.view.activePlayer = 'jon';
  press(ctx, 'phone-confirm-build');
  assert.deepEqual(ctx.commands, [{ type: 'build', designId: 'public-library', row: 0, col: 2 }]);
});

test('full-city stock inspection is possible but Build/Festival are guarded and Lobby at cap is legal', () => {
  const ctx = context('full');
  press(ctx, 'phone-build');
  assert.equal(ctx.ui.phonePanel, 'market');
  press(ctx, 'phone-design', { designId: 'grand-bazaar' });
  press(ctx, 'phone-plot', { row: '0', col: '0' });
  press(ctx, 'phone-confirm-build');
  press(ctx, 'phone-festival');
  assert.deepEqual(ctx.commands, []);
  assert.match(ctx.ui.phoneNotice, /already held/i);
  press(ctx, 'phone-lobby');
  assert.deepEqual(ctx.commands, [{ type: 'lobby' }]);
});

test('rendered sealed screen includes only the authenticated own commitment', () => {
  const ctx = context('locked');
  const markup = renderPhone(ctx);
  assert.match(markup, /Your vote is sealed/);
  assert.match(markup, /Small-Shop Supremacy/);
  assert.match(markup, /1<\/strong> influence committed/);
  assert.doesNotMatch(markup, /Honest Wages/);
  assert.match(markup, /Waiting for Lydia/);
});
