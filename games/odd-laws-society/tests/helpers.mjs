import assert from 'node:assert/strict';
import { engine } from '../engine.mjs';

export const SEATS = ['jon', 'lydia'];
export const other = id => id === 'jon' ? 'lydia' : 'jon';
export const clone = value => JSON.parse(JSON.stringify(value));
export const OPENING_AGENDA = [
  { session: 1, category: 'economy', lawIds: ['small-shop-supremacy', 'honest-wages'] },
  { session: 2, category: 'civic', lawIds: ['shop-local', 'industrial-pride'] },
  { session: 3, category: 'economy', lawIds: ['workshop-week', 'public-grants'] },
  { session: 4, category: 'civic', lawIds: ['public-service-day', 'mandatory-applause'] },
  { session: 5, category: 'economy', lawIds: ['everything-is-art', 'open-tender'] },
  { session: 6, category: 'civic', lawIds: ['fashionable-streets', 'diversity-parade'] },
];

export function fresh(overrides = {}) {
  return engine.create({ seed: 'accounting-seed', matchId: 'test-match', options: { firstChair: 'jon', agenda: clone(OPENING_AGENDA) }, ...overrides });
}
export function action(state, type, fields = {}) {
  return { type, matchId: state.matchId, phaseId: state.phaseId, ...fields };
}
export function take(state, type, fields = {}, seat = state.activePlayer) {
  return engine.apply(state, seat, action(state, type, fields));
}
export function council(state, jon = { choiceId: 'keep', bid: 0 }, lydia = { choiceId: 'keep', bid: 0 }, order = SEATS) {
  const commitments = { jon, lydia };
  const phaseId = state.phaseId;
  for (const seat of order) state = engine.apply(state, seat, { type: 'commitCouncil', matchId: state.matchId, phaseId, ...commitments[seat] });
  return state;
}
export function emptyTurns(state, count = 6, type = 'work') {
  for (let i = 0; i < count; i += 1) state = take(state, type);
  return state;
}
export function toSession(session, initial = fresh()) {
  let state = initial;
  while (state.session < session) {
    state = council(state);
    state = emptyTurns(state);
  }
  return state;
}
export function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) frozen(entry);
    Object.freeze(value);
  }
  return value;
}

/** Deliberately artificial authority fixtures isolate rule boundaries; never browser-served. */
export function cityOf(ids) {
  return Array.from({ length: 9 }, (_, index) => ids[index] ? { instanceId: `synthetic-${index}`, designId: ids[index] } : null);
}
export function scenario({ session = 1, seat = 'lydia', coins = 30, influence = 2, city = [], economy = 'economy-neutral', civic = 'civic-neutral', builds = 0 } = {}) {
  let state = council(toSession(session));
  if (state.activePlayer !== seat) state = take(state, 'work');
  state.players[seat].coins = coins;
  state.players[seat].influence = influence;
  state.players[seat].city = cityOf(city);
  state.players[seat].buildsThisSession = builds;
  state.players[seat].streetEvaluated = [0, 1, 2].map(row => state.players[seat].city.slice(row * 3, row * 3 + 3).every(Boolean));
  state.activeLaws = { economy, civic };
  return state;
}
export function assertRuleError(callback) {
  assert.throws(callback, error => {
    assert.equal(typeof error.code, 'string');
    assert.ok(error.code.length > 0);
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0 && error.message.length < 240);
    return true;
  });
}
export function jsonError(callback) {
  try { callback(); } catch (error) { return JSON.stringify({ code: error.code, message: error.message, ...error }); }
  assert.fail('Expected a safe rule rejection');
}
