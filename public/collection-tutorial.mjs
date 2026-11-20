/** Reuse a game's isolated tutorial without creating a room or a command client. */
export function createTutorialBridge({
  createTutorial, rules, assets, sound = {}, onRender = () => {}, onClose = () => {},
}) {
  if (typeof createTutorial !== 'function') throw new TypeError('The guided tutorial is unavailable.');
  const context = Object.freeze({ rules, media: assets });
  let tutorial = null;
  let disposed = false;
  let wasOpen = false;
  const changed = () => {
    if (disposed || !tutorial) return;
    const state = tutorial.getState();
    if (state.open) {
      wasOpen = true;
      onRender(tutorial.render(context), state);
    } else if (wasOpen) {
      wasOpen = false;
      onClose();
    }
  };
  tutorial = createTutorial({ onChange: changed });
  return Object.freeze({
    open({ replay = false } = {}) { if (!disposed) tutorial.open({ replay }); },
    close() { if (!disposed && tutorial.getState().open) tutorial.close(); },
    action(action, target) {
      if (disposed || typeof action !== 'string' || !action.startsWith('tutorial-')) return false;
      try { sound.unlock?.()?.catch?.(() => {}); } catch {}
      return tutorial.handleAction(action, target, context);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      tutorial.dispose();
    },
  });
}

const focusKey = element => {
  if (!element?.dataset?.action) return null;
  return ['action', 'plot', 'choiceId', 'scoreId'].filter(key => element.dataset[key] !== undefined)
    .map(key => `[data-${key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}="${CSS.escape(element.dataset[key])}"]`).join('');
};

/** Shell-only overlay lifecycle. Lesson content and progress remain WS3-owned. */
export function mountCollectionTutorial({
  document: doc = globalThis.document, shell, createTutorial, rules, assets, sound,
  preferences = {}, replay = false, onClose = () => {},
  styles = ['/games/odd-laws-society/view.css', '/games/odd-laws-society/tutorial.css'],
}) {
  if (!doc?.body || !shell) throw new TypeError('A page is required for guided practice.');
  const previousFocus = doc.activeElement;
  const previousInert = shell.inert;
  const previousOverflow = doc.body.style.overflow;
  const root = doc.createElement('div');
  root.className = 'ols collection-tutorial-host';
  root.classList.toggle('ols-reduced-motion', preferences.reducedMotion === true);
  let disposed = false;
  let bridge = null;
  let lastStep = null;
  const links = styles.map(href => {
    const link = doc.createElement('link');
    link.rel = 'stylesheet'; link.href = href; link.dataset.collectionTutorialStyle = '';
    doc.head.append(link);
    return link;
  });
  shell.inert = true;
  doc.body.style.overflow = 'hidden';
  doc.body.append(root);

  function finish(notify) {
    if (disposed) return;
    disposed = true;
    bridge?.dispose();
    root.removeEventListener('click', click);
    root.removeEventListener('keydown', keydown);
    root.removeEventListener('load', mediaLoaded, true);
    root.removeEventListener('error', mediaFailed, true);
    root.remove();
    links.forEach(link => link.remove());
    shell.inert = previousInert;
    doc.body.style.overflow = previousOverflow;
    if (notify) {
      if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus({ preventScroll: true });
      onClose();
    }
  }
  function render(markup, state) {
    if (disposed) return;
    const focused = root.contains(doc.activeElement) ? focusKey(doc.activeElement) : null;
    const scroll = state.step === lastStep ? root.querySelector('[role="dialog"]')?.scrollTop || 0 : 0;
    root.innerHTML = markup;
    lastStep = state.step;
    root.querySelectorAll('img[data-ols-media]').forEach(img => {
      if (img.complete && img.naturalWidth) img.parentElement.classList.add('ols-media-loaded');
    });
    const dialog = root.querySelector('[role="dialog"]');
    if (dialog) dialog.scrollTop = scroll;
    const next = focused && root.querySelector(focused);
    if (next && !next.disabled) next.focus({ preventScroll: true });
    else dialog?.focus({ preventScroll: true });
  }
  function click(event) {
    const button = event.target.closest('[data-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    if (bridge.action(button.dataset.action, button)) event.preventDefault();
  }
  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); bridge.close(); return; }
    if (event.key !== 'Tab') return;
    const dialog = root.querySelector('[role="dialog"]');
    if (!dialog) return;
    const controls = [...dialog.querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]')]
      .filter(node => !node.hidden && node.getClientRects().length);
    if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (doc.activeElement === first || !dialog.contains(doc.activeElement) || doc.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === dialog)) {
      event.preventDefault(); first.focus();
    }
  }
  function mediaLoaded(event) {
    if (event.target.matches?.('img[data-ols-media]')) event.target.parentElement.classList.add('ols-media-loaded');
  }
  function mediaFailed(event) {
    if (!event.target.matches?.('img[data-ols-media]')) return;
    event.target.hidden = true;
    event.target.parentElement.classList.remove('ols-media-loaded');
  }
  root.addEventListener('click', click);
  root.addEventListener('keydown', keydown);
  root.addEventListener('load', mediaLoaded, true);
  root.addEventListener('error', mediaFailed, true);
  try {
    bridge = createTutorialBridge({ createTutorial, rules, assets, sound, onRender: render, onClose: () => finish(true) });
    bridge.open({ replay });
  } catch (error) { finish(false); throw error; }
  return Object.freeze({
    setPreferences(next) {
      if (!disposed && typeof next?.reducedMotion === 'boolean') root.classList.toggle('ols-reduced-motion', next.reducedMotion);
    },
    dispose() { finish(false); },
  });
}
