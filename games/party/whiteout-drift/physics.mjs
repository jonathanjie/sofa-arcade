import { clamp, distance, pursuitWaypoint, random } from './city.mjs';

const RADIUS = 11;
export const driver = c => c.role === 0 || c.role === 3 || c.role === 4;
export function emit(s, kind, at, by, target = null) {
  s.events.push({ id: ++s.serial, at: s.elapsedMs, kind, x: at.x, y: at.y, by, target });
}

export function style(c, points) { c.score += points * (c.role === 3 ? 2 : 1); }

export function steer(s, c, { x, y, d }) {
  c.stickX = x; c.stickY = y;
  if (!c.spinMs && d !== c.button) {
    if (d && c.role === 1 && !c.cd) {
      c.boostMs = 400; c.cd = 2800;
    } else if (!d && driver(c) && c.boostCharge >= 500) {
      c.boostMs = 450;
      if (Math.hypot(c.vx, c.vy) > 80) style(c, 15);
      emit(s, 'boost', c, c.id);
    }
  }
  if (!d) c.boostCharge = 0;
  c.button = d;
}

function aiSteer(s, c) {
  let target = s.pings.at(-1) ?? s.cars.find(v => v.role === 3);
  if (!target) {
    for (const v of s.cars) if (driver(v) && (!target || distance(c, v) < distance(c, target))) target = v;
  }
  if (!target) return;
  const p = pursuitWaypoint(s, c, target), gap = Math.max(1, distance(c, p));
  steer(s, c, { x: (p.x - c.x) / gap, y: (p.y - c.y) / gap,
    d: +(distance(c, target) < 68 && !c.cd && !c.button) });
}

function removeInward(c, nx, ny) {
  const inward = Math.min(0, c.vx * nx + c.vy * ny);
  c.vx -= inward * nx; c.vy -= inward * ny;
  c.wallPinned = true;
}

export function constrain(s, c) {
  c.x = clamp(c.x, RADIUS, s.w - RADIUS); c.y = clamp(c.y, RADIUS, s.h - RADIUS);
  if (c.x === RADIUS || c.x === s.w - RADIUS) removeInward(c, c.x === RADIUS ? 1 : -1, 0);
  if (c.y === RADIUS || c.y === s.h - RADIUS) removeInward(c, 0, c.y === RADIUS ? 1 : -1);
  for (const [x, y, w, h] of s.blocks) {
    const dx = c.x - clamp(c.x, x, x + w), dy = c.y - clamp(c.y, y, y + h);
    const gap = Math.hypot(dx, dy);
    if (gap > RADIUS) continue;
    if (gap) {
      c.x += dx / gap * (RADIUS - gap); c.y += dy / gap * (RADIUS - gap);
      removeInward(c, dx / gap, dy / gap);
    } else {
      const faces = [[c.x - x, -1, 0], [x + w - c.x, 1, 0], [c.y - y, 0, -1], [y + h - c.y, 0, 1]];
      const [depth, nx, ny] = faces.reduce((a, b) => a[0] <= b[0] ? a : b);
      c.x += nx * (depth + RADIUS); c.y += ny * (depth + RADIUS);
      removeInward(c, nx, ny);
    }
  }
}

export function move(s, c, dt) {
  const seconds = dt / 1000;
  if (c.ai) aiSteer(s, c);
  const speed = Math.hypot(c.vx, c.vy), stick = Math.hypot(c.stickX, c.stickY);
  c.drift = !c.spinMs && driver(c) && !!c.button;
  if (c.spinMs) {
    c.a += seconds * 8; c.vx *= 0.97; c.vy *= 0.97;
  } else {
    if (c.drift) c.boostCharge = Math.min(1000, c.boostCharge + dt);
    if (stick > 0.04) {
      const delta = Math.atan2(c.stickY, c.stickX) - c.a;
      const turn = seconds * (c.drift ? 6.5 : 4.4);
      c.a += clamp(Math.atan2(Math.sin(delta), Math.cos(delta)), -turn, turn);
    }
    const dx = Math.cos(c.a), dy = Math.sin(c.a);
    const target = c.boostMs ? 330 : stick * (c.ai ? 165 : 195);
    const forward = c.vx * dx + c.vy * dy;
    const thrust = (target - forward) * (c.boostMs ? 0.52 : 0.16);
    const slip = -c.vx * dy + c.vy * dx;
    const grip = c.drift ? 0.065 : clamp(0.44 - speed / 1100, 0.18, 0.44);
    c.vx += dx * thrust + dy * slip * grip; c.vy += dy * thrust - dx * slip * grip;
  }
  c.wallPinned = false;
  c.x += c.vx * seconds; c.y += c.vy * seconds;
  constrain(s, c);
}

export function collide(s, a, b) {
  const gap = distance(a, b);
  if (gap > 2 * RADIUS + 0.01) return null;
  const nx = gap ? (b.x - a.x) / gap : 1, ny = gap ? (b.y - a.y) / gap : 0;
  const overlap = Math.max(0, 2 * RADIUS - gap) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
  const av = a.vx * nx + a.vy * ny, bv = -b.vx * nx - b.vy * ny;
  const impulse = Math.max(0, av + bv) * (a.boostMs || b.boostMs ? 0.92 : 0.64);
  a.vx -= nx * impulse; a.vy -= ny * impulse; b.vx += nx * impulse; b.vy += ny * impulse;
  constrain(s, a); constrain(s, b);
  return [av, bv];
}

export function streetContacts(s, car) {
  for (const cone of s.cones) if (!cone.hit && distance(car, cone) <= RADIUS + 5) {
    cone.hit = true; emit(s, 'cone', cone, car.id);
  }
  for (const h of s.hydrants) if (!h.cd && distance(car, h) <= RADIUS + 7) {
    h.cd = 14000; style(car, 30); emit(s, 'hydrant', h, car.id);
    s.ice.push({ id: ++s.serial, x: h.x, y: h.y + h.side * 17, r: 44 + random(s) * 8,
      seed: Math.floor(random(s) * 65536), ms: 9500, owner: car.id, struck: [] });
  }
}

export function awardDispatch(s, spot) {
  for (const ping of s.pings) if (distance(spot, ping) <= 95) {
    const sender = s.cars.find(c => c.id === ping.by);
    if (sender) sender.score += 25;
  }
}

export function iceContacts(s, car) {
  for (const patch of s.ice) {
    if (car.spinMs || patch.struck.includes(car.id) || distance(car, patch) > patch.r ||
      (car.id === patch.owner && patch.ms > 8750)) continue;
    patch.struck.push(car.id); car.spinMs = 1350; car.drift = false; car.boostCharge = car.boostMs = 0;
    emit(s, 'ice-spin', car, patch.owner, car.id);
    const owner = s.cars.find(c => c.id === patch.owner);
    if (owner && owner !== car) style(owner, s.mode === 'freeze-tag' && car.role === 1 ? 50 : 60);
    if (car.role === 1) awardDispatch(s, car);
  }
}

const BALL_MAX_SPEED = 540;

export function stepBall(s, dt, onGoal) {
  const b = s.ball;
  if (!b) return;
  const seconds = dt / 1000;
  for (const car of s.cars) {
    if (car.role === 2) continue;
    const gap = distance(car, b);
    const minGap = RADIUS + b.r;
    if (gap >= minGap) continue;
    const nx = gap > 0.001 ? (b.x - car.x) / gap : Math.cos(car.a);
    const ny = gap > 0.001 ? (b.y - car.y) / gap : Math.sin(car.a);
    const overlap = minGap - gap;
    b.x += nx * overlap * 0.85;
    b.y += ny * overlap * 0.85;
    car.x -= nx * overlap * 0.15;
    car.y -= ny * overlap * 0.15;
    constrain(s, car);
    const carSpeed = Math.hypot(car.vx, car.vy);
    const rel = Math.max(0, (car.vx - b.vx) * nx + (car.vy - b.vy) * ny);
    const power = car.boostMs > 0 ? 1.55 : 1.15;
    const kick = Math.max(125, rel * power + carSpeed * 0.45);
    b.vx += nx * kick + car.vx * 0.25;
    b.vy += ny * kick + car.vy * 0.25;
    const nextSpeed = Math.hypot(b.vx, b.vy);
    if (nextSpeed > BALL_MAX_SPEED) {
      b.vx = b.vx / nextSpeed * BALL_MAX_SPEED;
      b.vy = b.vy / nextSpeed * BALL_MAX_SPEED;
    }
    b.spin = clamp(b.spin + ((car.vx * ny - car.vy * nx) / 140), -10, 10);
    b.lastTouch = car.id;
    b.lastSide = car.side;
    if (!car.touchCd) {
      car.score += 10;
      car.touchCd = 800;
      if (car.boostMs > 0 || kick > 230) emit(s, car.boostMs > 0 ? 'powershot' : 'kick', b, car.id);
    }
  }
  const onIce = s.ice.some(p => distance(b, p) <= p.r + b.r * 0.5);
  const drag = onIce ? 0.996 : 0.985;
  b.vx *= drag;
  b.vy *= drag;
  b.spin *= 0.96;
  b.x += b.vx * seconds;
  b.y += b.vy * seconds;

  if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.82; }
  else if (b.y > s.h - b.r) { b.y = s.h - b.r; b.vy = -Math.abs(b.vy) * 0.82; }

  const inGoalMouth = s.goal && b.y >= s.goal.top + 4 && b.y <= s.goal.bottom - 4;
  if (inGoalMouth && b.x <= 4) { onGoal('blue'); return; }
  if (inGoalMouth && b.x >= s.w - 4) { onGoal('gold'); return; }
  if (!inGoalMouth) {
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.82; }
    else if (b.x > s.w - b.r) { b.x = s.w - b.r; b.vx = -Math.abs(b.vx) * 0.82; }
  }
}
