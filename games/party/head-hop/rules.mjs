// Adapted from goofyfish/public/games/stomping.html (MIT, © Kamran Ahmed).
import { hashSeed } from '../whiteout-drift/city.mjs';

const durationMs = 90_000;
const floor = 510;
const width = 1000;
const modes = [
  { id: 'last-one-up', label: 'Last One Up', hint: 'Keep your three lives. The last jumper up wins.' },
  { id: 'stomp-chain', label: 'Stomp Chain', hint: 'Bounce from head to head to build your multiplier.' },
  { id: 'king-of-the-heads', label: 'King of the Heads', hint: 'Ride another jumper’s head to earn a point each second.' },
];

function createRound(players, seed, round, match = {}) {
  const offset = hashSeed(seed) % 83;
  const mode = modes.find(m => m.id === match.mode)?.id ?? modes[0].id;
  // The safety crew walks in lockstep. Their broad hats leave small gaps
  // early in the round, then fold in as the brambles close.
  const crew = Array.from({ length: 13 }, (_, i) => ({
    x: i * 82 + offset - 30, y: floor - 35, dir: 1, brim: 39,
  }));
  return {
    mode,
    elapsedMs: 0, wall: 0, over: false,
    goons: Array.from({ length: 12 }, (_, i) => ({
      x: ((i * 87 + offset) % 1040) - 20,
      y: floor - 60 - (i % 3) * 60, dir: i % 2 ? 1 : -1,
    })).concat(crew),
    players: players.map(({ id, look, name }, i) => ({
      id, look, name, x: 50 + 900 * (i + .5) / players.length, y: 130 + i % 3 * 90,
      dir: i % 2 ? 1 : -1, vy: 0, lives: 3, chain: 0, points: 0, rideMs: 0,
      balloon: 3800, boost: true, perch: null, perchedMs: 0, squashed: 0, survived: 0, hits: 0,
    })),
  };
}

function normalizeInput(input) {
  if (input?.kind !== 'hop' || Object.keys(input).length !== 2 ||
      !Number.isInteger(input.power) || input.power < 0 || input.power > 10) return null;
  return { kind: 'hop', power: input.power };
}

function loseLife(p, s) {
  p.lives--;
  p.chain = 0;
  p.y = 120 + (p.look % 4) * 52;
  p.x = Math.max(s.wall + 60, 55 + (p.look * 137 + p.survived / 100) % 875);
  p.vy = 0;
  p.perch = null;
  p.balloon = 3800;
  p.boost = true;
}

function step(state, inputs, dt = 50, { departures = [], elapsedMs = state.elapsedMs + dt } = {}) {
  if (state.over) return state;
  const s = structuredClone(state);
  s.elapsedMs = Math.min(elapsedMs, durationMs);
  const seconds = (s.elapsedMs - state.elapsedMs) / 1000;
  s.players = s.players.filter(p => !departures.some(d => d.playerId === p.id));
  s.wall = 12 + 115 * (1 - Math.cos(s.elapsedMs / 9000));
  for (const g of s.goons) {
    g.x += g.dir * 47 * seconds;
    if (g.brim) g.brim = Math.max(15, 42 - Math.max(0, s.elapsedMs - 53000) / 1100);
    if (g.x < -30) g.x += 1066;
    if (g.x > 1036) g.x -= 1066;
  }
  for (const { playerId, input } of inputs) {
    const p = s.players.find(p => p.id === playerId);
    if (!p?.lives || !p.boost) continue;
    p.vy = -195 - 15 * input.power;
    p.boost = false;
    p.balloon = 0;
    p.perch = null;
  }
  for (const p of s.players) {
    if (!p.lives) continue;
    p.survived = s.elapsedMs;
    p.squashed = Math.max(0, p.squashed - dt);
    if (p.balloon > 0) {
      p.balloon -= dt;
      continue;
    }
    const carrier = s.players.find(q => q.id === p.perch && q.lives && !q.balloon);
    if (carrier && p.perchedMs < 1600 && carrier.y > 135) {
      p.x = carrier.x;
      p.y = carrier.y - 55;
      p.rideMs += dt;
      p.perchedMs += dt;
      continue;
    }
    if (p.perch) {
      p.perch = null;
      p.vy = -270;
    }
    const oldY = p.y;
    p.x += p.dir * 93 * seconds;
    if (p.x >= width - 22 || p.x <= s.wall + 20) {
      p.dir = p.x >= width - 22 ? -1 : 1;
      p.x = Math.max(s.wall + 20, Math.min(width - 22, p.x));
    }
    p.vy += 440 * seconds;
    p.y += p.vy * seconds;
    if (p.y < 88) { p.y = 88; p.vy = Math.max(0, p.vy); }
    // A falling foot must cross the crown. Side contacts cannot score.
    const crosses = (x, y, radius = 23) => oldY <= y && p.y >= y && Math.abs(p.x - x) < radius;
    const target = s.players.find(q => q !== p && q.lives && !q.balloon && !q.perch && crosses(q.x, q.y - 55));
    const goon = s.goons.find(g => crosses(g.x, g.y, g.brim));
    if (p.vy > 0 && (target || goon)) {
      p.y = target ? target.y - 55 : goon.y;
      p.vy = -285;
      p.boost = true;
      p.hits++;
      p.points += Math.min(++p.chain, 12);
      if (target) {
        target.y += 10;
        target.squashed = 350;
        if (s.mode === 'king-of-the-heads') { p.perch = target.id; p.perchedMs = 0; }
      }
    }
    if (p.y >= floor) loseLife(p, s);
  }
  s.over = s.elapsedMs >= durationMs || (s.mode === 'last-one-up' && s.players.filter(p => p.lives).length <= 1);
  return s;
}

function score(s, p) {
  if (s.mode === 'last-one-up') return p.lives * 100 + Math.floor(p.survived / 1000);
  return s.mode === 'stomp-chain' ? p.points : Math.floor(p.rideMs / 1000);
}

export const headHop = {
  id: 'head-hop', minPlayers: 2, maxPlayers: 16, modes, defaultMode: modes[0].id, durationMs,
  createRound, normalizeInput, step, isRoundOver: s => s.over,
  scores: s => s.players.map(p => ({ playerId: p.id, score: score(s, p) })).sort((a,b) => b.score - a.score),
  projectForPhone(s, id) {
    const p = s.players.find(p => p.id === id);
    return p ? { lives: p.lives, score: score(s,p), chain: Math.min(12, p.chain) } : null;
  },
  projectForTv(s) {
    return { elapsedMs: s.elapsedMs, wall: s.wall, goons: s.goons,
      players: s.players.map(({ id, look, name, x, y, dir, lives, hits, chain, squashed, balloon, vy, perch }) =>
        ({ id, look, name, x, y, dir, lives, hits, chain, squashed, balloon, rising: vy < 0, riding: Boolean(perch) })) };
  },
};
