import { mountButton, mountTilt } from '../../phone/controls.mjs';
import { CARDS, GREEN_CENTRE, GREEN_HALF_WIDTH, PICTURE_ANGLE, PLAY_MS, cheeseAngle, slotPhase } from './cards.mjs';
import { createCardClock } from './clock.mjs';
import { button, mountHold, mountSwipe, mountTrace } from './gestures.mjs';

function addStyle(document) {
  const url = new URL('./phone.css', import.meta.url).href;
  if (document.querySelector('link[href="' + url + '"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.append(link);
}

function mountChoices(root, control, send) {
  const labels = control === 'number' ? [3, 4, 5, 6, 7, 8] : [1, 2, 3, 4];
  const buttons = labels.map((label, index) => button(root, label, 'snack-choice',
    () => send('choose', control === 'number' ? label : index)));
  return { setEnabled(value) { buttons.forEach(key => { key.disabled = !value; }); } };
}

function mountShake(root, send, window) {
  const tap = mountButton(root, { label: 'Tap!', onPress: () => send('tap') });
  const sensor = window.DeviceMotionEvent;
  let disposed = false;
  let listening = false;
  let previous;
  let last = -Infinity;
  function motion(event) {
    const linear = event.acceleration;
    const gravity = event.accelerationIncludingGravity;
    let strength = 0;
    if (linear && [linear.x, linear.y, linear.z].every(Number.isFinite)) {
      strength = Math.hypot(linear.x, linear.y, linear.z);
    } else if (gravity && [gravity.x, gravity.y, gravity.z].every(Number.isFinite)) {
      if (previous) strength = Math.hypot(gravity.x - previous.x, gravity.y - previous.y, gravity.z - previous.z);
      previous = gravity;
    }
    if (strength < 10 || event.timeStamp - last < 120) return;
    last = event.timeStamp;
    send('tap');
  }
  const mode = button(root, 'Enable shake', 'party-secondary snack-mode', async () => {
    if (listening) {
      window.removeEventListener('devicemotion', motion);
      listening = false;
      previous = undefined;
      mode.textContent = 'Enable shake';
      return;
    }
    let allowed = true;
    try {
      if (sensor.requestPermission) allowed = await sensor.requestPermission() === 'granted';
    } catch { allowed = false; }
    if (disposed) return;
    if (allowed) window.addEventListener('devicemotion', motion);
    listening = allowed;
    mode.textContent = allowed ? 'Use taps' : 'Shake unavailable';
  });
  mode.hidden = !window.isSecureContext || !sensor;
  return {
    setEnabled(value) { tap.setEnabled(value); },
    dispose() { disposed = true; window.removeEventListener('devicemotion', motion); },
  };
}

function mountPicture(root, variant, send) {
  root.innerHTML = '<div class="snack-level" aria-hidden="true"><div class="snack-picture">▥</div></div>';
  const picture = root.querySelector('.snack-picture');
  const lean = PICTURE_ANGLE[variant];
  let axis = 0;
  let timer;
  let lastSample = -Infinity;
  function paint() { picture.style.transform = 'rotate(' + (lean + axis) * .34 + 'deg)'; }
  const widget = mountTilt(root, { onInput: sample => {
    lastSample = performance.now();
    axis = Math.round(sample.x * 100);
    paint();
  } });
  const pad = root.querySelector('.party-stick');
  pad.textContent = '← Drag →';
  pad.setAttribute('aria-label', 'Drag to level the picture');
  const mode = root.querySelector('.party-secondary');
  mode.classList.add('snack-mode');
  paint();
  return {
    setEnabled(value, preparing) {
      widget.setEnabled(value);
      if (preparing) mode.disabled = false;
      if (value && timer === undefined) timer = setInterval(() => {
        if (pad.disabled && performance.now() - lastSample > 175 && axis !== 0) {
          axis = 0;
          paint();
        }
        send('axis', axis);
      }, 65);
      if (!value && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
        axis = 0;
        paint();
      }
    },
    dispose() { clearInterval(timer); widget.dispose(); },
  };
}

function mountTimingCue(root, visual, variant) {
  const document = root.ownerDocument;
  const note = document.createElement('div');
  note.className = 'snack-timing';
  note.setAttribute('aria-hidden', 'true');
  root.prepend(note);
  let cycle;
  let lead;
  let animation;
  if (visual === 'bar') {
    note.innerHTML = '<div class="snack-green"></div><i></i>';
    const green = note.querySelector('div');
    green.style.left = (GREEN_CENTRE - GREEN_HALF_WIDTH) + '%';
    green.style.width = (2 * GREEN_HALF_WIDTH) + '%';
    cycle = 2200 / (1 + variant / 16);
    lead = 280 / (1 + variant / 16);
    animation = note.querySelector('i').animate([{ left: '0%' }, { left: '100%' }, { left: '0%' }],
      { duration: cycle, iterations: Infinity });
  } else {
    note.classList.add('snack-wheel');
    note.innerHTML = '<div class="snack-needle"><i></i></div><div class="snack-pin"></div><div class="snack-cheese"></div>';
    cycle = 360 / (.16 + variant * .008);
    lead = 0;
    const start = cheeseAngle(0, variant);
    animation = note.querySelector('.snack-needle').animate([
      { transform: 'rotate(' + start + 'deg)' }, { transform: 'rotate(' + (start + 360) + 'deg)' },
    ], { duration: cycle, iterations: Infinity });
  }
  animation.pause();
  animation.currentTime = lead;
  return {
    sync(at, live) {
      const desired = Math.max(0, Math.min(PLAY_MS, at)) + lead;
      if (Math.abs(animation.currentTime - desired) > 35 || !live) animation.currentTime = desired;
      if (live && animation.playState !== 'running') animation.play();
      if (!live && animation.playState === 'running') animation.pause();
    },
    dispose() { animation.cancel(); },
  };
}

export function mountSnackStackPhone(root, { input }) {
  const document = root.ownerDocument;
  const window = document.defaultView;
  addStyle(document);
  root.classList.add('snack-phone');
  root.innerHTML = '<p class="snack-brief"></p><div class="snack-control"></div><output class="snack-feedback"></output>';
  const brief = root.querySelector('.snack-brief');
  const controls = root.querySelector('.snack-control');
  const feedback = root.querySelector('.snack-feedback');
  const clock = createCardClock();
  let current;
  let widget;
  let cue;
  let allowed = false;
  let pendingAt;
  let localTaps = 0;
  let liveUntil;
  let liveFrom;
  let closeTimer;

  function refreshFeedback() {
    if (!current) return;
    const card = CARDS[current.c];
    const phase = slotPhase(current.t);
    let text = '';
    if (phase === 'score') text = '+' + current.g + ' · ' + current.s + ' total';
    else if (phase === 'preview' && allowed) text = 'Get ready';
    else if (pendingAt !== undefined || current.d) text = 'Locked in';
    else if (phase === 'check') text = 'Time!';
    else if (card.control === 'tap' || card.control === 'shake') text = String(Math.max(localTaps, current.n));
    if (feedback.textContent !== text) feedback.textContent = text;
  }

  function send(kind, value = 0, stamp = clock.at(performance.now())) {
    if (!allowed || !current || pendingAt !== undefined || current.d || stamp < 0 || stamp >= PLAY_MS) return false;
    const submitted = input({ kind, slot: current.i, at: stamp, value });
    if (submitted === false) return false;
    if (kind === 'choose' || kind === 'up' || (kind === 'tap' && CARDS[current.c].control === 'stop')) pendingAt = stamp;
    if (kind === 'tap' && ['exact-seven', 'quick-taps'].includes(CARDS[current.c].id)) localTaps++;
    refreshFeedback();
    return true;
  }

  function rebuild(card, state) {
    widget?.dispose?.();
    cue?.dispose();
    widget = cue = undefined;
    controls.replaceChildren();
    controls.dataset.control = card.control;
    brief.textContent = card.instruction;
    if (card.control === 'hold') {
      widget = mountHold(controls, send, () => {
        const local = performance.now();
        const stamp = clock.at(local);
        return send('down', 0, stamp) ? { local, stamp } : undefined;
      }, ({ local, stamp }) => send('up', 0, stamp + Math.round(performance.now() - local)));
    } else if (card.control === 'swipe') widget = mountSwipe(controls, send);
    else if (card.control === 'trace') widget = mountTrace(controls, send);
    else if (card.control === 'number' || card.control === 'choice') widget = mountChoices(controls, card.control, send);
    else if (card.control === 'tilt') widget = mountPicture(controls, state.v, send);
    else if (card.control === 'shake') widget = mountShake(controls, send, window);
    else widget = mountButton(controls, {
      label: card.control === 'stop' ? 'Stop!' : 'Tap!', onPress: () => send('tap'),
    });
    if (card.visual === 'bar' || card.visual === 'wheel') cue = mountTimingCue(controls, card.visual, state.v);
  }

  function paintClock() {
    const now = performance.now();
    const at = clock.at(now);
    const live = allowed && now >= liveFrom && now < liveUntil;
    const acceptsInput = live && pendingAt === undefined && !current.d;
    widget?.setEnabled(acceptsInput, allowed && now < liveFrom);
    cue?.sync(pendingAt ?? (Number.isFinite(at) ? at : 0), acceptsInput);
    clearTimeout(closeTimer);
    if (allowed && now < liveFrom) closeTimer = setTimeout(paintClock, liveFrom - now + 1);
    else if (live) closeTimer = setTimeout(paintClock, liveUntil - now + 1);
  }

  return {
    update(state, enabled) {
      root.dataset.active = String(enabled);
      if (!state) {
        allowed = false;
        current = undefined;
        widget?.dispose?.();
        cue?.dispose();
        widget = cue = undefined;
        controls.replaceChildren();
        clearTimeout(closeTimer);
        return;
      }
      const isNew = !current || state.i !== current.i || state.c !== current.c || state.t < current.t;
      if (isNew) {
        clock.reset();
        pendingAt = undefined;
        localTaps = 0;
        rebuild(CARDS[state.c], state);
      } else if (!enabled && allowed) {
        clock.reset();
        if (!state.d) pendingAt = undefined;
      }
      current = state;
      if (enabled) {
        const now = performance.now();
        clock.sample(state.t, now);
        const at = clock.at(now);
        liveFrom = now - at;
        liveUntil = liveFrom + PLAY_MS;
      }
      allowed = enabled;
      root.dataset.phase = slotPhase(state.t);
      widget.update?.(state.n);
      paintClock();
      refreshFeedback();
    },
    dispose() {
      clearTimeout(closeTimer);
      widget?.dispose?.();
      cue?.dispose();
      root.classList.remove('snack-phone');
      delete root.dataset.active;
      delete root.dataset.phase;
      root.replaceChildren();
    },
  };
}
