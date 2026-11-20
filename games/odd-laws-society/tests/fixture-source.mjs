/**
 * Authority-side fixture recipes. Do not include this file in any browser allowlist.
 * Every scenario below is reached by legal actions from a normal v0.2 setup.
 */
import { engine } from '../engine.mjs';

const AGENDA = [
  { session: 1, category: 'economy', lawIds: ['small-shop-supremacy', 'honest-wages'] },
  { session: 2, category: 'civic', lawIds: ['diversity-parade', 'fashionable-streets'] },
  { session: 3, category: 'economy', lawIds: ['public-grants', 'workshop-week'] },
  { session: 4, category: 'civic', lawIds: ['shop-local', 'industrial-pride'] },
  { session: 5, category: 'economy', lawIds: ['everything-is-art', 'open-tender'] },
  { session: 6, category: 'civic', lawIds: ['public-service-day', 'mandatory-applause'] },
];

function start(matchId) {
  return engine.create({ seed: 'canonical-odd-laws-v02', matchId, options: { firstChair: 'jon', agenda: AGENDA } });
}

function action(state, playerId, type, fields = {}) {
  return engine.apply(state, playerId, { type, matchId: state.matchId, phaseId: state.phaseId, ...fields });
}

function council(state, choiceId = 'keep') {
  let next = action(state, 'jon', 'commitCouncil', { choiceId, bid: 0 });
  next = action(next, 'lydia', 'commitCouncil', { choiceId, bid: 0 });
  return next;
}

function mirroredSession(state, choiceId, actions) {
  let next = council(state, choiceId);
  // Each pair gives both seats the same public action, in the real initiative order.
  for (const item of actions) {
    for (let seat = 0; seat < 2; seat++) {
      const playerId = next.activePlayer;
      if (item === 'work' || item === 'festival') next = action(next, playerId, item);
      else {
        const plot = next.players[playerId].city.indexOf(null);
        next = action(next, playerId, 'build', { designId: item, row: Math.floor(plot / 3), col: plot % 3 });
      }
    }
  }
  return next;
}

/** Full states for test/regeneration only. Never return these through a room API. */
export function fixtureStates() {
  const opening = start('fixture-opening');
  const jonLocked = action(opening, 'jon', 'commitCouncil', { choiceId: 'small-shop-supremacy', bid: 1 });
  const lydiaLocked = action(opening, 'lydia', 'commitCouncil', { choiceId: 'honest-wages', bid: 0 });
  const revealed = action(jonLocked, 'lydia', 'commitCouncil', { choiceId: 'honest-wages', bid: 0 });
  const ordinary = action(revealed, 'lydia', 'build', { designId: 'corner-shop', row: 0, col: 0 });

  let full = start('fixture-full-city');
  full = mirroredSession(full, 'small-shop-supremacy', ['corner-shop', 'button-workshop', 'work']);
  full = mirroredSession(full, 'diversity-parade', ['work', 'pocket-theatre', 'tea-stall']);
  full = mirroredSession(full, 'public-grants', ['public-library', 'clockwork-studio', 'debate-hall']);
  full = mirroredSession(full, 'keep', ['night-market', 'quilt-bridge', 'work']);
  const late = council(full, 'keep');
  // Identical legal development, celebrations and savings retain an exact shared victory.
  let tied = mirroredSession(full, 'keep', ['festival', 'work', 'work']);
  tied = mirroredSession(tied, 'keep', ['festival', 'work', 'work']);

  return {
    'council-unsubmitted': opening,
    'council-jon-locked': jonLocked,
    'council-lydia-locked': lydiaLocked,
    'council-revealed': revealed,
    'ordinary-turn': ordinary,
    'late-full-city': late,
    'finished-tie': tied,
  };
}

/** Only these role projections are serialized into the public fixture subtree. */
export function projectedFixtures() {
  return Object.fromEntries(Object.entries(fixtureStates()).map(([name, state]) => [name, {
    tv: engine.project(state, { role: 'host' }),
    jon: engine.project(state, { role: 'player', playerId: 'jon' }),
    lydia: engine.project(state, { role: 'player', playerId: 'lydia' }),
  }]));
}
