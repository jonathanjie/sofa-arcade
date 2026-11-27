import { createArcadeLoop, createTimeline } from '../../kit/animation.mjs';
import { LOOKS } from '../../looks.mjs';
import { balloon, burst, cloud, createPlaneArt, crown, dart, hoop, paintSky, scarf, thermal } from './art.mjs';

const modes = {
  'ring-rally': ['Bank through glowing sky rings. Gold rings score triple!', 'Ring Rally'],
  'balloon-pop': ['Fire paper darts or swoop through drifting balloons to pop them.', 'Balloon Pop'],
  'sky-tag': ['Snatch the Sun Crown and stay aloft—tag the leader with a dart to steal it.', 'Sky Tag'],
};
export const paperSkiesPlayHintForMode = mode => (modes[mode] ?? modes['ring-rally'])[0];
export function paperSkiesResultSummary(view) {
  const scene = view.state ?? view.scene;
  const mode = (modes[scene?.mode ?? view.mode] ?? modes['ring-rally'])[1];
  const standings = view.results?.length ? view.results : (view.standings ?? scene?.planes ?? []);
  if (!standings.length) return `A soft landing after ${mode}.`;
  const best = Math.max(...standings.map(p => p.score));
  const leaders = standings.filter(p => p.score === best);
  if (leaders.length > 1) return `${leaders.length} pilots share the ${mode} lead with ${best}!`;
  const pilot = leaders[0];
  const member = view.roster?.find(p => p.id === (pilot.playerId ?? pilot.id));
  return `${member?.name ?? pilot.name ?? LOOKS[pilot.look]?.name ?? 'Our pilot'} wins ${mode} with ${best}. Nice flying!`;
}

function glide(previous, scene, t, lerp) {
  if (previous.mode !== scene.mode) return scene;
  const planes = scene.planes.map((p, i) => {
    const old = previous.planes[i]?.id === p.id ? previous.planes[i] : previous.planes.find(other => other.id === p.id);
    // Do not interpolate across a world wrap or a respawn.
    if (!old || Math.abs(old.x - p.x) > scene.w / 2 || Math.abs(old.y - p.y) > scene.h / 2) return p;
    const turn = p.a - old.a;
    return { ...p, x: lerp(old.x, p.x, t), y: lerp(old.y, p.y, t), a: old.a + t * Math.atan2(Math.sin(turn), Math.cos(turn)) };
  });
  return { ...scene, planes };
}

export function mountPaperSkiesTv(canvas, { reducedMotion = false } = {}) {
  const c = canvas.getContext('2d', { alpha: false });
  const sky = canvas.ownerDocument.createElement('canvas');
  const drawPlane = createPlaneArt(canvas.ownerDocument);
  const timeline = createTimeline();
  let safe = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  let roster = new Map(), lastRound, receivedAt, disposed = false, still = false;
  canvas.setAttribute('aria-label', 'Paper Skies flight board');

  function update(view) {
    const scene = view.scene ?? view.state;
    if (disposed || !scene || view.round < lastRound) return;
    if (sky.width !== scene.w || sky.height !== scene.h) {
      sky.width = scene.w; sky.height = scene.h;
      paintSky(sky.getContext('2d'), scene.w, scene.h);
    }
    roster = new Map((view.roster ?? []).map(p => [p.id, p.name]));
    lastRound = view.round;
    receivedAt = performance.now();
    timeline.push(scene, lastRound, receivedAt);
  }
  function draw(at, reduced = still) {
    if (disposed) return;
    const s = timeline.sample(at, glide, reduced);
    if (!s) return;
    const scale = Math.min(safe.width / s.w, safe.height / s.h);
    if (!(scale > 0)) return;
    const elapsed = s.elapsedMs + Math.max(0, at - receivedAt);
    const time = reduced ? 0 : elapsed;
    c.fillStyle = '#424c58';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.translate(safe.x + (safe.width - scale * s.w) / 2, safe.y + (safe.height - scale * s.h) / 2);
    c.scale(scale, scale);
    c.beginPath(); c.rect(0, 0, s.w, s.h); c.clip();
    c.drawImage(sky, 0, 0);
    for (const item of s.thermals) thermal(c, item, time);
    for (const item of s.clouds) cloud(c, item);
    for (const item of s.rings) hoop(c, item, time);
    for (const item of s.balloons) balloon(c, item);
    for (const item of s.crowns) if (item.holder == null) crown(c, item.x, item.y, time);
    for (const item of s.darts) dart(c, item);
    c.font = 'bold 16px system-ui'; c.textAlign = 'center';
    for (const p of s.planes) {
      drawPlane(c, p, time, reduced);
      if (p.crown || s.crowns.some(item => item.holder === p.id)) crown(c, p.x, p.y - 35, time);
      const label = `${(roster.get(p.id) ?? LOOKS[p.look].name).slice(0, 9)} · ${p.score}`;
      const width = Math.min(112, c.measureText(label).width + 16);
      const x = Math.max(width / 2, Math.min(s.w - width / 2, p.x));
      const y = p.y > s.h - 52 ? p.y - 45 : p.y + 23;
      c.fillStyle = '#334155'; c.beginPath(); c.roundRect(x - width / 2, y, width, 22, 9); c.fill();
      c.fillStyle = scarf(p.look); c.fillText(label, x, y + 16, width - 10);
    }
    if (!reduced) for (const event of s.events) burst(c, event, elapsed - event.at);
    c.restore();
  }
  const loop = createArcadeLoop(draw, value => { still = value; });
  loop.setReducedMotion(reducedMotion);
  return {
    update, push: update, draw,
    resize({ width, height, safe: bounds }) {
      if (disposed) return;
      canvas.width = width; canvas.height = height;
      safe = bounds ?? { x: 0, y: 0, width, height };
    },
    setReducedMotion: loop.setReducedMotion,
    dispose() { disposed = true; loop.dispose(); sky.width = sky.height = 0; },
  };
}
