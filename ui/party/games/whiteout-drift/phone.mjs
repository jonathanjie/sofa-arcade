import { mountStick } from '../../phone/controls.mjs';

const CENTRE = { x: 0, y: 0 };
const SEND_MS = 75;
const MIN_SEND_MS = 50;
const SENSOR_TIMEOUT_MS = 850;
const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function direction(x, y, unit = false) {
  const length = Math.hypot(x, y);
  if (length < .09) return CENTRE;
  const divisor = unit ? length : Math.max(1, length);
  return { x: Math.trunc(1000 * x / divisor) / 1000, y: Math.trunc(1000 * y / divisor) / 1000 };
}

export function mountWhiteoutPhone(root, { input }) {
  const document = root.ownerDocument;
  const view = document.defaultView;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./phone.css', import.meta.url).href;
  root.innerHTML = `<div class="wd-phone">
    <header class="wd-status"><strong data-role>Practice</strong><span data-hp>● ● ●</span><span>Score <b data-score>0</b></span><strong data-spin hidden>ICE SPIN!</strong></header>
    <div class="wd-driving">
      <div class="wd-wheel"><button type="button" class="wd-tilt" hidden>Enable tilt</button><div class="wd-stick"></div><div class="wd-rim" aria-hidden="true"><i></i></div><span class="wd-label">Steer</span></div>
      <div class="wd-action"><button type="button" class="wd-drift">DRIFT / BOOST</button><progress max="10" value="0" aria-label="Boost charge"></progress></div>
    </div>
    <div class="wd-dispatch" hidden><button type="button" class="wd-radar" aria-label="Dispatch radar: tap, swipe or use arrows">↖ ↑ ↗<br>← ◎ →<br>↙ ↓ ↘<small>DISPATCH RADAR</small></button><div><strong data-feedback>Ready</strong><progress max="40" value="40" aria-label="Dispatch cooldown"></progress></div></div>
  </div>`;
  root.prepend(stylesheet);
  const find = selector => root.querySelector(selector);
  const panel = find('.wd-phone');
  const wheel = find('.wd-wheel');
  const drift = find('.wd-drift');
  const radar = find('.wd-radar');
  const tilt = find('.wd-tilt');
  const charge = find('.wd-action progress');
  const sensor = view.DeviceOrientationEvent;
  tilt.hidden = !view.isSecureContext || !sensor;
  let role = 0, cooldown = 0, active = false, practice = false, disposed = false;
  let current = CENTRE, held = false, lastSend = -Infinity, dirty = false;
  let pending = [], timer, pointer, radarStart, neutral, tiltSince, asking = false, pingUntil = 0;
  const listeners = [];
  function listen(node, type, handler) {
    node.addEventListener(type, handler);
    listeners.push(() => node.removeEventListener(type, handler));
  }
  const now = () => view.performance.now();
  const driving = () => (active || practice) && role !== 2;
  function flush() {
    if (!active || role === 2 || now() - lastSend < MIN_SEND_MS) return;
    const payload = pending.shift() ?? (dirty || current !== CENTRE || held ? { kind: 'drive', ...current, d: Number(held) } : null);
    if (!payload) return;
    lastSend = now();
    const accepted = input(payload);
    dirty = !accepted || pending.length > 0 || payload.x !== current.x || payload.y !== current.y || payload.d !== Number(held);
  }
  function edge() {
    if (!active || role === 2) return;
    pending.push({ kind: 'drive', ...current, d: Number(held) });
    // Keep at most the next edge and latest state during very fast gestures.
    if (pending.length > 2) pending.splice(1, pending.length - 2);
    flush();
  }
  function steer(next) {
    if (next.x === current.x && next.y === current.y) return;
    current = next;
    wheel.style.setProperty('--wd-x', `${current.x * 36}%`);
    wheel.style.setProperty('--wd-y', `${current.y * 36}%`);
    dirty = true;
    if (next === CENTRE) edge();
    else flush();
  }
  function hold(value) {
    if (held === value) return;
    held = value;
    drift.setAttribute('aria-pressed', String(value));
    edge();
  }
  const stick = mountStick(find('.wd-stick'), {
    label: 'Steering pad', onInput({ x, y }) { if (driving() && !neutral) steer(direction(x, y)); },
  });
  function refresh() {
    stick.setEnabled(driving() && !neutral);
    drift.disabled = !driving() || (role === 1 && cooldown > 0 && !held);
    tilt.disabled = !driving() || asking;
    radar.disabled = !active || role !== 2 || cooldown > 0 || now() < pingUntil;
    find('[data-feedback]').textContent = cooldown || now() < pingUntil ? 'Ping sent!' : 'Ready';
  }
  function stopTilt() {
    tiltSince = undefined;
    neutral = undefined;
    tilt.textContent = 'Enable tilt';
    steer(CENTRE);
    refresh();
  }
  function reset() {
    if (pointer !== undefined && drift.hasPointerCapture(pointer)) drift.releasePointerCapture(pointer);
    if (radarStart && radar.hasPointerCapture(radarStart.id)) radar.releasePointerCapture(radarStart.id);
    pointer = undefined;
    radarStart = undefined;
    stick.setEnabled(false);
    hold(false);
    steer(CENTRE);
    stopTilt();
  }
  listen(drift, 'pointerdown', event => {
    if (drift.disabled || pointer !== undefined || event.button !== 0) return;
    pointer = event.pointerId;
    drift.setPointerCapture(pointer);
    hold(true);
  });
  function release(event) {
    if (event.pointerId !== undefined && event.pointerId !== pointer) return;
    pointer = undefined;
    hold(false);
    refresh();
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) listen(drift, type, release);
  function ping(x, y) {
    if (radar.disabled || Math.hypot(x, y) < .1 || now() - lastSend < MIN_SEND_MS) return;
    lastSend = now();
    if (input({ kind: 'dispatch', ...direction(x, y, true) })) pingUntil = now() + 360;
    refresh();
  }
  listen(radar, 'pointerdown', event => {
    if (radar.disabled || radarStart || event.button !== 0) return;
    radarStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    radar.setPointerCapture(event.pointerId);
  });
  listen(radar, 'pointerup', event => {
    if (radarStart?.id !== event.pointerId) return;
    let x = event.clientX - radarStart.x, y = event.clientY - radarStart.y;
    radarStart = undefined;
    if (Math.hypot(x, y) < 24) {
      const box = radar.getBoundingClientRect();
      x = 2 * (event.clientX - box.left) / box.width - 1;
      y = 2 * (event.clientY - box.top) / box.height - 1;
    }
    ping(x, y);
  });
  for (const type of ['pointercancel', 'lostpointercapture', 'blur']) listen(radar, type, () => { radarStart = undefined; });
  listen(radar, 'keydown', event => {
    if (!Object.hasOwn(arrows, event.key)) return;
    event.preventDefault();
    ping(...arrows[event.key]);
  });
  listen(view, 'keydown', event => {
    if (!driving() || ![' ', 'Shift'].includes(event.key)) return;
    event.preventDefault();
    if (!event.repeat && !drift.disabled) hold(true);
  });
  listen(view, 'keyup', event => { if ([' ', 'Shift'].includes(event.key)) release(event); });
  listen(view, 'blur', reset);
  listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  listen(tilt, 'click', async () => {
    if (tilt.disabled) return;
    if (tiltSince !== undefined) { stopTilt(); return; }
    asking = true;
    refresh();
    let granted = true;
    try { if (typeof sensor.requestPermission === 'function') granted = await sensor.requestPermission() === 'granted'; }
    catch { granted = false; }
    if (disposed) return;
    asking = false;
    if (granted && driving()) { tiltSince = now(); tilt.textContent = 'Use stick'; }
    else tilt.textContent = 'Tilt unavailable';
    refresh();
  });
  listen(view, 'deviceorientation', event => {
    if (!driving() || tiltSince === undefined || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    tiltSince = now();
    if (!neutral) { neutral = { beta: event.beta, gamma: event.gamma }; refresh(); }
    const wrap = value => ((value + 540) % 360) - 180;
    const x = wrap(event.gamma - neutral.gamma) / 27, y = wrap(event.beta - neutral.beta) / 27;
    const angle = (view.screen.orientation?.angle ?? view.orientation ?? 0) * Math.PI / 180;
    steer(direction(x * Math.cos(angle) + y * Math.sin(angle), y * Math.cos(angle) - x * Math.sin(angle)));
  });
  timer = view.setInterval(() => {
    if (tiltSince !== undefined && now() - tiltSince > SENSOR_TIMEOUT_MS) stopTilt();
    flush();
    if (role === 2) refresh();
  }, SEND_MS);
  drift.setAttribute('aria-pressed', 'false');
  refresh();
  return {
    practiceWhileWaiting: true,
    update(state, enabled, meta = {}) {
      const nextPractice = Boolean(meta.practice);
      const nextRole = nextPractice ? 0 : state?.r ?? 0;
      if (role !== nextRole || active !== Boolean(enabled) || practice !== nextPractice) {
        active = false;
        reset();
        pending = [];
        dirty = false;
        pingUntil = 0;
      }
      role = nextRole;
      active = Boolean(enabled);
      practice = nextPractice;
      cooldown = state?.c ?? 0;
      panel.dataset.role = String(role);
      find('[data-role]').textContent = practice ? 'Practice' : ['Getaway', 'Police', 'Dispatch', 'Most Wanted'][role];
      const hp = state?.h ?? 3;
      find('[data-hp]').textContent = '● '.repeat(hp) + '○ '.repeat(3 - hp);
      find('[data-hp]').setAttribute('aria-label', `${hp} of 3 integrity`);
      find('[data-score]').textContent = String(state?.s ?? 0);
      find('[data-spin]').hidden = !state?.i;
      find('.wd-driving').hidden = role === 2;
      find('.wd-dispatch').hidden = role !== 2;
      drift.textContent = role === 1 ? 'SIREN RAM' : 'DRIFT / BOOST';
      charge.max = role === 1 ? 40 : 10;
      charge.value = role === 1 ? 40 - cooldown : state?.b ?? 0;
      charge.setAttribute('aria-label', role === 1 ? 'Ram cooldown' : 'Boost charge');
      charge.toggleAttribute('data-charged', role !== 1 && charge.value >= 5);
      find('.wd-dispatch progress').value = 40 - cooldown;
      refresh();
    },
    dispose() {
      disposed = true;
      view.clearInterval(timer);
      for (const remove of listeners) remove();
      stick.dispose();
      root.replaceChildren();
    },
  };
}
