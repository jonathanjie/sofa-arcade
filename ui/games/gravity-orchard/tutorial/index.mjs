import { LESSONS, DIRECTIONS, createLessonState } from './lessons.mjs';
import { fruitIcon, tutorialGraphic } from './graphics.mjs';
import { TUTORIAL_STYLE } from './styles.mjs';

const mounted = new WeakMap();
let sequence = 0;

function controlsFor(step) {
  if (step === 0) return '<button type="button" data-tutorial-action="recenter">Try a comfortable centre</button>';
  if (step === 1) return `<div class="go-tutorial__steering"><div class="go-tutorial__seats"><button type="button" data-tutorial-action="select-jon" aria-pressed="true">Steer Jon’s tray</button><button type="button" data-tutorial-action="select-lydia" aria-pressed="false">Steer Lydia’s tray</button></div><div class="go-tutorial__dpad" role="group" aria-label="Practice steering arrows"><button type="button" data-tutorial-action="steer" data-direction="up" aria-label="Steer up">↑</button><button type="button" data-tutorial-action="steer" data-direction="left" aria-label="Steer left">←</button><span aria-hidden="true">✥</span><button type="button" data-tutorial-action="steer" data-direction="right" aria-label="Steer right">→</button><button type="button" data-tutorial-action="steer" data-direction="down" aria-label="Steer down">↓</button></div></div>`;
  if (step === 2) return '<button type="button" data-tutorial-action="brake" aria-pressed="false" aria-label="Hold Brake">Ⅱ BRAKE</button>';
  if (step === 3) return '<button type="button" data-tutorial-action="pass">Pass the pear to Lydia →</button>';
  if (step === 4) return `<button type="button" data-tutorial-action="catch" data-fruit="apple">${fruitIcon('apple')}Apple</button><button type="button" data-tutorial-action="catch" data-fruit="pear">${fruitIcon('pear')}Pear</button>`;
  if (step === 5) return '<button type="button" data-tutorial-action="deliver">Deliver the first apple</button>';
  if (step === 6) return '<button type="button" data-tutorial-action="forecast">Preview the gust →</button><button type="button" data-tutorial-action="brake" aria-pressed="false" aria-label="Hold Brake">Ⅱ BRAKE</button>';
  return '<button type="button" data-tutorial-action="pause">Pause practice</button><button type="button" data-tutorial-action="ready-jon" aria-pressed="false" disabled>Jon ready</button><button type="button" data-tutorial-action="ready-lydia" aria-pressed="false" disabled>Lydia ready</button>';
}

function readoutFor(state) {
  if (state.step === 0) return state.centred ? 'Centre remembered in this demonstration' : 'Comfort first · a small movement is enough';
  if (state.step === 1) return `Steering ${state.selected === 'jon' ? 'Jon' : 'Lydia'} · ${Number(state.moved.jon) + Number(state.moved.lydia)} of 2 trays tried`;
  if (state.step === 2) return state.brakeHeld ? 'Brake held · movement softened' : state.done ? 'Brake released · steering can return' : 'Fruit rolling · hold Brake to steady it';
  if (state.step === 3) return state.done ? 'Pear received by Lydia' : state.passing ? 'Passing across the shared bridge…' : 'Jon sends · Lydia receives';
  if (state.step === 4) return state.basketAttempt === 'pear' ? 'Pear basket · 1 of 3 buffer places filled' : state.basketAttempt === 'apple' ? 'Wrong basket · the apple stays in play' : 'Look for the same shape on fruit and basket';
  if (state.step === 5) return state.done ? '1 shared order filled · 0 fruit left in these buffers' : `${state.deliveries} apples buffered · 0 pears buffered · capacity 3 each`;
  if (state.step === 6) return state.braced ? 'Braced · gust points right →' : state.forecastStarted ? 'Gust points right → · hold Brake now' : 'Striped compost · dashed gate · directional gust';
  if (state.done) return 'Practice complete · your real run waits for readiness';
  if (state.resumeMs !== null) return `Both ready · starting in ${Math.max(1, 3 - Math.floor(state.resumeMs / 1000))}`;
  return state.paused ? `Paused · ${Number(state.ready.jon) + Number(state.ready.lydia)} of 2 gardeners ready` : 'Pause this private practice garden';
}

/**
 * Optional, isolated teaching surface. Its only outward action is onClose().
 * No room object, dispatcher, sensor source or persistent run can be injected.
 *
 * reducedMotion accepts a boolean, a current-value function, or a MediaQueryList.
 * The operating-system preference is always honored and can change while mounted.
 */
export function mountTutorial(root, { onClose = () => {}, inputMode = 'touch', reducedMotion = false } = {}) {
  if (!root?.ownerDocument || typeof root.appendChild !== 'function') throw new TypeError('The tutorial needs a DOM root.');
  mounted.get(root)?.dispose();
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win?.requestAnimationFrame) throw new TypeError('The tutorial needs a browser animation frame scheduler.');
  const previousFocus = doc.activeElement;
  const prefix = `go-tutorial-${++sequence}`;
  const style = doc.createElement('style');
  style.dataset.goTutorialStyle = '';
  style.textContent = TUTORIAL_STYLE;
  const host = doc.createElement('div');
  host.className = 'go-tutorial';
  host.dataset.goTutorial = '';
  host.innerHTML = `<section class="go-tutorial__dialog" role="dialog" aria-modal="true" aria-labelledby="${prefix}-title" aria-describedby="${prefix}-intro" tabindex="-1"><header class="go-tutorial__top"><div><span class="go-tutorial__eyebrow">A little guided practice <span data-tutorial-counter></span></span><div class="go-tutorial__progress" aria-hidden="true">${LESSONS.map(() => '<i></i>').join('')}</div></div><button type="button" data-tutorial-action="close" aria-label="Close tutorial and return to your garden">Close ×</button></header><main class="go-tutorial__main" data-tutorial-content></main><footer class="go-tutorial__footer"><button type="button" data-tutorial-action="back" disabled>← Back</button><p>This practice garden is separate from your run.</p><button type="button" class="go-tutorial__next" data-tutorial-action="next" disabled>Next →</button></footer></section>`;
  root.append(style, host);
  const dialog = host.querySelector('[role="dialog"]');
  const content = host.querySelector('[data-tutorial-content]');
  const nextButton = host.querySelector('[data-tutorial-action="next"]');
  const backButton = host.querySelector('[data-tutorial-action="back"]');
  const motionQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const injectedQuery = reducedMotion && typeof reducedMotion === 'object' && typeof reducedMotion.addEventListener === 'function' ? reducedMotion : null;
  const inertRecords = [];
  let state = createLessonState();
  let disposed = false;
  let frame = 0;
  let lastTime = null;
  let dirty = true;
  let motion = false;
  let brakePointer = null;
  let brakeKey = null;
  let lastGraphic = '';
  let lastFeedback = '';
  let lastReadout = '';

  // Mark only sibling branches inert. The provided root and all its ancestors stay usable.
  // Restore the exact previous state when this isolated modal is removed.
  for (let branch = host; branch && branch !== doc.body; branch = branch.parentElement) {
    const parent = branch.parentElement;
    if (!parent) break;
    for (const sibling of parent.children) {
      if (sibling === branch || ['STYLE', 'SCRIPT', 'LINK', 'TEMPLATE'].includes(sibling.tagName)) continue;
      inertRecords.push([sibling, sibling.inert]);
      sibling.inert = true;
    }
  }

  function readMotion() {
    let preference = reducedMotion;
    if (typeof reducedMotion === 'function') {
      try { preference = reducedMotion(); } catch { preference = false; }
    }
    return preference === true || preference?.matches === true || motionQuery?.matches === true;
  }

  function changed() { dirty = true; }

  function renderStep({ focus = true } = {}) {
    if (disposed) return;
    const lesson = LESSONS[state.step];
    dialog.dataset.tutorialStep = String(state.step);
    host.querySelector('[data-tutorial-counter]').textContent = `${state.step + 1} / ${LESSONS.length}`;
    host.querySelectorAll('.go-tutorial__progress i').forEach((el, index) => { el.dataset.complete = String(index <= state.step); });
    content.innerHTML = `<div class="go-tutorial__visual"><div class="go-tutorial__garden" data-tutorial-garden></div><div class="go-tutorial__readout" data-tutorial-readout></div></div><div class="go-tutorial__copy"><h2 id="${prefix}-title" tabindex="-1">${lesson.title}</h2><p id="${prefix}-intro">${state.step === 0 && inputMode !== 'tilt' ? lesson.touchText : lesson.text}</p><p class="go-tutorial__prompt">${lesson.prompt}</p><div class="go-tutorial__actions">${controlsFor(state.step)}</div><div class="go-tutorial__feedback" data-tutorial-feedback role="status" aria-live="polite" aria-atomic="true" data-complete="false"></div></div>`;
    backButton.disabled = state.step === 0;
    nextButton.textContent = state.step === LESSONS.length - 1 ? 'Return to garden' : 'Next →';
    lastGraphic = lastFeedback = lastReadout = '';
    dirty = true;
    paint();
    content.scrollTop = 0;
    if (focus) content.querySelector('h2').focus({ preventScroll: true });
  }

  function paint() {
    if (disposed) return;
    host.dataset.reducedMotion = String(motion);
    const graphic = tutorialGraphic(state, prefix);
    if (graphic !== lastGraphic) {
      content.querySelector('[data-tutorial-garden]').innerHTML = graphic;
      lastGraphic = graphic;
    }
    const feedback = state.done ? LESSONS[state.step].success : state.step === 4 && state.basketAttempt === 'apple' ? 'That apple bounced back. It belongs in the apple basket on Jon’s tray. Try the pear.' : state.step === 6 && state.brakeHeld && !state.forecastStarted ? 'Start the forecast, then brace with Brake as the arrow points right.' : 'Take your time. You can close this practice at any point.';
    if (feedback !== lastFeedback) {
      content.querySelector('[data-tutorial-feedback]').textContent = feedback;
      lastFeedback = feedback;
    }
    content.querySelector('[data-tutorial-feedback]').dataset.complete = String(state.done);
    const readout = readoutFor(state);
    if (readout !== lastReadout) {
      content.querySelector('[data-tutorial-readout]').textContent = readout;
      lastReadout = readout;
    }
    nextButton.disabled = !state.done;
    const brake = content.querySelector('[data-tutorial-action="brake"]');
    if (brake) brake.setAttribute('aria-pressed', String(state.brakeHeld));
    if (state.step === 1) {
      content.querySelector('[data-tutorial-action="select-jon"]').setAttribute('aria-pressed', String(state.selected === 'jon'));
      content.querySelector('[data-tutorial-action="select-lydia"]').setAttribute('aria-pressed', String(state.selected === 'lydia'));
    }
    if (state.step === 3) content.querySelector('[data-tutorial-action="pass"]').disabled = state.passing || state.done;
    if (state.step === 5) {
      const deliver = content.querySelector('[data-tutorial-action="deliver"]');
      deliver.disabled = state.done;
      deliver.textContent = ['Deliver the first apple', 'Deliver the second apple', 'Deliver the pear', 'Order filled ✓'][state.deliveries];
    }
    if (state.step === 7) {
      content.querySelector('[data-tutorial-action="pause"]').disabled = state.paused;
      for (const player of ['jon', 'lydia']) {
        const ready = content.querySelector(`[data-tutorial-action="ready-${player}"]`);
        ready.disabled = !state.paused || state.ready[player];
        ready.setAttribute('aria-pressed', String(state.ready[player]));
      }
    }
    dirty = false;
  }

  function releaseBrake() {
    if (!state.brakeHeld && brakePointer === null && brakeKey === null) return;
    state.brakeHeld = false;
    brakePointer = null;
    brakeKey = null;
    dirty = true;
  }

  function holdBrake() {
    if (state.step !== 2 && state.step !== 6) return;
    state.brakeHeld = true;
    if (state.step === 6 && state.forecastStarted) {
      state.braced = true;
      state.done = true;
    }
    dirty = true;
    paint();
  }

  function steer(direction) {
    if (state.step !== 1 || !DIRECTIONS[direction]) return;
    const position = state.positions[state.selected];
    const { x, y } = DIRECTIONS[direction];
    position.x = Math.max(state.selected === 'jon' ? 105 : 605, Math.min(state.selected === 'jon' ? 365 : 865, position.x + x * 26));
    position.y = Math.max(155, Math.min(265, position.y + y * 26));
    state.moved[state.selected] = true;
    state.done = state.moved.jon && state.moved.lydia;
    dirty = true;
  }

  function action(event) {
    const button = event.target.closest?.('[data-tutorial-action]');
    if (disposed || !button || !host.contains(button) || button.disabled) return;
    const kind = button.dataset.tutorialAction;
    if (kind === 'brake') return; // Held pointer/keyboard state is handled separately.
    event.preventDefault();
    if (kind === 'close') { close(); return; }
    if (kind === 'back' || kind === 'next') {
      if (kind === 'next' && !state.done) return;
      if (kind === 'next' && state.step === LESSONS.length - 1) { close(); return; }
      const step = state.step + (kind === 'next' ? 1 : -1);
      if (step < 0 || step >= LESSONS.length) return;
      releaseBrake();
      state = createLessonState(step);
      lastTime = null;
      renderStep();
      return;
    }
    if (state.step === 0 && kind === 'recenter') { state.centred = true; state.done = true; }
    if (state.step === 1) {
      if (kind === 'select-jon' || kind === 'select-lydia') state.selected = kind.slice(7);
      if (kind === 'steer') steer(button.dataset.direction);
    }
    if (state.step === 3 && kind === 'pass' && !state.done) {
      state.passing = true;
      if (motion) { state.passProgress = 1; state.done = true; state.passing = false; }
    }
    if (state.step === 4 && kind === 'catch' && ['apple', 'pear'].includes(button.dataset.fruit)) {
      state.basketAttempt = button.dataset.fruit;
      state.done = state.basketAttempt === 'pear';
    }
    if (state.step === 5 && kind === 'deliver' && state.deliveries < 3) {
      state.deliveries += 1;
      state.done = state.deliveries === 3;
    }
    if (state.step === 6 && kind === 'forecast') {
      state.forecastStarted = true;
      state.forecastMs = 0;
      state.braced = false;
      state.done = false;
      if (state.brakeHeld) { state.braced = true; state.done = true; }
    }
    if (state.step === 7) {
      if (kind === 'pause') state.paused = true;
      if (state.paused && (kind === 'ready-jon' || kind === 'ready-lydia')) {
        state.ready[kind.slice(6)] = true;
        if (state.ready.jon && state.ready.lydia && state.resumeMs === null) state.resumeMs = 0;
      }
    }
    dirty = true;
    paint();
  }

  function pointerDown(event) {
    const button = event.target.closest?.('[data-tutorial-action="brake"]');
    if (disposed || !button || !host.contains(button) || button.disabled || (event.button !== undefined && event.button !== 0)) return;
    if (brakePointer !== null) return;
    event.preventDefault();
    brakePointer = event.pointerId;
    button.focus({ preventScroll: true });
    try { button.setPointerCapture(event.pointerId); } catch { /* A detached pointer is neutralized by pointercancel/blur. */ }
    holdBrake();
  }

  function pointerUp(event) {
    if (brakePointer !== null && event.pointerId === brakePointer) {
      releaseBrake();
      paint();
    }
  }

  function focusables() {
    return [...dialog.querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]')]
      .filter(el => !el.hidden && el.getClientRects().length > 0);
  }

  function keyDown(event) {
    if (disposed) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!host.contains(event.target)) return;
    if (event.key === 'Tab') {
      const controls = focusables();
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (doc.activeElement === first || !controls.includes(doc.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (doc.activeElement === last || !controls.includes(doc.activeElement))) {
        event.preventDefault(); first.focus();
      }
      return;
    }
    const arrow = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' }[event.key];
    if (state.step === 1 && arrow) { event.preventDefault(); steer(arrow); paint(); return; }
    const button = event.target.closest?.('[data-tutorial-action="brake"]');
    if (button && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      brakeKey = event.key;
      holdBrake();
    }
  }

  function keyUp(event) {
    if (brakeKey !== null && event.key === brakeKey) { event.preventDefault(); releaseBrake(); paint(); }
  }

  function focusIn(event) {
    if (!disposed && !host.contains(event.target)) (focusables()[0] || dialog).focus({ preventScroll: true });
  }

  function visibilityChanged() {
    lastTime = null;
    if (doc.hidden) releaseBrake();
  }

  function tick(time) {
    if (disposed) return;
    const dt = lastTime === null || doc.hidden ? 0 : Math.max(0, Math.min(50, time - lastTime));
    lastTime = time;
    const nextMotion = readMotion();
    if (nextMotion !== motion) { motion = nextMotion; dirty = true; }
    if (state.step === 2) {
      if (state.brakeHeld) {
        state.speed = Math.max(0, state.speed - dt * .6);
        state.brakeHeldMs += dt;
        if (state.brakeHeldMs >= 300) state.done = true;
      } else {
        state.speed = Math.min(100, state.speed + dt * .24);
        state.brakeHeldMs = 0;
      }
      if (!motion) {
        state.rollX += state.rollDirection * state.speed * dt / 1000;
        if (state.rollX >= 360) { state.rollX = 360; state.rollDirection = -1; }
        if (state.rollX <= 110) { state.rollX = 110; state.rollDirection = 1; }
      }
      dirty = true;
    }
    if (state.step === 3 && state.passing) {
      state.passProgress = motion ? 1 : Math.min(1, state.passProgress + dt / 900);
      if (state.passProgress >= 1) { state.passing = false; state.done = true; }
      dirty = true;
    }
    if (state.step === 6 && state.forecastStarted && state.forecastMs < 4500) {
      const before = Math.floor(state.forecastMs / 1000);
      state.forecastMs = Math.min(4500, state.forecastMs + dt);
      if (state.forecastMs === 4500 || before !== Math.floor(state.forecastMs / 1000)) dirty = true;
    }
    if (state.step === 7 && state.resumeMs !== null && !state.done) {
      const before = Math.floor(state.resumeMs / 1000);
      state.resumeMs = Math.min(3000, state.resumeMs + dt);
      if (state.resumeMs === 3000) state.done = true;
      if (state.done || before !== Math.floor(state.resumeMs / 1000)) dirty = true;
    }
    if (dirty) paint();
    frame = win.requestAnimationFrame(tick);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    win.cancelAnimationFrame(frame);
    host.removeEventListener('click', action);
    host.removeEventListener('pointerdown', pointerDown);
    doc.removeEventListener('pointerup', pointerUp, true);
    doc.removeEventListener('pointercancel', pointerUp, true);
    doc.removeEventListener('lostpointercapture', pointerUp, true);
    doc.removeEventListener('keydown', keyDown, true);
    doc.removeEventListener('keyup', keyUp, true);
    doc.removeEventListener('focusin', focusIn, true);
    doc.removeEventListener('visibilitychange', visibilityChanged);
    win.removeEventListener('blur', releaseBrake);
    motionQuery?.removeEventListener?.('change', changed);
    injectedQuery?.removeEventListener?.('change', changed);
    releaseBrake();
    host.remove();
    style.remove();
    for (const [element, inert] of inertRecords) element.inert = inert;
    if (mounted.get(root) === api) mounted.delete(root);
    if (previousFocus?.isConnected && !previousFocus.disabled && !previousFocus.inert) previousFocus.focus?.({ preventScroll: true });
  }

  function close() {
    if (disposed) return;
    dispose();
    if (typeof onClose === 'function') onClose();
  }

  const api = Object.freeze({ dispose });
  mounted.set(root, api);
  host.addEventListener('click', action);
  host.addEventListener('pointerdown', pointerDown);
  doc.addEventListener('pointerup', pointerUp, true);
  doc.addEventListener('pointercancel', pointerUp, true);
  doc.addEventListener('lostpointercapture', pointerUp, true);
  doc.addEventListener('keydown', keyDown, true);
  doc.addEventListener('keyup', keyUp, true);
  doc.addEventListener('focusin', focusIn, true);
  doc.addEventListener('visibilitychange', visibilityChanged);
  win.addEventListener('blur', releaseBrake);
  motionQuery?.addEventListener?.('change', changed);
  injectedQuery?.addEventListener?.('change', changed);
  motion = readMotion();
  renderStep();
  frame = win.requestAnimationFrame(tick);
  return api;
}
