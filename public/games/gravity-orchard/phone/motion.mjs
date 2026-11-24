import { MOTION_TUNING as T } from './tuning.mjs';

const SAFE = Object.freeze({ x: 0, y: 0, brake: true });
const RAD = Math.PI / 180;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = a => {
  const length = Math.hypot(...a);
  return length > 1e-9 ? a.map(n => n / length) : null;
};

/** Screen angle measures counter-clockwise rotation from the natural orientation. */
function screenAngle(env) {
  const value = env.screen?.orientation?.angle ?? env.orientation ?? 0;
  return Number.isFinite(value) ? ((Math.round(value / 90) * 90 % 360) + 360) % 360 : 0;
}

function normalise(x, y, brake) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...SAFE };
  x = clamp(x, -1, 1);
  y = clamp(y, -1, 1);
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return {
    x: Math.round(x * T.rounding) / T.rounding || 0,
    y: Math.round(y * T.rounding) / T.rounding || 0,
    brake: Boolean(brake),
  };
}

/**
 * Alpha-free gravity direction in right/down control coordinates. This is
 * (-m31, m32, m33) from the W3C Z-X'-Y'' device-to-earth matrix; screen-down
 * reverses the physical device y axis when interpreting gravitational pull.
 * Unlike subtracting Euler angles, this stays
 * continuous at beta ±180 and equivalent gamma ±90 / beta-flip branches.
 * No compass heading, acceleration integration or raw sensor history is used.
 */
function gravity(event) {
  const { beta, gamma } = event;
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)
      || Math.abs(beta) > 180 || Math.abs(gamma) > 90) return null;
  const b = beta * RAD, g = gamma * RAD;
  return [Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)];
}

function neutralFrame(direction) {
  const forward = unit(direction);
  // At a vertical-gravity pole, choose a fixed, finite tangent. Gravity cannot
  // observe rotation about itself; a reclined grip or touch avoids that limit.
  const right = unit([forward[2], 0, -forward[0]]) ?? [1, 0, 0];
  const down = unit([
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  ]);
  return { forward, right, down };
}

function relativeVector(direction, neutral, angle) {
  const forward = dot(direction, neutral.forward);
  const a = Math.atan2(dot(direction, neutral.right), forward) / RAD;
  const b = Math.atan2(dot(direction, neutral.down), forward) / RAD;
  const deadZone = value => Math.sign(value)
    * clamp((Math.abs(value) - T.deadZoneDegrees) / (T.usableDegrees - T.deadZoneDegrees), 0, 1);
  const x = deadZone(a), y = deadZone(b);
  if (angle === 90) return normalise(y, -x, false);
  if (angle === 180) return normalise(-x, -y, false);
  if (angle === 270) return normalise(-y, x, false);
  return normalise(x, y, false);
}

/**
 * Contracted input adapter. `environment` is a window-like object with
 * document, screen.orientation, DeviceOrientationEvent, event listeners and
 * setTimeout/clearTimeout. Tests may inject those plus a monotonic `now`.
 *
 * Status: {state,mode,calibrated,message,reason?,requestPause?,progress?}.
 * requestPause is a presentation notification, never a network operation.
 * Public pause()/resume() do not submit commands or advance a game clock.
 * A calibration success enables readiness but does not resume steering.
 */
export function createMotionController({ emitInput, onStatus = () => {}, environment, now } = {}) {
  if (typeof emitInput !== 'function') throw new TypeError('emitInput must be a function');
  const env = environment ?? globalThis.window ?? globalThis;
  const doc = env.document;
  const clock = now ?? (() => env.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now());
  const schedule = (env.setTimeout ?? globalThis.setTimeout).bind(env);
  const cancel = (env.clearTimeout ?? globalThis.clearTimeout).bind(env);
  const disposers = [];
  let disposed = false, mode = 'tilt', paused = true;
  let permission = 'unknown', permissionPromise = null, generation = 0;
  let capturing = false, focused = true;
  let angle = screenAngle(env), neutral = null, latest = null;
  let calibration = null, initialTimer = null, deadlineTimer = null, stableTimer = null;
  let filterTimer = null, filterTime = 0;
  let target = { x: 0, y: 0 }, filtered = { x: 0, y: 0 };
  let touch = { x: 0, y: 0 }, brake = false;

  const visible = () => doc?.hidden !== true && doc?.visibilityState !== 'hidden';
  const calibrated = () => mode === 'touch' || neutral !== null;
  function report(state, message, extras = {}) {
    if (disposed) return;
    onStatus({ state, mode, calibrated: calibrated(), message, ...extras });
  }
  function safe() { emitInput({ ...SAFE }); }
  function clearTimer(name) {
    if (name !== null) cancel(name);
    return null;
  }
  function clearCalibration() {
    initialTimer = clearTimer(initialTimer);
    deadlineTimer = clearTimer(deadlineTimer);
    stableTimer = clearTimer(stableTimer);
    calibration = null;
  }
  function clearForce() {
    filterTimer = clearTimer(filterTimer);
    target = { x: 0, y: 0 };
    filtered = { x: 0, y: 0 };
    touch = { x: 0, y: 0 };
    brake = false;
    safe();
  }
  function detach() {
    if (!capturing) return;
    env.removeEventListener?.('deviceorientation', onOrientation);
    capturing = false;
  }
  function attach() {
    if (capturing || disposed || mode !== 'tilt' || permission !== 'granted' || !visible() || !focused) return;
    env.addEventListener?.('deviceorientation', onOrientation);
    capturing = true;
  }
  function listen(object, event, handler) {
    object?.addEventListener?.(event, handler);
    disposers.push(() => object?.removeEventListener?.(event, handler));
  }
  function available() {
    if (env.isSecureContext !== true) return 'insecure';
    if (!env.DeviceOrientationEvent || typeof env.addEventListener !== 'function') return 'unsupported';
    return null;
  }
  function reportAvailability() {
    const problem = available();
    if (problem === 'insecure') report(problem, 'Tilt needs a trusted secure connection. Touch is ready to use.');
    else if (problem === 'unsupported') report(problem, 'This browser has no orientation sensor. Use touch controls.');
    else if (permission === 'denied') report('denied', 'Motion access was declined. Use touch, or change browser permission and reload.');
    else report('needs-permission', 'Enable tilt while holding your phone comfortably.');
    return problem;
  }
  function halt(reason, { invalidate = false, requestPause = true } = {}) {
    if (disposed) return;
    paused = true;
    ++generation;
    permissionPromise = null;
    clearCalibration();
    detach();
    latest = null;
    if (invalidate) neutral = null;
    clearForce();
    report('paused', reason === 'rotation' ? 'Phone rotated. Recenter before you are ready.'
      : 'Controls paused. Return when you are ready.', { reason, requestPause });
  }
  function failReadings(message, reason = 'no-samples') {
    clearCalibration();
    detach();
    neutral = null;
    latest = null;
    paused = true;
    clearForce();
    report('no-samples', message, { reason, requestPause: true });
  }
  function finishCalibration() {
    stableTimer = null;
    if (disposed || !calibration || !calibration.anchor || !visible() || !focused) return;
    neutral = neutralFrame(calibration.sum);
    clearCalibration();
    clearForce();
    report('ready', 'Tilt centred. Ready when you are.', { progress: 1 });
    // Keep paused until the mounted view observes the authoritative start.
  }
  function feedCalibration(direction) {
    initialTimer = clearTimer(initialTimer);
    const moved = calibration.anchor
      && Math.acos(clamp(dot(calibration.anchor, direction), -1, 1)) / RAD > T.calibrationToleranceDegrees;
    if (!calibration.anchor || moved) {
      stableTimer = clearTimer(stableTimer);
      calibration.anchor = direction;
      calibration.sum = [...direction];
      calibration.count = 1;
      calibration.startedAt = clock();
      stableTimer = schedule(finishCalibration, T.calibrationStableMs);
      report('calibrating', moved ? 'Hold comfortably still for a moment.' : 'Hold this comfortable position.', { progress: 0 });
    } else {
      // A bounded running mean is enough; no raw motion history is recorded.
      calibration.count = Math.min(calibration.count + 1, 240);
      const weight = 1 / calibration.count;
      calibration.sum = calibration.sum.map((n, i) => n + (direction[i] - n) * weight);
      report('calibrating', 'Hold this comfortable position.', {
        progress: clamp((clock() - calibration.startedAt) / T.calibrationStableMs, 0, 1),
      });
    }
  }
  function startCalibration(notifyPause = true) {
    if (disposed || !visible() || !focused) return false;
    // Changed-only sensors may have no new event for a stationary foreground
    // phone. Only an uninterrupted, still-attached capture can seed the hold.
    // Lifecycle/detach paths clear latest, so pre-background data cannot arm it.
    const heldPose = capturing ? latest : null;
    paused = true;
    clearCalibration();
    neutral = null;
    latest = null;
    clearForce();
    if (mode === 'touch') {
      report('ready', 'Touch controls centred.', { reason: 'recenter', requestPause: notifyPause });
      return true;
    }
    if (available() || permission !== 'granted') {
      reportAvailability();
      return false;
    }
    calibration = { anchor: null, sum: null, count: 0, startedAt: clock() };
    report('calibrating', 'Hold your phone naturally; waiting for a sensor reading.', {
      progress: 0, reason: 'recenter', requestPause: notifyPause,
    });
    attach();
    initialTimer = schedule(() => {
      initialTimer = null;
      if (calibration && !calibration.anchor) failReadings('Permission is allowed, but no usable readings arrived. Try again or use touch.');
    }, T.firstSampleTimeoutMs);
    deadlineTimer = schedule(() => {
      deadlineTimer = null;
      if (calibration) failReadings('Could not find a steady neutral position. Recenter again or use touch.', 'unstable');
    }, T.calibrationTimeoutMs);
    if (heldPose) {
      latest = heldPose;
      feedCalibration(heldPose);
    }
    return true;
  }
  function output() {
    if (disposed || paused || !visible() || !focused || !calibrated()) return;
    const value = mode === 'touch' ? touch : filtered;
    emitInput(normalise(value.x, value.y, brake));
  }
  function filterStep() {
    filterTimer = null;
    if (disposed || paused || mode !== 'tilt' || !neutral || !visible() || !focused) return;
    const time = clock();
    const dt = clamp(time - filterTime, 1, T.filterMaxStepMs);
    filterTime = time;
    const weight = 1 - Math.exp(-dt / T.filterTimeConstantMs);
    filtered = {
      x: filtered.x + (target.x - filtered.x) * weight,
      y: filtered.y + (target.y - filtered.y) * weight,
    };
    const settled = Math.max(Math.abs(target.x - filtered.x), Math.abs(target.y - filtered.y)) <= T.filterEpsilon;
    if (settled) filtered = { ...target };
    output();
    if (!settled) filterTimer = schedule(filterStep, T.filterIntervalMs);
  }
  function moveTarget(direction) {
    target = relativeVector(direction, neutral, angle);
    if (filterTimer === null) {
      filterTime = clock();
      filterTimer = schedule(filterStep, T.filterIntervalMs);
    }
  }
  function onOrientation(event) {
    if (disposed || !capturing || mode !== 'tilt' || !visible() || !focused) return;
    const direction = gravity(event);
    if (!direction) {
      latest = null;
      if (calibration) {
        stableTimer = clearTimer(stableTimer);
        calibration.anchor = null;
        calibration.sum = null;
        calibration.count = 0;
        report('calibrating', 'Waiting for a usable sensor reading.', { progress: 0 });
      } else if (neutral) failReadings('The sensor stopped returning usable readings. Recenter or use touch.', 'invalid-sample');
      return;
    }
    latest = direction;
    if (calibration) feedCalibration(direction);
    else if (neutral && !paused) moveTarget(direction);
  }

  function requestPermissionFromGesture() {
    if (disposed) return Promise.resolve(false);
    if (permissionPromise) return permissionPromise;
    if (mode !== 'tilt') setMode('tilt');
    if (available() || permission === 'denied') { reportAvailability(); return Promise.resolve(false); }
    if (!visible() || !focused) { halt('hidden'); return Promise.resolve(false); }
    if (permission === 'granted') return Promise.resolve(startCalibration(false));
    const version = ++generation;
    let requested;
    // Intentionally before a Promise/await, listener setup or unrelated work:
    // Safari requires this platform call in the user's transient activation.
    try {
      const type = env.DeviceOrientationEvent;
      requested = typeof type.requestPermission === 'function'
        ? type.requestPermission() : 'granted';
    } catch {
      permission = 'denied';
      reportAvailability();
      return Promise.resolve(false);
    }
    report('needs-permission', 'Waiting for motion permission. Touch remains available.');
    const pending = Promise.resolve(requested).then(result => {
      if (disposed || version !== generation || mode !== 'tilt') return false;
      permissionPromise = null;
      permission = result === 'granted' ? 'granted' : 'denied';
      if (permission !== 'granted') { reportAvailability(); return false; }
      return startCalibration(false);
    }, () => {
      if (disposed || version !== generation) return false;
      permissionPromise = null;
      permission = 'denied';
      reportAvailability();
      return false;
    });
    permissionPromise = pending;
    return pending;
  }
  function calibrate() {
    if (disposed) return false;
    ++generation;
    permissionPromise = null;
    return startCalibration(true);
  }
  function setMode(value) {
    if (disposed) return false;
    if (value !== 'tilt' && value !== 'touch') throw new TypeError('mode must be tilt or touch');
    if (mode === value) return true;
    ++generation;
    permissionPromise = null;
    clearCalibration();
    detach();
    paused = true;
    latest = null;
    neutral = null;
    mode = value;
    clearForce();
    if (mode === 'touch') report('ready', 'Touch controls ready.', { reason: 'mode', requestPause: true });
    else if (permission === 'granted') startCalibration(true);
    else reportAvailability();
    return true;
  }
  function setTouchVector(x, y) {
    if (disposed || mode !== 'touch' || paused) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      halt('invalid-touch');
      return;
    }
    touch = normalise(x, y, false);
    output();
  }
  function setBrake(held) {
    if (disposed) return;
    if (typeof held !== 'boolean') { halt('invalid-brake'); return; }
    if (paused) return;
    brake = held;
    output();
  }
  function pause() {
    if (disposed) return;
    paused = true;
    clearForce();
    // Lifecycle updates may call pause while the setup calibrator is running.
    // That must not cancel the player's deliberate neutral-position capture.
    if (!calibration) report('paused', 'Controls paused. Ready when you are.', { requestPause: false });
  }
  function resume() {
    if (disposed || !visible() || !focused || calibration || !calibrated()) return false;
    clearForce();
    paused = false;
    attach();
    report('ready', mode === 'touch' ? 'Touch controls ready.' : 'Tilt controls ready.');
    // Do not carry a touch drag or an old filtered force across a pause. The
    // latest visible sensor pose may be used, eased in from neutral.
    if (mode === 'tilt' && latest) moveTarget(latest);
    output();
    return true;
  }
  function dispose() {
    if (disposed) return;
    halt('disposed', { invalidate: true });
    disposed = true;
    for (const remove of disposers.splice(0)) remove();
  }

  listen(doc, 'visibilitychange', () => {
    if (!visible()) halt('hidden', { invalidate: mode === 'tilt' });
    // Foregrounding never re-arms controls. Shared readiness owns resumption.
  });
  listen(env, 'blur', () => { focused = false; halt('blur', { invalidate: mode === 'tilt' }); });
  listen(env, 'focus', () => { focused = true; });
  listen(env, 'pagehide', () => halt('pagehide', { invalidate: mode === 'tilt' }));
  const rotate = () => {
    const next = screenAngle(env);
    if (next === angle) return;
    angle = next;
    halt('rotation', { invalidate: mode === 'tilt' });
  };
  listen(env.screen?.orientation, 'change', rotate);
  listen(env, 'orientationchange', rotate);
  safe();
  reportAvailability();
  return { requestPermissionFromGesture, calibrate, setMode, setTouchVector, setBrake, pause, resume, dispose };
}
