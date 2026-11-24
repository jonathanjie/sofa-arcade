const ROUND_MS = 90_000;
const STEER_LEASE_MS = 250;
const DASH_MS = 2_000;
const GUST_MS = 4_000;
const GUST_CROSSING_MS = 900;
const WARNING_MS = 2_000;
const BODY_RADIUS = 11.5;
const MASS = 1;
const RESTITUTION = 0.83;
const ACCELERATION = 155;
const DRAG_PER_TICK = 0.88;
const TOP_SPEED = 104;
const DASH_IMPULSE = 82;
const GUST_IMPULSE = 12;
const MAX_GUST_IMPULSE = 16;
const GUST_EDGE_MARGIN = 2.5 * BODY_RADIUS;
const HIT_FEEDBACK_SPEED = 15;
const EVENT_MEMORY_MS = 300;
const MAX_EVENTS = 32;

// Times are in milliseconds and radii are fractions of the starting rug.
const SHRINKS = [
  [16_000, .91], [29_000, .82], [42_000, .73], [55_000, .64], [68_000, .56],
  [74_000, .46], [78_000, .37], [82_000, .28], [86_000, .19], [89_000, .10],
];

function rugRadius(initialRadius, fraction) {
  return Math.max(13, initialRadius * fraction);
}

function startAngle(seed) {
  let hash = 2166136261;
  for (const letter of String(seed)) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619);
  return (hash >>> 0) / 2 ** 32 * 2 * Math.PI;
}

function createRound(players, seed, gameRound = 1) {
  const radius = Math.sqrt(6500 + 1150 * players.length);
  const spawnFraction = .42 + .013 * players.length;
  const headStartMs = (players.length === 2 ? 2000 : 0) + 2000 * Math.min(3, gameRound - 1);
  const pulls = SHRINKS.map(([at, fraction]) => {
    // Advance early pulls most, and keep the last pull close to the time limit.
    const lead = headStartMs * (ROUND_MS - at) / (ROUND_MS - SHRINKS[0][0]);
    return [at - Math.round(lead / 50) * 50, fraction];
  });
  const angle = startAngle(seed);
  const bodies = players.map(({ id }, index) => {
    const bearing = angle + 2 * Math.PI * index / players.length;
    const x = Math.cos(bearing);
    const y = Math.sin(bearing);
    return {
      id, x: x * radius * spawnFraction, y: y * radius * spawnFraction, vx: 0, vy: 0,
      steerX: 0, steerY: 0, steerUntil: 0, aimX: -x, aimY: -y,
      dashAt: -DASH_MS, gustAt: -GUST_MS, outAt: null,
    };
  });
  return {
    bodies, radius, initialRadius: radius, pulls, shrinkIndex: 0, elapsedMs: 0,
    events: [], nextEventId: 1, gusts: [],
  };
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.hasOwn(input, 'kind')) return null;
  const fields = Object.keys(input).length;
  if (input.kind === 'dash') return fields === 1 ? { kind: 'dash' } : null;
  if (input.kind !== 'roll' && input.kind !== 'gust') return null;
  if (fields !== 3 || !Object.hasOwn(input, 'x') || !Object.hasOwn(input, 'y')) return null;
  const { x, y } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1) return null;
  const magnitude = Math.hypot(x, y);
  if (magnitude > 1.000001 || (input.kind === 'gust' && magnitude < .1)) return null;
  return { kind: input.kind, x: x || 0, y: y || 0 };
}

function emit(state, kind, data = {}) {
  state.events.push({ id: state.nextEventId++, at: state.elapsedMs, kind, ...data });
}

function applyInputs(state, inputs) {
  const { elapsedMs, radius } = state;
  for (const { playerId, input: { kind, x, y } } of inputs) {
    const body = state.bodies.find(candidate => candidate.id === playerId);
    if (!body) continue;
    if (body.outAt !== null) {
      if (kind === 'gust' && elapsedMs - body.gustAt >= GUST_MS) {
        const magnitude = Math.hypot(x, y);
        body.gustAt = elapsedMs;
        // The front always travels faster than a bunny, so it can pass each one only once.
        const duration = Math.min(GUST_CROSSING_MS, 2000 * radius / (TOP_SPEED + 1));
        state.gusts.push({ playerId, x: x / magnitude, y: y / magnitude, radius, at: elapsedMs, duration });
        emit(state, 'gust', { playerId });
      }
      continue;
    }
    if (kind === 'roll') {
      const magnitude = Math.hypot(x, y);
      body.steerX = x;
      body.steerY = y;
      body.steerUntil = elapsedMs + STEER_LEASE_MS;
      if (magnitude >= .1) {
        body.aimX = x / magnitude;
        body.aimY = y / magnitude;
      }
    } else if (kind === 'dash' && elapsedMs - body.dashAt >= DASH_MS) {
      body.dashAt = elapsedMs;
      body.vx += body.aimX * DASH_IMPULSE;
      body.vy += body.aimY * DASH_IMPULSE;
      emit(state, 'dash', { playerId, x: body.x, y: body.y });
    }
  }
}

function capSpeed(body) {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > TOP_SPEED) {
    body.vx *= TOP_SPEED / speed;
    body.vy *= TOP_SPEED / speed;
  }
}

function applyGusts(body, state, dt) {
  const edgeMargin = Math.min(GUST_EDGE_MARGIN, .48 * state.radius);
  if (Math.hypot(body.x, body.y) > state.radius - edgeMargin) return;
  let vx = 0;
  let vy = 0;
  for (const gust of state.gusts) {
    const travel = 2 * gust.radius * (state.elapsedMs - gust.at) / gust.duration;
    const start = travel - gust.radius;
    const end = travel + 2 * gust.radius * dt / gust.duration - gust.radius;
    const along = body.x * gust.x + body.y * gust.y;
    if (along >= start && along < end) {
      vx += gust.x * GUST_IMPULSE;
      vy += gust.y * GUST_IMPULSE;
    }
  }
  const magnitude = Math.hypot(vx, vy);
  if (!magnitude) return;
  const scale = Math.min(1, MAX_GUST_IMPULSE / magnitude);
  const nextVx = body.vx + vx * scale;
  const nextVy = body.vy + vy * scale;
  // Sum the geometric series of drag over future ticks. Even staggered gusts
  // must leave the stopping point inside the current rug.
  const coastSeconds = DRAG_PER_TICK / (1 - DRAG_PER_TICK) * dt / 1000;
  const stopX = body.x + nextVx * coastSeconds;
  const stopY = body.y + nextVy * coastSeconds;
  if (Math.hypot(stopX, stopY) >= state.radius) return;
  body.vx = nextVx;
  body.vy = nextVy;
}

function roll(body, state, dt) {
  if (state.elapsedMs < body.steerUntil) {
    body.vx += body.steerX * ACCELERATION * dt / 1000;
    body.vy += body.steerY * ACCELERATION * dt / 1000;
  }
  applyGusts(body, state, dt);
  body.vx *= DRAG_PER_TICK;
  body.vy *= DRAG_PER_TICK;
  capSpeed(body);
  body.x += body.vx * dt / 1000;
  body.y += body.vy * dt / 1000;
}

function collide(state, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const gap = Math.hypot(dx, dy);
  const overlap = 2 * BODY_RADIUS - gap;
  if (overlap <= 0) return;

  const nx = gap ? dx / gap : 1;
  const ny = gap ? dy / gap : 0;
  const halfOverlap = overlap / 2;
  a.x -= nx * halfOverlap;
  a.y -= ny * halfOverlap;
  b.x += nx * halfOverlap;
  b.y += ny * halfOverlap;

  const closingSpeed = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closingSpeed <= 0) return;
  const impulse = (1 + RESTITUTION) * closingSpeed / (2 / MASS);
  const speedChange = impulse / MASS;
  a.vx -= nx * speedChange;
  a.vy -= ny * speedChange;
  b.vx += nx * speedChange;
  b.vy += ny * speedChange;
  if (closingSpeed >= HIT_FEEDBACK_SPEED) {
    emit(state, 'hit', { playerId: a.id, otherId: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      strong: closingSpeed >= 68 });
  }
}

function isRoundOver(state) {
  return state.elapsedMs >= ROUND_MS || state.bodies.filter(body => body.outAt === null).length <= 1;
}

function step(state, inputs, dt, { departures = [] } = {}) {
  if (isRoundOver(state)) return state;
  const elapsedMs = Math.min(ROUND_MS, state.elapsedMs + dt);
  const removed = new Set(departures.map(({ playerId }) => playerId));
  const next = {
    ...state, elapsedMs,
    bodies: state.bodies.filter(body => !removed.has(body.id)).map(body => ({ ...body })),
    events: state.events.filter(event => elapsedMs - event.at < EVENT_MEMORY_MS),
    gusts: state.gusts.filter(gust => !removed.has(gust.playerId) && elapsedMs - gust.at < gust.duration),
  };
  const live = next.bodies.filter(body => body.outAt === null);
  if (live.length > 1) simulate(next, inputs, live, dt);
  for (const { playerId } of departures) {
    const body = state.bodies.find(candidate => candidate.id === playerId);
    if (body?.outAt === null) emit(next, 'left', { playerId, x: body.x, y: body.y });
  }
  next.events = next.events.slice(-MAX_EVENTS);
  return next;
}

function simulate(next, inputs, live, dt) {
  const { elapsedMs } = next;
  const shrink = next.pulls[next.shrinkIndex];
  if (shrink && elapsedMs >= shrink[0]) {
    next.radius = rugRadius(next.initialRadius, shrink[1]);
    next.shrinkIndex++;
    emit(next, 'shrink');
  }
  applyInputs(next, inputs);
  for (const body of live) roll(body, next, dt);
  // A second pass separates neighbours pushed together in the first pass.
  for (let pass = 0; pass < 2; pass++) {
    for (const [index, body] of live.entries()) {
      for (let other = index + 1; other < live.length; other++) collide(next, body, live[other]);
    }
  }
  for (const body of live) {
    capSpeed(body);
    if (Math.hypot(body.x, body.y) <= next.radius) continue;
    body.outAt = elapsedMs;
    emit(next, 'out', { playerId: body.id, x: body.x, y: body.y });
  }
}

function projectForPhone(state, playerId, now) {
  const body = state.bodies.find(candidate => candidate.id === playerId);
  if (!body) return null;
  const out = body.outAt !== null;
  const readyAt = out ? body.gustAt + GUST_MS : body.dashAt + DASH_MS;
  const cd = Math.max(0, readyAt - state.elapsedMs);
  // Anchor each charge at projection so a discarded host tick cannot skew later charges.
  return cd && Number.isFinite(now) ? { out, cd, at: Math.ceil(now + cd) } : { out, cd };
}

function projectForTv(state) {
  const next = state.pulls[state.shrinkIndex];
  const ms = next ? next[0] - state.elapsedMs : Infinity;
  return {
    radius: state.radius, initialRadius: state.initialRadius, elapsedMs: state.elapsedMs,
    warning: ms <= WARNING_MS ? { radius: rugRadius(state.initialRadius, next[1]), ms } : null,
    bodies: state.bodies.map(({ id, x, y, vx, vy, outAt }) => ({ id, x, y, vx, vy, outAt })),
    gusts: state.gusts,
    events: state.events,
  };
}

function scores(state) {
  const ranked = state.bodies.map(({ id, x, y, outAt }) => ({
    id, survival: outAt ?? ROUND_MS + 1, distance: Math.round(Math.hypot(x, y) * 1000),
  }));
  ranked.sort((a, b) => b.survival - a.survival || a.distance - b.distance);
  let points = ranked.length;
  return ranked.map((body, index) => {
    const prior = ranked[index - 1];
    if (prior && (body.survival !== prior.survival || body.distance !== prior.distance)) points = ranked.length - index;
    return { playerId: body.id, score: points };
  });
}

export const dustBunnySumo = Object.freeze({
  id: 'dust-bunny-sumo', minPlayers: 2, maxPlayers: 16, durationMs: ROUND_MS,
  createRound, normalizeInput, step, projectForPhone, projectForTv, isRoundOver, scores,
});
