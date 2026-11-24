const FRAME_INTERVAL_MS = 50;
const MAX_EFFECTS = 96;
const lerp = (from, to, amount) => from + (to - from) * amount;

/** Present one snapshot behind the host, without extrapolating. */
export function createTimeline({ intervalMs = FRAME_INTERVAL_MS } = {}) {
  let previous;
  let current;
  let arrivedAt;
  let currentKey;
  return {
    push(scene, key, at) {
      previous = key === currentKey ? current : null;
      current = scene;
      currentKey = key;
      arrivedAt = at;
    },
    sample(at, interpolate, reduced = false) {
      if (!previous || !current || reduced) return current;
      const amount = Math.max(0, Math.min(1, (at - arrivedAt) / intervalMs));
      return interpolate(previous, current, amount, lerp);
    },
  };
}

export function createArcadeLoop(draw, onMotionChange = () => {}) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let request;
  let appReduced = false;
  const reduced = () => media.matches || appReduced;
  function drawFrame(at) {
    draw(at, reduced());
    request = requestAnimationFrame(drawFrame);
  }
  const update = () => onMotionChange(reduced());
  media.addEventListener('change', update);
  request = requestAnimationFrame(drawFrame);
  return {
    setReducedMotion(value) {
      appReduced = Boolean(value);
      update();
    },
    dispose() {
      cancelAnimationFrame(request);
      media.removeEventListener('change', update);
    },
  };
}

export function createJuice() {
  let freezeUntil = 0;
  let shakeUntil = 0;
  let particles = [];
  let labels = [];
  const pulses = new Map();
  let reduced = false;
  function clear() {
    freezeUntil = shakeUntil = 0;
    particles = [];
    labels = [];
    pulses.clear();
  }
  return {
    clear,
    setReducedMotion(value) {
      reduced = value;
      if (reduced) clear();
    },
    impact({ x, y, colour, label, id, time, strong = false }) {
      if (reduced) return;
      const count = strong ? 28 : 7;
      for (let index = 0; index < count; index++) {
        const angle = index * 2.4;
        const speed = (strong ? 135 : 60) + (index % 7) * 19;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 50,
          colour: index % 3 ? colour : '#fff1ca', time, life: strong ? 730 : 360 });
      }
      particles = particles.slice(-MAX_EFFECTS);
      if (label) {
        labels.push({ x, y, label, time });
        labels = labels.slice(-16);
      }
      if (id) pulses.set(id, time + 120);
      if (strong) {
        freezeUntil = time + 85;
        shakeUntil = time + 220;
      }
    },
    frozen(time) { return time < freezeUntil; },
    offset(time) {
      const strength = Math.max(0, (shakeUntil - time) / 220) * 7;
      return [Math.round(Math.sin(time / 13) * strength), Math.round(Math.cos(time / 17) * strength)];
    },
    squash(id, time) {
      const end = pulses.get(id);
      if (end > time) return end - time > 60 ? 1 : -1;
      pulses.delete(id);
      return 0;
    },
    draw(context, time) {
      for (const [id, until] of pulses) if (time >= until) pulses.delete(id);
      particles = particles.filter(particle => time - particle.time < particle.life);
      labels = labels.filter(label => time - label.time < 480);
      for (const particle of particles) {
        const age = (time - particle.time) / 1000;
        context.globalAlpha = 1 - age * 1000 / particle.life;
        context.fillStyle = particle.colour;
        context.fillRect(Math.round(particle.x + age * particle.vx),
          Math.round(particle.y + age * particle.vy + age * age * 190), 6, 6);
      }
      context.font = '900 27px system-ui';
      context.textAlign = 'center';
      for (const label of labels) {
        const elapsed = time - label.time;
        context.globalAlpha = 1 - elapsed / 480;
        context.fillStyle = '#fff1ca';
        context.fillText(label.label, label.x, label.y - elapsed / 9);
      }
      context.globalAlpha = 1;
      context.textAlign = 'start';
    },
  };
}

export function createSoundHooks(sound, cues) {
  return event => {
    if (Object.hasOwn(cues, event)) sound.effect(cues[event]);
  };
}
