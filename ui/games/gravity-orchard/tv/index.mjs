import { mountScene } from './scene.mjs';
import { mountTutorial } from '../tutorial/index.mjs';
import { FRUIT_TYPES, STAGES, clockLabel, summarizeResults } from './public-view.mjs';
import { createPresentationTimeline } from './timeline.mjs';
import { createEventCursor, effectName, sceneName } from './effects.mjs';
import { TV_STYLES } from './styles.mjs';

const mounts = new WeakMap();
const NAMES = { jon: 'Jon', lydia: 'Lydia' };
const FRUIT_NAMES = { apple: 'Apple', plum: 'Plum', pear: 'Pear', starfruit: 'Starfruit' };
const RECIPE_NAMES = { 'apple-picnic': 'Apple picnic', 'plum-picnic': 'Plum picnic', 'sunlit-mix': 'Sunlit mix', 'moonlit-mix': 'Moonlit mix' };
const ACTIVE = new Set(['playing', 'countdown']);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const iconPaths = {
  apple: '<path d="M20 14C7 4 1 19 7 31c5 11 10 8 13 7 3 1 8 4 13-7 6-12 0-27-13-17Z" fill="#cb6450"/><path d="M20 14V5m1 4c1-5 7-6 10-4-1 5-6 7-10 4Z" fill="#679454"/>',
  plum: '<ellipse cx="20" cy="24" rx="13" ry="16" fill="#8b6caa"/><path d="M20 9v30m-1-29C10 6 12 2 15 3m7 6c9-3 9-7 6-6" fill="none"/>',
  pear: '<path d="M15 8c-3 3-2 7-5 12C-3 37 8 41 20 41s23-4 10-21c-3-5-2-9-5-12Z" fill="#b3c068"/><path d="M21 8V2m1 4c4-5 8-4 9-2-3 4-6 5-9 2Z" fill="#5b874d"/>',
  starfruit: '<path d="m20 2 6 13 14 2-10 10 2 15-12-7-12 7 2-15L0 17l14-2Z" fill="#e7bb4c"/><path d="m20 13 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z" fill="#fff2a6"/>',
};
function fruitIcon(type) { return `<svg class="go-tv-fruit-icon" viewBox="-3 -2 46 47" aria-hidden="true" fill="none" stroke="#374839" stroke-width="1.8" stroke-linejoin="round">${iconPaths[type]}</svg>`; }
function ingredients(recipe) {
  if (!recipe) return '<span class="go-tv-ingredient">All packed ✓</span>';
  return FRUIT_TYPES.filter(type => recipe.needs[type] > 0).map(type => `<span class="go-tv-ingredient" aria-label="${recipe.needs[type]} ${FRUIT_NAMES[type].toLowerCase()}${recipe.needs[type] > 1 ? 's' : ''}">${fruitIcon(type)}<span aria-hidden="true">×${recipe.needs[type]}</span></span>`).join('');
}
function ordersMarkup(view) {
  const index = view.orders.activeIndex, recipes = view.orders.recipes;
  const active = recipes[index];
  return `<div class="go-tv-recipe" aria-label="${esc(active ? `Active recipe: ${RECIPE_NAMES[active.id] ?? 'Picnic order'}` : 'All recipes complete')}"><span class="go-tv-eyebrow">${active ? `Pack now · ${view.orders.completedIds.length} / ${recipes.length}` : 'Picnic packed'}</span><div class="go-tv-ingredients">${ingredients(active)}</div></div><div class="go-tv-preview" aria-label="Next two recipes">${[1, 2].map(offset => `<div aria-label="${recipes[index + offset] ? `Next ${offset}: ${esc(RECIPE_NAMES[recipes[index + offset].id] ?? 'Picnic order')}` : 'No further recipe'}"><span class="go-tv-eyebrow">${offset === 1 ? 'Next' : 'Then'}</span><div class="go-tv-ingredients">${recipes[index + offset] ? ingredients(recipes[index + offset]) : '<span aria-hidden="true">—</span>'}</div></div>`).join('')}</div>`;
}
function readyMarkup(view, presence) {
  return `<div class="go-tv-ready" aria-label="Player readiness">${['jon', 'lydia'].map(id => {
    const state = presence?.[id];
    const label = state?.connected === false ? 'Reconnect phone' : view.ready[id] ? 'Ready ✓' : 'Ready on phone';
    return `<span data-ready="${view.ready[id]}" data-ready-player="${id}"><strong>${NAMES[id]}</strong>${label}</span>`;
  }).join('')}</div>`;
}
function actionButton(action, label, primary = false) { return `<button type="button" data-go-action="${action}"${primary ? ' class="go-primary"' : ''}>${label}</button>`; }
function resultRows(view) {
  return `<div class="go-tv-result-rows" aria-label="Stage results">${view.results.map(result => `<div class="go-tv-result-row"><span>${esc(STAGES[result.stageIndex].name)}</span><span aria-label="${result.ordersCompleted} of 4 orders, ${result.stars} of 3 stars">${result.ordersCompleted}/4 · ${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}</span></div>`).join('')}</div>`;
}
function panelMarkup(view, presence) {
  const stage = STAGES[view.stageIndex];
  const ready = readyMarkup(view, presence);
  if (view.phase === 'waiting') return `<span class="go-tv-eyebrow">${view.mode === 'practice' ? 'Untimed practice' : `Orchard ${view.stageIndex + 1} of 3`}</span><h2>${esc(stage.name)}</h2><p>Two gardens. One picnic.</p>${ready}`;
  if (view.phase === 'paused') {
    const reasons = { help: 'A little time to practise.', recenter: 'Find a comfortable grip on your phone.', network: 'Reconnect both phones when you’re ready.', 'host-stall': 'The garden is resting. Ready up to continue.', recovery: 'Your saved garden is ready to continue.', requested: 'Take your time. The garden can wait.' };
    return `<span class="go-tv-eyebrow">${esc(stage.name)} · clock stopped</span><h2>Picnic paused</h2><p>${reasons[view.pauseReason] ?? reasons.requested}</p>${ready}<p>Both ready → a fresh countdown.</p><div class="go-tv-panel-actions">${actionButton('rematch-same', view.mode === 'practice' ? 'Restart practice' : 'Restart same seed')}${actionButton('rematch-new', 'Start fresh')}</div>`;
  }
  if (view.phase === 'interlude') {
    const result = view.results.at(-1);
    return `<span class="go-tv-eyebrow">Orchard ${view.stageIndex + 1} complete</span><h2>${result?.ordersCompleted === 4 ? 'Picnic packed!' : 'Time for the next garden'}</h2><p>${result ? `${result.ordersCompleted} of 4 orders · ${result.stars} of 3 stars · ${result.composted} composted` : 'Stage result received.'}</p><p>Next: ${esc(STAGES[Math.min(view.stageIndex + 1, 2)].name)}</p>${ready}<div class="go-tv-panel-actions">${result ? actionButton('retry-stage', 'Retry this orchard') : ''}</div>`;
  }
  if (view.phase === 'finished') {
    const result = summarizeResults(view);
    return `<span class="go-tv-eyebrow">${result.perfect ? 'Perfect Picnic · no compost' : view.mode === 'practice' ? 'Practice complete' : 'Three gardens · one team'}</span><h2>${result.perfect ? 'A perfectly lovely picnic' : 'Look what you grew together'}</h2><div class="go-tv-totals"><div><strong>${result.orders}<small>/${view.mode === 'practice' ? view.results.length * 4 : 12}</small></strong><span>orders packed</span></div><div><strong>${result.stars}<small>/${view.mode === 'practice' ? view.results.length * 3 : 9}</small></strong><span>stars earned</span></div><div><strong>${result.composted}</strong><span>composted</span></div></div>${resultRows(view)}<div class="go-tv-panel-actions">${actionButton('rematch-same', 'Play same seed', true)}${actionButton('rematch-new', 'Try a new seed')}${view.results.length ? actionButton('retry-stage', 'Retry last orchard') : ''}</div>`;
  }
  return '';
}

/** GO4's only TV mount. onCommand takes {kind,payload}; GO7 supplies IDs/authority. */
export function mountTV(root, { assets = {}, geometry, onCommand, onExit, sound = {}, reducedMotion = false, now } = {}) {
  if (!root?.ownerDocument || typeof root.replaceChildren !== 'function') throw new TypeError('mountTV requires an element root');
  mounts.get(root)?.dispose();
  const document = root.ownerDocument, window = document.defaultView;
  const clock = typeof now === 'function' ? now : () => window.performance.now();
  const timeline = createPresentationTimeline({ now: clock });
  const cursor = createEventCursor();
  let disposed = false, frameId = null, view = null, connection = { state: 'connecting' }, invalidData = false;
  let tutorial = null, helpPending = false, exitPending = false, commandSerial = 0, pendingCommand = null;
  let lastMusic = null, latestEvents = [], lastStale = null, statusText = '', reduced = false;
  let controlError = '', freshRequired = false;
  const lastCueAt = new Map();
  const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const container = document.createElement('section');
  container.className = 'go-tv'; container.dataset.goTv = ''; container.dataset.goPhase = 'loading';
  container.setAttribute('aria-label', 'Gravity Orchard shared garden');
  container.innerHTML = `<style data-go-tv-style>${TV_STYLES}</style><header class="go-tv-header"><div class="go-tv-wordmark"><h1>Gravity <span>Orchard</span></h1><p>A picnic for two</p></div><div class="go-tv-orders" data-go-orders aria-label="Picnic recipes"><span class="go-tv-eyebrow">Waiting for your garden…</span></div><div class="go-tv-meta"><div><span class="go-tv-stage-label" data-go-stage>Orchard — / 3</span><div class="go-tv-stage-dots" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="go-tv-clock" data-go-clock aria-label="Stage time">—:—</div></div></header><main class="go-tv-main"><div class="go-tv-scene"></div><div class="go-tv-status" data-go-status role="status" aria-live="polite">Connecting to your garden…</div><section class="go-tv-panel" data-go-panel aria-label="Garden status" tabindex="-1" hidden></section><div class="go-tv-countdown" data-go-countdown role="status" aria-live="polite" hidden></div><div class="go-tv-hazard" data-go-hazard role="status" aria-live="polite" hidden></div></main><footer class="go-tv-footer"><div class="go-tv-presence" aria-label="Phone controllers"></div><nav class="go-tv-actions" aria-label="Garden controls">${actionButton('help', 'Help')}${actionButton('pause', 'Pause')}${actionButton('exit', 'Sofa Arcade')}</nav></footer><div class="go-tv-toast" data-go-message role="status" aria-live="polite" hidden></div><span class="go-sr-only" data-go-announcement role="status" aria-live="polite"></span><div class="go-tv-tutorial-layer" hidden></div>`;
  root.replaceChildren(container);
  const find = selector => container.querySelector(selector);
  const orderNode = find('[data-go-orders]'), clockNode = find('[data-go-clock]'), stageNode = find('[data-go-stage]');
  const statusNode = find('[data-go-status]'), panelNode = find('[data-go-panel]'), countdownNode = find('[data-go-countdown]');
  const hazardNode = find('[data-go-hazard]'), presenceNode = find('.go-tv-presence'), messageNode = find('[data-go-message]');
  const tutorialRoot = find('.go-tv-tutorial-layer'), announcement = find('[data-go-announcement]');
  const scene = mountScene(find('.go-tv-scene'), { assets, geometry, reducedMotion: false });
  function writeHTML(node, markup) {
    if (node.__goMarkup === markup) return;
    const focused = node.contains(document.activeElement) ? document.activeElement?.dataset?.goAction : null;
    node.innerHTML = markup; node.__goMarkup = markup;
    if (focused) [...node.querySelectorAll('[data-go-action]')].find(button => button.dataset.goAction === focused)?.focus({ preventScroll: true });
  }
  function applyReducedMotion() {
    let explicit = false;
    try { explicit = typeof reducedMotion === 'function' ? Boolean(reducedMotion()) : typeof reducedMotion === 'object' && reducedMotion !== null ? Boolean(reducedMotion.matches) : Boolean(reducedMotion); } catch { /* Keep the OS preference usable. */ }
    const next = explicit || Boolean(mediaQuery?.matches);
    if (container.dataset.reducedMotion === undefined || reduced !== next) {
      reduced = next; container.dataset.reducedMotion = String(reduced); scene.setReducedMotion(reduced);
    }
  }
  function announce(text) { if (announcement.textContent !== text) announcement.textContent = text; }
  function message(text = '') { controlError = text; messageNode.textContent = text; messageNode.hidden = !text; }
  function setMusic() {
    const name = view && connection.state !== 'connected' ? 'paused' : sceneName(view);
    if (name === lastMusic) return;
    lastMusic = name;
    try { sound?.setScene?.(name); } catch { /* A failed optional sound adapter cannot stop a garden. */ }
  }
  function emitEffects(events) {
    const at = clock();
    for (const event of events) {
      if (event.kind === 'transfer') announce('Fruit passed across the bridge.');
      const name = event.kind === 'phase-change' && view?.phase === 'countdown' ? 'countdown' : effectName(event);
      if (!name) continue;
      // Stable IDs are consumed even when a burst is restrained or audio is unavailable.
      const previous = lastCueAt.get(name) ?? -Infinity;
      if (at - previous < (name === 'catch' || name === 'reject' ? 90 : 160)) continue;
      lastCueAt.set(name, at);
      try { sound?.effect?.(name, { id: event.id, event }); } catch { /* Shared audio may be locked/off. */ }
      if (event.kind === 'order-complete') announce('Picnic order packed.');
    }
  }
  function presenceMarkup(stale = false) {
    return ['jon', 'lydia'].map(id => {
      const state = connection.presence?.[id];
      const globalLoss = connection.state !== 'connected';
      const held = invalidData || freshRequired || (stale && ACTIVE.has(view?.phase));
      const lost = globalLoss || held || state?.connected === false || (state && !state.inputFresh && view?.phase === 'playing');
      const flag = lost ? 'lost' : state?.connected === true ? 'ready' : 'unknown';
      const label = globalLoss ? 'Connection pending' : held ? 'View held' : state?.connected === false ? 'Reconnect' : lost ? 'Safe Brake' : view?.ready[id] ? 'Ready ✓' : !state ? 'Phone status pending' : ACTIVE.has(view?.phase) ? view?.players[id].input.brake ? 'Brake held' : 'Steering' : 'Connected';
      return `<span class="go-tv-player" data-player-presence="${id}" data-connection="${flag}"><i class="go-tv-presence-dot" aria-hidden="true"></i><strong>${NAMES[id]}</strong><span>${label}</span></span>`;
    }).join('');
  }
  function renderStatus(stale = false) {
    const state = connection.state;
    const lost = ['jon', 'lydia'].filter(id => connection.presence?.[id]?.connected === false).map(id => NAMES[id]);
    const neutral = ['jon', 'lydia'].filter(id => connection.presence?.[id]?.connected === true && !connection.presence[id].inputFresh).map(id => NAMES[id]);
    let text = '';
    if (invalidData) text = 'Waiting for fresh garden data. The board is held safely.';
    else if (state !== 'connected') text = state === 'connecting' ? 'Connecting to your garden…' : state === 'reconnecting' ? 'Reconnecting… the garden view is held.' : 'Connection lost. Waiting to reconnect…';
    else if (!view) text = 'Waiting for your garden…';
    else if ((stale || freshRequired) && ACTIVE.has(view.phase)) text = 'Waiting for a fresh garden update…';
    else if (lost.length) text = `${lost.join(' & ')} · reconnect ${lost.length === 1 ? 'phone' : 'phones'}`;
    else if (neutral.length && view.phase === 'playing') text = `${neutral.join(' & ')} · safe Brake while controls reconnect`;
    if (text !== statusText) { statusNode.textContent = text; statusText = text; }
    statusNode.hidden = !text;
    container.dataset.goStale = String(Boolean(stale || freshRequired || invalidData));
    writeHTML(presenceNode, presenceMarkup(stale));
  }
  function renderChrome() {
    if (!view || disposed) return;
    container.dataset.goPhase = view.phase;
    container.dataset.goMatch = view.matchId;
    container.dataset.goEpoch = String(view.runEpoch);
    container.dataset.goTick = String(view.tick);
    writeHTML(orderNode, ordersMarkup(view));
    clockNode.textContent = clockLabel(view);
    clockNode.classList.toggle('is-urgent', view.timeRemainingTicks !== null && view.timeRemainingTicks <= 600);
    clockNode.setAttribute('aria-label', view.timeRemainingTicks === null ? 'Untimed practice' : `${clockLabel(view)} remaining`);
    stageNode.textContent = view.mode === 'practice' ? 'Practice' : `Orchard ${view.stageIndex + 1} / 3`;
    [...find('.go-tv-stage-dots').children].forEach((dot, index) => { dot.className = view.results.some(result => result.stageIndex === index) ? 'is-complete' : index === view.stageIndex ? 'is-current' : ''; });
    const markup = panelMarkup(view, connection.presence);
    writeHTML(panelNode, markup); panelNode.hidden = !markup || Boolean(tutorial);
    countdownNode.hidden = view.phase !== 'countdown' || Boolean(tutorial);
    if (view.phase === 'countdown') writeHTML(countdownNode, `<span>${esc(STAGES[view.stageIndex].name)}</span><strong>${Math.max(1, Math.ceil(view.countdownTicks / 60))}</strong><span>Get comfortable</span>`);
    const gust = view.gust;
    const gates = view.gateStates.filter(gate => gate.state !== 'open');
    let hazard = '';
    if (gust) {
      const horizontal = Math.abs(gust.x) >= Math.abs(gust.y);
      const direction = horizontal ? gust.x >= 0 ? 'right' : 'left' : gust.y >= 0 ? 'down' : 'up';
      const arrow = { right: '→', left: '←', down: '↓', up: '↑' }[direction];
      hazard = `<span class="go-tv-hazard-arrow" aria-hidden="true">${arrow}</span><span>Lala · ${gust.phase === 'forecast' ? `gust ${direction} in ${Math.ceil(gust.ticksRemaining / 60)}s` : `gusting ${direction}`}</span>`;
      hazardNode.dataset.hazardPhase = gust.phase;
    } else if (gates.length) {
      hazard = `<span>${gates.some(gate => gate.closureDeferred) ? '▥ Gate waiting · bridge occupied' : gates.some(gate => gate.state === 'closed') ? '▥ Bridge gate closed' : `▥ Gate closes in ${Math.ceil(Math.min(...gates.map(gate => gate.ticksToChange)) / 60)}s`}</span>`;
      hazardNode.dataset.hazardPhase = 'forecast';
    }
    writeHTML(hazardNode, hazard); hazardNode.hidden = !hazard || !ACTIVE.has(view.phase) || Boolean(tutorial);
    renderStatus(timeline.sample().stale); setMusic(); updateButtons();
  }
  function updateButtons() {
    const active = ACTIVE.has(view?.phase);
    const pause = find('[data-go-action="pause"]');
    pause.hidden = !active;
    for (const button of container.querySelectorAll('[data-go-action]')) {
      const action = button.dataset.goAction;
      if (['help', 'exit'].includes(action)) { button.disabled = false; continue; }
      button.disabled = Boolean(pendingCommand) || connection.state !== 'connected' || invalidData || (active && timeline.sample().stale);
    }
    const help = find('[data-go-action="help"]');
    help.textContent = helpPending ? 'Cancel Help' : 'Help';
  }
  function closeTutorial() {
    if (!tutorial) return;
    const old = tutorial; tutorial = null;
    old.dispose(); tutorialRoot.replaceChildren(); tutorialRoot.hidden = true;
    for (const child of container.children) if (child !== tutorialRoot) { child.inert = false; }
    renderChrome();
    if (!disposed) find('[data-go-action="help"]')?.focus({ preventScroll: true });
  }
  function openTutorial() {
    if (disposed || tutorial) return;
    helpPending = false; message(''); tutorialRoot.hidden = false;
    for (const child of container.children) if (child !== tutorialRoot && child.tagName !== 'STYLE') child.inert = true;
    tutorial = mountTutorial(tutorialRoot, { onClose: closeTutorial, inputMode: 'tilt', reducedMotion: () => reduced });
    panelNode.hidden = true; countdownNode.hidden = true; hazardNode.hidden = true;
    updateButtons();
  }
  function dispatch(kind, payload, intent = null) {
    if (disposed || !view || pendingCommand || typeof onCommand !== 'function') {
      if (!disposed && typeof onCommand !== 'function') message('This control is not connected yet.');
      if (intent === 'help') helpPending = false;
      if (intent === 'exit') exitPending = false;
      if (!disposed) updateButtons();
      return;
    }
    const serial = ++commandSerial, matchId = view.matchId;
    pendingCommand = { serial, matchId, kind }; updateButtons();
    let result;
    try { result = onCommand({ kind, payload }); } catch { result = Promise.reject(new Error('command failed')); }
    Promise.resolve(result).then(reply => {
      if (disposed || serial !== commandSerial || view?.matchId !== matchId) return;
      pendingCommand = null;
      if (reply?.accepted === false) {
        if (intent === 'help') helpPending = false;
        if (intent === 'exit') exitPending = false;
        message('That request could not be completed. Try again.');
      } else if (intent === 'help' && helpPending && ACTIVE.has(view.phase)) message('Waiting for the shared pause before Help…');
      updateButtons();
    }, () => {
      if (disposed || serial !== commandSerial || view?.matchId !== matchId) return;
      pendingCommand = null; if (intent === 'help') helpPending = false; if (intent === 'exit') exitPending = false;
      message('The request did not reach your garden. Reconnect and try again.'); updateButtons();
    });
  }
  function handleAction(event) {
    const button = event.target.closest?.('[data-go-action]');
    if (disposed || !button || !container.contains(button) || button.disabled || tutorial) return;
    const action = button.dataset.goAction;
    if (pendingCommand && ACTIVE.has(view?.phase) && ['help', 'exit'].includes(action) && !helpPending) return;
    if (action === 'help') {
      if (helpPending) { helpPending = false; message(''); updateButtons(); return; }
      if (ACTIVE.has(view?.phase)) {
        helpPending = true; message('Pausing the garden for Help…'); dispatch('pause', { reason: 'help' }, 'help');
      } else openTutorial();
    } else if (action === 'pause' && ACTIVE.has(view?.phase)) { message(''); dispatch('pause', { reason: 'requested' }); }
    else if (action === 'retry-stage' && ['interlude', 'finished'].includes(view?.phase) && view.results.length) { message(''); dispatch('retry-stage', {}); }
    else if (['rematch-same', 'rematch-new'].includes(action) && ['paused', 'finished'].includes(view?.phase)) { message(''); dispatch('rematch', { seedMode: action === 'rematch-same' ? 'same' : 'new' }); }
    else if (action === 'exit') {
      if (ACTIVE.has(view?.phase) && connection.state === 'connected' && typeof onCommand === 'function') { exitPending = true; message('Pausing your garden…'); dispatch('pause', { reason: 'requested' }, 'exit'); }
      else onExit?.();
    }
  }
  function paint() {
    if (disposed) return;
    applyReducedMotion();
    const sample = timeline.sample();
    if (sample.view) {
      let presented = sample.view;
      const safe = connection.state !== 'connected' || sample.stale || invalidData || freshRequired;
      if (safe || ['jon', 'lydia'].some(id => connection.presence?.[id]?.connected === false || (connection.presence?.[id] && !connection.presence[id].inputFresh))) {
        presented = { ...presented, players: Object.fromEntries(['jon', 'lydia'].map(id => [id, { input: safe || connection.presence?.[id]?.connected === false || (connection.presence?.[id] && !connection.presence[id].inputFresh) ? { x: 0, y: 0, brake: true } : presented.players[id].input }])) };
      }
      scene.update(presented, { fruits: sample.fruits, now: clock(), events: latestEvents });
      latestEvents = [];
      if (lastStale !== sample.stale) { lastStale = sample.stale; renderStatus(sample.stale); updateButtons(); }
    }
    frameId = window.requestAnimationFrame(paint);
  }
  container.addEventListener('click', handleAction);
  mediaQuery?.addEventListener?.('change', applyReducedMotion);
  if (typeof reducedMotion === 'object') reducedMotion?.addEventListener?.('change', applyReducedMotion);
  applyReducedMotion(); renderStatus(); writeHTML(presenceNode, presenceMarkup()); updateButtons();
  frameId = window.requestAnimationFrame(paint);
  const api = {
    update(raw) {
      if (disposed) return false;
      const previous = view;
      const recovering = freshRequired;
      const result = timeline.push(raw);
      if (!result.accepted) {
        if (result.reason === 'invalid-view') { invalidData = true; timeline.freeze(); renderStatus(true); updateButtons(); }
        return false;
      }
      view = result.view; invalidData = false; freshRequired = false;
      const newMatch = previous && previous.matchId !== view.matchId;
      const boundary = previous && (newMatch || previous.runEpoch !== view.runEpoch || previous.phase !== view.phase);
      if (boundary) { pendingCommand = null; commandSerial += 1; lastCueAt.clear(); if (!controlError.includes('request')) message(''); }
      if (newMatch) { helpPending = false; exitPending = false; closeTutorial(); cursor.clear(); latestEvents = []; }
      const events = cursor.consume(view, { silent: recovering || connection.state !== 'connected' });
      latestEvents = result.reset ? events : [...latestEvents, ...events].slice(-64);
      emitEffects(events); renderChrome();
      if (helpPending && !ACTIVE.has(view.phase)) openTutorial();
      if (tutorial && ACTIVE.has(view.phase)) closeTutorial(); // A remote resume cannot leave a hidden live board.
      if (exitPending && !ACTIVE.has(view.phase)) { exitPending = false; onExit?.(); }
      if (previous?.phase !== view.phase) announce({ waiting: 'Waiting for both phones to be ready.', countdown: 'The garden starts after the countdown.', playing: 'The garden is playing.', paused: 'Garden paused. Both phones must be ready to continue.', interlude: 'Stage complete.', finished: summarizeResults(view).perfect ? 'Perfect Picnic. All twelve orders, no compost.' : 'Your picnic results are ready.' }[view.phase]);
      return true;
    },
    setConnection(status) {
      if (disposed || !status || !['connecting', 'connected', 'reconnecting', 'offline', 'error'].includes(status.state)) return;
      const previousState = connection.state;
      const presence = status.presence && Object.fromEntries(['jon', 'lydia'].map(id => [id, status.presence[id] && typeof status.presence[id].connected === 'boolean' && typeof status.presence[id].inputFresh === 'boolean' ? { connected: status.presence[id].connected, inputFresh: status.presence[id].inputFresh } : undefined]));
      connection = { state: status.state, ...(presence ? { presence } : connection.presence ? { presence: connection.presence } : {}) };
      if (status.state !== 'connected' || (previousState !== 'connected' && status.state === 'connected' && view)) { timeline.freeze(); freshRequired = true; latestEvents = []; }
      container.dataset.goConnection = status.state;
      renderChrome(); renderStatus(timeline.sample().stale); updateButtons();
    },
    dispose() {
      if (disposed) return;
      disposed = true; commandSerial += 1; pendingCommand = null; helpPending = false; exitPending = false;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      container.removeEventListener('click', handleAction);
      mediaQuery?.removeEventListener?.('change', applyReducedMotion);
      if (typeof reducedMotion === 'object') reducedMotion?.removeEventListener?.('change', applyReducedMotion);
      tutorial?.dispose(); tutorial = null; scene.dispose(); timeline.dispose(); cursor.clear(); latestEvents = []; lastCueAt.clear();
      container.remove(); if (mounts.get(root) === api) mounts.delete(root);
    },
  };
  mounts.set(root, api);
  return api;
}
