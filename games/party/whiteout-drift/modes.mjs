import { clamp, distance, random } from './city.mjs';
import { awardDispatch, driver, emit } from './physics.mjs';

export const DURATION = 75_000;
export const modes = Object.freeze([
  { id: 'getaway', label: 'Midnight Getaway', hint: 'Outdrift the midnight patrol. Smash hydrants to freeze ice traps.' },
  { id: 'cops-and-robbers', label: 'Cops vs. Robbers', hint: 'Robbers hit checkpoints and freeze traps. Cops ram to bust.' },
  { id: 'freeze-tag', label: 'Frostbite Tag', hint: 'Tagged drivers join the patrol. Last getaway car wins.' },
  { id: 'drift-king', label: 'Whiteout Crown', hint: 'Grab the Most Wanted Crown and ice-trap anyone in pursuit.' },
].map(Object.freeze));

function chassis(s, id, look, role, ai = false) {
  const spot = s.spawns.find(p => s.cars.every(c => c.role === 2 || distance(c, p) >= 36));
  return { ...(spot ?? s.spawns[0]), id, look, role, ai, hp: role === 0 && s.mode === 'freeze-tag' ? 2 : 3,
    a: random(s) * Math.PI * 2, vx: 0, vy: 0, score: 0, spinMs: 0, boostMs: 0, boostCharge: 0,
    cd: 0, grace: 0, pinMs: 0, drift: false, button: 0, stickX: 0, stickY: 0, wallPinned: false, respawnAt: 0 };
}

function addPolice(s) {
  s.cars.push(chassis(s, `ai${++s.police}`, -1, 1, true));
}

function checkpoint(s) {
  const choices = s.streets.filter(p => !s.checkpoint || distance(p, s.checkpoint) > 40);
  s.checkpoint = { ...choices[Math.floor(random(s) * choices.length)], r: 34 };
}

export function setup(s, players, round) {
  const n = players.length, teams = s.mode === 'cops-and-robbers', tag = s.mode === 'freeze-tag';
  const cops = teams ? Math.max(1, Math.round(n * 0.35)) : tag ? (n > 8 ? 2 : 1) : 0;
  for (const [index, player] of players.entries()) {
    const cop = (index - (round - 1) % n + n) % n < cops;
    s.cars.push(chassis(s, player.id, player.look, cop ? 1 : 0));
    s.roster.push({ id: player.id, side: cop ? 'cops' : 'robbers', score: 0 });
  }
  if (teams) { s.team = { robbers: 0, cops: 0, winner: null }; checkpoint(s); }
  if (s.mode === 'drift-king') s.crown = { x: s.w / 2, y: s.h / 2, holder: null };
  const patrol = s.mode === 'getaway' ? (n <= 4 ? 2 : n <= 10 ? 3 : 4) : s.crown ? 2 : +(teams && n <= 4);
  for (let i = 0; i < patrol; i++) addPolice(s);
}

export function dispatch(s, car, input) {
  if (car.role !== 2 || car.cd || s.crown) return;
  const aim = { x: clamp(car.x + input.x * 260, 11, s.w - 11), y: clamp(car.y + input.y * 260, 11, s.h - 11) };
  // Anchor the siren on a navigable intersection, even when aiming through a building.
  const spot = s.streets.reduce((a, b) => distance(a, aim) <= distance(b, aim) ? a : b);
  s.pings.push({ ...spot, by: car.id, ms: 3500 }); car.cd = 4000;
  emit(s, 'dispatch', spot, car.id);
}

export function dropCrown(s, c) {
  if (!s.crown || s.crown.holder !== c.id) return;
  s.crown = { x: c.x, y: c.y, holder: null }; c.role = 0;
  emit(s, 'crown', c, c.id);
}

function takeCrown(s, c) {
  c.role = 3; s.crown.holder = c.id; c.score += 50; s.stealAt = s.elapsedMs + 1200;
  emit(s, 'crown', c, c.id);
}

function bust(s, victim, cop) {
  dropCrown(s, victim);
  emit(s, 'bust', victim, cop.id, victim.id); awardDispatch(s, victim);
  victim.pinMs = victim.button = victim.boostMs = victim.boostCharge = 0;
  victim.drift = false; victim.vx = victim.vy = victim.stickX = victim.stickY = 0;
  if (s.mode === 'freeze-tag') {
    if (!s.cars.some(c => c !== victim && driver(c))) s.lastDriver = victim.id;
    victim.role = 1; victim.hp = 3; victim.spinMs = 400; cop.score += 120;
  } else {
    victim.role = 2; victim.hp = victim.cd = victim.spinMs = 0;
    if (s.team) { s.team.cops++; cop.score += 150; }
    if (s.crown) victim.respawnAt = s.elapsedMs + 2500;
  }
}

export function contact(s, attacker, victim, speed, pins) {
  if (!driver(victim) || attacker.spinMs || attacker.role === 2) return;
  if (victim.role === 3 && driver(attacker) && s.elapsedMs >= s.stealAt && speed > (attacker.boostMs ? 45 : 100)) {
    victim.role = 0; takeCrown(s, attacker); return;
  }
  if (attacker.role !== 1 || victim.grace) return;
  if (victim.wallPinned && Math.hypot(victim.vx, victim.vy) < 70) pins.set(victim, attacker);
  if (speed < (attacker.boostMs ? 45 : 96)) return;
  emit(s, 'ram', victim, attacker.id, victim.id); victim.grace = 900;
  if (s.team) attacker.score += 20;
  if (--victim.hp <= 0) bust(s, victim, attacker);
}

export function finishPins(s, pins, dt) {
  for (const c of s.cars) {
    c.pinMs = driver(c) && pins.has(c) ? c.pinMs + dt : 0;
    if (c.pinMs >= 1000) bust(s, c, pins.get(c));
  }
}

export function updateModes(s, previous) {
  if (s.mode === 'getaway') {
    for (const at of [25000, 50000]) if (previous < at && s.elapsedMs >= at && s.police < 6) addPolice(s);
  }
  for (const c of s.cars) {
    if (s.crown && c.role === 2 && s.elapsedMs >= c.respawnAt) {
      Object.assign(c, chassis(s, c.id, c.look, 0), { score: c.score, grace: 900 });
    }
    if (!driver(c)) continue;
    const beats = period => Math.floor(s.elapsedMs / period) - Math.floor(previous / period);
    if (s.mode === 'getaway') c.score += beats(250);
    if (s.mode === 'freeze-tag') c.score += 2 * beats(250);
    if (s.crown) {
      if (!s.crown.holder && distance(c, s.crown) < 24) takeCrown(s, c);
      if (s.crown.holder === c.id) { s.crown.x = c.x; s.crown.y = c.y; c.score += 4 * beats(200); }
    }
    if (s.checkpoint && distance(c, s.checkpoint) <= s.checkpoint.r) {
      emit(s, 'checkpoint', c, c.id); c.score += 120; s.team.robbers++; checkpoint(s);
    }
  }
  const live = s.cars.filter(driver);
  if (s.mode === 'getaway' && live.length === 1 && s.roster.length >= 3) {
    s.lastAt ??= s.elapsedMs;
    if (s.elapsedMs - s.lastAt >= 3000 || s.elapsedMs >= DURATION) { live[0].score += 200; s.over = true; }
  }
  s.over ||= s.elapsedMs >= DURATION || (!s.crown && !live.length) || !s.cars.some(c => !c.ai);
  if (s.team && s.over) s.team.winner = live.length && s.team.robbers >= s.team.cops ? 'robbers' : 'cops';
}
