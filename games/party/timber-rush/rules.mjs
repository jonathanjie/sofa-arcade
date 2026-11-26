// Adapted from goofyfish/public/games/chopping.html (MIT, © Kamran Ahmed).
const durationMs = 90_000;
const barMs = 6000;
const recoveryMs = 2000;
const logsPerTree = 72;
const modes = [
  {
    id: 'fell-race',
    label: 'Fell Race',
    hint: 'Fell three trees first, or cut the most logs before time runs out.',
  },
  { id: 'sabotage', label: 'Sabotage', hint: 'Chain ten clean chops to send a branch to a rival.' },
  { id: 'lumber-team', label: 'Lumber Team', hint: 'Pool your logs with the Birch or Cedar crew.' },
];

function random(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function branch(state) {
  const roll = random(state);
  return roll < 0.32 ? -1 : roll > 0.68 ? 1 : 0;
}

function createRound(players, seed, round = 1, match = {}) {
  let hash = round;
  for (const char of String(seed)) hash = Math.imul(hash, 31) + char.charCodeAt(0);
  const state = {
    seed: hash,
    mode: modes.find((m) => m.id === match.mode)?.id ?? 'fell-race',
    elapsedMs: 0,
    finished: false,
    flights: [],
    trees: [],
  };
  state.trees = players.map(({ id, look }, i) => ({
    id,
    look,
    team: i % 2,
    side: -1,
    logs: 0,
    combo: 0,
    bar: barMs,
    readyAt: 0,
    down: false,
    left: false,
    lastChop: -1000,
    branches: Array.from({ length: 5 }, () => branch(state)),
  }));
  return state;
}

function normalizeInput(input) {
  if (!input || Object.keys(input).length !== 2 || input.kind !== 'chop' || ![-1, 1].includes(input.side))
    return null;
  return { kind: 'chop', side: input.side };
}

function squash(tree, now) {
  tree.combo = 0;
  tree.down = true;
  tree.readyAt = now + recoveryMs;
  tree.bar = barMs;
}

function step(state, inputs, dt = 50, { departures = [], elapsedMs = state.elapsedMs + dt } = {}) {
  if (state.finished) return state;
  const next = structuredClone(state);
  const now = Math.min(durationMs, elapsedMs);
  next.elapsedMs = now;
  next.flights = next.flights.filter(axe => now - axe.at < 650);
  for (const tree of next.trees) {
    if (departures.some((d) => d.playerId === tree.id)) tree.left = true;
    if (tree.left || (now < tree.readyAt && tree.down)) continue;
    tree.bar -= now - Math.max(state.elapsedMs, tree.down ? tree.readyAt : 0);
    tree.down = false;
    if (tree.bar <= 0) squash(tree, now);
  }
  for (const { playerId, input } of inputs) {
    const tree = next.trees.find((t) => t.id === playerId);
    if (!tree || tree.left || now < tree.readyAt || !normalizeInput(input)) continue;
    tree.side = input.side;
    tree.lastChop = now;
    const hazard = tree.branches.shift();
    tree.branches.push(branch(next));
    if (hazard === tree.side) {
      squash(tree, now);
      continue;
    }
    tree.logs++;
    tree.combo++;
    tree.bar = Math.min(barMs, tree.bar + 800);
    tree.readyAt = now + 350;
    if (next.mode === 'fell-race' && tree.logs === 3 * logsPerTree) {
      next.finished = true;
      break;
    }
    if (next.mode === 'sabotage' && tree.combo % 10 === 0) {
      const rivals = next.trees.filter((t) => !t.left && t !== tree);
      const target = rivals[Math.floor(random(next) * rivals.length)];
      if (target) {
        const slot = target.branches.indexOf(0, 1);
        if (slot < 0) target.branches.splice(2, 0, random(next) < 0.5 ? -1 : 1);
        else target.branches[slot] = random(next) < 0.5 ? -1 : 1;
        target.branches.length = 5;
        next.flights.push({ from: tree.id, to: target.id, at: now });
      }
    }
  }
  next.finished ||= now >= durationMs || next.trees.every((t) => t.left);
  return next;
}

function totals(state) {
  const teams = [0, 0];
  for (const tree of state.trees) teams[tree.team] += tree.logs;
  return teams;
}

function projectForPhone(state, id) {
  const t = state.trees.find((tree) => tree.id === id && !tree.left);
  return t ? { s: t.logs, b: t.branches[0], d: +t.down, teach: +(state.elapsedMs < 3200) } : null;
}

export const timberRush = Object.freeze({
  id: 'timber-rush',
  minPlayers: 2,
  maxPlayers: 16,
  modes,
  defaultMode: 'fell-race',
  durationMs,
  normalizeInput,
  createRound,
  step,
  projectForPhone,
  projectForTv: (s) => ({
    trees: s.trees,
    teams: totals(s),
    mode: s.mode,
    now: s.elapsedMs,
    flights: s.flights,
    logsPerTree,
    barMs,
  }),
  isRoundOver: (s) => s.finished,
  scores(s) {
    const teams = totals(s);
    return s.trees
      .map((t) => ({ playerId: t.id, score: s.mode === 'lumber-team' ? teams[t.team] : t.logs }))
      .sort((a, b) => b.score - a.score);
  },
});
