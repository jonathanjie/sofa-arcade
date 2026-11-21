import { createMotionController } from './motion.mjs';
import { icon } from './icons.mjs';

export { createMotionController } from './motion.mjs';

const SAFE = Object.freeze({ x: 0, y: 0, brake: true });
const ACTIVE = new Set(['playing', 'countdown']);
const READY_PHASES = new Set(['waiting', 'paused', 'interlude']);
const PHASES = new Set([...ACTIVE, ...READY_PHASES, 'finished']);
const ACTIONABLE_SENSOR_STATES = new Set(['insecure', 'unsupported', 'needs-permission', 'denied', 'no-samples']);
const sheetOwners = new WeakMap();
let mountSequence = 0;

function useStyles(document) {
  let record = sheetOwners.get(document);
  if (!record) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./phone.css', import.meta.url).href;
    link.dataset.go3Styles = '';
    document.head.append(link);
    record = { link, count: 0 };
    sheetOwners.set(document, record);
  }
  record.count += 1;
  return () => {
    record.count -= 1;
    if (!record.count) {
      record.link.remove();
      sheetOwners.delete(document);
    }
  };
}

function assetSource(assets, playerId) {
  const state = assets?.characterStates?.[playerId]?.idle;
  const key = typeof state === 'string' ? state : state?.asset;
  const item = (key && assets?.assets?.[key]) || state ||
    assets?.assets?.[`gardener-${playerId}`] || assets?.assets?.[playerId];
  // Runtime imagery stays on this host; failure always retains the readable badge.
  return typeof item?.src === 'string' && /^\/(?!\/)/.test(item.src) ? item.src : null;
}

function vector(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const scale = Math.max(1, Math.hypot(x, y));
  return { x: x / scale, y: y / scale };
}

/**
 * Mount the real phone controller. This view never owns score, physics or time.
 * input.setInput receives only {x,y,brake}. Optional input.onStatus observes the
 * motion status; environment/now are deterministic-fixture injection seams.
 * onCommand receives a unique id, kind and payload, and may return a Promise.
 */
export function mountPhone(root, {
  playerId, input, onCommand, onExit = () => {}, assets = {}, reducedMotion,
} = {}) {
  if (!root?.ownerDocument || !['jon', 'lydia'].includes(playerId)) {
    throw new TypeError('mountPhone requires a DOM root and a jon or lydia playerId.');
  }
  if (typeof input?.setInput !== 'function' || typeof onCommand !== 'function') {
    throw new TypeError('mountPhone requires input.setInput and onCommand.');
  }
  const document = root.ownerDocument;
  const window = document.defaultView;
  const releaseStyles = useStyles(document);
  const instance = ++mountSequence;
  const id = `go3-${instance}`;
  const playerName = playerId === 'jon' ? 'Jon' : 'Lydia';
  const partnerName = playerId === 'jon' ? 'Lydia' : 'Jon';
  const partnerId = playerId === 'jon' ? 'lydia' : 'jon';
  const removers = [];
  let disposed = false;
  let motion;
  let view = null;
  let connection = { state: 'connecting' };
  let sensor = { state: 'needs-permission', mode: 'tilt', calibrated: false };
  let selectedMode = 'tilt';
  let configured = false;
  let setupOpen = true;
  let localHold = true;
  let controlling = false;
  let syncing = false;
  let updateDepth = 0;
  let dialogOpen = false;
  let focusReturn = null;
  let joystickPointer = null;
  let pointerVector = { x: 0, y: 0 };
  const brakePointers = new Set();
  const keys = new Set();
  let shownVector = { x: 0, y: 0, brake: true };
  let commandCounter = 0;
  let pendingReady = false;
  let pendingReadyValue = null;
  let readyGeneration = 0;
  let readyIntent = null;
  let activeEpoch = null;
  let lifecycleGeneration = 0;
  let commandError = '';
  let pauseRequest = null;
  let withdrawalRequestedAt = null;
  let ignoreLostCapture = false;
  const nonce = window?.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${instance}`;

  const shell = document.createElement('section');
  shell.className = 'go3-phone';
  shell.dataset.go3 = 'phone';
  shell.dataset.player = playerId;
  shell.setAttribute('aria-label', `Gravity Orchard — ${playerName}'s controller`);
  shell.innerHTML = `
    <div class="go3-shell">
      <header class="go3-header">
        <div class="go3-identity-badge" data-go3="portrait">${icon('leaf')}<span>${playerName[0]}</span></div>
        <div class="go3-identity"><span class="go3-kicker">Gravity Orchard</span><h1>${playerName}<span>${playerId === 'jon' ? 'Left garden' : 'Right garden'}</span></h1></div>
        <button class="go3-icon-button go3-help-button" type="button" data-go3="help" aria-label="Help and controls">${icon('help')}</button>
      </header>
      <div class="go3-status-row">
        <span class="go3-connection" data-go3="connection" role="status">${icon('signal')}<span>Connecting</span></span>
        <span class="go3-mode-label" data-go3="mode-label">${icon('phone')}<span>Tilt controls</span></span>
      </div>
      <section class="go3-phase" aria-labelledby="${id}-phase-title">
        <div><span class="go3-kicker" data-go3="stage">Your floating garden</span><h2 id="${id}-phase-title" data-go3="phase">Make yourself comfortable</h2></div>
        <span class="go3-time" data-go3="time"></span>
        <p class="go3-phase-note" data-go3="phase-note"></p>
      </section>
      <section class="go3-setup" data-go3="setup" aria-labelledby="${id}-setup-title">
        <div class="go3-setup-heading">${icon('phone')}<h3 id="${id}-setup-title" data-go3="setup-title">Play with a gentle tilt</h3></div>
        <p data-go3="sensor-status" role="status">Hold your phone comfortably while seated.</p>
        <div class="go3-calibration" data-go3="calibration" hidden><span></span></div>
        <div class="go3-setup-actions">
          <button class="go3-primary" type="button" data-go3="enable-tilt">${icon('phone')}<span>Enable tilt</span></button>
          <button class="go3-primary" type="button" data-go3="calibrate" hidden>${icon('center')}<span>Center my phone</span></button>
          <button class="go3-secondary" type="button" data-go3="touch-mode">${icon('touch')}<span>Use touch controls</span></button>
        </div>
      </section>
      <div class="go3-play-controls">
        <section class="go3-controller" aria-labelledby="${id}-control-title">
          <div class="go3-control-heading"><h3 id="${id}-control-title" data-go3="control-title">Your tilt</h3><span data-go3="vector-label">Centered</span></div>
          <div class="go3-steering" data-go3="joystick" role="group" aria-roledescription="two-dimensional joystick" aria-label="Steer ${playerName}'s garden" aria-describedby="${id}-keyboard" tabindex="0">
            <div class="go3-steering-rings" aria-hidden="true"><i></i><i></i><i></i></div>
            <span class="go3-direction go3-up" aria-hidden="true">↑</span><span class="go3-direction go3-right" aria-hidden="true">→</span>
            <span class="go3-direction go3-down" aria-hidden="true">↓</span><span class="go3-direction go3-left" aria-hidden="true">←</span>
            <span class="go3-thumb" data-go3="thumb" aria-hidden="true">${icon('leaf')}</span>
            <span class="go3-steering-caption" data-go3="steering-caption">Gently tilt to steer</span>
          </div>
          <span id="${id}-keyboard" class="go3-sr-only">Touch mode: drag in any direction, or use arrow keys or W A S D while focused here. Hold Space to brake. Escape pauses.</span>
        </section>
        <div class="go3-brake-column">
          <button class="go3-brake" type="button" data-go3="brake" aria-pressed="false" aria-label="Hold Brake" aria-describedby="${id}-brake-note">
            ${icon('brake')}<strong>Brake</strong><span id="${id}-brake-note">Hold to steady</span>
          </button>
          <div class="go3-tools">
            <button type="button" class="go3-secondary" data-go3="pause">${icon('pause')}<span>Pause</span></button>
            <button type="button" class="go3-secondary" data-go3="recenter">${icon('center')}<span>Recenter</span></button>
          </div>
        </div>
      </div>
      <section class="go3-ready-panel" data-go3="ready-panel">
        <div class="go3-ready-seats" data-go3="ready-seats"><span data-go3="self-ready">${playerName} · Not ready</span><span data-go3="partner-ready">${partnerName} · Not ready</span></div>
        <button class="go3-primary go3-ready" type="button" data-go3="ready">${icon('check')}<span>I'm ready</span></button>
        <p class="go3-ready-note" data-go3="ready-note">Both gardeners start together.</p>
      </section>
      <section class="go3-results" data-go3="results" hidden>
        <div class="go3-result-symbol">${icon('basket')}</div><h3>Picnic complete</h3><p data-go3="results-summary"></p>
        <p class="go3-ready-note">Choose the next adventure on the TV.</p>
      </section>
      <p class="go3-error" data-go3="error" role="alert" hidden></p>
      <p class="go3-live go3-sr-only" data-go3="announcement" role="status" aria-live="polite"></p>
    </div>
    <div class="go3-dialog-backdrop" data-go3="help-backdrop" hidden>
      <section class="go3-dialog" data-go3="help-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-help-title" tabindex="-1">
        <header><div><span class="go3-kicker">A little help</span><h2 id="${id}-help-title">Make yourself at home</h2></div><button class="go3-icon-button" type="button" data-go3="close-help" aria-label="Close Help">${icon('close')}</button></header>
        <p>Steer your garden while watching the TV. Pass fruit over the bridge and guide it into its matching basket.</p>
        <div class="go3-help-tip">${icon('brake')}<p><strong>Hold Brake</strong> to steady your fruit. You can steer and brake together.</p></div>
        <div class="go3-help-tip">${icon('center')}<p><strong>Recenter</strong> with your phone in a natural seated grip. Rotating your screen pauses play for a new center.</p></div>
        <h3>Your controls</h3>
        <div class="go3-help-modes"><button type="button" class="go3-secondary" data-go3="tilt-mode">${icon('phone')}<span>Set up tilt</span></button><button type="button" class="go3-secondary" data-go3="help-touch">${icon('touch')}<span>Use touch</span></button></div>
        <p class="go3-keyboard-help"><strong>Keyboard:</strong> focus the steering pad, use arrows or W A S D, and hold Space for Brake. Escape pauses.</p>
        <p class="go3-help-pause">Closing Help keeps play paused. Both gardeners must be ready to continue.</p>
        <button class="go3-secondary go3-exit" type="button" data-go3="exit">${icon('exit')}<span>Leave controller</span></button>
      </section>
    </div>`;
  root.replaceChildren(shell);
  const element = (name) => shell.querySelector(`[data-go3="${name}"]`);
  const refs = Object.fromEntries([...shell.querySelectorAll('[data-go3]')].map((node) => [node.dataset.go3, node]));
  const source = assetSource(assets, playerId);
  if (source) {
    const portrait = document.createElement('img');
    portrait.alt = '';
    portrait.src = source;
    listen(portrait, 'load', () => {
      if (!disposed) refs.portrait.classList.add('go3-portrait-loaded');
    }, { once: true });
    refs.portrait.append(portrait);
  }
  const motionQuery = window?.matchMedia?.('(prefers-reduced-motion: reduce)');
  function updateReducedMotion() {
    shell.dataset.reducedMotion = String(reducedMotion === undefined ? !!motionQuery?.matches : !!reducedMotion);
  }
  function listen(target, type, fn, options) {
    target?.addEventListener?.(type, fn, options);
    removers.push(() => target?.removeEventListener?.(type, fn, options));
  }
  if (reducedMotion === undefined) listen(motionQuery, 'change', updateReducedMotion);
  updateReducedMotion();

  function canControl() {
    return !disposed && view?.phase === 'playing' && connection.state === 'connected' &&
      configured && !localHold && !dialogOpen && !setupOpen &&
      (selectedMode === 'touch' || sensor.calibrated) && !document.hidden;
  }

  function sendInput(next) {
    if (disposed) return;
    const normalized = vector(next.x, next.y);
    const value = canControl() ? { ...normalized, brake: next.brake === true } : { ...SAFE };
    input.setInput(value);
    shownVector = value;
    drawVector();
  }

  function drawVector() {
    const { x, y, brake } = shownVector;
    refs.joystick.style.setProperty('--go3-x', String(x));
    refs.joystick.style.setProperty('--go3-y', String(y));
    refs.joystick.dataset.braking = String(brake);
    const vertical = Math.abs(y) > 0.1 ? (y < 0 ? 'Up' : 'Down') : '';
    const horizontal = Math.abs(x) > 0.1 ? (x < 0 ? 'left' : 'right') : '';
    refs['vector-label'].textContent = vertical && horizontal ? `${vertical} ${horizontal}` : vertical || (horizontal ? horizontal[0].toUpperCase() + horizontal.slice(1) : 'Centered');
    const held = brakePointers.size > 0 || keys.has(' ');
    refs.brake.setAttribute('aria-pressed', String(held));
    refs.brake.dataset.held = String(held);
    refs.brake.querySelector('strong').textContent = held ? 'Steady' : 'Brake';
  }

  function releasePointers() {
    const pointers = [...brakePointers];
    if (joystickPointer !== null) pointers.push(joystickPointer);
    joystickPointer = null;
    pointerVector = { x: 0, y: 0 };
    brakePointers.clear();
    keys.clear();
    ignoreLostCapture = true;
    for (const pointerId of pointers) {
      for (const target of [refs.joystick, refs.brake]) {
        try { if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId); } catch { /* Already released by the browser. */ }
      }
    }
    ignoreLostCapture = false;
    shownVector = { ...SAFE };
    drawVector();
  }

  function dispatch(kind, payload) {
    const generation = lifecycleGeneration;
    const readyVersion = readyGeneration;
    const command = { id: `go3-${nonce}-${++commandCounter}`, kind, payload };
    let result;
    try { result = onCommand(command); } catch (error) { result = Promise.reject(error); }
    return Promise.resolve(result).then((reply) => {
      if (!disposed && generation === lifecycleGeneration &&
          (kind !== 'ready' || readyVersion === readyGeneration) && reply?.accepted === false) {
        commandError = kind === 'pause' ? 'Pause was not confirmed. Keep controls released and check the TV.' : 'That didn’t go through. Check your Wi-Fi and try again.';
        render();
      }
      return reply;
    }, () => {
      if (!disposed && generation === lifecycleGeneration && (kind !== 'ready' || readyVersion === readyGeneration)) {
        commandError = kind === 'pause' ? 'Pause could not be confirmed. Controls are held safely.' : 'Could not send ready. Try again when connected.';
        render();
      }
      return { accepted: false };
    });
  }

  function requestSharedPause(reason = 'requested', retry = false) {
    if (!ACTIVE.has(view?.phase)) return;
    const boundary = `${view.matchId}:${view.runEpoch}`;
    if (pauseRequest?.boundary === boundary && (!retry || pauseRequest.state !== 'failed')) return;
    const request = { boundary, state: 'pending' };
    pauseRequest = request;
    void dispatch('pause', { reason: ['help', 'recenter'].includes(reason) ? reason : 'requested' }).then((reply) => {
      if (disposed || pauseRequest !== request || `${view?.matchId}:${view?.runEpoch}` !== boundary) return;
      request.state = reply?.accepted === false ? 'failed' : 'confirmed';
      render();
    });
  }

  function withdrawReady() {
    const pendingWasReady = pendingReadyValue === true;
    readyGeneration += 1;
    pendingReady = false;
    pendingReadyValue = null;
    readyIntent = null;
    activeEpoch = null;
    if (!READY_PHASES.has(view?.phase) || (!view?.ready?.[playerId] && !pendingWasReady)) return;
    const boundary = `${view.matchId}:${view.runEpoch}`;
    if (withdrawalRequestedAt === boundary) return;
    withdrawalRequestedAt = boundary;
    void dispatch('ready', { value: false });
  }

  function hold(reason = 'requested', shared = true, retry = false) {
    localHold = true;
    controlling = false;
    withdrawReady();
    releasePointers();
    motion?.pause();
    input.setInput({ ...SAFE });
    if (shared) requestSharedPause(reason, retry);
    render();
  }

  function syncControls() {
    if (!motion || syncing || disposed || updateDepth > 0) return;
    syncing = true;
    const shouldControl = canControl();
    if (shouldControl && !controlling) {
      controlling = motion.resume() !== false;
    } else if (!shouldControl && controlling) {
      controlling = false;
      motion.pause();
    }
    syncing = false;
  }

  function handleStatus(status) {
    if (disposed) return;
    // A harmless internal pause (for example, opening Help during setup) must
    // not replace a useful permission/fallback action with a recenter button.
    // External lifecycle safety still presents its own paused/recenter state.
    const previousSensor = sensor;
    sensor = status.state === 'paused' && !status.requestPause && !status.calibrated &&
      ACTIONABLE_SENSOR_STATES.has(previousSensor.state)
      ? { ...status, state: previousSensor.state, message: previousSensor.message, reason: previousSensor.reason }
      : { ...status };
    if (status.mode) selectedMode = status.mode;
    if (status.state === 'ready' && (selectedMode === 'touch' || status.calibrated)) {
      configured = true;
      setupOpen = false;
    }
    if (status.requestPause) {
      localHold = true;
      controlling = false;
      withdrawReady();
      releasePointers();
      input.setInput({ ...SAFE });
      requestSharedPause(status.reason === 'rotation' || status.reason === 'recenter' ? 'recenter' : 'requested');
      if (status.reason === 'rotation' || (selectedMode === 'tilt' && !status.calibrated)) setupOpen = true;
    }
    input.onStatus?.({ ...status });
    if (updateDepth === 0) render();
    syncControls();
  }

  motion = createMotionController({
    emitInput: sendInput,
    onStatus: handleStatus,
    environment: input.environment || window,
    now: input.now,
  });

  function chooseTouch() {
    hold('requested');
    selectedMode = 'touch';
    configured = true;
    setupOpen = false;
    motion.setMode('touch');
    closeHelp();
    render();
    refs.ready.focus({ preventScroll: true });
  }

  function enableTilt() {
    // This call must remain first: permission is requested during this tap's
    // transient user activation, before network work or unrelated awaits.
    const permission = motion.requestPermissionFromGesture();
    controlling = false;
    withdrawReady();
    releasePointers();
    input.setInput({ ...SAFE });
    selectedMode = 'tilt';
    setupOpen = true;
    localHold = true;
    requestSharedPause('recenter');
    render();
    Promise.resolve(permission).catch(() => { /* Controller reports a safe actionable status. */ });
  }

  function recenter() {
    hold('recenter');
    if (selectedMode === 'tilt') {
      setupOpen = true;
      motion.calibrate();
    } else {
      motion.setTouchVector(0, 0);
      refs.announcement.textContent = 'Touch controls centered. Both gardeners must be ready to continue.';
    }
    render();
  }

  function openHelp() {
    focusReturn = document.activeElement;
    hold('help');
    dialogOpen = true;
    refs['help-backdrop'].hidden = false;
    shell.querySelector('.go3-shell').inert = true;
    refs['close-help'].focus({ preventScroll: true });
    render();
  }

  function closeHelp() {
    if (!dialogOpen) return;
    dialogOpen = false;
    refs['help-backdrop'].hidden = true;
    shell.querySelector('.go3-shell').inert = false;
    if (focusReturn?.isConnected) focusReturn.focus({ preventScroll: true });
    render();
    // Deliberately no resume: the authoritative both-ready countdown owns it.
  }

  function touchPosition(event) {
    const bounds = refs.joystick.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.34);
    const position = vector((event.clientX - bounds.left - bounds.width / 2) / radius,
      (event.clientY - bounds.top - bounds.height / 2) / radius);
    pointerVector = position;
    motion.setTouchVector(position.x, position.y);
  }

  listen(refs.joystick, 'pointerdown', (event) => {
    if (selectedMode !== 'touch' || !canControl() || joystickPointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    joystickPointer = event.pointerId;
    refs.joystick.focus({ preventScroll: true });
    try { refs.joystick.setPointerCapture(event.pointerId); } catch { /* document release remains installed. */ }
    touchPosition(event);
  });
  listen(refs.joystick, 'pointermove', (event) => {
    if (event.pointerId !== joystickPointer || !canControl()) return;
    event.preventDefault();
    touchPosition(event);
  });
  listen(refs.brake, 'pointerdown', (event) => {
    if (!canControl() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    brakePointers.add(event.pointerId);
    try { refs.brake.setPointerCapture(event.pointerId); } catch { /* document release remains installed. */ }
    motion.setBrake(true);
    drawVector();
  });
  listen(document, 'pointerup', (event) => {
    if (disposed) return;
    if (event.pointerId === joystickPointer) {
      joystickPointer = null;
      pointerVector = { x: 0, y: 0 };
      keyboardVector();
    }
    if (brakePointers.delete(event.pointerId)) motion.setBrake(brakePointers.size > 0 || keys.has(' '));
    drawVector();
  });
  function cancelPointer(event) {
    if (ignoreLostCapture || (event.pointerId !== joystickPointer && !brakePointers.has(event.pointerId))) return;
    hold('requested');
    refs.announcement.textContent = 'Control interrupted. Both gardeners must be ready to continue.';
  }
  listen(document, 'pointercancel', cancelPointer);
  listen(refs.joystick, 'lostpointercapture', cancelPointer);
  listen(refs.brake, 'lostpointercapture', cancelPointer);

  function keyboardVector() {
    const x = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft') || keys.has('a'));
    const y = Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w'));
    const next = x || y || joystickPointer === null ? vector(x, y) : pointerVector;
    motion.setTouchVector(next.x, next.y);
    motion.setBrake(keys.has(' ') || brakePointers.size > 0);
  }
  const movementKeys = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);
  listen(shell, 'keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (dialogOpen) closeHelp(); else hold('requested');
      return;
    }
    if (dialogOpen && event.key === 'Tab') {
      const focusable = [...refs['help-dialog'].querySelectorAll('button:not(:disabled),[tabindex="0"]')];
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    const key = event.key.toLowerCase();
    if (!canControl() || ![refs.joystick, refs.brake].includes(event.target)) return;
    if ((selectedMode === 'touch' && movementKeys.has(key)) || key === ' ') {
      event.preventDefault();
      keys.add(key);
      keyboardVector();
    }
  });
  listen(document, 'keyup', (event) => {
    const key = event.key.toLowerCase();
    if (!keys.delete(key)) return;
    event.preventDefault();
    keyboardVector();
  });
  listen(shell, 'focusout', (event) => {
    if ((event.target === refs.joystick || event.target === refs.brake) && keys.size &&
      event.relatedTarget !== refs.joystick && event.relatedTarget !== refs.brake) hold('requested');
  });
  // These real-document lifecycle hooks complement injected sensor environments.
  listen(document, 'visibilitychange', () => { if (document.hidden) hold('requested'); });
  listen(window, 'pagehide', () => hold('requested'));
  listen(window, 'blur', () => { if (ACTIVE.has(view?.phase)) hold('requested'); });
  listen(refs.help, 'click', openHelp);
  listen(refs['close-help'], 'click', closeHelp);
  listen(refs.pause, 'click', () => hold('requested', true, true));
  listen(refs.recenter, 'click', recenter);
  listen(refs['enable-tilt'], 'click', enableTilt);
  listen(refs.calibrate, 'click', recenter);
  listen(refs['touch-mode'], 'click', chooseTouch);
  listen(refs['help-touch'], 'click', chooseTouch);
  listen(refs['tilt-mode'], 'click', () => {
    closeHelp();
    selectedMode = 'tilt';
    setupOpen = true;
    localHold = true;
    motion.setMode('tilt');
    render();
    refs['enable-tilt'].focus({ preventScroll: true });
  });
  listen(refs.exit, 'click', () => { hold('requested'); onExit(); });
  listen(refs.ready, 'click', () => {
    if (!READY_PHASES.has(view?.phase) || !configured || connection.state !== 'connected' || pendingReady || setupOpen) return;
    if (selectedMode === 'tilt' && !sensor.calibrated) return;
    commandError = '';
    pendingReady = true;
    const value = !view.ready?.[playerId];
    pendingReadyValue = value;
    const readyVersion = ++readyGeneration;
    withdrawalRequestedAt = null;
    readyIntent = value ? { matchId: view.matchId, epoch: view.runEpoch } : null;
    activeEpoch = null;
    const matchId = view.matchId; const epoch = view.runEpoch;
    render();
    void dispatch('ready', { value }).then((reply) => {
      if (disposed || readyVersion !== readyGeneration) return;
      pendingReady = false;
      pendingReadyValue = null;
      if (reply?.accepted === false) readyIntent = null;
      if (view?.matchId === matchId && view?.runEpoch === epoch) render();
    });
  });

  function render() {
    if (disposed) return;
    const phase = PHASES.has(view?.phase) ? view.phase : 'waiting';
    const ready = !!view?.ready?.[playerId];
    shell.dataset.phase = phase;
    shell.dataset.mode = selectedMode;
    shell.dataset.sensorState = sensor.state;
    shell.dataset.connection = connection.state;
    shell.dataset.controlling = String(canControl());
    refs.connection.querySelector('span').textContent = ({ connected: 'Connected', connecting: 'Connecting', reconnecting: 'Reconnecting', offline: 'Offline', error: 'Connection issue' })[connection.state] || 'Connecting';
    refs['mode-label'].querySelector('span').textContent = selectedMode === 'touch' ? 'Touch controls' : 'Tilt controls';
    refs['mode-label'].querySelector('svg').outerHTML = icon(selectedMode === 'touch' ? 'touch' : 'phone');
    const stageNames = ['Morning Delivery', 'Switchback Grove', "Lala’s Moonlight Picnic"];
    refs.stage.textContent = view ? `${view.mode === 'practice' ? 'Practice' : `Orchard ${view.stageIndex + 1} of 3`} · ${stageNames[view.stageIndex] || 'Gravity Orchard'}` : 'Your floating garden';
    const headings = { waiting: configured ? 'Ready to roll?' : 'Make yourself comfortable', countdown: 'Here we grow', playing: localHold ? 'Controls held safely' : 'A little teamwork', paused: 'Take a breather', interlude: 'A lovely harvest', finished: 'The picnic is ready' };
    refs.phase.textContent = headings[phase];
    refs.time.textContent = phase === 'countdown' ? String(Math.max(0, Math.ceil((view?.countdownTicks || 0) / 60))) : phase === 'playing' && Number.isFinite(view?.timeRemainingTicks) ? `${Math.ceil(view.timeRemainingTicks / 60)}s` : view?.mode === 'practice' ? '∞' : '';
    const notes = {
      waiting: '', countdown: 'Get comfortable. Watch the TV.',
      playing: localHold ? 'Waiting for the shared pause.' : '',
      paused: view?.pauseReason === 'network' ? 'Reconnect, then get ready together.' : 'Both gardeners choose ready to continue.',
      interlude: 'Catch your breath before the next garden.', finished: '',
    };
    refs['phase-note'].textContent = connection.state !== 'connected' ? 'Your controls are paused while we reconnect.' : notes[phase];
    refs['phase-note'].hidden = !refs['phase-note'].textContent;
    refs.setup.hidden = !setupOpen;
    const setupCopy = {
      insecure: ['Touch is ready to play', 'Tilt needs the one-time setup on your Mac. You can play the whole game with touch.'],
      unsupported: ['Touch is ready to play', 'This browser does not provide phone tilt. Touch has all the same controls.'],
      'needs-permission': ['Play with a gentle tilt', 'Hold your phone naturally while seated. Enable tilt, then keep still briefly to find your center.'],
      denied: ['Your choice — touch works too', 'Tilt was not allowed. Use touch, or allow motion in your browser settings.'],
      'no-samples': ['No tilt readings yet', 'Tilt isn’t responding. Try centering again, or play with touch.'],
      calibrating: ['Find your comfortable center', 'Hold your phone naturally and still for a moment. No flat table or shaking needed.'],
      ready: ['Your controls are ready', 'Choose ready when you and your partner are comfortable.'],
      paused: ['Center your phone again', sensor.reason === 'rotation' ? 'The screen rotated. Hold your new comfortable grip and recenter before continuing.' : 'Keep your phone in a comfortable grip, then center it.'],
    };
    const [title, copy] = setupCopy[sensor.state] || setupCopy['needs-permission'];
    refs['setup-title'].textContent = title;
    refs['sensor-status'].textContent = copy;
    refs['enable-tilt'].hidden = !['needs-permission'].includes(sensor.state);
    refs.calibrate.hidden = !['no-samples', 'paused', 'ready'].includes(sensor.state) || selectedMode !== 'tilt';
    refs.calibration.hidden = sensor.state !== 'calibrating';
    const progress = Number.isFinite(sensor.progress) ? Math.max(0, Math.min(1, sensor.progress)) : 0;
    refs.calibration.firstElementChild.style.transform = `scaleX(${progress})`;
    refs['control-title'].textContent = selectedMode === 'touch' ? 'Your garden' : 'Your tilt';
    refs['steering-caption'].textContent = selectedMode === 'touch' ? 'Drag to steer' : 'Gently tilt to steer';
    refs.joystick.setAttribute('aria-disabled', String(!canControl() || selectedMode !== 'touch'));
    refs.brake.setAttribute('aria-disabled', String(!canControl()));
    refs.pause.disabled = !ACTIVE.has(phase) || pauseRequest?.state === 'pending';
    refs.pause.querySelector('span').textContent = pauseRequest?.state === 'pending' ? 'Pausing…' : localHold && ACTIVE.has(phase) ? 'Retry pause' : 'Pause';
    refs.recenter.disabled = !configured && sensor.state !== 'ready';
    refs['ready-panel'].hidden = !READY_PHASES.has(phase) || setupOpen;
    refs['self-ready'].textContent = `${playerName} · ${ready ? 'Ready ✓' : 'Not ready'}`;
    refs['partner-ready'].textContent = `${partnerName} · ${view?.ready?.[partnerId] ? 'Ready ✓' : 'Not ready'}`;
    refs['self-ready'].dataset.ready = String(ready);
    refs['partner-ready'].dataset.ready = String(!!view?.ready?.[partnerId]);
    refs.ready.disabled = !view || !configured || connection.state !== 'connected' || pendingReady || setupOpen || dialogOpen || (selectedMode === 'tilt' && !sensor.calibrated);
    refs.ready.querySelector('span').textContent = pendingReady ? 'Sending…' : ready ? 'Ready — tap to cancel' : phase === 'interlude' ? 'Ready for the next garden' : "I'm ready";
    refs['ready-note'].textContent = ready ? `Waiting for ${partnerName}.` : 'Both gardeners start together.';
    refs.results.hidden = phase !== 'finished';
    if (phase === 'finished') {
      const results = Array.isArray(view?.results) ? view.results : [];
      const orders = results.reduce((total, result) => total + (Number.isFinite(result.ordersCompleted) ? result.ordersCompleted : 0), 0);
      const stars = results.reduce((total, result) => total + (Number.isFinite(result.stars) ? result.stars : 0), 0);
      refs['results-summary'].textContent = `${orders} shared orders · ${stars} stars`;
    }
    refs.error.hidden = !commandError;
    refs.error.textContent = commandError;
  }

  render();
  input.setInput({ ...SAFE });

  return {
    update(nextView) {
      if (disposed || nextView?.gameId !== 'gravity-orchard' || !PHASES.has(nextView.phase)) return;
      // pause() reports status synchronously. Do not let that callback resume
      // halfway through clearing an authoritative boundary, then overwrite its
      // fresh input with SAFE. Nested fixture/stream updates settle as one unit.
      updateDepth += 1;
      try {
        const previous = view;
        const boundary = previous && (previous.matchId !== nextView.matchId || previous.runEpoch !== nextView.runEpoch || previous.phase !== nextView.phase);
        view = nextView;
        if (boundary) {
          lifecycleGeneration += 1;
          readyGeneration += 1;
          controlling = false;
          releasePointers();
          motion.pause();
          input.setInput({ ...SAFE });
          pendingReady = false;
          pendingReadyValue = null;
          commandError = '';
          if (previous.matchId !== nextView.matchId || previous.runEpoch !== nextView.runEpoch) {
            pauseRequest = null;
            withdrawalRequestedAt = null;
          }
        }
        if (!nextView.ready?.[playerId]) withdrawalRequestedAt = null;
        // Arm only a new authoritative countdown epoch following this phone's
        // deliberate ready intent. A stale countdown -> playing transition after
        // Help, cancellation or a failed pause must never release a safety hold.
        const epochKey = `${nextView.matchId}:${nextView.runEpoch}`;
        const startsRequestedRun = nextView.phase === 'countdown' && readyIntent &&
          readyIntent.matchId === nextView.matchId && nextView.runEpoch > readyIntent.epoch;
        if (startsRequestedRun && !dialogOpen && !setupOpen && configured && connection.state === 'connected') {
          activeEpoch = epochKey;
          readyIntent = null;
          localHold = false;
        }
        if (ACTIVE.has(nextView.phase) && activeEpoch !== epochKey) localHold = true;
        if (!ACTIVE.has(nextView.phase)) {
          localHold = true;
          activeEpoch = null;
          if (boundary) readyIntent = null;
        }
        if (ACTIVE.has(nextView.phase) && (localHold || dialogOpen || setupOpen || connection.state !== 'connected')) requestSharedPause('requested');
      } finally {
        updateDepth -= 1;
        if (updateDepth === 0) {
          render();
          syncControls();
        }
      }
    },
    setConnection(nextStatus) {
      if (disposed) return;
      const previousState = connection.state;
      connection = nextStatus && typeof nextStatus === 'object' ? { ...nextStatus } : { state: 'offline' };
      if (connection.state !== 'connected' && previousState === 'connected') hold('requested');
      else if (connection.state === 'connected' && previousState !== 'connected' && localHold && ACTIVE.has(view?.phase)) requestSharedPause('requested', true);
      render();
      syncControls();
    },
    dispose() {
      if (disposed) return;
      // Attempt this before detaching. Server deadman remains necessary when a
      // browser exits before the final input or pause command can be delivered.
      hold('requested');
      motion.dispose();
      disposed = true;
      for (const remove of removers) remove();
      shell.remove();
      releaseStyles();
    },
  };
}
