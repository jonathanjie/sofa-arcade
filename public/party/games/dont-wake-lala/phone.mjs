import { createCatIcon } from './art.mjs';

const HOLD_REFRESH_MS = 100;
const MOTION_INTERVAL_MS = 150;
const ACCELERATION_THRESHOLD = 2.5; // m/s², excluding gravity
const ROTATION_THRESHOLD = 35; // degrees/s
const SIGNAL_LABELS = { sleep: 'Asleep', ear: 'Ear twitch', blink: 'Eye opening', look: 'Freeze' };
const HOLD_KEYS = new Set([' ', 'Enter']);

function vectorLength(values) {
  return values.every(Number.isFinite) ? Math.hypot(...values) : 0;
}

function mountStrictMode(button, input) {
  const window = button.ownerDocument.defaultView;
  const sensor = window.DeviceMotionEvent;
  button.hidden = !window.isSecureContext || !sensor;
  let optedIn = false;
  let enabled = false;
  let disposed = false;
  let lastSignal = -Infinity;

  function onMotion(event) {
    if (!enabled) return;
    const now = window.performance.now();
    if (now - lastSignal < MOTION_INTERVAL_MS) return;
    const { acceleration, rotationRate } = event;
    const accelerationSize = acceleration ? vectorLength([acceleration.x, acceleration.y, acceleration.z]) : 0;
    const rotationSize = rotationRate ? vectorLength([rotationRate.alpha, rotationRate.beta, rotationRate.gamma]) : 0;
    if (accelerationSize < ACCELERATION_THRESHOLD && rotationSize < ROTATION_THRESHOLD) return;
    input({ kind: 'motion' });
    lastSignal = now;
  }

  async function toggle() {
    if (optedIn) {
      window.removeEventListener('devicemotion', onMotion);
      button.setAttribute('aria-pressed', 'false');
      optedIn = false;
      return;
    }
    button.disabled = true;
    let allowed = true;
    try {
      if (typeof sensor.requestPermission === 'function') allowed = await sensor.requestPermission() === 'granted';
    } catch { allowed = false; }
    if (disposed) return;
    button.disabled = false;
    if (!allowed) return;
    optedIn = true;
    button.setAttribute('aria-pressed', 'true');
    window.addEventListener('devicemotion', onMotion);
  }

  button.addEventListener('click', toggle);
  return {
    update(value) { enabled = value; },
    dispose() {
      disposed = true;
      window.removeEventListener('devicemotion', onMotion);
    },
  };
}

export function mountDontWakeLalaPhone(root, { input }) {
  const document = root.ownerDocument;
  const window = document.defaultView;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./phone.css', import.meta.url).href;
  document.head.append(css);
  root.innerHTML = `<div class="lala-handset">
    <button class="lala-hold" type="button" aria-label="Hold to tiptoe" disabled>
      <span class="lala-signal"><canvas width="48" height="48" aria-hidden="true"></canvas><span data-lala-cue></span></span>
      <span class="lala-action" aria-hidden="true">Hold</span>
      <span class="lala-progress"><span></span></span>
    </button>
    <button class="lala-strict" type="button" aria-pressed="false">Strict motion</button>
  </div>`;
  const pad = root.querySelector('.lala-hold');
  const signal = root.querySelector('[data-lala-cue]');
  const action = root.querySelector('.lala-action');
  const progress = root.querySelector('.lala-progress span');
  const icon = root.querySelector('canvas').getContext('2d');
  const drawIcon = createCatIcon(document);
  const strict = mountStrictMode(root.querySelector('.lala-strict'), input);
  let pointer = null;
  let key = null;
  let refresh;
  let cue;
  let distance;
  let caught = false;

  function updateAction() {
    const text = caught ? 'Caught!' : cue === 'look' ? 'Freeze!' : refresh !== undefined ? 'Tiptoe…' : 'Hold';
    if (action.textContent !== text) action.textContent = text;
  }

  function startHold() {
    if (pad.disabled || refresh !== undefined) return;
    input({ kind: 'hold', held: true });
    refresh = window.setInterval(() => input({ kind: 'hold', held: true }), HOLD_REFRESH_MS);
    pad.dataset.held = 'true';
    updateAction();
  }

  function stopHold() {
    const heldPointer = pointer;
    pointer = null;
    key = null;
    if (heldPointer !== null && pad.hasPointerCapture(heldPointer)) pad.releasePointerCapture(heldPointer);
    if (refresh === undefined) return;
    window.clearInterval(refresh);
    refresh = undefined;
    input({ kind: 'hold', held: false });
    pad.dataset.held = 'false';
    updateAction();
  }

  pad.addEventListener('pointerdown', event => {
    if (pad.disabled || event.button !== 0 || pointer !== null || key !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    pad.setPointerCapture(pointer);
    startHold();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    pad.addEventListener(event, value => { if (pointer === value.pointerId) stopHold(); });
  }
  pad.addEventListener('keydown', event => {
    if (!HOLD_KEYS.has(event.key)) return;
    event.preventDefault();
    if (pad.disabled || event.repeat || key !== null || pointer !== null) return;
    key = event.key;
    startHold();
  });
  pad.addEventListener('keyup', event => {
    if (!HOLD_KEYS.has(event.key)) return;
    event.preventDefault();
    if (key === event.key) stopHold();
  });
  pad.addEventListener('blur', stopHold);
  pad.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('blur', stopHold);
  function visibilityChanged() { if (document.hidden) stopHold(); }
  document.addEventListener('visibilitychange', visibilityChanged);

  return {
    update(state, enabled) {
      if (!enabled) stopHold();
      pad.disabled = !enabled;
      strict.update(enabled);
      const nextCue = state?.cue ?? 'sleep';
      if (nextCue !== cue) {
        cue = nextCue;
        pad.dataset.cue = cue;
        signal.textContent = SIGNAL_LABELS[cue];
        drawIcon(icon, cue);
      }
      caught = Boolean(state?.caught);
      pad.dataset.caught = String(caught);
      if (distance !== state?.distance) {
        distance = state?.distance;
        progress.style.width = `${(distance ?? 0) * 100 / 150}%`;
      }
      updateAction();
    },
    dispose() {
      stopHold();
      strict.dispose();
      window.removeEventListener('blur', stopHold);
      document.removeEventListener('visibilitychange', visibilityChanged);
      css.remove();
      root.replaceChildren();
    },
  };
}
