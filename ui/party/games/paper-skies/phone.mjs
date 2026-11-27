import { mountTilt } from '../../phone/controls.mjs';

const SEND_MS = 50;
const MODES = ['Ring Rally', 'Balloon Pop', 'Sky Tag'];
const axis = value => Math.round(1000 * Math.max(-1, Math.min(1, value))) / 1000;

export function mountPaperSkiesPhone(root, { input }) {
  const document = root.ownerDocument;
  const view = document.defaultView;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./phone.css', import.meta.url).href;
  root.innerHTML = `<div class="ps-phone">
    <header class="ps-status"><strong data-mode>Practice</strong><span>Score <b data-score>0</b></span><span data-context hidden></span><span data-wobble hidden>Wobble</span></header>
    <label class="ps-fuel">Boost <progress max="10" value="0" aria-label="Boost charge"></progress></label>
    <div class="ps-controls"><div class="ps-steer"></div><div class="ps-actions">
      <button type="button" class="ps-boost" aria-pressed="false">Boost</button>
      <button type="button" class="ps-fire" aria-pressed="false">Fire <small data-fire>Ready</small></button>
    </div></div>
  </div>`;
  root.prepend(stylesheet);
  const find = selector => root.querySelector(selector);
  const panel = find('.ps-phone');
  const boost = find('.ps-boost');
  const fire = find('.ps-fire');
  let active = false, practice = false, disposed = false;
  let x = 0, y = 0, b = 0, f = 0;
  let lastSend = -Infinity, pendingFire = false, dirty = false;
  const listeners = [];
  const enabled = () => active || practice;
  const payload = () => ({ kind: 'fly', x, y, b, f });
  function flush() {
    if (!active || view.performance.now() - lastSend < SEND_MS) return;
    if (!dirty && !x && !y && !b && !f && !pendingFire) return;
    const next = payload();
    if (pendingFire) next.f = 1;
    lastSend = view.performance.now();
    const accepted = input(next);
    if (accepted !== false) pendingFire = false;
    dirty = accepted === false || next.f !== f;
  }
  function changed() {
    dirty = true;
    flush();
  }
  const steering = mountTilt(find('.ps-steer'), { onInput(next) {
    if (!enabled()) return;
    x = axis(next.x);
    y = axis(next.y);
    panel.style.setProperty('--ps-x', `${x * 30}%`);
    panel.style.setProperty('--ps-y', `${y * 30}%`);
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
  const releaseFire = hold(fire, value => { f = value; if (value && active) pendingFire = true; });
  function reset() {
    steering.setEnabled(false);
    pendingFire = false;
    x = y = b = f = 0;
    panel.style.setProperty('--ps-x', '0%');
    panel.style.setProperty('--ps-y', '0%');
    releaseBoost();
    releaseFire();
    dirty = true;
  }
  function refresh() {
    steering.setEnabled(enabled());
    boost.disabled = fire.disabled = !enabled();
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
      find('.ps-fuel progress').value = state?.b ?? 0;
      find('[data-wobble]').hidden = !(state?.w > 0);
      boost.toggleAttribute('data-boosting', state?.k === 1);
      fire.toggleAttribute('data-cooldown', state?.f > 0);
      find('[data-fire]').textContent = state?.f > 0 ? `${(state.f / 10).toFixed(1)}s` : 'Ready';
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
