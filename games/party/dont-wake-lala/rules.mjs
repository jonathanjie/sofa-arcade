const TICK_MS = 50;
const ROUND_MS = 60_000;
const GRACE_MS = 150;
const HOLD_LEASE_MS = 350;
const TICKS_PER_POINT = 4;
const TARGET = 150;
const TARGET_TICKS = TARGET * TICKS_PER_POINT;

function seedNumber(seed) {
  let hash = 2166136261;
  for (const letter of String(seed)) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619);
  return hash >>> 0 || 1;
}

function buildCues(seed, round) {
  let random = seedNumber(seed);
  function pick(min, max) {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return min + (random >>> 0) % (max - min + 1);
  }
  const cues = [];
  let start = 0;
  function add(name, ticks) {
    const end = start + ticks * TICK_MS;
    cues.push({ name, start, end });
    start = end;
  }
  const minWarningTicks = Math.max(12, 18 - 2 * (round - 1));
  let untilFake = pick(2, 4);
  while (start <= ROUND_MS) {
    add('sleep', pick(50, 95));
    const fake = round >= 2 && --untilFake === 0;
    if (fake) {
      add('ear', pick(10, 13));
      untilFake = pick(3, 5);
    } else {
      const warning = minWarningTicks + pick(0, 1);
      const eyelid = pick(4, 5);
      add('ear', warning - eyelid);
      add('blink', eyelid);
      add('look', pick(17, 23));
    }
  }
  return cues;
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.hasOwn(input, 'kind')) return null;
  const fields = Object.keys(input).length;
  if (input.kind === 'hold' && fields === 2 && Object.hasOwn(input, 'held') && typeof input.held === 'boolean') {
    return { kind: 'hold', held: input.held };
  }
  if (input.kind === 'motion' && fields === 1) return { kind: 'motion' };
  return null;
}

function step(state, inputs, dt, { departures = [] } = {}) {
  if (isRoundOver(state)) return state;
  const elapsedMs = Math.min(ROUND_MS, state.elapsedMs + dt);
  const nextCue = state.cues[state.cueIndex + 1];
  const cueIndex = nextCue?.start <= elapsedMs ? state.cueIndex + 1 : state.cueIndex;
  const cue = state.cues[cueIndex];
  const lookingFor = cue.name === 'look' ? elapsedMs - cue.start : -1;
  const pressed = new Set();
  const runners = Object.fromEntries(Object.entries(state.runners).map(([id, runner]) => [id, { ...runner }]));
  for (const { playerId } of departures) delete runners[playerId];
  for (const { playerId, input } of inputs) {
    if (!Object.hasOwn(runners, playerId)) continue;
    const runner = runners[playerId];
    if (input.kind === 'hold') {
      runner.heldUntil = input.held ? elapsedMs + HOLD_LEASE_MS : 0;
      if (input.held) pressed.add(playerId);
    } else if (lookingFor > 0) runner.motion = true;
  }
  let finish = false;
  for (const [id, runner] of Object.entries(runners)) {
    const held = runner.heldUntil > elapsedMs;
    runner.moving = held && lookingFor === -1;
    if (lookingFor === -1) {
      runner.caught = false;
      runner.motion = false;
      // Require a fresh hold at the line so a disconnected phone cannot win on its lease.
      if (runner.moving && (runner.ticks < TARGET_TICKS - 1 || pressed.has(id))) runner.ticks++;
      if (runner.ticks === TARGET_TICKS) finish = true;
    } else if (lookingFor >= GRACE_MS && !runner.caught
      && (held || runner.motion || (lookingFor > GRACE_MS && pressed.has(id)))) {
      runner.ticks = 0;
      runner.caught = true;
      runner.catchId++;
    }
  }
  return { ...state, runners, cueIndex, elapsedMs, finish };
}

function isRoundOver(state) {
  return state.finish || state.elapsedMs === ROUND_MS || Object.keys(state.runners).length === 0;
}

export const dontWakeLala = Object.freeze({
  id: 'dont-wake-lala',
  minPlayers: 2,
  maxPlayers: 16,
  durationMs: ROUND_MS,
  createRound(players, seed, round = 1, match) {
    return {
      cues: buildCues(seed, round),
      cueIndex: 0,
      elapsedMs: 0,
      startsAt: match?.startsAt ?? 0,
      finish: false,
      runners: Object.fromEntries(players.map(({ id }) => [id, {
        ticks: 0, heldUntil: 0, moving: false, motion: false, caught: false, catchId: 0,
      }])),
    };
  },
  normalizeInput,
  step,
  isRoundOver,
  projectForPhone(state, playerId) {
    if (!Object.hasOwn(state.runners, playerId)) return null;
    const { ticks, caught } = state.runners[playerId];
    const { name: cue, end } = state.cues[state.cueIndex];
    const view = { cue, distance: ticks / TICKS_PER_POINT, caught };
    if (cue === 'look') view.lookUntil = Math.ceil(state.startsAt + Math.min(ROUND_MS, end));
    return view;
  },
  projectForTv(state) {
    return {
      cue: state.cues[state.cueIndex].name,
      finish: state.finish,
      target: TARGET,
      runners: Object.entries(state.runners).map(([playerId, { ticks, moving, caught, catchId }]) => ({
        playerId, distance: ticks / TICKS_PER_POINT, moving, caught, catchId,
      })),
    };
  },
  scores(state) {
    return Object.entries(state.runners)
      .map(([playerId, runner]) => ({ playerId, score: runner.ticks / TICKS_PER_POINT }))
      .sort((a, b) => b.score - a.score);
  },
});
