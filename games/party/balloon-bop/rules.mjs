// Adapted from goofyfish/public/games/bopping.html, MIT © Kamran Ahmed.
// See docs/third-party/goofyfish-LICENSE.txt.
const durationMs = 90_000;
const modes = [
  { id: 'keep-it-up', label: 'Keep It Up', hint: 'Keep the balloons up together. Three drops end the round.' },
  { id: 'balloon-volley', label: 'Balloon Volley', hint: 'Bop balloons over the net. Score when one lands on the other side.' },
];

function random(s) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}

// Court coordinates are 1000 units wide. Heights increase from the floor.
function serve(s) {
  return { x: 80 + random(s) * 840, y: 330 + random(s) * 45, vx: random(s) * 1.6 - .8, vy: 0 };
}

function createRound(roster, seed, round = 1, match = {}) {
  const volley = match?.mode === 'balloon-volley';
  const players = roster.map(({ id, look }, i) => {
    const side = i % 2;
    const x = volley ? side * 500 + 480 * (Math.floor(i / 2) + .5) / Math.ceil((roster.length - side) / 2) + 10
      : (i + .5) * 1000 / roster.length;
    return { id, look, side, x, start: x, target: x, hop: 0, y: 0, bops: 0 };
  });
  const s = { volley, players, seed: round, tick: 0, elapsed: 0, drops: 0, team: 0, points: [0, 0],
    wind: 0, dart: null, balloons: [], event: null, serial: 0 };
  for (const c of String(seed)) s.seed = Math.imul(s.seed, 31) + c.charCodeAt(0) >>> 0;
  s.balloons.push(serve(s));
  return s;
}

function normalizeInput(v) {
  if (!v || Array.isArray(v) || Object.keys(v).length !== 2 || !Object.hasOwn(v, 'x') ||
    !Object.hasOwn(v, 'kind') || v.kind !== 'hop' || !Number.isInteger(v.x) || v.x < 0 || v.x > 1000) return null;
  return { kind: 'hop', x: v.x || 0 };
}

function impact(s, label, x, y) {
  s.event = { id: ++s.serial, label, x, y };
}

function lose(s, b) {
  if (s.volley) s.points[b.x < 500 ? 1 : 0]++;
  else s.drops++;
  impact(s, s.volley ? 'Point!' : 'Pop!', b.x, b.y);
  Object.assign(b, serve(s));
}

function step(state, inputs, dt = 50, { departures = [], elapsedMs = state.elapsed + dt } = {}) {
  const s = structuredClone(state);
  s.tick++;
  s.elapsed = elapsedMs;
  s.players = s.players.filter(p => !departures.some(d => d.playerId === p.id));
  for (const { playerId, input } of inputs) {
    const p = s.players.find(p => p.id === playerId);
    if (!p || p.hop) continue;
    p.start = p.x;
    p.target = s.volley ? 18 + p.side * 500 + .464 * input.x : 18 + .964 * input.x;
    p.hop = 1;
  }
  for (const p of s.players) {
    if (!p.hop) continue;
    const progress = p.hop / 18;
    p.x = p.start + (p.target - p.start) * progress;
    p.y = 680 * progress * (1 - progress);
    p.hop = (p.hop + 1) % 19;
  }
  if (s.tick % 360 === 0 && s.balloons.length < 5) s.balloons.push(serve(s));
  if (s.tick % 220 === 160) s.wind = random(s) < .5 ? -1 : 1;
  if (s.tick % 220 === 0) s.wind = 0;
  if (s.tick % 260 === 210) s.dart = { x: 0, y: 135 + random(s) * 50 };
  if (s.dart) {
    s.dart.x += 12;
    if (s.players.some(p => p.hop && Math.abs(p.x - s.dart.x) < 28 && s.dart.y >= p.y - 8 && s.dart.y <= p.y + 95)) {
      impact(s, 'Blocked!', s.dart.x, s.dart.y);
      s.dart = null;
    } else if (s.dart.x > 1000) s.dart = null;
  }
  const airborne = s.balloons.length;
  for (const b of s.balloons) {
    const previousX = b.x;
    b.vy = Math.max(-3.4, b.vy - .095);
    b.y += b.vy;
    b.x += b.vx + s.wind * 1.6;
    if (b.x < 18 || b.x > 982) {
      b.x = Math.max(18, Math.min(982, b.x));
      b.vx = b.x === 18 ? 2 : -2;
    }
    if (s.volley && b.y < 112 && (previousX < 500) !== (b.x < 500)) {
      b.x = previousX;
      b.vx = previousX < 500 ? -3 : 3;
    }
    if (s.dart && Math.hypot(s.dart.x - b.x, s.dart.y - b.y) < 26) {
      s.dart = null;
      lose(s, b);
    } else if (b.y <= 18) lose(s, b);
    else if (b.vy <= 0) {
      const hitter = s.players.find(p => p.hop && Math.abs(p.x - b.x) <= 34 && b.y >= p.y - 10 && b.y < p.y + 110);
      if (hitter) {
        hitter.bops++;
        s.team += airborne;
        b.vy = Math.min(7, Math.sqrt(2 * .095 * Math.max(10, 360 - b.y)));
        b.vx = s.volley ? (hitter.side ? -1 : 1) * 6 : 3 * (random(s) - .5);
        impact(s, '+' + airborne, b.x, b.y);
      }
    }
    if (!s.volley && s.drops >= 3) break;
  }
  return s;
}

export const balloonBop = {
  id: 'balloon-bop', modes, defaultMode: modes[0].id, minPlayers: 2, maxPlayers: 16, durationMs,
  createRound, normalizeInput, step,
  isRoundOver: s => s.elapsed >= durationMs || !s.players.length || (!s.volley && s.drops >= 3),
  scores: s => s.players.map(p => ({ playerId: p.id, score: s.volley ? s.points[p.side] : p.bops })).sort((a,b) => b.score-a.score),
  projectForPhone(s, id) {
    const p = s.players.find(p => p.id === id);
    return p ? { b: p.bops, l: 3 - s.drops, t: s.volley ? p.side : -1, s: s.volley ? s.points[p.side] : s.team } : null;
  },
  projectForTv(s) {
    const { volley, team, drops, points, dart, wind, event } = s;
    return { volley, team, drops, points, dart, wind, event, balloons: s.balloons.map(({x,y}) => ({x,y})),
      players: s.players.map(({id,look,x,y,side}) => ({id,look,x,y,side})) };
  },
};
