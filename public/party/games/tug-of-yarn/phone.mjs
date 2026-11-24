import { mountButton } from '../../phone/controls.mjs';
import {
  BEATS, HIT_WINDOW_MS, PERFECT_MS, TEAMS, closestBeat, createBeatClock, timingGrade,
} from './rhythm.mjs';

const FEEDBACK_MS = 600;
const MAX_HALF_TRIP_MS = 75;

async function measureHalfTrip(signal) {
  const code = new URLSearchParams(location.search).get('code');
  if (!code || !/^[A-Z0-9]{6}$/.test(code)) return 0;
  let fastest = Infinity;
  for (let attempt = 0; attempt < 3; attempt++) {
    const startedAt = performance.now();
    const response = await fetch(`/api/party/rooms/${code}`, { cache: 'no-store', signal });
    if (!response.ok) return 0;
    await response.json();
    fastest = Math.min(fastest, performance.now() - startedAt);
  }
  return Math.min(MAX_HALF_TRIP_MS, fastest / 2);
}

export function mountTugOfYarnPhone(root, { input }) {
  root.innerHTML = '<div class="tug-pad-zone"></div>';
  const document = root.ownerDocument;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./phone.css', import.meta.url).href;
  root.prepend(style);
  const zone = root.querySelector('.tug-pad-zone');
  const button = mountButton(zone, { label: 'Tap on the beat', onPress: event => {
    if (event.detail === 0) press();
  } });
  const pad = zone.querySelector('button');
  pad.dataset.tugPad = '';
  pad.innerHTML = `<span class="tug-team"></span>
    <span class="tug-dial" aria-hidden="true"><span class="tug-ring"></span><span class="tug-target"></span></span>
    <strong class="tug-action" aria-hidden="true">TAP</strong><output class="tug-grade"></output>`;
  pad.addEventListener('pointerdown', event => {
    if (event.isPrimary && event.button === 0) press();
  });
  const team = pad.querySelector('.tug-team');
  const ring = pad.querySelector('.tug-ring');
  const grade = pad.querySelector('.tug-grade');
  const action = pad.querySelector('.tug-action');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const clock = createBeatClock();
  const probe = new AbortController();
  let state;
  let enabled = false;
  let halfTrip = 0;
  let pressedBeat;
  let shownBeat;
  let animation;
  let timer;
  let feedbackTimer;

  void measureHalfTrip(probe.signal).then(value => { halfTrip = value; }).catch(() => { /* Snapshot timing still works. */ });

  function feedback(text) {
    grade.textContent = text;
    pad.dataset.grade = text;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { grade.textContent = ''; pad.dataset.grade = ''; }, FEEDBACK_MS);
  }

  function press() {
    if (!enabled) return;
    const elapsed = Math.round(clock.elapsed(performance.now()));
    if (elapsed < state.s) return;
    const beat = BEATS[closestBeat(elapsed - state.s)] + state.s;
    const result = timingGrade(Math.abs(beat - elapsed));
    if (beat === pressedBeat) return;
    if (result !== 'Miss' && input({ kind: 'tap', at: elapsed })) pressedBeat = beat;
    feedback(result);
  }

  function stopRing() {
    clearTimeout(timer);
    animation?.cancel();
    animation = null;
    shownBeat = undefined;
  }

  function paintRhythm() {
    clearTimeout(timer);
    if (!enabled) return;
    const elapsed = clock.elapsed(performance.now()) - state.s;
    const index = closestBeat(elapsed);
    const beat = BEATS[index];
    const delta = elapsed - beat;
    const upcoming = delta > HIT_WINDOW_MS ? index + 1 : index;
    const next = BEATS[upcoming];
    const step = elapsed < 0 ? 'rest' : Math.abs(delta) <= PERFECT_MS ? 'perfect'
      : Math.abs(delta) <= HIT_WINDOW_MS ? 'good' : 'wait';
    pad.dataset.window = step;
    const label = step === 'rest' ? 'READY' : 'TAP';
    if (action.textContent !== label) action.textContent = label;
    const key = next === undefined ? null : next + state.s;
    if (key !== shownBeat) {
      animation?.cancel();
      animation = null;
      shownBeat = key;
      if (key !== null && !motion.matches) {
        const from = upcoming ? BEATS[upcoming - 1] + HIT_WINDOW_MS : 0;
        animation = ring.animate([{ transform: 'scale(1.86)' }, { transform: 'scale(1)' }],
          { duration: next - from, fill: 'both' });
      }
    }
    if (animation) {
      const from = upcoming ? BEATS[upcoming - 1] + HIT_WINDOW_MS : 0;
      animation.currentTime = Math.max(0, Math.min(next - from, elapsed - from));
      if (elapsed < from || elapsed >= next) animation.pause();
      else animation.play();
    }

    const boundaries = elapsed < 0 ? [0] : [next - HIT_WINDOW_MS, next - PERFECT_MS, next + PERFECT_MS + 1,
      next + HIT_WINDOW_MS + 1];
    const boundary = boundaries.find(at => at > elapsed);
    if (boundary !== undefined) timer = setTimeout(paintRhythm, Math.ceil(boundary - elapsed));
  }

  function motionChanged() { stopRing(); paintRhythm(); }
  motion.addEventListener('change', motionChanged);

  return {
    update(next, active) {
      if (next && next.b !== state?.b) {
        team.textContent = `Team ${TEAMS[next.b].name}`;
        pad.dataset.team = String(next.b);
      }
      if (!active || !next) {
        if (enabled) {
          clock.reset();
          pressedBeat = undefined;
          stopRing();
          clearTimeout(feedbackTimer);
          grade.textContent = '';
          pad.dataset.grade = '';
        }
        enabled = false;
        pad.dataset.window = 'rest';
        action.textContent = 'READY';
      } else {
        if (enabled && next.t < state.t) {
          clock.reset();
          pressedBeat = undefined;
          stopRing();
        }
        enabled = true;
        clock.sync(next.t, performance.now(), halfTrip);
      }
      state = next;
      button.setEnabled(enabled);
      if (enabled) paintRhythm();
    },
    dispose() {
      probe.abort();
      stopRing();
      clearTimeout(feedbackTimer);
      motion.removeEventListener('change', motionChanged);
      button.dispose();
      root.replaceChildren();
    },
  };
}
