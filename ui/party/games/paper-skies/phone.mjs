import { mountTilt } from '../../phone/controls.mjs';

const SEND_MS = 50;
const MODES = ['Sun Chains', 'Sky Balloons', 'Sun Crown'];
const axis = value => Math.round(1000 * Math.max(-1, Math.min(1, value))) / 1000;

export function mountPaperSkiesPhone(root, { input }) {
  const document = root.ownerDocument;
  const view = document.defaultView;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./phone.css', import.meta.url).href;
  root.innerHTML = `<div class="ps-phone">
    <header class="ps-status"><strong data-mode>Practice</strong><span>Score <b data-score>0</b></span><span data-context hidden></span></header>
    <div class="ps-cockpit">
      <div class="ps-compass" aria-hidden="true" data-compass>
        <div class="ps-horizon"></div>
        <div class="ps-wings"></div>
        <div class="ps-arrow" data-arrow hidden></div>
      </div>
      <div class="ps-gauges">
        <span class="ps-target" data-target>Bank to steer</span>
        <label class="ps-fuel">FUEL <progress max="100" value="100" aria-label="Fuel"></progress></label>
        <label class="ps-alt">ALT <progress max="100" value="0" aria-label="Altitude"></progress></label>
      </div>
    </div>
    <p class="ps-tilt-tip">Rotate sideways &amp; tap Enable tilt to fly</p>
    <div class="ps-controls"><div class="ps-steer"></div><div class="ps-actions">
      <button type="button" class="ps-roll" aria-pressed="false">ROLL</button>
      <button type="button" class="ps-loop" aria-pressed="false">LOOP</button>
      <button type="button" class="ps-boost" aria-pressed="false">BOOST</button>
    </div></div>
  </div>`;
  root.prepend(stylesheet);
  const find = selector => root.querySelector(selector);
  const panel = find('.ps-phone');
  const boost = find('.ps-boost');
  const roll = find('.ps-roll');
  const loop = find('.ps-loop');
  let active = false, practice = false, disposed = false;
  let x = 0, y = 0, b = 0, r = 0, l = 0;
  let lastSend = -Infinity, pendingRoll = false, pendingLoop = false, dirty = false;
  const listeners = [];
  const enabled = () => active || practice;
  const payload = () => ({ kind: 'fly', x, y, b, r, l });
  function flush() {
    if (!active || view.performance.now() - lastSend < SEND_MS) return;
    if (!dirty && !x && !y && !b && !r && !l && !pendingRoll && !pendingLoop) return;
    const next = payload();
    if (pendingRoll) next.r = 1;
    if (pendingLoop) next.l = 1;
    lastSend = view.performance.now();
    const accepted = input(next);
    if (accepted !== false) pendingRoll = pendingLoop = false;
    dirty = accepted === false || next.r !== r || next.l !== l;
  }
  function changed() {
    dirty = true;
    flush();
  }
  const steerRoot = find('.ps-steer');
  const steering = mountTilt(steerRoot, { onInput(next) {
    if (!enabled()) return;
    const tiltButton = steerRoot.children[1];
    if (tiltButton.textContent === 'Use touch') {
      tiltButton.textContent = 'Tilt active · Use touch';
      tiltButton.setAttribute('aria-label', tiltButton.textContent);
    }
    x = axis(next.x);
    y = axis(next.y);
    panel.style.setProperty('--ps-x', `${x * 30}%`);
    panel.style.setProperty('--ps-y', `${y * 30}%`);
    if (practice) panel.style.setProperty('--ps-bank', `${Math.round(x * 28)}deg`);
    changed();
  } });
  function listen(node, type, handler) {
    node.addEventListener(type, handler);
    listeners.push(() => node.removeEventListener(type, handler));
  }
  function hold(button, set) {
    let pointer;
    function change(value) {
      button.setAttribute('aria-pressed', String(Boolean(value)));
      set(value);
      changed();
    }
    function release(event = {}) {
      if (event.pointerId !== undefined && event.pointerId !== pointer) return;
      const captured = pointer;
      pointer = undefined;
      if (captured !== undefined && button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
      change(0);
    }
    listen(button, 'pointerdown', event => {
      if (!enabled() || pointer !== undefined || event.button !== 0) return;
      pointer = event.pointerId;
      button.setPointerCapture(pointer);
      change(1);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) listen(button, type, release);
    return release;
  }
  const releaseBoost = hold(boost, value => { b = value; });
  const releaseRoll = hold(roll, value => { r = value; if (value && active) pendingRoll = true; });
  const releaseLoop = hold(loop, value => { l = value; if (value && active) pendingLoop = true; });
  function reset() {
    steering.setEnabled(false);
    pendingRoll = pendingLoop = false;
    x = y = b = r = l = 0;
    panel.style.setProperty('--ps-x', '0%');
    panel.style.setProperty('--ps-y', '0%');
    panel.style.setProperty('--ps-bank', '0deg');
    releaseBoost();
    releaseRoll();
    releaseLoop();
    dirty = true;
  }
  function refresh() {
    steering.setEnabled(enabled());
    boost.disabled = roll.disabled = loop.disabled = !enabled();
  }
  function cancel() {
    reset();
    refresh();
  }
  listen(view, 'blur', cancel);
  listen(document, 'visibilitychange', () => { if (document.hidden) cancel(); });
  const timer = view.setInterval(flush, SEND_MS);
  refresh();
  return {
    practiceWhileWaiting: true,
    update(state, nextActive, meta) {
      if (disposed) return;
      const nextPractice = Boolean(meta?.practice && !nextActive);
      if (active !== nextActive || practice !== nextPractice) {
        const wasActive = active;
        active = false;
        reset();
        if (wasActive) input(payload());
        active = Boolean(nextActive);
        practice = nextPractice;
      }
      refresh();
      find('[data-mode]').textContent = MODES[state?.m] ?? 'Practice';
      find('[data-score]').textContent = String(state?.s ?? 0);
      const context = find('[data-context]');
      context.textContent = state?.m === 0 ? `Streak x${state.c}` : state?.m === 1 ? `Popped ${state.c}` : state?.m === 2 && state.c === 1 ? 'Crown!' : '';
      context.hidden = !context.textContent;
      find('.ps-fuel progress').value = state?.f ?? 100;
      find('.ps-fuel').toggleAttribute('data-low', state?.f <= 25);
      find('.ps-alt progress').value = state?.z ?? 0;
      boost.toggleAttribute('data-boosting', state?.k === 1);
      roll.toggleAttribute('data-cooldown', state?.rl === 1);
      loop.toggleAttribute('data-cooldown', state?.lp === 1);
      const compass = find('[data-compass]');
      const arrow = find('[data-arrow]');
      const targetLabel = find('[data-target]');
      const hasTarget = typeof state?.t === 'number';
      if (typeof state?.r === 'number') panel.style.setProperty('--ps-bank', `${Math.round(state.r * 2.8)}deg`);
      if (hasTarget) panel.style.setProperty('--ps-target', `${state.t}deg`);
      arrow.hidden = !hasTarget;
      compass.toggleAttribute('data-crown', state?.m === 2 && state?.c === 1);
      targetLabel.textContent = state?.m === 0 ? 'Gold ring' : state?.m === 1 ? 'Next balloon' : state?.m === 2 ? (state.c === 1 ? 'Keep flying!' : 'Sun Crown') : 'Bank to steer';
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const wasActive = active;
      active = practice = false;
      reset();
      if (wasActive) input(payload());
      view.clearInterval(timer);
      steering.dispose();
      for (const remove of listeners) remove();
      root.replaceChildren();
    },
  };
}
