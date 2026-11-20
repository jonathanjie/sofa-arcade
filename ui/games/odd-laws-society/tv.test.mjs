import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTV } from './tv.mjs';

// Deliberately small independent injected adapter: presentation must use its
// quotes, rather than reproducing rule arithmetic or reading private authority.
const buildings = [
  { id: 'corner-shop', name: 'Corner Shop', term: 1, guild: 'commerce', cost: 3, prestige: 1, ability: { type: 'income', amount: 1 }, abilityDescription: '+1 coin at later income, capped at +2.' },
  { id: 'tea-stall', name: 'Tea Stall', term: 1, guild: 'commerce', cost: 2, prestige: 2, ability: null, abilityDescription: '' },
];
const rules = {
  buildings,
  laws: [
    { id: 'public-grants', name: 'Public Grants', category: 'economy', description: 'Civic Buildings cost 2 less, minimum 1.' },
    { id: 'open-tender', name: 'Open Tender', category: 'economy', description: 'The first Build costs 2 less, minimum 1.' },
  ],
  guilds: [{ id: 'commerce', name: 'Commerce', iconKey: 'commerce', color: '#a37e30' }],
  buildQuote: (view, playerId, id) => ({ allowed: view.activePlayer === playerId, reason: null, printedCost: buildings.find(b => b.id === id).cost, cost: playerId === 'jon' ? 1 : 2, discount: { amount: 1, sourceId: 'open-tender' }, influenceGain: 0, prestige: 1 }),
  civicAward: () => 0,
};
const player = () => ({ coins: 9, influence: 3, city: Array(9).fill(null), streetEvaluated: [false, false, false], buildsThisSession: 0, festivalUsed: false, score: { buildings: 4, streets: 2, festivals: 0, civic: 1, treasury: 3, total: 10 } });
function context() {
  return {
    viewer: { role: 'host' }, rules, ui: {}, status: { state: 'connected' }, media: {},
    view: {
      schemaVersion: 1, gameId: 'odd-laws-society', rulesVersion: '0.2', matchId: 'test-match', phase: 'playing', stage: 'council', phaseId: 'council-3', session: 3, term: 2, chair: 'jon', chairSchedule: ['jon', 'lydia', 'lydia', 'jon', 'jon', 'lydia'], activePlayer: null, actionIndex: null,
      actionsRemaining: { jon: 3, lydia: 3 }, activeLaws: { economy: 'economy-neutral', civic: 'civic-neutral' }, agenda: [], council: { category: 'economy', optionIds: ['public-grants', 'open-tender', 'keep'], ready: { jon: true, lydia: false }, ownCommitment: null }, market: buildings.map(b => ({ designId: b.id, remaining: 2 })), players: { jon: player(), lydia: player() }, lastCouncil: null, result: null,
    },
  };
}

test('TV output is invariant to private drafts and even an accidental ownCommitment', () => {
  const a = context();
  const b = structuredClone(a.view);
  b.council.ownCommitment = { choiceId: 'public-grants', bid: 3 };
  assert.equal(renderTV(a), renderTV({ ...a, view: b, ui: { choiceId: 'open-tender', bid: 1 } }));
  assert.match(renderTV(a), /Choosing privately/);
  assert.doesNotMatch(renderTV(a), /3 paid|1 paid|ownCommitment/);
});

test('TV uses injected player-specific exact prices and keeps potential treasury separate', () => {
  const ctx = context();
  Object.assign(ctx.view, { stage: 'actions', activePlayer: 'lydia', actionIndex: 2, council: null });
  const html = renderTV(ctx);
  assert.match(html, /Jon pays 1 coins; Lydia pays 2 coins/);
  assert.match(html, /Jon: 7 current prestige/);
  assert.match(html, /\+3 treasury potential/);
  assert.doesNotMatch(html, /Jon: 10 current prestige/);
});

test('reveal shows both committed votes and both paid bids in one render', () => {
  const ctx = context();
  Object.assign(ctx.view, { stage: 'actions', activePlayer: 'lydia', actionIndex: 0, council: null, lastCouncil: { session: 3, phaseId: 'council-3', category: 'economy', choices: { jon: { choiceId: 'public-grants', bid: 3 }, lydia: { choiceId: 'keep', bid: 2 } }, adoptedLawId: 'public-grants' } });
  const html = renderTV(ctx);
  assert.match(html, /data-reveal-phase="council-3"/);
  assert.match(html, /3 paid/);
  assert.match(html, /2 paid/);
  assert.match(html, /data-envelope="jon"/);
  assert.match(html, /data-envelope="lydia"/);
  assert.match(html, /data-character="lala" data-character-state="stamp"/);
  ctx.view.actionIndex = 1;
  assert.doesNotMatch(renderTV(ctx), /data-reveal-phase/);
  assert.doesNotMatch(renderTV(ctx), /data-character-state="stamp"/);
});

test('final ties show both authoritative totals and every score category', () => {
  const ctx = context();
  Object.assign(ctx.view, { phase: 'finished', stage: 'finished', session: 6, term: 3, council: null, result: { winner: 'tie', scores: { jon: 10, lydia: 10 } } });
  const html = renderTV(ctx);
  assert.match(html, /A shared victory/);
  assert.match(html, /Jon: 10 final prestige/);
  assert.match(html, /Lydia: 10 final prestige/);
  for (const category of ['Buildings', 'Streets', 'Festivals', 'Civic laws', 'Treasury']) assert.ok(html.includes(`<th scope="row">${category}</th>`));
  assert.doesNotMatch(html, /treasury potential/);
});
