import { mountButton, mountStick } from '../../phone/controls.mjs';

const SEND_MS = 75;
const SENSOR_TIMEOUT_MS = 850;
const CENTRE = { x: 0, y: 0 };
const SWIPE_MIN_PX = 24;

function direction(x, y) {
  const length = Math.hypot(x, y);
  const divisor = Math.max(1, length);
  return length < .09 ? CENTRE : {
    x: Math.trunc(1000 * x / divisor) / 1000,
    y: Math.trunc(1000 * y / divisor) / 1000,
  };
}

export function mountDustBunnyPhone(root, { input }) {
  root.innerHTML = `<div class="sumo-controls">
    <div data-sumo-rider>
      <button class="party-secondary sumo-mode" type="button" hidden>Enable tilt</button>
      <div class="sumo-steering">
        <div class="sumo-stick"></div>
        <div class="sumo-guide" aria-hidden="true"><i></i><b></b></div>
        <span class="sumo-steer-label" aria-hidden="true">Drag to roll</span>
      </div>
      <div class="sumo-dash"></div>
      <progress class="sumo-charge" max="4" value="4" aria-label="Dash charge"></progress>
    </div>
    <div data-sumo-draught hidden>
      <h2>You’re a draught</h2>
      <button class="sumo-swipe" type="button" aria-label="Swipe or use arrow keys to send a gust">
        <span aria-hidden="true">↖ ↑ ↗<br>← ✦ →<br>↙ ↓ ↘</span>
        <strong>Swipe for a gust</strong>
      </button>
      <progress class="sumo-charge" max="8" value="8" aria-label="Gust charge"></progress>
    </div>
  </div>`;
  const document = root.ownerDocument;
  const view = document.defaultView;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./phone.css', import.meta.url).href;
  root.prepend(stylesheet);
  const find = selector => root.querySelector(selector);
  const rider = find('[data-sumo-rider]');
  const draught = find('[data-sumo-draught]');
  const steering = find('.sumo-steering');
  const stickLabel = find('.sumo-steer-label');
  const mode = find('.sumo-mode');
  const swipe = find('.sumo-swipe');
  const dashCharge = rider.querySelector('progress');
  const gustCharge = draught.querySelector('progress');
  const sensor = view.DeviceOrientationEvent;
  mode.hidden = !view.isSecureContext || !sensor;
  let rolling = false;
  let blowing = false;
  let cooldown = 0;
  let pendingUntil = 0;
  let timer;
  let current = CENTRE;
  let sent = CENTRE;
  let useTilt = false;
  let asking = false;
  let neutral;
  let lastSample = 0;
  let disposed = false;
  let pointer;

  function setDirection(next) {
    if (current.x === next.x && current.y === next.y) return;
    current = next;
    steering.style.setProperty('--sumo-x', `${36 * current.x}%`);
    steering.style.setProperty('--sumo-y', `${36 * current.y}%`);
  }

  function sendDirection(force = false) {
    if (!rolling) return;
    if (force || current !== CENTRE || sent !== CENTRE) {
      if (input({ kind: 'roll', ...current })) sent = current;
    }
  }

  function refresh() {
    const pending = view.performance.now() < pendingUntil;
    dash.setEnabled(rolling && !cooldown && !pending);
    swipe.disabled = !blowing || cooldown > 0 || pending;
    dashCharge.value = pending && rolling ? 0 : 4 - Math.min(4, cooldown);
    gustCharge.value = pending && blowing ? 0 : 8 - Math.min(8, cooldown);
  }

  function fire(action) {
    if (cooldown || view.performance.now() < pendingUntil) return;
    if (input(action)) {
      pendingUntil = view.performance.now() + 360;
      refresh();
    }
  }

  const stick = mountStick(find('.sumo-stick'), {
    onInput({ x, y }) { if (rolling && !neutral) setDirection(direction(x, y)); },
  });
  const dash = mountButton(find('.sumo-dash'), {
    label: 'Dash',
    onPress() {
      if (!rolling) return;
      sendDirection(true);
      fire({ kind: 'dash' });
    },
  });

  function paintMode() {
    steering.dataset.tilt = String(Boolean(neutral));
    stick.setEnabled(rolling && !neutral);
    stickLabel.textContent = neutral ? 'Tilt to roll' : 'Drag to roll';
    mode.textContent = useTilt ? 'Use stick' : 'Enable tilt';
  }

  function resetDirection() {
    neutral = undefined;
    lastSample = 0;
    setDirection(CENTRE);
    paintMode();
  }

  function orient(event) {
    if (!rolling || !useTilt || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    lastSample = view.performance.now();
    if (!neutral) {
      neutral = { beta: event.beta, gamma: event.gamma };
      paintMode();
    }
    const wrapDegrees = value => ((value + 540) % 360) - 180;
    const x = wrapDegrees(event.gamma - neutral.gamma) / 27;
    const y = wrapDegrees(event.beta - neutral.beta) / 27;
    const angle = (view.screen.orientation?.angle ?? view.orientation ?? 0) * Math.PI / 180;
    setDirection(direction(x * Math.cos(angle) + y * Math.sin(angle), y * Math.cos(angle) - x * Math.sin(angle)));
  }

  function selectTilt(value) {
    useTilt = value;
    if (value) view.addEventListener('deviceorientation', orient);
    else view.removeEventListener('deviceorientation', orient);
    resetDirection();
  }

  mode.addEventListener('click', async () => {
    if (asking) return;
    if (useTilt) { selectTilt(false); return; }
    asking = true;
    mode.disabled = true;
    let granted = true;
    try {
      if (typeof sensor.requestPermission === 'function') granted = await sensor.requestPermission() === 'granted';
    } catch { granted = false; }
    if (disposed) return;
    asking = false;
    mode.disabled = false;
    if (granted) selectTilt(true);
    else mode.textContent = 'Tilt unavailable · use stick';
  });

  function clearSwipe() { pointer = undefined; }
  swipe.addEventListener('pointerdown', event => {
    if (!blowing || swipe.disabled || pointer || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    swipe.setPointerCapture(event.pointerId);
  });
  swipe.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    const x = event.clientX - pointer.x;
    const y = event.clientY - pointer.y;
    clearSwipe();
    const length = Math.hypot(x, y);
    if (blowing && length >= SWIPE_MIN_PX) fire({ kind: 'gust', ...direction(x / length, y / length) });
  });
  swipe.addEventListener('lostpointercapture', clearSwipe);
  const keys = {
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  };
  swipe.addEventListener('keydown', event => {
    if (!blowing || !Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    fire({ kind: 'gust', ...keys[event.key] });
  });

  function onSendTick() {
    if (neutral && view.performance.now() - lastSample > SENSOR_TIMEOUT_MS) selectTilt(false);
    sendDirection();
  }

  function clearOnHide() {
    if (!document.hidden) return;
    resetDirection();
    sendDirection();
  }
  document.addEventListener('visibilitychange', clearOnHide);
  paintMode();
  refresh();

  return {
    update(state, enabled) {
      const wasRolling = rolling;
      const wasBlowing = blowing;
      rolling = Boolean(enabled && state && !state.out);
      blowing = Boolean(enabled && state?.out);
      if (rolling !== wasRolling) {
        clearInterval(timer);
        sent = CENTRE;
        resetDirection();
        if (rolling) timer = view.setInterval(onSendTick, SEND_MS);
      }
      if (rolling !== wasRolling || blowing !== wasBlowing || state?.cd) pendingUntil = 0;
      cooldown = state?.cd ?? 0;
      rider.hidden = Boolean(state?.out);
      draught.hidden = !state?.out;
      if (!blowing) clearSwipe();
      refresh();
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      view.removeEventListener('deviceorientation', orient);
      document.removeEventListener('visibilitychange', clearOnHide);
      stick.dispose();
      dash.dispose();
      root.replaceChildren();
    },
  };
}
