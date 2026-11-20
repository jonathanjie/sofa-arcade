/** Test-only secret-bearing engine. Never register or serve this module. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRoomApi } from './rooms.mjs';

export const FIXTURE_GAME_ID = 'private-fixture';
export const PRIVATE_SENTINEL = 'UNREVEALED_ENGINE_SENTINEL_7b69';
export const PLAYERS = Object.freeze(['jon', 'lydia']);
export const TEST_ORIGIN = 'https://sofa.example';
const CHAIR_SCHEDULE = ['jon', 'lydia', 'lydia', 'jon', 'jon', 'lydia'];
const other = player => player === 'jon' ? 'lydia' : 'jon';

function rule(code, message = 'That action is not available.') {
  return Object.assign(new Error(message), { name: 'FixtureRuleError', code });
}

function phaseId(state, suffix) { return `${state.matchId}:session-${state.session}:${suffix}`; }
function treasury(player) { return Math.min(4, Math.floor(player.coins / 3)); }
function updateScores(state) {
  for (const player of Object.values(state.players)) {
    player.score.treasury = treasury(player);
    player.score.total = Object.entries(player.score).reduce((sum, [key, value]) => sum + (key === 'total' ? 0 : value), 0);
  }
}
function prepareCouncil(state) {
  state.stage = 'council';
  state.phaseId = phaseId(state, 'council');
  state.activePlayer = null;
  state.actionIndex = null;
  state.actionsRemaining = { jon: 3, lydia: 3 };
  state.chair = CHAIR_SCHEDULE[state.session - 1];
  state.term = Math.ceil(state.session / 2);
  const agenda = state.agenda[state.session - 1];
  state.council = { category: agenda.category, optionIds: [...agenda.lawIds, 'keep'], ready: { jon: false, lydia: false }, ownCommitment: null };
  state.privateState.pendingCommitments = { jon: null, lydia: null };
  state.privateState.phaseBudgets = Object.fromEntries(PLAYERS.map(id => [id, state.players[id].influence]));
}

/** Six city turns and up to six councils; deliberately not the production game. */
export function createPrivateEngine({ sessions = 2 } = {}) {
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 6) throw new Error('Fixture sessions must be 1..6.');
  const stats = { applies: 0, rebases: 0, projections: [] };
  const engine = {
    gameId: FIXTURE_GAME_ID,
    playerIds: PLAYERS,
    create({ matchId }) {
      if (typeof matchId !== 'string' || !matchId) throw new Error('The platform must supply a fresh matchId.');
      const state = {
        schemaVersion: 1, gameId: FIXTURE_GAME_ID, rulesVersion: '0.2', matchId,
        phase: 'playing', stage: 'council', phaseId: '', session: 1, term: 1,
        chair: 'jon', chairSchedule: [...CHAIR_SCHEDULE], activePlayer: null,
        actionIndex: null, actionsRemaining: { jon: 3, lydia: 3 },
        activeLaws: { economy: 'economy-neutral', civic: 'civic-neutral' },
        agenda: Array.from({ length: 6 }, (_, index) => ({ session: index + 1, category: index % 2 ? 'civic' : 'economy', lawIds: [`bill-${index + 1}-a`, `bill-${index + 1}-b`] })),
        council: null,
        market: [{ designId: 'fixture-house', remaining: 2 }],
        players: Object.fromEntries(PLAYERS.map(id => [id, {
          coins: 4, influence: 2, city: Array(9).fill(null), streetEvaluated: [false, false, false],
          buildsThisSession: 0, festivalUsed: false,
          score: { buildings: 0, streets: 0, festivals: 0, civic: 0, treasury: 1, total: 1 },
        }])),
        lastCouncil: null, result: null,
        privateState: { sentinel: PRIVATE_SENTINEL, pendingCommitments: {}, phaseBudgets: {}, privateHistory: [] },
      };
      prepareCouncil(state);
      return state;
    },
    normalizeAction(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw rule('invalid_action');
      const extras = { commitCouncil: ['choiceId', 'bid'], build: ['designId', 'row', 'col'], work: [], lobby: [], festival: [] };
      if (!Object.hasOwn(extras, raw.type)) throw rule('invalid_action');
      const fields = ['type', 'matchId', 'phaseId', ...extras[raw.type]];
      if (Object.keys(raw).length !== fields.length || Object.keys(raw).some(key => !fields.includes(key))) throw rule('invalid_action');
      if (typeof raw.matchId !== 'string' || !raw.matchId || typeof raw.phaseId !== 'string' || !raw.phaseId) throw rule('invalid_action');
      if (raw.type === 'commitCouncil' && (typeof raw.choiceId !== 'string' || !Number.isInteger(raw.bid) || raw.bid < 0 || raw.bid > 3)) throw rule('invalid_bid');
      if (raw.type === 'build' && (raw.designId !== 'fixture-house' || ![raw.row, raw.col].every(n => Number.isInteger(n) && n >= 0 && n <= 2))) throw rule('invalid_action');
      return Object.fromEntries(fields.map(key => [key, raw[key]]));
    },
    actionKey(action) { return JSON.stringify(action); },
    canRebaseAction(state, actor, action) {
      stats.rebases++;
      return action.type === 'commitCouncil' && PLAYERS.includes(actor)
        && state.phase === 'playing' && state.stage === 'council'
        && action.matchId === state.matchId && action.phaseId === state.phaseId
        && state.privateState.pendingCommitments[actor] === null
        && state.council.optionIds.includes(action.choiceId)
        && action.bid <= state.privateState.phaseBudgets[actor];
    },
    apply(previous, actor, action) {
      stats.applies++;
      if (!PLAYERS.includes(actor)) throw rule('invalid_action');
      if (previous.matchId !== action.matchId) throw rule('stale_match');
      if (previous.phaseId !== action.phaseId) throw rule('stale_phase');
      if (previous.phase !== 'playing') throw rule('game_finished');
      const state = structuredClone(previous);
      if (action.type === 'commitCouncil') {
        if (state.stage !== 'council') throw rule('stale_phase');
        if (state.privateState.pendingCommitments[actor]) throw rule('vote_locked');
        if (!state.council.optionIds.includes(action.choiceId)) throw rule('invalid_choice');
        if (action.bid > state.privateState.phaseBudgets[actor]) throw rule('insufficient_influence');
        const commitment = { choiceId: action.choiceId, bid: action.bid };
        state.privateState.pendingCommitments[actor] = commitment;
        state.privateState.privateHistory.push({ actor, commitment, sentinel: PRIVATE_SENTINEL });
        state.council.ready[actor] = true;
        if (PLAYERS.every(id => state.privateState.pendingCommitments[id])) {
          const choices = structuredClone(state.privateState.pendingCommitments);
          const winner = choices.jon.bid === choices.lydia.bid ? state.chair : choices.jon.bid > choices.lydia.bid ? 'jon' : 'lydia';
          const category = state.council.category;
          if (choices[winner].choiceId !== 'keep') state.activeLaws[category] = choices[winner].choiceId;
          for (const id of PLAYERS) state.players[id].influence -= choices[id].bid;
          state.lastCouncil = { session: state.session, phaseId: state.phaseId, choices, adoptedLawId: state.activeLaws[category], category };
          state.council = null;
          state.stage = 'actions';
          state.actionIndex = 0;
          state.phaseId = phaseId(state, 'action-0');
          state.activePlayer = other(state.chair);
        }
        return state;
      }
      if (state.stage !== 'actions' || state.activePlayer !== actor) throw rule('not_your_turn');
      const player = state.players[actor];
      if (action.type === 'work') player.coins += 3;
      if (action.type === 'lobby') player.influence = Math.min(6, player.influence + 2);
      if (action.type === 'festival') {
        if (player.coins < 3) throw rule('insufficient_coins');
        if (player.festivalUsed) throw rule('festival_used');
        player.coins -= 3; player.festivalUsed = true; player.score.festivals += 3;
      }
      if (action.type === 'build') {
        const index = action.row * 3 + action.col;
        if (player.city[index]) throw rule('plot_occupied');
        if (!state.market[0].remaining) throw rule('no_stock');
        if (player.coins < 2) throw rule('insufficient_coins');
        player.coins -= 2; state.market[0].remaining--;
        player.city[index] = { instanceId: `${state.phaseId}:house`, designId: action.designId };
        player.buildsThisSession++; player.score.buildings += 2;
      }
      state.actionsRemaining[actor]--;
      if (state.actionIndex < 5) {
        state.actionIndex++;
        state.phaseId = phaseId(state, `action-${state.actionIndex}`);
        state.activePlayer = other(actor);
      } else if (state.session < sessions) {
        state.session++;
        for (const value of Object.values(state.players)) {
          value.coins += 3; value.influence = Math.min(6, value.influence + 1);
          value.buildsThisSession = 0; value.festivalUsed = false;
        }
        prepareCouncil(state);
      } else {
        state.phase = 'finished'; state.stage = 'finished'; state.activePlayer = null; state.actionIndex = null;
        state.phaseId = phaseId(state, 'finished');
      }
      updateScores(state);
      if (state.phase === 'finished') {
        const scores = Object.fromEntries(PLAYERS.map(id => [id, state.players[id].score.total]));
        state.result = { winner: scores.jon === scores.lydia ? 'tie' : scores.jon > scores.lydia ? 'jon' : 'lydia', scores };
      }
      return state;
    },
    project(fullState, viewer) {
      stats.projections.push(structuredClone(viewer));
      const { privateState, ...publicState } = fullState;
      const view = structuredClone(publicState);
      if (view.council) view.council.ownCommitment = viewer.role === 'player'
        ? structuredClone(privateState.pendingCommitments[viewer.playerId]) : null;
      return view;
    },
  };
  return Object.assign(engine, { stats });
}

export function createPrivateApi(engine = createPrivateEngine()) {
  return createRoomApi({
    resolveGame: id => id === FIXTURE_GAME_ID ? { id, status: 'playable', name: 'Private platform test fixture' } : null,
    resolveEngine: id => id === FIXTURE_GAME_ID ? engine : null,
  });
}

export function memoryFixture(engine = createPrivateEngine()) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE sofa_rooms (
    code TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    jon_seen INTEGER NOT NULL DEFAULT 0, lydia_seen INTEGER NOT NULL DEFAULT 0
  )`);
  const stats = { writes: 0, casAttempts: 0, casFailures: 0 };
  let barrier = null;
  let pausedCas = null;
  let failCas = false;
  const DB = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    const isCas = /^UPDATE sofa_rooms SET revision =/.test(sql);
    const bound = args => ({
      bind(...values) { return bound(values); },
      async first() { return statement.get(...args) || null; },
      async run() {
        stats.writes++;
        if (isCas) {
          stats.casAttempts++;
          if (pausedCas) {
            const current = pausedCas;
            pausedCas = null;
            current.entered();
            await current.promise;
          }
          if (barrier) {
            const current = barrier;
            if (--current.remaining === 0) { barrier = null; current.release(); }
            await current.promise;
          }
          if (failCas) { stats.casFailures++; return { success: true, meta: { changes: 0 } }; }
        }
        const changes = Number(statement.run(...args).changes);
        if (isCas && !changes) stats.casFailures++;
        return { success: true, meta: { changes } };
      },
    });
    return bound([]);
  } };
  return {
    env: { DB }, sqlite, stats, engine, handle: createPrivateApi(engine),
    armCasBarrier(count = 2) {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      barrier = { remaining: count, promise, release };
    },
    holdNextCas() {
      let release;
      let entered;
      const promise = new Promise(resolve => { release = resolve; });
      const waiting = new Promise(resolve => { entered = resolve; });
      pausedCas = { promise, release, entered };
      return { entered: waiting, release };
    },
    failCas(value = true) { failCas = value; },
    close() { barrier?.release(); pausedCas?.release(); sqlite.close(); },
  };
}

export async function callApi(fixture, route, {
  body, token, method = body === undefined ? 'GET' : 'POST', headers = {}, rawBody,
} = {}) {
  const request = new Request(TEST_ORIGIN + route, {
    method,
    headers: { ...(method === 'POST' ? { Origin: TEST_ORIGIN, 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const response = await fixture.handle(request, fixture.env);
  const text = await response.text();
  assert.match(response.headers.get('cache-control'), /no-store/);
  return { status: response.status, body: JSON.parse(text), text, response };
}

export async function openRoom(request, { start = true } = {}) {
  const created = await request('/api/rooms', { body: { gameId: FIXTURE_GAME_ID } });
  assert.equal(created.status, 201, created.text);
  const { code, hostToken } = created.body;
  const tokens = {};
  const clients = {};
  for (const playerId of PLAYERS) {
    clients[playerId] = crypto.randomUUID();
    const joined = await request(`/api/rooms/${code}/join`, { body: { playerId, clientId: clients[playerId] } });
    assert.equal(joined.status, 200, joined.text);
    tokens[playerId] = joined.body.playerToken;
  }
  const current = start ? await request(`/api/rooms/${code}/start`, { body: {}, token: hostToken }) : await request(`/api/rooms/${code}`);
  assert.equal(current.status, 200, current.text);
  return { code, hostToken, tokens, clients, game: current.body };
}

export function command(room, type, fields = {}, actionId = crypto.randomUUID()) {
  return { revision: room.revision, actionId, action: { type, matchId: room.state.matchId, phaseId: room.state.phaseId, ...fields } };
}

export function rawRoom(fixture, code) {
  return fixture.sqlite.prepare('SELECT * FROM sofa_rooms WHERE code = ?').get(code);
}

export function assertNoAuthoritySecrets(text, credentials = []) {
  for (const value of [PRIVATE_SENTINEL, 'privateState', 'pendingCommitments', 'phaseBudgets', 'privateHistory', 'recentActions', 'hostHash', 'tokenHash', 'clientHash', ...credentials]) {
    assert.ok(!text.includes(value), `Serialized payload disclosed ${credentials.includes(value) ? 'a credential' : value}`);
  }
}

export function assertPendingView(room, ownCommitment, ready = { jon: true, lydia: false }) {
  assert.equal(room.state.stage, 'council');
  assert.deepEqual(room.state.council.ready, ready);
  assert.deepEqual(room.state.council.ownCommitment, ownCommitment);
  assert.equal(room.state.players.jon.influence, 2);
  assert.equal(room.state.players.lydia.influence, 2);
  assert.equal(room.state.lastCouncil, null);
}
