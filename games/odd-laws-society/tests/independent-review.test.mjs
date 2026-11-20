import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { engine, RuleError } from '../engine.mjs';
import { BUILDINGS } from '../catalog.mjs';
import { buildQuote, streetOutcome } from '../preview.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const action = (state, type, fields = {}) => ({ type, matchId: state.matchId, phaseId: state.phaseId, ...fields });

function actionsInTerm(term) {
  let state = engine.create({ seed: 'independent-review', matchId: `review-${term}`, options: { firstChair: 'jon' } });
  while (state.term < term || state.stage === 'council') {
    if (state.stage === 'council') {
      state = engine.apply(state, 'jon', action(state, 'commitCouncil', { choiceId: 'keep', bid: 0 }));
      state = engine.apply(state, 'lydia', action(state, 'commitCouncil', { choiceId: 'keep', bid: 0 }));
    } else {
      state = engine.apply(state, state.activePlayer, action(state, 'work'));
    }
  }
  return state;
}

test('independent review: every design has exact pre-action discount/payment under every Economy law', () => {
  // Synthetic city snapshots isolate the price boundaries; complete legal traces
  // are tested separately. Expected amounts come directly from the rule table.
  const economies = [
    ['economy-neutral', null], ['small-shop-supremacy', 'commerce'],
    ['workshop-week', 'craft'], ['public-grants', 'civic'],
    ['everything-is-art', 'culture'], ['open-tender', 'first'], ['honest-wages', null],
  ];
  const bases = [null, actionsInTerm(1), actionsInTerm(2), actionsInTerm(3)];
  let cases = 0;
  for (const building of BUILDINGS) for (const [lawId, target] of economies) {
    for (const builds of [0, 1]) for (const workshopCount of [0, 1, 2]) for (const influence of [0, 5, 6]) {
      const state = clone(bases[building.term]);
      const actor = state.activePlayer;
      const player = state.players[actor];
      state.activeLaws.economy = lawId;
      player.coins = 100;
      player.influence = influence;
      player.buildsThisSession = builds;
      for (let index = 0; index < workshopCount; index++) {
        player.city[index] = { instanceId: `review-workshop-${index}`, designId: index === 0 ? 'button-workshop' : 'clockwork-studio' };
      }
      const eligibleLaw = target === building.guild || (target === 'first' && builds === 0);
      const nominalDiscount = eligibleLaw ? 2 : (workshopCount > 0 && builds === 0 ? 1 : 0);
      const expectedCost = Math.max(1, building.cost - nominalDiscount);
      const sourceId = eligibleLaw ? lawId : nominalDiscount ? 'workshop' : null;
      const grant = building.ability?.type === 'influenceOnBuild' ? building.ability.amount : 0;
      const expectedGain = Math.min(grant, 6 - influence);
      const before = JSON.stringify(state);
      assert.deepEqual(buildQuote(state, actor, building.id), {
        allowed: true, reason: null, printedCost: building.cost, cost: expectedCost,
        discount: { amount: building.cost - expectedCost, sourceId },
        influenceGain: expectedGain, prestige: building.prestige,
      }, `${building.id}/${lawId}/builds=${builds}/workshops=${workshopCount}/influence=${influence}`);
      const after = engine.apply(state, actor, action(state, 'build', { designId: building.id, row: 0, col: 2 }));
      assert.equal(after.players[actor].coins, 100 - expectedCost);
      assert.equal(after.players[actor].influence, influence + expectedGain);
      assert.equal(after.players[actor].buildsThisSession, builds + 1);
      assert.equal(after.players[actor].city[2].designId, building.id);
      assert.equal(JSON.stringify(state), before);
      cases++;
    }
  }
  assert.equal(cases, 2268);
});

test('independent review: all 64 guild triples and each plot position obey the one-or-three street rule', () => {
  const guildDesigns = [
    ['corner-shop', 'tea-stall', 'night-market'],
    ['button-workshop', 'clockwork-studio', 'quilt-bridge'],
    ['petition-kiosk', 'public-library', 'debate-hall'],
    ['community-garden', 'pocket-theatre', 'concert-pavilion'],
  ];
  const base = engine.project(actionsInTerm(1), { role: 'public' });
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    const guilds = [a, b, c];
    const qualifies = new Set(guilds).size !== 2;
    for (let row = 0; row < 3; row++) for (let missing = 0; missing < 3; missing++) {
      const view = clone(base);
      // The helper must still preview when this seat is inactive, broke and no stock remains.
      view.activePlayer = 'lydia';
      view.players.jon.coins = 0;
      view.market.forEach(stack => { stack.remaining = 0; });
      for (let col = 0; col < 3; col++) if (col !== missing) {
        view.players.jon.city[row * 3 + col] = { instanceId: `review-${col}`, designId: guildDesigns[guilds[col]][col] };
      }
      const expected = { canPlace: true, reason: null, completes: true, qualifies, prestige: qualifies ? 2 : 0 };
      const before = JSON.stringify(view);
      assert.deepEqual(streetOutcome(view, 'jon', row, missing, guildDesigns[guilds[missing]][missing]), expected);
      assert.equal(JSON.stringify(view), before);
      view.players.jon.streetEvaluated[row] = true;
      assert.equal(streetOutcome(view, 'jon', row, missing, guildDesigns[guilds[missing]][missing]).prestige, 0);
    }
  }
  for (const positions of [[0, 3, 6], [0, 4, 8]]) {
    const view = clone(base);
    positions.slice(0, 2).forEach((position, index) => {
      view.players.jon.city[position] = { instanceId: `vertical-${index}`, designId: guildDesigns[0][index] };
    });
    const last = positions[2];
    assert.deepEqual(streetOutcome(view, 'jon', Math.floor(last / 3), last % 3, 'night-market'), {
      canPlace: true, reason: null, completes: false, qualifies: false, prestige: 0,
    });
  }
});

test('independent review: sparse or accessor setup agendas fail safely before creation', () => {
  const original = engine.create({ seed: 'setup-review', matchId: 'setup-review' }).agenda;
  for (let hole = 0; hole < 6; hole++) {
    const agenda = clone(original);
    delete agenda[hole];
    assert.throws(() => engine.create({ seed: 'x', matchId: 'x', options: { agenda } }),
      error => error instanceof RuleError && error.code === 'INVALID_SETUP');
  }
  const agenda = clone(original);
  let getterRead = false;
  Object.defineProperty(agenda, '3', { enumerable: true, get() { getterRead = true; return original[3]; } });
  assert.throws(() => engine.create({ seed: 'x', matchId: 'x', options: { agenda } }),
    error => error instanceof RuleError && error.code === 'INVALID_SETUP');
  assert.equal(getterRead, false);
});

test('independent review: Lydia wins distinct-choice council ties in both commitment arrival orders', () => {
  for (const bid of [0, 1, 2]) for (const order of [['jon', 'lydia'], ['lydia', 'jon']]) {
    let state = engine.create({ seed: 'lydia-tie', matchId: 'lydia-tie', options: { firstChair: 'lydia' } });
    const choices = { jon: state.council.optionIds[0], lydia: state.council.optionIds[1] };
    for (const seat of order) state = engine.apply(state, seat, action(state, 'commitCouncil', { choiceId: choices[seat], bid }));
    assert.equal(state.activeLaws.economy, choices.lydia);
    assert.equal(state.activePlayer, 'jon');
    assert.equal(state.players.jon.influence, 2 - bid);
    assert.equal(state.players.lydia.influence, 2 - bid);
  }
});

test('independent review: the sixth action earns the new Civic threshold before income; replacement preserves awards', () => {
  const agenda = [
    { session: 1, category: 'economy', lawIds: ['public-grants', 'honest-wages'] },
    { session: 2, category: 'civic', lawIds: ['public-service-day', 'shop-local'] },
    { session: 3, category: 'economy', lawIds: ['small-shop-supremacy', 'workshop-week'] },
    { session: 4, category: 'civic', lawIds: ['industrial-pride', 'mandatory-applause'] },
    { session: 5, category: 'economy', lawIds: ['everything-is-art', 'open-tender'] },
    { session: 6, category: 'civic', lawIds: ['fashionable-streets', 'diversity-parade'] },
  ];
  let state = engine.create({ seed: 'sixth-action', matchId: 'sixth-action', options: { firstChair: 'jon', agenda } });
  const vote = choiceId => {
    for (const seat of ['jon', 'lydia']) state = engine.apply(state, seat, action(state, 'commitCouncil', { choiceId, bid: 0 }));
  };
  const work = () => { state = engine.apply(state, state.activePlayer, action(state, 'work')); };
  vote('keep');
  state = engine.apply(state, 'lydia', action(state, 'build', { designId: 'petition-kiosk', row: 0, col: 0 }));
  for (let index = 0; index < 5; index++) work();
  assert.equal(state.session, 2);
  vote('public-service-day');
  for (let index = 0; index < 5; index++) work();
  assert.equal(state.actionIndex, 5);
  assert.equal(state.activePlayer, 'lydia');
  assert.equal(state.players.lydia.score.civic, 0);
  state = engine.apply(state, 'lydia', action(state, 'build', { designId: 'petition-kiosk', row: 0, col: 1 }));
  assert.equal(state.session, 3);
  assert.equal(state.players.lydia.score.civic, 1);
  assert.equal(state.players.jon.score.civic, 0);
  assert.equal(state.players.lydia.coins, 16);
  assert.equal(state.players.lydia.influence, 6);
  assert.equal(state.players.lydia.buildsThisSession, 0);
  vote('keep');
  for (let index = 0; index < 6; index++) work();
  assert.equal(state.players.lydia.score.civic, 2);
  vote('industrial-pride');
  for (let index = 0; index < 6; index++) work();
  assert.equal(state.session, 5);
  assert.equal(state.players.lydia.score.civic, 2);
});

test('independent review: browser module graph ends at public data and safe errors', () => {
  const publicModules = new Set(['catalog.mjs', 'preview.mjs', 'errors.mjs']);
  const visited = new Set();
  function inspect(name) {
    if (visited.has(name)) return;
    assert.ok(publicModules.has(name), `private dependency in public graph: ${name}`);
    visited.add(name);
    const source = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(|\bfetch\s*\(|\bMath\.random\s*\(|\bDate\.now\s*\(/);
    for (const [, specifier] of source.matchAll(/(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
      assert.match(specifier, /^\.\/[a-z-]+\.mjs$/);
      inspect(specifier.slice(2));
    }
  }
  inspect('catalog.mjs');
  inspect('preview.mjs');
  assert.deepEqual([...visited].sort(), [...publicModules].sort());
});
