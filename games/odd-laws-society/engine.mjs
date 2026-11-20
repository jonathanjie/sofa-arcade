/**
 * Odd Laws Society v0.2 authority. Never serve this module or full states to a phone.
 * The caller authenticates the player/viewer and supplies a fresh matchId at creation.
 * All randomness is consumed at setup; every transition is pure and JSON-serializable.
 */
import { BUILDINGS, LAWS } from './catalog.mjs';
import { RuleError, fail } from './errors.mjs';
import { buildQuote, streetOutcome, civicAward, scoreBreakdown, incomeBonus, festivalBonus } from './preview.mjs';
import { project } from './projection.mjs';

export { project, RuleError };
export const GAME_ID = 'odd-laws-society';
export const RULES_VERSION = '0.2';
export const PLAYER_IDS = Object.freeze(['jon', 'lydia']);

const BUILDING_IDS = new Set(BUILDINGS.map(building => building.id));
const LAW_IDS = new Set(LAWS.map(law => law.id));
const MATCH_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PHASE_ID = /^([A-Za-z0-9_-]{1,128}):s([1-6]):(council|action:[0-5]|finished)$/;
const ACTION_FIELDS = Object.freeze({
  commitCouncil: ['type', 'matchId', 'phaseId', 'choiceId', 'bid'],
  build: ['type', 'matchId', 'phaseId', 'designId', 'row', 'col'],
  work: ['type', 'matchId', 'phaseId'],
  lobby: ['type', 'matchId', 'phaseId'],
  festival: ['type', 'matchId', 'phaseId'],
});
const copy = value => JSON.parse(JSON.stringify(value));
const otherPlayer = playerId => playerId === 'jon' ? 'lydia' : 'jon';
const categoryFor = session => session % 2 === 1 ? 'economy' : 'civic';
const councilPhase = state => `${state.matchId}:s${state.session}:council`;
const actionPhase = state => `${state.matchId}:s${state.session}:action:${state.actionIndex}`;

/** Reject hidden/accessor/symbol fields as well as unknown JSON keys. */
function record(value, allowedKeys, requiredKeys, code, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(code, message);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowedKeys.includes(key)
        || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code, message);
  }
  if (requiredKeys.some(key => !Object.hasOwn(value, key))) fail(code, message);
}

function assertPlayer(playerId) {
  if (!PLAYER_IDS.includes(playerId)) fail('INVALID_PLAYER', 'A valid authenticated player is required.');
}

function assertMatchId(matchId, code = 'INVALID_MATCH_ID') {
  if (typeof matchId !== 'string' || !MATCH_ID.test(matchId)) fail(code, 'A valid match ID is required.');
}

function assertPhaseId(phaseId, matchId) {
  const parts = typeof phaseId === 'string' ? PHASE_ID.exec(phaseId) : null;
  if (!parts || parts[1] !== matchId || (parts[3] === 'finished' && parts[2] !== '6')) {
    fail('INVALID_PHASE_ID', 'A valid phase ID is required.');
  }
}

/**
 * Canonical command identity excludes transport revision/actionId and actor identity.
 * Those are authenticated and deduplicated by the room adapter, never by the payload.
 */
export function normalizeAction(rawAction) {
  // Inspect type only after checking that the input has ordinary data properties.
  record(rawAction, ['type', 'matchId', 'phaseId', 'choiceId', 'bid', 'designId', 'row', 'col'],
    ['type', 'matchId', 'phaseId'], 'INVALID_ACTION', 'The action payload is invalid.');
  const fields = typeof rawAction.type === 'string' && Object.hasOwn(ACTION_FIELDS, rawAction.type)
    ? ACTION_FIELDS[rawAction.type] : null;
  if (!fields) fail('INVALID_ACTION', 'The action type is invalid.');
  record(rawAction, fields, fields, 'INVALID_ACTION', 'The action payload is invalid.');
  assertMatchId(rawAction.matchId);
  assertPhaseId(rawAction.phaseId, rawAction.matchId);
  const normalized = { type: rawAction.type, matchId: rawAction.matchId, phaseId: rawAction.phaseId };
  if (rawAction.type === 'commitCouncil') {
    if (typeof rawAction.choiceId !== 'string'
        || !(rawAction.choiceId === 'keep' || LAW_IDS.has(rawAction.choiceId))) {
      fail('INVALID_CHOICE', 'Choose a valid council option.');
    }
    if (!Number.isInteger(rawAction.bid) || rawAction.bid < 0 || rawAction.bid > 3) {
      fail('INVALID_BID', 'A council bid must be an integer from 0 to 3.');
    }
    normalized.choiceId = rawAction.choiceId;
    normalized.bid = rawAction.bid === 0 ? 0 : rawAction.bid;
  } else if (rawAction.type === 'build') {
    if (typeof rawAction.designId !== 'string' || !BUILDING_IDS.has(rawAction.designId)) {
      fail('INVALID_ACTION', 'Choose a valid building design.');
    }
    if (![rawAction.row, rawAction.col].every(value => Number.isInteger(value) && value >= 0 && value <= 2)) {
      fail('INVALID_ACTION', 'Choose a valid city plot.');
    }
    normalized.designId = rawAction.designId;
    normalized.row = rawAction.row === 0 ? 0 : rawAction.row;
    normalized.col = rawAction.col === 0 ? 0 : rawAction.col;
  }
  return normalized;
}

export function actionKey(action) {
  return JSON.stringify(normalizeAction(action));
}

function seededRandom(seed) {
  let word = 2166136261;
  for (let index = 0; index < seed.length; index += 1) word = Math.imul(word ^ seed.charCodeAt(index), 16777619) >>> 0;
  return () => {
    word = (word + 0x6d2b79f5) >>> 0;
    let next = word;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

function makeAgenda(seed) {
  // Independent streams keep the public agenda identical under mirrored Chairs.
  const economy = shuffled(LAWS.filter(law => law.category === 'economy').map(law => law.id), seededRandom(`${seed}:economy`));
  const civic = shuffled(LAWS.filter(law => law.category === 'civic').map(law => law.id), seededRandom(`${seed}:civic`));
  return Array.from({ length: 6 }, (_, index) => {
    const category = categoryFor(index + 1);
    const pairStart = Math.floor(index / 2) * 2;
    return { session: index + 1, category, lawIds: (category === 'economy' ? economy : civic).slice(pairStart, pairStart + 2) };
  });
}

function assertDenseSetupArray(value, length) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== length
      || Reflect.ownKeys(value).some(key => key !== 'length'
        && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) {
    fail('INVALID_SETUP', 'The agenda must use complete ordinary arrays.');
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail('INVALID_SETUP', 'The agenda must use complete ordinary arrays.');
    }
  }
}

function validateAgenda(agenda) {
  assertDenseSetupArray(agenda, 6);
  const seen = new Set();
  return Array.from(agenda, (entry, index) => {
    record(entry, ['session', 'category', 'lawIds'], ['session', 'category', 'lawIds'],
      'INVALID_SETUP', 'The agenda entry is invalid.');
    if (entry.session !== index + 1 || entry.category !== categoryFor(index + 1)) {
      fail('INVALID_SETUP', 'The agenda order or category is invalid.');
    }
    assertDenseSetupArray(entry.lawIds, 2);
    for (const lawId of entry.lawIds) {
      if (typeof lawId !== 'string' || !LAWS.some(law => law.id === lawId && law.category === entry.category) || seen.has(lawId)) {
        fail('INVALID_SETUP', 'Each agenda law must appear once in its correct category.');
      }
      seen.add(lawId);
    }
    return { session: entry.session, category: entry.category, lawIds: [...entry.lawIds] };
  });
}

function stockFor(term) {
  return BUILDINGS.filter(building => building.term === term).map(building => ({ designId: building.id, remaining: 2 }));
}

function startingPlayer() {
  return {
    coins: 4, influence: 2, city: Array(9).fill(null), streetEvaluated: [false, false, false],
    buildsThisSession: 0, festivalUsed: false,
    score: { buildings: 0, streets: 0, festivals: 0, civic: 0, treasury: 1, total: 1 },
  };
}

function refreshScores(state) {
  for (const playerId of PLAYER_IDS) state.players[playerId].score = scoreBreakdown(state, playerId);
}

function openCouncil(state) {
  const proposal = state.agenda[state.session - 1];
  state.stage = 'council';
  state.activePlayer = null;
  state.actionIndex = null;
  state.actionsRemaining = { jon: 3, lydia: 3 };
  state.chair = chairForSession(state);
  state.phaseId = councilPhase(state);
  state.council = {
    category: proposal.category, optionIds: [...proposal.lawIds, 'keep'],
    budgets: { jon: state.players.jon.influence, lydia: state.players.lydia.influence },
    commitments: { jon: null, lydia: null },
  };
}

/** A/B | B/A | A/B. The caller can inspect any valid session of this match. */
export function chairForSession(state, session = state?.session) {
  if (!Number.isInteger(session) || session < 1 || session > 6
      || !Array.isArray(state?.chairSchedule) || state.chairSchedule.length !== 6
      || !PLAYER_IDS.includes(state.chairSchedule[session - 1])) {
    fail('INVALID_STATE', 'The Chair schedule or session is invalid.');
  }
  return state.chairSchedule[session - 1];
}

/** Freshness is the adapter's responsibility: never derive matchId from the seed. */
export function create(input) {
  record(input, ['seed', 'matchId', 'options'], ['seed', 'matchId'], 'INVALID_SETUP', 'The match setup is invalid.');
  assertMatchId(input.matchId, 'INVALID_SETUP');
  if (typeof input.seed !== 'string' || input.seed.length < 1 || input.seed.length > 256) {
    fail('INVALID_SETUP', 'A setup seed of 1 to 256 characters is required.');
  }
  const options = input.options === undefined ? {} : input.options;
  record(options, ['firstChair', 'agenda'], [], 'INVALID_SETUP', 'The setup options are invalid.');
  if (Object.hasOwn(options, 'firstChair') && !PLAYER_IDS.includes(options.firstChair)) {
    fail('INVALID_SETUP', 'The first Chair must be a valid player.');
  }
  const firstChair = options.firstChair ?? (seededRandom(`${input.seed}:chair`)() < 0.5 ? 'jon' : 'lydia');
  const secondChair = otherPlayer(firstChair);
  const state = {
    schemaVersion: 1, gameId: GAME_ID, rulesVersion: RULES_VERSION,
    seed: input.seed, matchId: input.matchId,
    phase: 'playing', stage: 'council', phaseId: '', session: 1, term: 1,
    chair: firstChair,
    chairSchedule: [firstChair, secondChair, secondChair, firstChair, firstChair, secondChair],
    activePlayer: null, actionIndex: null, actionsRemaining: { jon: 3, lydia: 3 },
    activeLaws: { economy: 'economy-neutral', civic: 'civic-neutral' },
    agenda: Object.hasOwn(options, 'agenda') ? validateAgenda(options.agenda) : makeAgenda(input.seed),
    council: null, market: stockFor(1),
    players: { jon: startingPlayer(), lydia: startingPlayer() },
    lastCouncil: null, result: null,
  };
  openCouncil(state);
  refreshScores(state);
  return state;
}

function assertState(state) {
  if (!state || state.gameId !== GAME_ID || state.rulesVersion !== RULES_VERSION || state.schemaVersion !== 1
      || !Number.isInteger(state.session) || state.session < 1 || state.session > 6
      || state.term !== Math.ceil(state.session / 2)
      || !['playing', 'finished'].includes(state.phase) || !['council', 'actions', 'finished'].includes(state.stage)
      || (state.phase === 'finished') !== (state.stage === 'finished')) {
    fail('INVALID_STATE', 'The match state is invalid.');
  }
  assertMatchId(state.matchId, 'INVALID_STATE');
  const expectedPhase = state.stage === 'council' ? councilPhase(state)
    : state.stage === 'actions' ? actionPhase(state) : `${state.matchId}:s6:finished`;
  if (state.phaseId !== expectedPhase || state.chair !== chairForSession(state)
      || (state.stage === 'actions' && (!Number.isInteger(state.actionIndex) || state.actionIndex < 0 || state.actionIndex > 5))
      || (state.stage === 'finished' && state.session !== 6)) {
    fail('INVALID_STATE', 'The match phase is invalid.');
  }
}

function validateCouncilAction(state, playerId, action) {
  if (state.stage !== 'council' || !state.council) fail('WRONG_STAGE', 'Council is not open.');
  if (state.council.commitments[playerId] !== null) {
    fail('COUNCIL_ALREADY_COMMITTED', 'Your council choice is already locked.');
  }
  if (!state.council.optionIds.includes(action.choiceId)) fail('INVALID_CHOICE', 'Choose an offered council option.');
  const budget = state.council.budgets[playerId];
  if (!Number.isInteger(budget) || budget < 0 || budget > 6 || budget !== state.players[playerId].influence) {
    fail('INVALID_STATE', 'The council budget is invalid.');
  }
  if (action.bid > Math.min(3, budget)) fail('INVALID_BID', 'The bid exceeds your council budget.');
}

function validateAction(state, playerId, action) {
  assertPlayer(playerId);
  assertState(state);
  if (action.matchId !== state.matchId) fail('STALE_MATCH', 'This action belongs to another match.');
  if (state.phase === 'finished') fail('GAME_FINISHED', 'This match has finished.');
  if (action.phaseId !== state.phaseId) fail('STALE_PHASE', 'This action belongs to another phase.');
  if (action.type === 'commitCouncil') {
    validateCouncilAction(state, playerId, action);
    return;
  }
  if (state.stage !== 'actions') fail('WRONG_STAGE', 'City actions are not open.');
  if (state.activePlayer !== playerId) fail('NOT_YOUR_TURN', 'Wait for your city turn.');
  if (state.actionsRemaining[playerId] < 1) fail('INVALID_STATE', 'No city actions remain.');
  const player = state.players[playerId];
  if (action.type === 'build') {
    const stack = state.market.find(item => item.designId === action.designId);
    if (!stack || stack.remaining < 1) fail('NOT_AVAILABLE', 'That building is not available in this market.');
    if (!player.city.includes(null)) fail('CITY_FULL', 'Your city is full.');
    if (player.city[action.row * 3 + action.col] !== null) fail('PLOT_OCCUPIED', 'That plot is occupied.');
    if (player.coins < buildQuote(state, playerId, action.designId).cost) fail('INSUFFICIENT_COINS', 'You need more coins to build.');
  } else if (action.type === 'festival') {
    if (player.festivalUsed) fail('FESTIVAL_USED', 'You have already held a Festival this session.');
    if (player.coins < 3) fail('INSUFFICIENT_COINS', 'A Festival costs 3 coins.');
  }
}

/** Only an unsubmitted same-council commitment can survive bounded room CAS re-evaluation. */
export function canRebaseAction(state, authenticatedPlayerId, rawAction) {
  try {
    const action = normalizeAction(rawAction);
    if (action.type !== 'commitCouncil') return false;
    validateAction(state, authenticatedPlayerId, action);
    return true;
  } catch {
    return false;
  }
}

function resolveCouncil(state) {
  const council = state.council;
  const jon = council.commitments.jon;
  const lydia = council.commitments.lydia;
  if (jon === null || lydia === null) return;
  const winner = jon.bid === lydia.bid ? state.chair : jon.bid > lydia.bid ? 'jon' : 'lydia';
  const choiceId = council.commitments[winner].choiceId;
  // Simultaneous all-pay reveal: no balance changes are visible after only one lock.
  for (const playerId of PLAYER_IDS) state.players[playerId].influence -= council.commitments[playerId].bid;
  if (choiceId !== 'keep') state.activeLaws[council.category] = choiceId;
  state.lastCouncil = {
    session: state.session, phaseId: state.phaseId,
    choices: { jon: { ...jon }, lydia: { ...lydia } },
    adoptedLawId: state.activeLaws[council.category], category: council.category,
  };
  state.council = null;
  state.stage = 'actions';
  state.actionIndex = 0;
  state.activePlayer = otherPlayer(state.chair);
  state.phaseId = actionPhase(state);
}

function finishSession(state) {
  // Compute both awards from the same post-action city snapshot before recording either.
  const awards = { jon: civicAward(state, 'jon'), lydia: civicAward(state, 'lydia') };
  for (const playerId of PLAYER_IDS) state.players[playerId].score.civic += awards[playerId];
  refreshScores(state);
  if (state.session === 6) {
    state.phase = 'finished';
    state.stage = 'finished';
    state.phaseId = `${state.matchId}:s6:finished`;
    state.actionIndex = null;
    state.activePlayer = null;
    const scores = { jon: state.players.jon.score.total, lydia: state.players.lydia.score.total };
    state.result = { winner: scores.jon === scores.lydia ? 'tie' : scores.jon > scores.lydia ? 'jon' : 'lydia', scores };
    return;
  }
  state.session += 1;
  state.term = Math.ceil(state.session / 2);
  if (state.session === 3 || state.session === 5) state.market = stockFor(state.term);
  for (const playerId of PLAYER_IDS) {
    const player = state.players[playerId];
    player.coins += 3 + incomeBonus(state, playerId);
    player.influence = Math.min(6, player.influence + 1);
    player.buildsThisSession = 0;
    player.festivalUsed = false;
  }
  openCouncil(state);
  refreshScores(state);
}

function advanceCityTurn(state, playerId) {
  state.actionsRemaining[playerId] -= 1;
  if (state.actionIndex === 5) {
    finishSession(state);
    return;
  }
  state.actionIndex += 1;
  state.activePlayer = otherPlayer(playerId);
  state.phaseId = actionPhase(state);
}

export function apply(fullState, authenticatedPlayerId, rawAction) {
  const action = normalizeAction(rawAction);
  validateAction(fullState, authenticatedPlayerId, action);
  const state = copy(fullState);
  const player = state.players[authenticatedPlayerId];
  if (action.type === 'commitCouncil') {
    state.council.commitments[authenticatedPlayerId] = { choiceId: action.choiceId, bid: action.bid };
    resolveCouncil(state);
  } else {
    if (action.type === 'build') {
      const quote = buildQuote(fullState, authenticatedPlayerId, action.designId);
      const street = streetOutcome(fullState, authenticatedPlayerId, action.row, action.col, action.designId);
      const stack = state.market.find(item => item.designId === action.designId);
      const instanceId = `${state.matchId}:${action.designId}:copy-${3 - stack.remaining}`;
      player.coins -= quote.cost;
      stack.remaining -= 1;
      player.city[action.row * 3 + action.col] = { instanceId, designId: action.designId };
      player.buildsThisSession += 1;
      player.influence += quote.influenceGain;
      if (street.completes) {
        player.streetEvaluated[action.row] = true;
        player.score.streets += street.prestige;
      }
    } else if (action.type === 'work') {
      const law = LAWS.find(entry => entry.id === state.activeLaws.economy);
      player.coins += law?.effect.type === 'workIncome' ? law.effect.coins : 3;
    } else if (action.type === 'lobby') {
      player.influence = Math.min(6, player.influence + 2);
    } else if (action.type === 'festival') {
      player.coins -= 3;
      player.score.festivals += 3 + festivalBonus(fullState, authenticatedPlayerId);
      player.festivalUsed = true;
    }
    advanceCityTurn(state, authenticatedPlayerId);
  }
  refreshScores(state);
  return state;
}

/** All legal normalized actions for an authenticated seat; authority/testing only. */
export function legalActions(state, authenticatedPlayerId) {
  assertPlayer(authenticatedPlayerId);
  assertState(state);
  if (state.phase === 'finished') return [];
  const base = { matchId: state.matchId, phaseId: state.phaseId };
  if (state.stage === 'council') {
    if (state.council.commitments[authenticatedPlayerId] !== null) return [];
    const actions = [];
    for (const choiceId of state.council.optionIds) {
      for (let bid = 0; bid <= Math.min(3, state.council.budgets[authenticatedPlayerId]); bid += 1) {
        const action = normalizeAction({ type: 'commitCouncil', ...base, choiceId, bid });
        if (canRebaseAction(state, authenticatedPlayerId, action)) actions.push(action);
      }
    }
    return actions;
  }
  if (state.activePlayer !== authenticatedPlayerId) return [];
  const actions = ['work', 'lobby'].map(type => normalizeAction({ type, ...base }));
  const player = state.players[authenticatedPlayerId];
  if (player.coins >= 3 && !player.festivalUsed) actions.push(normalizeAction({ type: 'festival', ...base }));
  for (const stack of state.market) {
    if (!buildQuote(state, authenticatedPlayerId, stack.designId).allowed) continue;
    for (let index = 0; index < 9; index += 1) {
      if (player.city[index] === null) actions.push(normalizeAction({
        type: 'build', ...base, designId: stack.designId, row: Math.floor(index / 3), col: index % 3,
      }));
    }
  }
  return actions;
}

export const engine = Object.freeze({
  gameId: GAME_ID, playerIds: PLAYER_IDS,
  create, apply, normalizeAction, actionKey, project, canRebaseAction,
});
