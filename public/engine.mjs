/** Sofa Kingdoms — deterministic, JSON-only rules shared by the server and practice mode. */
export const SIZE = 5;
export const BAG_CAPACITY = 5;
export const ACTIONS_PER_TURN = 2;
export const PLAYER_IDS = ['jon', 'lydia'];
export const INITIAL_LURES = 2;
export const FULL_BAG_BONUS = 2;
export const TOY_RECHARGE_MINIMUM = 3;
export const SECOND_PLAYER_BONUS = 1;
/** Rules v4 is an opt-in prototype until the TV and phone controls support it. */
export const DEFAULT_RULES_VERSION = 3;
export const PROTOTYPE_RULES_VERSION = 4;

const DIRECTIONS = Object.freeze({
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1],
});
const KINDS = ['cushion', 'book', 'rug', 'wood', 'blanket'];
const HOME = Object.freeze({ jon: { row: 4, col: 0 }, lydia: { row: 0, col: 4 } });

const copy = value => JSON.parse(JSON.stringify(value));
const otherPlayer = id => id === 'jon' ? 'lydia' : 'jon';
const inBounds = (row, col) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;
const wrap = value => (value + SIZE) % SIZE;
const atHome = player => player.row === player.home.row && player.col === player.home.col;
const tileAt = (state, row, col) => state.tiles.find(tile => tile.row === row && tile.col === col);
const strategicRules = state => state.version >= 2;
const centreRules = state => state.version >= 4;
const isHome = (row, col) => Object.values(HOME).some(home => home.row === row && home.col === col);

/** Secured crumbs remain a conserved resource; score bonuses are separate. */
export function scoreFor(player) {
  return (Number.isFinite(player?.banked) ? player.banked : 0)
    + (Number.isFinite(player?.bonusPoints) ? player.bonusPoints : 0)
    + (Number.isFinite(player?.openingBonus) ? player.openingBonus : 0);
}

/** Alternate from the drawn starter; matches saved before v3 keep their order. */
export function roundStarter(state, round = state.round) {
  const firstPlayer = state.version >= 3 && PLAYER_IDS.includes(state.firstPlayer) ? state.firstPlayer : 'jon';
  return round % 2 === 1 ? firstPlayer : otherPlayer(firstPlayer);
}

function seededRandom(seed) {
  let word = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    word = Math.imul(word ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    word = (word + 0x6d2b79f5) >>> 0;
    let next = word;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rules v4 pounce beats within each ten-round block: the first pounce is on beat
 * 2 or 3 (round 3 or 4) and the second on beat 8 or 7, so one pounce is in an odd
 * round and one in an even round. Each player then acts last before one pounce.
 */
function pounceBeats(seed, block) {
  const early = seededRandom(`${seed}:pounce-beats:${block}`)() < 0.5;
  return early ? [2, 7] : [3, 8];
}

function forecastFor(seed, round, version = DEFAULT_RULES_VERSION) {
  const random = seededRandom(`${seed}:lala:${round}`);
  const beat = (round - 1) % 10;
  const pounces = version >= 4 ? pounceBeats(seed, Math.floor((round - 1) / 10)) : [2, 8];
  if (pounces.includes(beat)) {
    return { type: 'pounce', row: 1 + Math.floor(random() * 3), col: 1 + Math.floor(random() * 3) };
  }
  if (beat === 5) return { type: 'nap' };
  return {
    type: 'swipe',
    axis: [1, 4, 6, 9].includes(beat) ? 'column' : 'row',
    index: Math.floor(random() * SIZE),
    direction: random() < 0.5 ? -1 : 1,
  };
}

/** Future announced events, after the current round; a lure only edits this round. */
export function upcomingForecasts(state, count = 1) {
  if (!state || state.phase !== 'playing') return [];
  if (!Number.isInteger(count) || count < 0 || count > 2) {
    throw new Error('Preview zero, one, or two future rounds.');
  }
  return Array.from({ length: Math.min(count, state.maxRounds - state.round) }, (_, index) => {
    const round = state.round + index + 1;
    if (index === 0 && centreRules(state) && state.nextForecast) return { round, ...state.nextForecast };
    return { round, ...forecastFor(state.seed, round, state.version) };
  });
}

export function describeForecast(forecast) {
  if (!forecast) return 'The game is finished.';
  if (forecast.type === 'nap') return 'Lala takes a nap. The board stays still.';
  if (forecast.type === 'pounce') {
    return `Lala pounces on ${String.fromCharCode(65 + forecast.col)}${forecast.row + 1} and the four squares above, below, left, and right.`;
  }
  const direction = forecast.axis === 'row'
    ? (forecast.direction === 1 ? 'right' : 'left')
    : (forecast.direction === 1 ? 'down' : 'up');
  const line = forecast.axis === 'row' ? forecast.index + 1 : String.fromCharCode(65 + forecast.index);
  return `Lala slides ${forecast.axis} ${line} one space ${direction}. The edge wraps around.`;
}

function appendLog(state, text, playerId = null, kind = 'action') {
  state.logSequence += 1;
  state.log.push({ id: state.logSequence, round: state.round, playerId, kind, text });
  if (state.log.length > 32) state.log = state.log.slice(-32);
}

/**
 * Starts a game immediately. Room creation and lobby readiness belong to the server.
 * All terrain is walkable. The picture on a tile is flavour; crumbs travel with it.
 */
export function createGame({ seed = 'a-little-living-room', maxRounds = 10, firstPlayer, rulesVersion = DEFAULT_RULES_VERSION } = {}) {
  if (rulesVersion !== DEFAULT_RULES_VERSION && rulesVersion !== PROTOTYPE_RULES_VERSION) {
    throw new Error('Choose rules version 3 or 4.');
  }
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 20) {
    throw new Error('Choose between 1 and 20 rounds.');
  }
  if (typeof seed !== 'string' && typeof seed !== 'number') throw new Error('Use a word or number as the game seed.');
  if (firstPlayer !== undefined && !PLAYER_IDS.includes(firstPlayer)) throw new Error('Choose Jon or Lydia as the first player.');
  const normalizedSeed = String(seed).trim().slice(0, 80) || 'a-little-living-room';
  // A separate random stream keeps opening order independent of the board and
  // cat forecasts. Normal room/practice callers supply a fresh seed per match;
  // an explicit firstPlayer is reserved for tutorials and deterministic fixtures.
  const starter = firstPlayer ?? PLAYER_IDS[Math.floor(seededRandom(`${normalizedSeed}:starter`)() * PLAYER_IDS.length)];
  const random = seededRandom(`${normalizedSeed}:room`);
  const tiles = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      tiles.push({ id: `tile-${row * SIZE + col}`, row, col, kind: KINDS[Math.floor(random() * KINDS.length)], crumbs: 0 });
    }
  }
  const setPair = ([row, col], crumbs) => {
    tiles.find(tile => tile.row === row && tile.col === col).crumbs = crumbs;
    tiles.find(tile => tile.row === SIZE - 1 - row && tile.col === SIZE - 1 - col).crumbs = crumbs;
  };
  const shuffled = list => {
    for (let i = list.length - 1; i > 0; i--) {
      const pick = Math.floor(random() * (i + 1));
      [list[i], list[pick]] = [list[pick], list[i]];
    }
    return list;
  };
  // Every initial crumb has an equally valuable counterpart a half-turn away.
  if (rulesVersion >= 4) {
    // v4 keeps a small home cluster and puts most crumbs in the shared centre,
    // where the pounces land: 2 home pairs, 4 centre neighbours of 3, a centre
    // of 5 and one random outer pair. Total 29 crumbs.
    for (const pair of [[3, 0], [4, 1]]) setPair(pair, 2);
    for (const pair of [[1, 2], [2, 1]]) setPair(pair, 3);
    setPair(shuffled([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [2, 0], [3, 1]])[0], 2);
    tiles.find(tile => tile.row === 2 && tile.col === 2).crumbs = 5;
  } else {
    // The first two pairs put two different opening routes beside each burrow.
    for (const pair of [[3, 0], [4, 1], [2, 0], [3, 1]]) setPair(pair, 2);
    for (const pair of shuffled([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 1]]).slice(0, 2)) setPair(pair, 2);
    tiles.find(tile => tile.row === 2 && tile.col === 2).crumbs = 3;
  }
  const players = Object.fromEntries(PLAYER_IDS.map(id => [id, {
    id, name: id === 'jon' ? 'Jon' : 'Lydia', ...HOME[id], home: { ...HOME[id] },
    carried: 0, banked: 0, bonusPoints: 0,
    openingBonus: id === starter || rulesVersion >= 4 ? 0 : SECOND_PLAYER_BONUS, lures: INITIAL_LURES,
  }]));
  const state = {
    version: rulesVersion, seed: normalizedSeed, size: SIZE, phase: 'playing', round: 1, maxRounds,
    firstPlayer: starter, activePlayer: starter, actionsLeft: ACTIONS_PER_TURN, turnInRound: 0,
    players, tiles, forecast: forecastFor(normalizedSeed, 1, rulesVersion), lastEvent: null,
    // Rules v4 toys change the next round's event, so it is stored, not derived.
    // Sealed toys wait here, hidden from the other player, until the round ends.
    ...(rulesVersion >= 4 ? {
      nextForecast: maxRounds > 1 ? forecastFor(normalizedSeed, 2, rulesVersion) : null,
      sealedToys: { jon: null, lydia: null },
    } : {}),
    winner: null, actionNumber: 0, logSequence: 0, log: [],
  };
  appendLog(state, 'The kingdom is open. Bring crumbs back to your own burrow to score.', null, 'welcome');
  appendLog(state, rulesVersion >= 4
    ? `${players[starter].name} starts.`
    : `${players[starter].name} starts. ${players[otherPlayer(starter)].name} receives +${SECOND_PLAYER_BONUS} opening point for going second.`, null, 'opening');
  return state;
}

/** Returns only commands currently legal for this player; inactive players get []. */
export function legalActions(state, playerId) {
  if (!state || state.phase !== 'playing' || state.activePlayer !== playerId || !PLAYER_IDS.includes(playerId)) return [];
  const player = state.players[playerId];
  const actions = [];
  for (const [direction, [dr, dc]] of Object.entries(DIRECTIONS)) {
    if (inBounds(player.row + dr, player.col + dc)) actions.push({ type: 'move', direction });
  }
  if (player.carried < BAG_CAPACITY && tileAt(state, player.row, player.col).crumbs > 0) actions.push({ type: 'collect' });
  if (player.carried > 0 && atHome(player)) actions.push({ type: 'bank' });
  // Rules v3 toys bend this round's event. Rules v4 toys bend the next round's
  // event, so both players get a full turn to react before it happens.
  const target = centreRules(state) ? state.nextForecast : state.forecast;
  const canUseToy = player.lures > 0 && !(centreRules(state) && state.sealedToys?.[playerId]);
  if (canUseToy && centreRules(state) && target?.type === 'pounce') {
    for (const [dr, dc] of Object.values(DIRECTIONS)) {
      const row = target.row + dr;
      const col = target.col + dc;
      if (inBounds(row, col) && !isHome(row, col)) actions.push({ type: 'lure', row, col });
    }
  }
  if (canUseToy && target?.type === 'swipe') {
    if (strategicRules(state)) {
      for (const axis of ['row', 'column']) {
        for (let index = 0; index < SIZE; index++) {
          for (const direction of [-1, 1]) {
            if (axis !== target.axis || index !== target.index || direction !== target.direction) {
              actions.push({ type: 'lure', axis, index, direction });
            }
          }
        }
      }
    } else {
      for (let index = 0; index < SIZE; index++) {
        if (index !== target.index) actions.push({ type: 'lure', index });
      }
    }
  }
  actions.push({ type: 'end' });
  return actions;
}

function affectedCells(forecast) {
  if (!forecast || forecast.type === 'nap') return [];
  if (forecast.type === 'swipe') {
    return Array.from({ length: SIZE }, (_, index) => ({
      row: forecast.axis === 'row' ? forecast.index : index,
      col: forecast.axis === 'column' ? forecast.index : index,
    }));
  }
  return [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
    .map(([dr, dc]) => ({ row: forecast.row + dr, col: forecast.col + dc }))
    .filter(({ row, col }) => inBounds(row, col));
}

function resolveForecast(state) {
  const forecast = copy(state.forecast);
  const cells = affectedCells(forecast);
  const caught = [];
  const movements = [];
  if (forecast?.type === 'swipe') {
    const field = forecast.axis === 'row' ? 'row' : 'col';
    const movingField = forecast.axis === 'row' ? 'col' : 'row';
    for (const tile of state.tiles) {
      if (tile[field] === forecast.index) tile[movingField] = wrap(tile[movingField] + forecast.direction);
    }
    for (const player of Object.values(state.players)) {
      if (player[field] !== forecast.index) continue;
      const from = { row: player.row, col: player.col };
      player[movingField] = wrap(player[movingField] + forecast.direction);
      movements.push({ playerId: player.id, from, to: { row: player.row, col: player.col }, reason: 'swipe' });
    }
  } else if (forecast?.type === 'pounce') {
    for (const player of Object.values(state.players)) {
      if (!cells.some(cell => cell.row === player.row && cell.col === player.col)) continue;
      caught.push(player.id);
      const from = { row: player.row, col: player.col };
      tileAt(state, player.row, player.col).crumbs += player.carried;
      player.carried = 0;
      player.row = player.home.row;
      player.col = player.home.col;
      movements.push({ playerId: player.id, from, to: { row: player.row, col: player.col }, reason: 'pounce' });
    }
  }
  const description = describeForecast(forecast);
  return { ...forecast, round: state.round, description, affectedCells: cells, caught, movements };
}

/** Pure preview of this round's announced cat event, without advancing the game. */
export function previewForecast(state) {
  if (!state) throw new Error('Start a game to preview Lala.');
  const preview = copy(state);
  const event = resolveForecast(preview);
  return {
    forecast: copy(state.forecast), description: event.description, affectedCells: event.affectedCells,
    players: Object.fromEntries(PLAYER_IDS.map(id => [id, { row: preview.players[id].row, col: preview.players[id].col }])),
    tiles: preview.tiles, caught: event.caught, movements: event.movements,
  };
}

/**
 * Rules v4: both players' sealed toys are revealed together at the end of the
 * round. One toy changes the next round's event. Two toys cancel each other:
 * Lala ignores both, and both are used up.
 */
function revealSealedToys(state) {
  const played = PLAYER_IDS.filter(id => state.sealedToys[id]);
  if (played.length === 2) {
    appendLog(state, 'Both toys landed at once. Lala ignores them both.', null, 'toy-collision');
  } else if (played.length === 1) {
    const [playerId] = played;
    const toy = state.sealedToys[playerId];
    const target = state.nextForecast;
    if (target.type === 'pounce') {
      target.row = toy.row;
      target.col = toy.col;
    } else {
      target.axis = toy.axis;
      target.index = toy.index;
      target.direction = toy.direction;
    }
    target.luredBy = playerId;
    appendLog(state, `${state.players[playerId].name}'s toy is revealed. Next round: ${describeForecast(target)}`, playerId, 'toy');
  }
  state.sealedToys = { jon: null, lydia: null };
}

function finishTurn(state) {
  if (state.turnInRound === 0) {
    state.turnInRound = 1;
    state.activePlayer = otherPlayer(state.activePlayer);
    state.actionsLeft = ACTIONS_PER_TURN;
    return;
  }
  if (centreRules(state)) revealSealedToys(state);
  state.lastEvent = resolveForecast(state);
  let catText = state.lastEvent.description;
  if (state.lastEvent.caught.length) {
    catText += ` ${state.lastEvent.caught.map(id => state.players[id].name).join(' and ')} returned home and dropped their carried crumbs.`;
  }
  appendLog(state, catText, null, 'cat');
  if (state.round >= state.maxRounds) {
    state.phase = 'finished';
    state.activePlayer = null;
    state.actionsLeft = 0;
    state.forecast = null;
    if (centreRules(state)) state.nextForecast = null;
    const jonScore = strategicRules(state) ? scoreFor(state.players.jon) : state.players.jon.banked;
    const lydiaScore = strategicRules(state) ? scoreFor(state.players.lydia) : state.players.lydia.banked;
    state.winner = jonScore === lydiaScore ? 'tie' : (jonScore > lydiaScore ? 'jon' : 'lydia');
    appendLog(state, state.winner === 'tie'
      ? 'A shared crown! Both kingdoms finished with the same score.'
      : `${state.players[state.winner].name} wins the crumb crown!`, null, 'finish');
    return;
  }
  state.round += 1;
  state.turnInRound = 0;
  state.activePlayer = roundStarter(state);
  state.actionsLeft = ACTIONS_PER_TURN;
  if (centreRules(state)) {
    state.forecast = state.nextForecast;
    state.nextForecast = state.round < state.maxRounds ? forecastFor(state.seed, state.round + 1, state.version) : null;
  } else {
    state.forecast = forecastFor(state.seed, state.round, state.version);
  }
}

/**
 * Returns what one viewer may see. Rules v4 hides the other player's sealed toy
 * and shows their toy count as it was before they slipped it. A viewer that is
 * not a player (the TV) sees no sealed toys. Earlier versions have no secrets.
 */
export function projectState(state, viewerId = null) {
  const view = copy(state);
  if (!centreRules(view) || !view.sealedToys) return view;
  for (const id of PLAYER_IDS) {
    if (id === viewerId || !view.sealedToys[id]) continue;
    view.players[id].lures += 1;
    view.actionNumber -= 1;
    view.sealedToys[id] = null;
  }
  return view;
}

/** Apply one legal command. The input remains unchanged even if validation fails. */
export function applyAction(state, playerId, action) {
  if (!state || state.phase !== 'playing') throw new Error('This game has finished. Start a rematch to play again.');
  if (!PLAYER_IDS.includes(playerId)) throw new Error('Choose Jon or Lydia to play.');
  if (state.activePlayer !== playerId) throw new Error(`It is ${state.players[state.activePlayer].name}’s turn.`);
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('Choose an action.');
  const currentPlayer = state.players[playerId];
  if (action.type === 'move') {
    if (typeof action.direction !== 'string' || !Object.hasOwn(DIRECTIONS, action.direction)) throw new Error('Choose up, down, left, or right.');
    const [dr, dc] = DIRECTIONS[action.direction];
    if (!inBounds(currentPlayer.row + dr, currentPlayer.col + dc)) throw new Error('That is the edge of the room. Try another direction.');
  } else if (action.type === 'collect') {
    if (currentPlayer.carried >= BAG_CAPACITY) throw new Error('Your bag is full. Bank your crumbs at your burrow.');
    if (tileAt(state, currentPlayer.row, currentPlayer.col).crumbs <= 0) throw new Error('There are no crumbs on this square.');
  } else if (action.type === 'bank') {
    if (!atHome(currentPlayer)) throw new Error('Return to your own burrow to bank crumbs.');
    if (currentPlayer.carried <= 0) throw new Error('Collect some crumbs before banking.');
  } else if (action.type === 'lure' && centreRules(state) && !state.nextForecast) {
    throw new Error('Toys change the next round, and this is the last round.');
  } else if (action.type === 'lure' && centreRules(state) && state.sealedToys[playerId]) {
    throw new Error('You have already slipped a toy this round.');
  } else if (action.type === 'lure' && centreRules(state) && state.nextForecast.type === 'pounce') {
    if (currentPlayer.lures <= 0) throw new Error('You have used both of your toys.');
    if (!Number.isInteger(action.row) || !Number.isInteger(action.col)) throw new Error('Choose a square for the pounce.');
    const distance = Math.abs(action.row - state.nextForecast.row) + Math.abs(action.col - state.nextForecast.col);
    if (distance !== 1 || !inBounds(action.row, action.col)) throw new Error('A toy moves the pounce one square up, down, left, or right.');
    if (isHome(action.row, action.col)) throw new Error('Lala will not pounce on a burrow.');
  } else if (action.type === 'lure') {
    if (currentPlayer.lures <= 0) throw new Error('You have used both of your toys.');
    const target = centreRules(state) ? state.nextForecast : state.forecast;
    if (target.type !== 'swipe') {
      throw new Error(centreRules(state) ? 'Toys can redirect a swipe or a pounce, but not a nap.' : 'Toys can redirect a swipe, but not a pounce or a nap.');
    }
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= SIZE) throw new Error('Choose a row or column from 1 to 5.');
    const axis = Object.hasOwn(action, 'axis') ? action.axis : target.axis;
    const direction = Object.hasOwn(action, 'direction') ? action.direction : target.direction;
    if (axis !== 'row' && axis !== 'column') throw new Error('Choose a row or a column.');
    if (direction !== -1 && direction !== 1) throw new Error('Choose one of the two swipe directions.');
    if (!strategicRules(state) && (axis !== target.axis || direction !== target.direction)) {
      throw new Error('This classic match keeps the announced swipe axis and direction. Choose another line.');
    }
    if (axis === target.axis && action.index === target.index && direction === target.direction) {
      throw new Error('Lala is already aiming there in that direction. Choose a different swipe.');
    }
  } else if (action.type !== 'end') {
    throw new Error('That action is not part of this game.');
  }
  const next = copy(state);
  const player = next.players[playerId];
  next.actionNumber += 1;
  if (action.type === 'end') {
    appendLog(next, `${player.name} ends the turn with ${next.actionsLeft} ${next.actionsLeft === 1 ? 'action' : 'actions'} left.`, playerId);
    finishTurn(next);
    return next;
  }
  if (action.type === 'move') {
    const [dr, dc] = DIRECTIONS[action.direction];
    player.row += dr;
    player.col += dc;
    appendLog(next, `${player.name} moves ${action.direction}.`, playerId);
  } else if (action.type === 'collect') {
    const tile = tileAt(next, player.row, player.col);
    const collected = Math.min(tile.crumbs, BAG_CAPACITY - player.carried);
    player.carried += collected;
    tile.crumbs -= collected;
    appendLog(next, `${player.name} collects ${collected} ${collected === 1 ? 'crumb' : 'crumbs'}.`, playerId);
  } else if (action.type === 'bank') {
    const banked = player.carried;
    player.banked += banked;
    player.carried = 0;
    const bonus = strategicRules(next) && banked === BAG_CAPACITY ? FULL_BAG_BONUS : 0;
    const recharged = strategicRules(next) && banked >= TOY_RECHARGE_MINIMUM && player.lures < INITIAL_LURES;
    if (bonus) player.bonusPoints = (player.bonusPoints || 0) + bonus;
    if (recharged) player.lures += 1;
    appendLog(next, `${player.name} banks ${banked} ${banked === 1 ? 'crumb' : 'crumbs'}.${bonus ? ` +${bonus} full-bag bonus points.` : ''}${recharged ? ' One toy restored.' : ''} Safe from Lala!`, playerId);
  } else if (action.type === 'lure' && centreRules(next)) {
    // A sealed toy costs no action, so spending one reveals nothing.
    player.lures -= 1;
    next.sealedToys[playerId] = next.nextForecast.type === 'pounce'
      ? { row: action.row, col: action.col }
      : {
        axis: Object.hasOwn(action, 'axis') ? action.axis : next.nextForecast.axis,
        index: action.index,
        direction: Object.hasOwn(action, 'direction') ? action.direction : next.nextForecast.direction,
      };
    return next;
  } else if (action.type === 'lure') {
    player.lures -= 1;
    const target = next.forecast;
    if (target.type === 'pounce') {
      target.row = action.row;
      target.col = action.col;
    } else {
      target.axis = Object.hasOwn(action, 'axis') ? action.axis : target.axis;
      target.index = action.index;
      target.direction = Object.hasOwn(action, 'direction') ? action.direction : target.direction;
    }
    target.luredBy = playerId;
    appendLog(next, `${player.name} uses a toy. ${describeForecast(target)}`, playerId);
  }
  next.actionsLeft -= 1;
  if (next.actionsLeft === 0) finishTurn(next);
  return next;
}

export const GAME_RULES = Object.freeze({
  title: 'Sofa Kingdoms', rounds: 10, actionsPerTurn: ACTIONS_PER_TURN,
  bagCapacity: BAG_CAPACITY, toysPerPlayer: INITIAL_LURES, secondPlayerBonus: SECOND_PLAYER_BONUS,
  summary: [
    'The first player is drawn for each match. The second player starts with one secured opening point.',
    'Take two actions: move one square, collect crumbs, bank at your burrow, or use a toy.',
    'Your bag holds five crumbs. Banked crumbs score one point each; a full bag adds two bonus points.',
    'Bank at least three crumbs together to restore one toy, up to a maximum of two.',
    'After both turns, Lala performs the shown event. Tiles, crumbs, and players move together during a swipe.',
    'Swipes wrap around the room. Your home burrow stays in its corner.',
    'A pounce catches its marked square and the four squares above, below, left, and right. Drop your bag there and return home; banked points stay safe.',
    'Each player starts with two toys. A toy costs an action and chooses any swipe row or column and either direction.',
    'The first player alternates each round. Most points after the last round wins; equal scores share the crown.',
  ],
});
