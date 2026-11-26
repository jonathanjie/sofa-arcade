// Adapted from goofyfish public/games/stacks.html and public/games/planks.html.
// © Kamran Ahmed, MIT. See docs/third-party/goofyfish-LICENSE.txt.
const durationMs = 90_000;
const turnMs = 3000;
const modes = [
  { id: 'tallest', label: 'Tallest Tower', hint: 'Build the taller team tower.' },
  { id: 'coop', label: "Don't Topple", hint: 'Build together. A miss resets the tower. Beat your peak.' },
  { id: 'duel', label: 'Plank Duel', hint: 'Share one tower. Each miss costs your team a point.' },
];
const base = () => ({ height: 0, layers: [{ x: 0, w: 150 }] });

function createRound(players, seed, round = 1, match = {}) {
  const roster = players.map((p, i) => ({ ...p, side: i % 2 }));
  const first = (round - 1) % roster.length;
  const queue = [...roster.slice(first), ...roster.slice(0, first)].map(player => player.id);
  const mode = modes.find(m => m.id === match.mode)?.id ?? 'tallest';
  return { mode, roster, queue, towers: mode === 'tallest' ? [base(), base()] : [base()],
    points: [0, 0], peak: 0, phase: parseInt(String(seed).slice(-6), 16) || 0,
    now: 0, start: 0, turn: 0, event: null };
}

function target(s) {
  const player = s.roster.find(p => p.id === s.queue[0]);
  return s.mode === 'tallest' ? player?.side ?? 0 : 0;
}

function swing(s, at) {
  const top = s.towers[target(s)].layers.at(-1);
  const phase = s.phase + s.turn * 2.4 + (at - s.start) / 380;
  return { x: top.x + Math.round((top.w + 25) * Math.sin(phase)), w: top.w };
}

function rotate(s) {
  const id = s.queue.shift();
  s.queue.push(id);
  if (s.mode !== 'duel') return;
  const side = s.roster.find(p => p.id === id).side;
  const next = s.queue.findIndex(id => s.roster.find(p => p.id === id).side !== side);
  if (next > 0) s.queue.unshift(...s.queue.splice(next, 1));
}

function drop(s, at) {
  const lane = target(s);
  const tower = s.towers[lane];
  const top = tower.layers.at(-1);
  const block = swing(s, at);
  const delta = block.x - top.x;
  const overlap = top.w - Math.abs(delta);
  const perfect = overlap > 0 && Math.abs(delta) <= 10;
  const miss = overlap <= 0;
  const cut = miss ? block.w : perfect ? 0 : Math.abs(delta);
  s.event = { lane, at, block, label: miss ? 'Whoops!' : perfect ? 'Perfect!' : 'Slice!',
    cut, x: block.x + Math.sign(delta) * (block.w - cut) / 2 };
  if (miss) {
    if (s.mode === 'coop') s.towers[0] = base();
    if (s.mode === 'duel') s.points[s.roster.find(p => p.id === s.queue[0]).side]--;
  } else {
    const layer = perfect ? { x: top.x, w: Math.min(190, top.w + 8) } : { x: top.x + delta / 2, w: overlap };
    tower.layers = [...tower.layers.slice(-9), layer];
    tower.height++;
    s.peak = Math.max(s.peak, tower.height);
  }
  rotate(s);
  s.start = at;
  s.turn++;
}

function step(state, inputs, dt, { elapsedMs = state.now + dt, departures = [] } = {}) {
  // Layers are immutable between drops. Copy their small tower records before a landing.
  const s = { ...state, towers: state.towers.map(tower => ({ ...tower })), points: [...state.points] };
  s.now = Math.min(elapsedMs, durationMs);
  const gone = new Set(departures.map(d => d.playerId));
  s.roster = s.roster.filter(p => !gone.has(p.id));
  s.queue = s.queue.filter(id => !gone.has(id));
  if (!s.queue.length) return s;
  if (gone.has(state.queue[0])) s.start = s.now;
  const tap = inputs.find(i => i.playerId === s.queue[0] && i.input.kind === 'tap' &&
    (i.receivedMs ?? s.now) >= s.start && (i.receivedMs ?? s.now) <= s.start + turnMs);
  if (tap) drop(s, Math.min(tap.receivedMs ?? s.now, s.now));
  else if (s.now >= s.start + turnMs) drop(s, s.start + turnMs);
  return s;
}

function score(s, p) {
  if (s.mode === 'coop') return s.peak;
  if (s.mode === 'duel') return s.points[p.side];
  return s.towers[p.side].height;
}

export const wobbleTower = {
  id: 'wobble-tower', minPlayers: 2, maxPlayers: 16, modes, defaultMode: 'tallest', durationMs, createRound, step,
  normalizeInput(i) {
    return i && Object.keys(i).length === 1 && Object.hasOwn(i, 'kind') && i.kind === 'tap' ? { kind: 'tap' } : null;
  },
  projectForPhone(s, id) {
    const p = s.roster.find(p => p.id === id);
    if (!p) return null;
    let turns = s.queue.indexOf(id);
    // Unequal duel crews alternate sides. A smaller crew can cycle twice before a larger one.
    if (s.mode === 'duel') {
      const preview = { ...s, queue: [...s.queue] };
      turns = 0;
      while (preview.queue[0] !== id) { rotate(preview); turns++; }
    }
    return { q: turns, s: score(s, p) };
  },
  projectForTv(s) {
    return { mode: s.mode, roster: s.roster, towers: s.towers, points: s.points, peak: s.peak, active: s.queue[0],
      lane: target(s), moving: swing(s, s.now), event: s.event, turn: s.turn, now: s.now, left: s.start + turnMs - s.now };
  },
  scores: s => s.roster.map(p => ({ playerId: p.id, score: score(s, p) })).sort((a, b) => b.score - a.score),
  isRoundOver: s => s.now >= durationMs || !s.queue.length,
};
