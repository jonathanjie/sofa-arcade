import { clamp, distance, emit, recharge } from './world.mjs';
import { pop, steal } from './modes.mjs';

function confine(s, p) {
  p.x = clamp(p.x, 36, s.w - 36);
  p.y = clamp(p.y, 36, s.h - 36);
}
function boundaryTurn(s, p) {
  const inward = (v, max) => (Math.max(0, 70 - v) - Math.max(0, v - max + 70)) / 34;
  const x = inward(p.x, s.w), y = inward(p.y, s.h);
  if (!x && !y) return 0;
  const diff = Math.atan2(y, x) - p.a;
  return Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, Math.hypot(x, y)) * 4;
}
function weather(s, p) {
  const thermal = s.thermals.find(t => distance(p, t) <= t.r)?.id ?? null;
  if (thermal !== null && thermal !== p.thermal) { recharge(p, 28); p.liftMs = 450; }
  p.thermal = thermal;
  const storm = s.clouds.find(c => c.gust && distance(p, c) <= c.r)?.id ?? null;
  if (storm !== null && storm !== p.storm) {
    p.wobbleMs = Math.max(500, p.wobbleMs);
    if (s.mode === 'ring-rally') p.streak = 0;
  }
  p.storm = storm;
}
function botControl(s, p) {
  const nearest = list => {
    let best = null, bestD = Infinity;
    for (const item of list) {
      const d = distance(p, item);
      if (d < bestD) { bestD = d; best = item; }
    }
    return best;
  };
  let target = null, shoot = false;
  if (s.mode === 'ring-rally') {
    target = nearest(s.rings.filter(r => r.gold)) ?? nearest(s.rings);
  } else if (s.mode === 'balloon-pop') {
    target = nearest(s.balloons);
    shoot = true;
  } else if (s.mode === 'sky-tag') {
    if (p.crown) {
      const chaser = nearest(s.planes.filter(o => o !== p));
      if (chaser) target = { x: clamp(2 * p.x - chaser.x, 120, s.w - 120), y: clamp(2 * p.y - chaser.y, 120, s.h - 120) };
    } else {
      target = nearest(s.crowns);
      shoot = Boolean(target?.holder);
    }
  }
  if (!target) return { x: 0, y: 0, b: 0, f: 0 };
  const diff = Math.atan2(target.y - p.y, target.x - p.x) - p.a;
  const rel = Math.atan2(Math.sin(diff), Math.cos(diff));
  const gap = distance(p, target);
  return {
    x: clamp(rel * 1.4, -1, 1),
    y: Math.abs(rel) > 1.1 ? 0.6 : -0.3,
    b: +(Math.abs(rel) < 0.35 && gap > 190 && p.boostCharge > 40),
    f: +(shoot && Math.abs(rel) < 0.28 && gap < 360),
  };
}
export function fly(s, p, dt, clockDelta) {
  const sec = dt / 1000;
  const { x, y, b, f } = p.ai ? botControl(s, p) : p.control;
  for (const key of ['fireCd', 'wobbleMs', 'stealCd', 'liftMs']) p[key] = Math.max(0, p[key] - clockDelta);
  // Add integer point-milliseconds so half-point standings round consistently.
  if (p.crown) p.score = (Math.round(p.score * 1000) + 2 * clockDelta) / 1000;
  weather(s, p);
  p.boosting = b === 1 && (p.boosting ? p.boostCharge > 0 : p.boostCharge >= 10);
  recharge(p, (p.boosting ? -40 : 15) * sec);
  p.bank += (x - p.bank) * (1 - Math.exp(-8 * sec));
  const wobble = p.wobbleMs > 0 ? Math.sin(s.elapsedMs / 70) : 0;
  p.a += (p.bank * (2.4 + 0.7 * y) + wobble + boundaryTurn(s, p)) * sec;
  p.spd = 250 - y * (y < 0 ? 50 : 55) + 145 * p.boosting + 50 * (p.liftMs > 0) - 35 * (p.wobbleMs > 0);
  const dx = Math.cos(p.a), dy = Math.sin(p.a);
  p.x += dx * p.spd * sec; p.y += dy * p.spd * sec;
  confine(s, p);
  if (f && !p.fireCd && s.darts.filter(d => d.by === p.id).length < 2) {
    s.darts.push({ id: ++s.serial, by: p.id, look: p.look, a: p.a, x: p.x + 20 * dx, y: p.y + 20 * dy, ms: 750 });
    p.fireCd = 450;
  }
}
export function separate(s) {
  for (const [i, p] of s.planes.entries()) for (let j = 0; j < i; j++) {
    const q = s.planes[j], gap = distance(p, q);
    if (gap >= 28) continue;
    const push = (28 - gap) * 0.35;
    const dx = gap ? (p.x - q.x) / gap : 1, dy = gap ? (p.y - q.y) / gap : 0;
    p.x += dx * push; p.y += dy * push;
    q.x -= dx * push; q.y -= dy * push;
    confine(s, p); confine(s, q);
  }
}

// First intersection along the dart's swept segment, including a nose already inside a target.
function impact(d, target, radius, dx, dy, travel) {
  const x = target.x - d.x, y = target.y - d.y;
  const along = x * dx + y * dy, across = x * dy - y * dx;
  if (Math.abs(across) > radius) return Infinity;
  const half = Math.sqrt(radius ** 2 - across ** 2);
  return along + half < 0 || along - half > travel ? Infinity : Math.max(0, along - half);
}
export function advanceDarts(s, dt) {
  s.darts = s.darts.filter(d => {
    const dx = Math.cos(d.a), dy = Math.sin(d.a), travel = 560 * Math.min(dt, d.ms) / 1000;
    let nearest = Infinity, victim = null, balloonIndex = -1;
    for (const p of s.planes) {
      if (p.id === d.by) continue;
      const hit = impact(d, p, 17, dx, dy, travel);
      if (hit < nearest) { nearest = hit; victim = p; }
    }
    for (const [i, bl] of s.balloons.entries()) {
      const hit = impact(d, bl, bl.r, dx, dy, travel);
      if (hit < nearest) { nearest = hit; balloonIndex = i; }
    }
    if (nearest !== Infinity) {
      const owner = s.planes.find(p => p.id === d.by);
      if (balloonIndex >= 0) pop(s, balloonIndex, owner);
      else {
        victim.wobbleMs = 550;
        victim.x += 8 * dx; victim.y += 8 * dy; confine(s, victim);
        emit(s, 'hit', victim, owner.id, victim.id);
        steal(s, owner, victim);
      }
      return false;
    }
    d.x += travel * dx; d.y += travel * dy; d.ms -= dt;
    return d.ms > 0 && d.x >= 0 && d.x <= s.w && d.y >= 0 && d.y <= s.h;
  });
}
