import { clamp, distance, emit, random, site, TAU } from './world.mjs';
import { sampleHeight, wrapCoord } from './terrain.mjs';

export const modes = [{ id: 'ring-rally', label: 'Ring Rally' }, { id: 'balloon-pop', label: 'Balloon Pop' },
  { id: 'sky-tag', label: 'Sky Tag' }];

function chain(s, start = site(s), heading = random(s) * TAU) {
  const chainId = ++s.serial, bend = random(s) < 0.5 ? -1 : 1;
  let { x, y } = start;
  for (let i = 0; i < 5; i++) {
    const a = heading + i * bend * 0.24;
    x = wrapCoord(x + 21 * Math.cos(a)); y = wrapCoord(y + 21 * Math.sin(a));
    const z = clamp(start.z + 8 * Math.sin(i * Math.PI / 4), Math.max(14, sampleHeight(s.terrain, x, y) + 4), 52);
    s.suns.push({ id: ++s.serial, chainId, x, y, z, gold: +(i === 4) });
  }
}
function balloon(s, pts) {
  return { ...site(s), id: ++s.serial, r: 9 - pts, pts, col: pts === 3 ? 3 : Math.floor(random(s) * 3) };
}
export function populate(s) {
  if (s.mode === 'ring-rally') {
    const lead = s.planes[0];
    if (s.planes.length === 1) chain(s, lead, lead.a);
    else chain(s);
    chain(s); chain(s);
  }
  if (s.mode === 'balloon-pop') for (let i = 0; i < 12; i++) s.balloons.push(balloon(s, 1 + i % 3));
  if (s.mode === 'sky-tag') for (let i = 0; i < (s.planes.length >= 10 ? 2 : 1); i++) {
    s.crowns.push({ ...site(s), id: ++s.serial, holder: null, protectedUntil: 0 });
  }
  drift(s, 0);
}
export function drift(s, sec) {
  const count = 6 + 3 * (s.lv - 1);
  while (s.storms.length < count) s.storms.push({ ...site(s), id: ++s.serial });
  function move(item, speed) {
    const phase = item.id + s.elapsedMs / 4500;
    item.x = wrapCoord(item.x + speed * Math.cos(phase) * sec);
    item.y = wrapCoord(item.y + speed * Math.sin(phase) * sec);
    item.z = clamp(item.z + Math.sin(phase * 0.7) * sec, sampleHeight(s.terrain, item.x, item.y) + 4, 58);
  }
  if (s.lv >= 2) for (const storm of s.storms) move(storm, 3);
  for (const bl of s.balloons) move(bl, 5);
}
export function collect(s, dt) {
  for (const p of s.planes) {
    s.suns = s.suns.filter(sun => {
      if (distance(p, sun) >= 16) return true;
      p.suns++; p.combo = Math.min(5, p.combo + 1); p.lastSun = s.elapsedMs;
      if (p.loopMs) p.loopSun = true;
      const points = (sun.gold ? 20 : 10) * p.combo;
      p.score += points; p.fuel = Math.min(100, p.fuel + 16);
      emit(s, 'sun', sun, p.id, sun.id, `+${points}`);
      return false;
    });
    for (const [i, bl] of s.balloons.entries()) {
      if (distance(p, bl) >= bl.r + 10) continue;
      p.popped++; p.score += bl.pts * 10; p.fuel = Math.min(100, p.fuel + 12);
      emit(s, 'pop', bl, p.id, bl.id, `+${bl.pts * 10}`);
      s.balloons[i] = balloon(s, bl.pts);
    }
  }
  if (s.mode === 'ring-rally') {
    while (s.suns.length <= 10) {
      const counts = new Map();
      for (const sun of s.suns) counts.set(sun.chainId, (counts.get(sun.chainId) ?? 0) + 1);
      if (counts.size >= 3) {
        const [shortest] = [...counts].sort((a, b) => a[1] - b[1])[0];
        s.suns = s.suns.filter(sun => sun.chainId !== shortest);
      }
      chain(s);
    }
  }
  for (const crown of s.crowns) {
    let holder = s.planes.find(p => p.id === crown.holder);
    if (holder) Object.assign(crown, { x: holder.x, y: holder.y, z: holder.z });
    if (s.elapsedMs >= crown.protectedUntil) {
      const next = s.planes.find(p => !p.crown && distance(p, crown) < 18);
      if (next) {
        if (holder) holder.crown = false;
        holder = next; next.crown = true;
        Object.assign(crown, { holder: next.id, x: next.x, y: next.y, z: next.z, protectedUntil: s.elapsedMs + 1200 });
        emit(s, 'crown', next, next.id, crown.id);
      }
    }
    if (holder) holder.score += 10 * dt / 1000;
  }
}
