const FRAME_INTERVAL_MS = 50;
const MAX_EFFECTS = 96;
const lerp = (from, to, amount) => from + (to - from) * amount;

/** Present one snapshot behind the host, without extrapolating. */
export function createTimeline({ intervalMs = FRAME_INTERVAL_MS } = {}) {
  let previous;
  let current;
  let arrivedAt;
  let currentKey;
  let displayed;
  return {
    push(scene, key, at) {
      if (at < arrivedAt || (typeof key === 'number' && typeof currentKey === 'number' && key < currentKey)) return;
      const sameRound = key === currentKey;
      const inTransition = previous != null && at - arrivedAt < intervalMs;
      previous = sameRound ? (inTransition ? displayed ?? previous : current) : null;
      current = scene;
      currentKey = key;
      arrivedAt = at;
      displayed = undefined;
    },
    sample(at, interpolate, reduced = false) {
      if (previous == null || current == null || reduced) {
        displayed = current;
        return current;
      }
      const amount = Math.max(0, Math.min(1, (at - arrivedAt) / intervalMs));
      displayed = amount === 1 ? current : interpolate(previous, current, amount, lerp);
      return displayed;
    },
  };
}

export function createArcadeLoop(draw, onMotionChange = () => {}) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let request;
  let disposed = false;
  let appReduced = false;
  const reduced = () => media.matches || appReduced;
  function drawFrame(at) {
    request = undefined;
    if (document.hidden || disposed) return;
    draw(at, reduced());
    updateVisibility();
  }
  function updateVisibility() {
    if (document.hidden || disposed) {
      if (request !== undefined) cancelAnimationFrame(request);
      request = undefined;
    } else if (request === undefined) request = requestAnimationFrame(drawFrame);
  }
  const update = () => onMotionChange(reduced());
  media.addEventListener('change', update);
  document.addEventListener('visibilitychange', updateVisibility);
  updateVisibility();
  return {
    setReducedMotion(value) {
      appReduced = Boolean(value);
      update();
    },
    dispose() {
      disposed = true;
      updateVisibility();
      document.removeEventListener('visibilitychange', updateVisibility);
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
      if (id) {
        pulses.delete(id);
        pulses.set(id, time + 120);
        if (pulses.size > MAX_EFFECTS) pulses.delete(pulses.keys().next().value);
      }
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
