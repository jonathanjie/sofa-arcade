import { distance, emit, openSite, random, recharge, TAU } from './world.mjs';

export const modes = [ { id: 'ring-rally', label: 'Ring Rally' }, { id: 'balloon-pop', label: 'Balloon Pop' },
  { id: 'sky-tag', label: 'Sky Tag' } ];

function ring(s, gold) {
  return { id: ++s.serial, ...openSite(s, [...s.planes, ...s.rings], 95), r: 30, a: random(s) * TAU, gold };
}
function balloon(s, pts) {
  return { id: ++s.serial, ...openSite(s, [...s.planes, ...s.balloons], 70), r: [0, 22, 18, 15][pts],
    pts, col: pts === 3 ? 3 : Math.floor(random(s) * 3), phase: random(s) * TAU };
}
export function populate(s) {
  if (s.mode === 'ring-rally') for (let i = 0; i < 4; i++) s.rings.push(ring(s, +(i === 0)));
  if (s.mode === 'balloon-pop') for (const pts of [1, 1, 1, 1, 1, 1, 2, 2, 2, 3]) s.balloons.push(balloon(s, pts));
  if (s.mode === 'sky-tag') {
    const count = s.planes.length >= 10 ? 2 : 1;
    for (let i = 0; i < count; i++) s.crowns.push({ id: ++s.serial,
      x: s.w / 2 + (i - (count - 1) / 2) * 170, y: s.h / 2, holder: null });
  }
}

function awardCrown(s, crown, next, old) {
  if (old) { old.crown = false; old.wobbleMs = Math.max(old.wobbleMs, 350); }
  next.crown = true;
  next.score += old ? 3 : 2;
  next.stealCd = 1200;
  Object.assign(crown, { holder: next.id, x: next.x, y: next.y });
  emit(s, 'crown', next, next.id, crown.id);
}
export function steal(s, attacker, holder) {
  if (!holder.crown || holder.stealCd > 0 || attacker.crown) return;
  awardCrown(s, s.crowns.find(c => c.holder === holder.id), attacker, holder);
}
export function pop(s, index, plane) {
  const bl = s.balloons[index];
  plane.score += bl.pts;
  plane.popped++;
  emit(s, 'pop', bl, plane.id, bl.id);
  s.balloons[index] = balloon(s, bl.pts);
}
export function drift(s, seconds) {
  for (const bl of s.balloons) {
    const phase = bl.phase + s.elapsedMs / 2700;
    bl.x += (13 + 8 * Math.cos(phase)) * seconds;
    bl.y += 12 * Math.sin(phase) * seconds;
    if (bl.x > s.w - bl.r) bl.x = bl.r;
    if (bl.y < bl.r) bl.y = s.h - bl.r;
    else if (bl.y > s.h - bl.r) bl.y = bl.r;
  }
}
export function collect(s) {
  for (const p of s.planes) {
    for (const [i, rg] of s.rings.entries()) {
      if (distance(p, rg) > rg.r + 14) continue;
      p.streak = Math.min(5, p.streak + 1);
      p.score += (rg.gold ? 3 : 1) + +(p.streak >= 3);
      recharge(p, 35);
      emit(s, 'ring', rg, p.id, rg.id);
      s.rings[i] = ring(s, rg.gold);
    }
    for (const [i, bl] of s.balloons.entries()) if (distance(p, bl) <= bl.r + 14) pop(s, i, p);
  }
  for (const crown of s.crowns) {
    const holder = s.planes.find(p => p.id === crown.holder);
    if (holder) { crown.x = holder.x; crown.y = holder.y; }
    const next = s.planes.find(p => !p.crown && distance(p, crown) <= 34);
    if (!next) continue;
    if (holder) steal(s, next, holder);
    else awardCrown(s, crown, next);
  }
}
