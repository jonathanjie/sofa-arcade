import { bearing, clamp, distance, emit, target, TAU } from './world.mjs';
import { sampleHeight, SEA_LEVEL, wrapCoord } from './terrain.mjs';

const ROLL = 550, LOOP = 950;
const countdown = (ms, dt) => Math.max(0, ms - dt);

function botControl(s, p) {
  const goal = target(s, p);
  if (!goal || p.crown) return { x: 0.45, y: 0, b: 0 };
  return { x: clamp(bearing(p, goal) * 1.8, -1, 1), y: clamp((p.z - goal.z) / 8, -1, 1), b: +(p.fuel > 65) };
}

function weather(s, p) {
  for (const storm of s.storms) {
    const d = distance(p, storm), pass = p.stormPass[storm.id];
    if (d < 14) {
      if (p.rollMs || p.loopMs) {
        if (pass !== 'dodge' && pass !== 'hit') {
          p.tricks++; p.score += 25;
          emit(s, 'dodge', p, p.id, storm.id, '+25');
          p.stormPass[storm.id] = 'dodge';
        }
      } else if (!p.wobbleMs) {
        p.fuel = Math.max(0, p.fuel - 20); p.combo = 1; p.wobbleMs = 650;
        emit(s, 'storm', p, p.id, storm.id);
        p.stormPass[storm.id] = 'hit';
      } else if (!pass) p.stormPass[storm.id] = 'hit';
    } else if (d < 24) {
      if (!pass) p.stormPass[storm.id] = 'near';
    } else if (pass) {
      // Resolve on exit: a direct hit must not also earn a close-call bonus.
      if (pass === 'near') { p.score += 15; emit(s, 'close', p, p.id, storm.id, '+15'); }
      delete p.stormPass[storm.id];
    }
  }
}

function groundContact(s, p, dt) {
  const ground = sampleHeight(s.terrain, p.x, p.y);
  if (!p.loopMs && p.z < ground + 3) {
    p.z = ground + 10; p.fuel = Math.max(0, p.fuel - 18); p.combo = 1; p.wobbleMs = 600;
    emit(s, 'crash', p, p.id);
  }
  if (ground <= SEA_LEVEL && p.z <= 12.5 && !p.wobbleMs) {
    p.skimMs += dt;
    if (p.skimMs >= 500) { p.score += 2; p.skimMs -= 500; emit(s, 'skim', p, p.id, undefined, '+2'); }
  } else p.skimMs = 0;
}

// Buttons are rising-edge actions, not held commands. Latch short taps even
// when a press and its release arrive together in the same simulation tick.
export function inputPlane(p, input) {
  if (input.r && !p.control.r) p.wantRoll = true;
  if (input.l && !p.control.l) p.wantLoop = true;
  p.control = { ...input };
}

export function fly(s, p, dt) {
  const sec = dt / 1000, control = p.ai ? botControl(s, p) : p.control;
  p.rollCd = countdown(p.rollCd, dt); p.loopCd = countdown(p.loopCd, dt);
  p.wobbleMs = countdown(p.wobbleMs, dt);
  if (s.elapsedMs - p.lastSun > 4500) p.combo = 1;
  if (!p.stallMs && !p.rollMs && !p.loopMs) {
    if (p.wantLoop && !p.loopCd) { p.loopMs = LOOP; p.entryZ = p.z; p.loopSun = false; }
    else if (p.wantRoll && !p.rollCd) { p.rollMs = ROLL; p.rollDir = Math.sign(control.x || p.bank) || 1; }
  }
  p.wantLoop = p.wantRoll = false;
  p.bank += (control.x - p.bank) * Math.min(1, sec * 6);
  p.a = (p.a + p.bank * 2.4 * sec) % TAU;
  p.boosting = !!control.b && !p.stallMs;
  p.pitch = p.stallMs ? -0.18 : -control.y;
  p.spd = p.stallMs ? 22 : 38 + (s.lv - 1) * 5 + (p.boosting ? 22 : 0) - p.pitch * 4;
  let forward = p.spd * sec, side = 0;
  if (p.loopMs) {
    const old = 1 - p.loopMs / LOOP;
    p.loopPhase = Math.min(1, old + dt / LOOP);
    p.pitch = TAU * p.loopPhase;
    forward = p.spd * LOOP / (1000 * TAU) * (Math.sin(p.pitch) - Math.sin(TAU * old));
    p.z = p.entryZ + Math.min(10, (68 - p.entryZ) / 2) * (1 - Math.cos(p.pitch));
  } else p.z = clamp(p.z + p.pitch * 24 * sec, 8, 68);
  if (p.rollMs) {
    const old = 1 - p.rollMs / ROLL;
    p.rollPhase = Math.min(1, old + dt / ROLL);
    p.rollAngle = p.rollDir * TAU * p.rollPhase;
    side = p.rollDir * 9 * (Math.cos(Math.PI * old) - Math.cos(Math.PI * p.rollPhase));
  }
  p.x = wrapCoord(p.x + Math.cos(p.a) * forward - Math.sin(p.a) * side);
  p.y = wrapCoord(p.y + Math.sin(p.a) * forward + Math.cos(p.a) * side);
  if (!p.stallMs) p.fuel = Math.max(0, p.fuel - (2.4 + (s.lv - 1) * 0.5 + (p.boosting ? 4.5 : 0)) * sec);
  groundContact(s, p, dt);
  weather(s, p);
  if (p.stallMs) {
    p.stallMs = countdown(p.stallMs, dt);
    if (!p.stallMs) { p.fuel = 55; p.combo = 1; }
  } else if (!p.fuel) {
    p.stallMs = 1500; p.combo = 1; p.boosting = false; emit(s, 'stall', p, p.id);
  }
}

// Resolve trick completion after pickups so the last loop tick can earn +50.
export function finishTricks(s, p, dt) {
  if (p.rollMs && !(p.rollMs = countdown(p.rollMs, dt))) {
    p.rollCd = 700; p.rollPhase = p.rollAngle = 0;
  }
  if (p.loopMs && !(p.loopMs = countdown(p.loopMs, dt))) {
    const points = p.loopSun ? 50 : 30;
    p.loopCd = 1200; p.loopPhase = p.pitch = 0; p.score += points; p.tricks++;
    emit(s, 'loop', p, p.id, undefined, `+${points}`);
  }
}
