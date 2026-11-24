import { mountButton, mountTilt } from '../../phone/controls.mjs';
import {
  CARDS, EXACT_TAP_TARGET, GREEN_CENTRE, LALA_TAPS, PEPPER_TAPS, PICTURE_ANGLE, PLAY_MS, QUICK_TAP_TARGET,
  cheeseAngle, cheeseHalfWidth, greenHalfWidth, greenPosition, lalaLooks, slotPhase,
} from './cards.mjs';
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
  const tap = mountButton(root, { label: 'Tap pepper', onPress: () => send('tap') });
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

function mountTimingCue(root, visual, variant, difficulty) {
  const note = root.ownerDocument.createElement('div');
  note.className = 'snack-timing';
  note.setAttribute('aria-hidden', 'true');
  root.prepend(note);

  if (visual === 'bar') {
    note.innerHTML = '<div class="snack-green">Release</div><i></i>';
    const green = note.firstElementChild;
    const marker = note.lastElementChild;
    const halfWidth = greenHalfWidth(difficulty);
    green.style.left = (GREEN_CENTRE - halfWidth) + '%';
    green.style.width = (2 * halfWidth) + '%';
    return at => { marker.style.left = greenPosition(at, variant) + '%'; };
  }
  if (visual === 'wheel') {
    note.classList.add('snack-wheel');
    note.style.setProperty('--cheese-half', cheeseHalfWidth(difficulty) + 'deg');
    note.innerHTML = '<div class="snack-needle"><i></i></div><div class="snack-pin"></div><div class="snack-cheese">🧀</div>';
    const needle = note.firstElementChild;
    return at => { needle.style.transform = 'rotate(' + cheeseAngle(at, variant) + 'deg)'; };
  }
  note.classList.add('snack-stopwatch');
  return (_at, heldFor) => {
    const value = (Math.max(0, heldFor) / 1000).toFixed(1) + ' / 3 s';
    if (note.textContent !== value) note.textContent = value;
  };
}

const TAP_TARGETS = { seven: EXACT_TAP_TARGET, burst: QUICK_TAP_TARGET, pepper: PEPPER_TAPS, lookout: LALA_TAPS };

export function mountSnackStackPhone(root, { input, serverNow }) {
  const document = root.ownerDocument;
  const window = document.defaultView;
  addStyle(document);
  root.classList.add('snack-phone');
  root.innerHTML = '<p class="snack-brief"></p><div class="snack-control"></div><output class="snack-feedback"></output>';
  const brief = root.querySelector('.snack-brief');
  const controls = root.querySelector('.snack-control');
  const feedback = root.querySelector('.snack-feedback');
  const clock = createCardClock(serverNow);
  let practiceTaps = 0;
  const practice = button(root, 'Warm up · 0 taps', 'snack-practice', () => {
    practiceTaps = (practiceTaps + 1) % 100;
    practice.textContent = 'Warm up · ' + practiceTaps + (practiceTaps === 1 ? ' tap' : ' taps');
  });
  practice.hidden = true;
  let current;
  let widget;
  let cue;
  let tapPad;
  let allowed = false;
  let waiting = false;
  let pendingAt;
  let holdingAt;
  let localTaps = 0;
  let frame;
  let enabled;
  let preparing;

  function refreshFeedback(at = clock.at(current?.a)) {
    const visual = current && CARDS[current.c].visual;
    const count = current ? Math.max(localTaps, current.n) : 0;
    const reachedExactTarget = visual === 'seven' && count >= EXACT_TAP_TARGET;
    const locked = current?.d || pendingAt !== undefined || current?.g !== undefined;
    practice.hidden = !(waiting || (allowed && (locked || reachedExactTarget)));
    if (!current) return;
    const target = TAP_TARGETS[visual];
    let text = '';
    if (current.g !== undefined) text = '+' + current.g + ' · ' + current.s + ' total';
    else if (allowed && at === null) text = 'Syncing clock…';
    else if (at < 0 && allowed) text = 'Get ready';
    else if (pendingAt !== undefined || current.d) text = 'Locked in';
    else if (at >= PLAY_MS) text = 'Time!';
    else if (target) {
      text = count + ' / ' + target;
      if (visual === 'seven' && count === EXACT_TAP_TARGET) text += ' · Stop';
    }
    if (feedback.textContent !== text) feedback.textContent = text;
  }

  function send(kind, value = 0) {
    const at = clock.at(current?.a);
    if (!allowed || at === null || pendingAt !== undefined || current.d || at < 0 || at >= PLAY_MS) return false;
    if (input({ kind, slot: current.i, at, value }) === false) return false;
    const card = CARDS[current.c];
    if (kind === 'down') holdingAt = at;
    if (kind === 'cancel') holdingAt = undefined;
    if (kind === 'choose' || kind === 'up' || (kind === 'tap' && card.control === 'stop')) pendingAt = at;
    if (kind === 'tap' && ['seven', 'burst'].includes(card.visual)) localTaps++;
    refreshFeedback(at);
    return true;
  }

  function clearWidget() {
    widget?.dispose?.();
    widget = cue = tapPad = undefined;
    enabled = preparing = undefined;
    controls.replaceChildren();
    cancelAnimationFrame(frame);
    frame = undefined;
  }

  function rebuild(card, state) {
    clearWidget();
    controls.dataset.control = card.control;
    brief.textContent = card.instruction;
    if (card.control === 'hold') widget = mountHold(controls, send);
    else if (card.control === 'swipe') widget = mountSwipe(controls, send);
    else if (card.control === 'trace') widget = mountTrace(controls, send);
    else if (card.control === 'number' || card.control === 'choice') widget = mountChoices(controls, card.control, send);
    else if (card.control === 'tilt') widget = mountPicture(controls, state.v, send);
    else if (card.control === 'shake') widget = mountShake(controls, send, window);
    else {
      widget = mountButton(controls, { label: card.control === 'stop' ? 'Stop!' : 'Tap!', onPress: () => send('tap') });
      if (card.visual === 'lookout') tapPad = controls.querySelector('button');
    }
    if (['bar', 'wheel', 'timer'].includes(card.visual)) {
      cue = mountTimingCue(controls, card.visual, state.v, state.b);
    }
  }

  function paintClock() {
    frame = undefined;
    if (!current) return;
    const at = clock.at(current.a);
    const live = allowed && at !== null && at >= 0 && at < PLAY_MS;
    const acceptsInput = live && pendingAt === undefined && !current.d;
    const isPreparing = allowed && at < 0;
    if (enabled !== acceptsInput || preparing !== isPreparing) {
      enabled = acceptsInput;
      preparing = isPreparing;
      widget.setEnabled(enabled, preparing);
    }
    const displayAt = Math.max(0, Math.min(PLAY_MS, pendingAt ?? at ?? 0));
    cue?.(displayAt, holdingAt === undefined ? 0 : displayAt - holdingAt);
    if (tapPad) {
      const looking = !live || lalaLooks(displayAt, current.v, current.b);
      const label = looking ? 'Wait' : 'Tap!';
      if (tapPad.textContent !== label) {
        tapPad.textContent = label;
        tapPad.setAttribute('aria-label', label);
      }
      tapPad.classList.toggle('snack-wait', looking);
    }
    refreshFeedback(at);
    if (allowed && current.a !== undefined && (at === null || at < PLAY_MS)) frame = requestAnimationFrame(paintClock);
  }

  return {
    practiceWhileWaiting: true,
    update(state, enabled, { practice: practicing = false } = {}) {
      waiting = practicing;
      root.dataset.active = String(enabled);
      allowed = enabled;
      if (!state || waiting) {
        current = undefined;
        clearWidget();
        brief.textContent = '';
        feedback.textContent = '';
        refreshFeedback();
        return;
      }
      const isNew = !current || state.i !== current.i || state.c !== current.c || state.t < current.t;
      if (isNew) {
        pendingAt = holdingAt = undefined;
        localTaps = practiceTaps = 0;
        practice.textContent = 'Warm up · 0 taps';
        rebuild(CARDS[state.c], state);
      } else if (!enabled && !state.d) pendingAt = holdingAt = undefined;
      current = state;
      root.dataset.phase = slotPhase(state.t);
      widget.update?.(state.n);
      cancelAnimationFrame(frame);
      paintClock();
    },
    dispose() {
      clearWidget();
      root.classList.remove('snack-phone');
      delete root.dataset.active;
      delete root.dataset.phase;
      root.replaceChildren();
    },
  };
}
