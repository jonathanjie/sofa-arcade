export const COURT = Object.freeze({ width: 1440, height: 640, radius: 10, pickupRadius: 24 });
const { width, height, radius, pickupRadius } = COURT;
const ROUND_MS = 90_000;
const TARGET = 7;
const MAX_BALLS = 7;
const SERVE_DELAY_MS = 1800;
const FIRST_PICKUP_MS = 4500;
const PICKUP_PERIOD_MS = 8500;
const PICKUP_LIFE_MS = 7000;
const WIDE_MS = 6500;
const CURVE_MS = 3100;
const SLOW_MS = 2800;
const SLOW_FACTOR = 0.62;
const HIT_ACCELERATION = 1.08;
const MAX_SPEED = 1050;
const MAX_ANGLE = Math.PI * 0.32;
const BOOSTS = ['wide', 'split', 'curve', 'slow'];
// Fixed tick and speeds bound normal contacts per tick. Keep a second bound for replay fixtures.
const MAX_CONTACTS_PER_TICK = 64;
const TIME_EPSILON = 1e-10;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function seedHash(seed) {
  let hash = 2166136261;
  for (const letter of String(seed)) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619);
  return (hash >>> 0) || 1;
}

function random(state) {
  let value = state.rng;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng / 2 ** 32;
}

function positionPaddles(state) {
  for (const paddle of state.paddles) {
    const slot = paddle.bottom - paddle.top;
    paddle.length = paddle.baseLength;
    if (state.wideUntil[paddle.team] > state.elapsedMs) {
      paddle.length = Math.min(slot * 0.77, paddle.baseLength * 1.55);
    }
    paddle.y = paddle.top + paddle.length / 2 + (paddle.position + 1) * (slot - paddle.length) / 2;
  }
}

function serve(state, direction, y) {
  const speed = 365 + random(state) * 95;
  const angle = (random(state) - 0.5) * 0.93;
  state.balls.push({
    id: state.nextBall++, x: width / 2, y,
    vx: direction * speed * Math.cos(angle), vy: speed * Math.sin(angle),
    team: null, curveUntil: 0, bend: 0,
  });
}

function createRound(players, seed) {
  const largerTeam = Math.ceil(players.length / 2);
  const coverage = 0.29 + (largerTeam - 1) * 0.018;
  const paddles = players.map(({ id }, index) => {
    const team = index % 2;
    const size = team === 0 ? largerTeam : Math.floor(players.length / 2);
    const slotIndex = Math.floor(index / 2);
    return {
      playerId: id, team, top: height * slotIndex / size, bottom: height * (slotIndex + 1) / size,
      baseLength: height / size * coverage, position: 0,
    };
  });
  const state = {
    paddles, balls: [], serves: [],
    elapsedMs: 0, points: [0, 0], wideUntil: [0, 0], slowUntil: 0,
    rng: seedHash(seed), nextBall: 1, nextEvent: 1, events: [],
    pickup: null, nextPickupAt: FIRST_PICKUP_MS, boostIndex: 0,
  };
  state.boostIndex = Math.floor(random(state) * BOOSTS.length);
  positionPaddles(state);
  const count = players.length < 8 ? 3 : 4;
  const firstDirection = random(state) < 0.5 ? 1 : -1;
  for (let index = 0; index < count; index++) {
    const direction = index % 2 === 0 ? firstDirection : -firstDirection;
    serve(state, direction, height * (index + 1) / (count + 1));
  }
  return state;
}

function pickupTime(ball, pickup, vx, vy) {
  const dx = ball.x - pickup.x;
  const dy = ball.y - pickup.y;
  const distanceSquared = dx * dx + dy * dy - (pickupRadius + radius) ** 2;
  if (distanceSquared <= 0) return 0;
  const approach = dx * vx + dy * vy;
  const speedSquared = vx * vx + vy * vy;
  const discriminant = approach * approach - speedSquared * distanceSquared;
  if (approach >= 0 || discriminant < 0) return Infinity;
  return distanceSquared / (-approach + Math.sqrt(discriminant));
}

function paddleAt(paddles, team, y) {
  let closest;
  let distance = Infinity;
  for (const paddle of paddles) {
    if (paddle.team !== team) continue;
    const offset = Math.abs(paddle.y - y);
    if (offset <= paddle.length / 2 + radius && offset < distance) {
      closest = paddle;
      distance = offset;
    }
  }
  return closest;
}

function firstContact(state, ball, seconds, pace) {
  const vx = ball.vx * pace;
  const vy = ball.vy * pace;
  let next = null;
  function offer(time, kind, paddle) {
    if (time < -TIME_EPSILON || time > seconds + TIME_EPSILON) return;
    const bounded = clamp(time, 0, seconds);
    if (!next || bounded < next.time) next = { time: bounded, kind, ball, paddle };
  }

  if (vy) offer(((vy < 0 ? radius : height - radius) - ball.y) / vy, 'rail');
  const team = vx < 0 ? 0 : 1;
  if (vx) {
    const face = team === 0 ? radius : width - radius;
    const faceTime = (face - ball.x) / vx;
    if (faceTime >= -TIME_EPSILON && faceTime <= seconds + TIME_EPSILON) {
      const paddle = paddleAt(state.paddles, team, ball.y + vy * Math.max(0, faceTime));
      if (paddle) offer(faceTime, 'hit', paddle);
    }
    const goal = team === 0 ? -radius : width + radius;
    offer((goal - ball.x) / vx, 'goal');
  }
  if (state.pickup && ball.team !== null) offer(pickupTime(ball, state.pickup, vx, vy), 'boost');
  return next;
}

function record(state, event) {
  state.events.push({ ...event, id: state.nextEvent++ });
  if (state.events.length > 16) state.events.shift();
}

function collect(state, ball) {
  const { kind, x, y } = state.pickup;
  state.pickup = null;
  record(state, { kind: 'boost', boost: kind, team: ball.team, x, y });
  switch (kind) {
    case 'wide':
      state.wideUntil[ball.team] = state.elapsedMs + WIDE_MS;
      positionPaddles(state);
      break;
    case 'split':
      if (state.balls.length + state.serves.length < MAX_BALLS) {
        const otherVy = ball.vy >= 0 ? -Math.max(155, ball.vy) : Math.max(155, -ball.vy);
        state.balls.push({ ...ball, id: state.nextBall++, vy: otherVy, curveUntil: 0, bend: 0 });
      }
      break;
    case 'curve':
      ball.curveUntil = state.elapsedMs + CURVE_MS;
      ball.bend = ball.y > height / 2 ? -1 : 1;
      break;
    case 'slow':
      state.slowUntil = state.elapsedMs + SLOW_MS;
      break;
  }
}

function resolveContact(state, { ball, kind, paddle }) {
  if (kind === 'rail') {
    ball.y = ball.vy < 0 ? radius : height - radius;
    ball.vy = -ball.vy;
    return;
  }
  if (kind === 'boost') {
    collect(state, ball);
    return;
  }
  if (kind === 'hit') {
    const offset = clamp((ball.y - paddle.y) / (paddle.length / 2 + radius), -1, 1);
    const speed = Math.min(MAX_SPEED, Math.hypot(ball.vx, ball.vy) * HIT_ACCELERATION);
    const angle = offset * MAX_ANGLE;
    ball.x = paddle.team === 0 ? radius : width - radius;
    ball.vx = (paddle.team === 0 ? 1 : -1) * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
    ball.team = paddle.team;
    ball.curveUntil = 0;
    record(state, { kind, team: ball.team, playerId: paddle.playerId, x: ball.x, y: ball.y });
    return;
  }
  const team = ball.vx < 0 ? 1 : 0;
  state.points[team]++;
  record(state, { kind, team, x: clamp(ball.x, 0, width), y: ball.y, point: state.points[team] });
  state.balls = state.balls.filter(entry => entry !== ball);
  state.serves.push({ at: state.elapsedMs + SERVE_DELAY_MS, direction: team === 0 ? -1 : 1 });
}

function sweepCourt(state, seconds) {
  for (let contact = 0; contact < MAX_CONTACTS_PER_TICK; contact++) {
    const pace = state.slowUntil > state.elapsedMs ? SLOW_FACTOR : 1;
    let next = null;
    for (const ball of state.balls) {
      const candidate = firstContact(state, ball, seconds, pace);
      if (candidate && (!next || candidate.time < next.time ||
        (candidate.time === next.time && ball.id < next.ball.id))) next = candidate;
    }
    const travel = next ? next.time : seconds;
    for (const ball of state.balls) {
      ball.x += ball.vx * pace * travel;
      ball.y += ball.vy * pace * travel;
    }
    if (!next) return;
    resolveContact(state, next);
    if (state.points.includes(TARGET)) return;
    seconds -= travel;
  }
}

function prepareTick(state, dt) {
  const due = state.serves.filter(serve => serve.at <= state.elapsedMs);
  state.serves = state.serves.filter(serve => serve.at > state.elapsedMs);
  for (const { direction } of due) serve(state, direction, height * (0.17 + random(state) * 0.66));
  if (state.pickup?.expiresAt <= state.elapsedMs) state.pickup = null;
  if (state.elapsedMs >= state.nextPickupAt) {
    // Skip split while there is no room for another ball. The extra ball stays in rotation.
    let kind = BOOSTS[state.boostIndex++ % BOOSTS.length];
    if (kind === 'split' && state.balls.length + state.serves.length >= MAX_BALLS) {
      kind = BOOSTS[state.boostIndex++ % BOOSTS.length];
    }
    state.pickup = {
      kind, x: width * (0.42 + 0.16 * random(state)), y: height * (0.24 + 0.52 * random(state)),
      expiresAt: state.elapsedMs + PICKUP_LIFE_MS,
    };
    state.nextPickupAt = state.elapsedMs + PICKUP_PERIOD_MS;
  }
  for (const ball of state.balls) {
    if (ball.curveUntil > state.elapsedMs) {
      // Bend at a fixed rate. Horizontal travel stays continuous within each sweep.
      const maxVy = Math.abs(ball.vx) * 1.2;
      ball.vy = clamp(ball.vy + ball.bend * 250 * dt / 1000, -maxVy, maxVy);
    }
  }
}

function isRoundOver(state) {
  return state.points.includes(TARGET) || state.elapsedMs >= ROUND_MS;
}

export const wallOfPaddles = Object.freeze({
  id: 'wall-of-paddles',
  minPlayers: 2,
  maxPlayers: 16,
  durationMs: ROUND_MS,
  createRound,
  normalizeInput(input) {
    if (!input || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'kind') ||
      !Object.hasOwn(input, 'position') || input.kind !== 'slide' ||
      !Number.isFinite(input.position) || Math.abs(input.position) > 1) return null;
    return { kind: 'slide', position: input.position || 0 };
  },
  step(state, inputs, dt) {
    if (isRoundOver(state)) return state;
    const next = {
      ...state, paddles: state.paddles.map(paddle => ({ ...paddle })), balls: state.balls.map(ball => ({ ...ball })),
      serves: [...state.serves], points: [...state.points], wideUntil: [...state.wideUntil], events: [...state.events],
    };
    for (const { playerId, input } of inputs) {
      const paddle = next.paddles.find(entry => entry.playerId === playerId);
      if (paddle && input.kind === 'slide') paddle.position = input.position;
    }
    positionPaddles(next);
    const tickMs = Math.min(dt, ROUND_MS - next.elapsedMs);
    prepareTick(next, tickMs);
    sweepCourt(next, tickMs / 1000);
    next.elapsedMs += tickMs;
    return next;
  },
  projectForPhone(state, playerId) {
    const paddle = state.paddles.find(entry => entry.playerId === playerId);
    return paddle ? { team: paddle.team, position: paddle.position } : null;
  },
  projectForTv(state) {
    const pickup = state.pickup && { kind: state.pickup.kind, x: state.pickup.x, y: state.pickup.y };
    return {
      court: COURT, target: TARGET, points: state.points, pickup, events: state.events,
      slow: state.slowUntil > state.elapsedMs,
      paddles: state.paddles.map(({ playerId, team, top, bottom, y, length }) =>
        ({ playerId, team, top, bottom, y, length })),
      balls: state.balls.map(({ id, x, y, team, curveUntil }) =>
        ({ id, x, y, team, curved: curveUntil > state.elapsedMs })),
    };
  },
  isRoundOver,
  scores(state) {
    return state.paddles.map(({ playerId, team }) => ({ playerId, score: state.points[team] }))
      .sort((a, b) => b.score - a.score);
  },
});
