/* Sofa Kingdoms: layered cutout animation and deterministic action effects.
 * The game rules remain in engine.mjs. This file never changes game state. */
const sessions = new WeakMap();
const roots = new Set();
let visibilityBound = false;
const PLAYER_IDS = ['jon', 'lydia'];
const clock = () => Date.now();
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const catKey = event => event ? `${event.round}:${event.type}:${event.axis || ''}:${event.index ?? ''}:${event.direction ?? ''}:${event.row ?? ''}:${event.col ?? ''}` : '';

/** A pure, testable projection of rules changes into presentation events. */
export function deriveMotionEvents(previous, next) {
  if (!previous || !next || previous.seed !== next.seed || next.actionNumber < previous.actionNumber) return [];
  if (previous.actionNumber === next.actionNumber && previous.phase === next.phase) return [];
  const events = [];
  const newCat = next.lastEvent && catKey(previous.lastEvent) !== catKey(next.lastEvent);
  const catMovements = new Map(newCat ? (next.lastEvent.movements || []).map(m => [m.playerId, m]) : []);
  for (const id of PLAYER_IDS) {
    const before = previous.players[id], after = next.players[id];
    if (!before || !after) continue;
    const banked = after.banked - before.banked;
    if (banked > 0) events.push({ type: 'bank', playerId: id, amount: banked, row: after.home.row, col: after.home.col });
    const collected = after.carried - before.carried;
    if (collected > 0) events.push({ type: 'collect', playerId: id, amount: collected, row: after.row, col: after.col });
    if (after.lures < before.lures) events.push({ type: 'toy', playerId: id, row: after.row, col: after.col });
    if (before.row !== after.row || before.col !== after.col) {
      const catMove = catMovements.get(id);
      events.push({ type: catMove?.reason === 'pounce' ? 'caught' : catMove ? 'ride' : 'move', playerId: id,
        row: after.row, col: after.col, fromRow: before.row, fromCol: before.col });
    }
  }
  if (newCat) events.push({ type: 'cat', event: next.lastEvent });
  if (next.phase === 'playing' && (next.activePlayer !== previous.activePlayer || next.round !== previous.round)) {
    events.push({ type: 'turn', playerId: next.activePlayer });
  }
  if (previous.phase !== 'finished' && next.phase === 'finished') events.push({ type: 'victory', winner: next.winner });
  return events;
}

function element(tag, className, parent, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.setAttribute('aria-hidden', 'true');
  node.dataset.motionGenerated = 'true';
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function durationFor(event) {
  return ({ move: 510, ride: 760, caught: 900, collect: 1050, bank: 1450, toy: 850,
    cat: event.event?.type === 'nap' ? 1900 : 1150, turn: 750, victory: 2400 })[event.type] || 800;
}

function play(node, frames, duration, age, session, options = {}) {
  if (!node?.animate || age >= duration) return;
  const animation = node.animate(frames, { duration, fill: 'both', easing: 'ease-out', ...options });
  // Negative currentTime keeps staggered particles in their hidden first frame
  // until their own start; restoring an effect after a redraw retains its age.
  animation.currentTime = age;
  session.animations.push(animation);
  animation.finished.then(() => {
    // Canceling fill:both alone would expose an expired particle's base styles.
    // Remove temporary marks first; keep character rigs and real score labels.
    if (node.dataset?.motionGenerated === 'true' && !node.classList.contains('motion-rig')) node.remove();
    try { animation.cancel(); } catch {}
  }, () => {});
  return animation;
}

function makeRig(character, now) {
  if (character.querySelector('.motion-rig')) return;
  const id = character.dataset.character || (character.classList.contains('lala') ? 'lala' : character.classList.contains('lydia') ? 'lydia' : 'jon');
  character.classList.add('motion-character');
  character.dataset.motionCharacter = id;
  character.style.setProperty('--motion-phase', `${-(now % 4700)}ms`);
  character.style.setProperty('--motion-head-phase', `${-((now + (id === 'lydia' ? 1900 : 600)) % 6300)}ms`);
  character.style.setProperty('--motion-tail-phase', `${-(now % 5700)}ms`);
  character.style.setProperty('--motion-atlas-x', id === 'jon' ? '0%' : id === 'lydia' ? '50%' : '100%');
  const rig = element('span', `motion-rig motion-rig-${id}`, character);
  element('span', 'motion-cutout motion-body', rig);
  element('span', 'motion-cutout motion-head', rig);
  if (id === 'lala') {
    const purr = element('span', 'motion-purr', character);
    element('i', 'motion-purr-line motion-purr-left', purr);
    element('i', 'motion-purr-line motion-purr-right', purr);
  }
}

function characters(root, id, skipGhosts = true) {
  return [...root.querySelectorAll(`.character.${id}`)].filter(node => !skipGhosts || !node.closest('.ghost-slot'));
}

function rigTargets(root, id) {
  return characters(root, id).map(node => node.querySelector('.motion-rig') || node.querySelector('.character-fallback') || node);
}

function boardLayer(root) {
  const board = root.querySelector('.board');
  if (!board) return null;
  let layer = board.querySelector('.motion-board-layer');
  if (!layer) layer = element('div', 'motion-board-layer', board);
  return layer;
}

function cellPoint(layer, row, col) {
  return { x: (col + .5) * layer.clientWidth / 5, y: (row + .5) * layer.clientHeight / 5 };
}

function burst(root, event, age, session, banking = false) {
  const layer = boardLayer(root);
  const anchor = layer || root.querySelector('.controller-status') || root.querySelector('.player-card');
  if (!anchor) return;
  anchor.classList.add('motion-anchor');
  const point = layer ? cellPoint(layer, event.row, event.col) : { x: anchor.clientWidth / 2, y: anchor.clientHeight / 2 };
  const count = banking ? 10 : Math.min(8, 4 + event.amount);
  const length = banking ? 1250 : 900;
  for (let i = 0; i < count; i++) {
    const crumb = element('span', `motion-crumb ${banking ? 'motion-bank-crumb' : ''}`, anchor);
    crumb.style.left = `${point.x}px`;
    crumb.style.top = `${point.y}px`;
    const angle = (i / count) * Math.PI * 2;
    const reach = banking ? 36 + (i % 3) * 13 : 23 + (i % 3) * 9;
    const dx = Math.cos(angle) * reach;
    const dy = Math.sin(angle) * reach - (banking ? 28 : 18);
    play(crumb, [
      { opacity: 0, transform: 'translate(-50%, -50%) scale(.3)' },
      { opacity: 1, transform: `translate(calc(-50% + ${dx * .6}px), calc(-50% + ${dy * .6}px)) rotate(${i * 31}deg) scale(1.1)`, offset: .22 },
      { opacity: 0, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 12}px)) rotate(${i * 67}deg) scale(.35)` },
    ], length, age - i * 18, session);
  }
  const label = element('span', `motion-score-pop ${event.playerId}`, anchor, banking ? `+${event.amount} banked` : `+${event.amount}`);
  label.style.left = `${point.x}px`;
  label.style.top = `${point.y - 8}px`;
  play(label, [
    { opacity: 0, transform: 'translate(-50%, 0) scale(.8)' },
    { opacity: 1, transform: 'translate(-50%, -19px) scale(1)', offset: .18 },
    { opacity: 1, transform: 'translate(-50%, -29px) scale(1)', offset: .7 },
    { opacity: 0, transform: 'translate(-50%, -41px) scale(.94)' },
  ], banking ? 1400 : 1000, age, session);
}

function pawMarkup() {
  return '<svg viewBox="0 0 180 180" aria-hidden="true"><g stroke="#69462e" stroke-width="3" stroke-linejoin="round"><path d="M45 179 42 125Q15 111 22 82q-12-27 8-40 13-9 24 1Q51 13 73 9q22-3 25 24 12-22 31-12 17 9 10 34 25-9 32 14 7 23-16 38 4 23-16 36l2 36Z" fill="#efb66b"/><path d="m50 153 19-12m51 12-17-12M38 84l17 7m83-23-17 12" stroke="#ce8843" stroke-width="8" stroke-linecap="round"/><ellipse cx="42" cy="67" rx="10" ry="15" fill="#e6a29a" stroke="none"/><ellipse cx="78" cy="43" rx="11" ry="16" fill="#e6a29a" stroke="none"/><ellipse cx="119" cy="51" rx="10" ry="15" fill="#e6a29a" stroke="none"/><ellipse cx="146" cy="86" rx="10" ry="14" fill="#e6a29a" stroke="none"/><path d="M62 105q-1-30 24-33 24-2 33 27 8 22-16 27-12-9-25 0-19 0-16-21Z" fill="#e6a29a" stroke="none"/><path d="M46 170h87" stroke="#f9d99b" stroke-width="7" stroke-linecap="round"/></g></svg>';
}

function catEffect(root, event, age, session) {
  const cat = event.event;
  const layer = boardLayer(root);
  for (const target of rigTargets(root, 'lala')) {
    const frames = cat.type === 'nap'
      ? [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(4px) scale(1.045,.93)', offset: .35 }, { transform: 'translateY(0) scale(1)' }]
      : [{ transform: 'rotate(0) scale(1)' }, { transform: 'translateY(-5px) rotate(-8deg) scale(1.06)', offset: .25 }, { transform: 'translateY(2px) rotate(5deg) scale(1.02,.96)', offset: .5 }, { transform: 'rotate(0) scale(1)' }];
    play(target, frames, cat.type === 'nap' ? 1800 : 900, age, session);
  }
  if (cat.type === 'nap') {
    const mascot = root.querySelector('.forecast-art, .mini-cat, .lobby-cat');
    if (!mascot) return;
    mascot.classList.add('motion-anchor');
    for (let i = 0; i < 3; i++) {
      const z = element('span', 'motion-sleep-z', mascot, 'z');
      z.style.left = `${55 + i * 12}%`;
      z.style.top = '28%';
      play(z, [{ opacity: 0, transform: 'translate(0,0) scale(.65)' }, { opacity: .9, transform: 'translate(4px,-12px) scale(.9)', offset: .2 }, { opacity: 0, transform: 'translate(18px,-42px) scale(1.15)' }], 1250, age - i * 230, session);
    }
    return;
  }
  if (!layer) return;
  const paw = element('div', `motion-lala-paw motion-${cat.type}`, layer);
  paw.innerHTML = pawMarkup();
  const w = layer.clientWidth, h = layer.clientHeight;
  if (cat.type === 'swipe') {
    const horizontal = cat.axis === 'row';
    const size = w * .32;
    paw.style.width = `${size}px`;
    const line = (cat.index + .5) / 5;
    const start = cat.direction > 0 ? -.26 : 1.15;
    const end = cat.direction > 0 ? 1.15 : -.26;
    const from = horizontal ? [start * w, line * h] : [line * w, start * h];
    const to = horizontal ? [end * w, line * h] : [line * w, end * h];
    const rotation = horizontal ? (cat.direction > 0 ? -72 : 72) : (cat.direction > 0 ? 170 : 0);
    paw.style.left = '0'; paw.style.top = '0';
    play(paw, [
      { opacity: 0, transform: `translate(${from[0] - size / 2}px,${from[1] - size / 2}px) rotate(${rotation}deg)` },
      { opacity: 1, offset: .12 },
      { opacity: 1, offset: .78 },
      { opacity: 0, transform: `translate(${to[0] - size / 2}px,${to[1] - size / 2}px) rotate(${rotation + cat.direction * 8}deg)` },
    ], 1050, age, session, { easing: 'cubic-bezier(.24,.66,.36,1)' });
    const trail = element('div', `motion-swipe-trail ${horizontal ? 'horizontal' : 'vertical'}`, layer);
    if (horizontal) { trail.style.top = `${line * 100}%`; trail.style.left = '4%'; }
    else { trail.style.left = `${line * 100}%`; trail.style.top = '4%'; }
    play(trail, [{ opacity: 0, scale: '.85' }, { opacity: .6, scale: '1', offset: .25 }, { opacity: 0, scale: '1.02' }], 850, age, session);
  } else {
    const point = cellPoint(layer, cat.row, cat.col);
    const size = w * .39;
    paw.style.width = `${size}px`;
    paw.style.left = `${point.x - size / 2}px`;
    paw.style.top = `${point.y - size * .58}px`;
    const ring = element('span', 'motion-pounce-ring', layer);
    ring.style.left = `${point.x}px`; ring.style.top = `${point.y}px`;
    play(paw, [
      { opacity: 0, transform: 'translateY(-90px) rotate(-13deg) scale(1.3)' },
      { opacity: 1, transform: 'translateY(0) rotate(3deg) scale(.95,1.05)', offset: .25 },
      { opacity: 1, transform: 'translateY(3px) rotate(0) scale(1.08,.9)', offset: .35 },
      { opacity: 1, transform: 'translateY(-8px) rotate(-5deg) scale(1)', offset: .62 },
      { opacity: 0, transform: 'translateY(-65px) rotate(-12deg) scale(1.08)' },
    ], 1050, age, session);
    play(ring, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: .8, transform: 'translate(-50%,-50%) scale(.6)', offset: .3 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(2)' }], 900, age, session);
  }
}

function confetti(root, event, age, session) {
  const anchor = root.querySelector('.winner-stage') || boardLayer(root);
  if (!anchor) return;
  anchor.classList.add('motion-anchor');
  const layer = element('div', 'motion-confetti-layer', anchor);
  const w = anchor.clientWidth, h = Math.min(anchor.clientHeight, 480);
  for (let i = 0; i < 24; i++) {
    const paper = element('i', `motion-confetti motion-confetti-${i % 4}`, layer);
    const x = (i * 47.3 % 100) * w / 100;
    paper.style.left = `${x}px`;
    paper.style.top = '-12px';
    const drift = ((i % 5) - 2) * 21;
    play(paper, [
      { opacity: 0, transform: `translate(0,-10px) rotate(${i * 17}deg)` },
      { opacity: .9, offset: .12 },
      { opacity: .85, offset: .68 },
      { opacity: 0, transform: `translate(${drift}px,${h + 30}px) rotate(${i * 73 + 160}deg)` },
    ], 1700 + i % 4 * 140, age - i % 6 * 60, session, { easing: 'cubic-bezier(.22,.5,.5,1)' });
  }
  const winner = event.winner === 'tie' ? 'lala' : event.winner;
  for (const rig of rigTargets(root, winner)) {
    play(rig, [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-9px) rotate(-6deg) scale(1.06)', offset: .25 }, { transform: 'translateY(0) rotate(4deg) scale(1.04,.96)', offset: .5 }, { transform: 'translateY(-5px) rotate(-3deg)', offset: .72 }, { transform: 'translateY(0) rotate(0) scale(1)' }], 1350, age, session);
  }
}

function renderEffect(root, effect, session, now) {
  const age = now - effect.started;
  if (age >= effect.duration) return;
  const event = effect.event;
  if (event.type === 'cat') { catEffect(root, event, age, session); return; }
  if (event.type === 'victory') { confetti(root, event, age, session); return; }
  if (event.type === 'collect' || event.type === 'bank') burst(root, event, age, session, event.type === 'bank');
  const id = event.playerId;
  let frames;
  if (event.type === 'move') frames = [
    { transform: 'translateY(0) scale(1)' }, { transform: 'translateY(3px) scale(1.12,.86)', offset: .12 },
    { transform: 'translateY(-13px) rotate(-5deg) scale(.96,1.06)', offset: .45 },
    { transform: 'translateY(2px) rotate(3deg) scale(1.1,.9)', offset: .8 }, { transform: 'translateY(0) rotate(0) scale(1)' },
  ];
  if (event.type === 'ride') frames = [{ transform: 'rotate(0)' }, { transform: 'rotate(-10deg) translateY(-3px)', offset: .3 }, { transform: 'rotate(7deg) translateY(-2px)', offset: .6 }, { transform: 'rotate(0)' }];
  if (event.type === 'caught') frames = [{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(-13deg) scale(.87)', offset: .2 }, { transform: 'rotate(10deg) scale(1.05)', offset: .4 }, { transform: 'rotate(-6deg)', offset: .65 }, { transform: 'rotate(0) scale(1)' }];
  if (event.type === 'collect') frames = [{ transform: 'rotate(0) scale(1)' }, { transform: 'translateY(3px) rotate(7deg) scale(1.03,.94)', offset: .25 }, { transform: 'translateY(-5px) rotate(-4deg) scale(1.05)', offset: .55 }, { transform: 'rotate(0) scale(1)' }];
  if (event.type === 'bank') frames = [{ transform: 'translateY(0)' }, { transform: 'translateY(-9px) rotate(-5deg)', offset: .25 }, { transform: 'translateY(0) scale(1.08,.93)', offset: .45 }, { transform: 'translateY(-5px) rotate(4deg)', offset: .65 }, { transform: 'translateY(0) scale(1)' }];
  if (event.type === 'toy') frames = [{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg) translateX(-3px)', offset: .3 }, { transform: 'rotate(10deg) translateX(3px)', offset: .58 }, { transform: 'rotate(0)' }];
  if (event.type === 'turn') frames = [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-4px) rotate(-3deg) scale(1.035)', offset: .4 }, { transform: 'translateY(0) rotate(0) scale(1)' }];
  if (frames) for (const rig of rigTargets(root, id)) play(rig, frames, Math.min(effect.duration, event.type === 'bank' ? 1000 : 760), age, session);
  if (event.type === 'bank') {
    const score = root.querySelector(`.player-card.${id} .player-points`);
    play(score, [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: .25 }, { transform: 'scale(1)' }], 700, age, session);
  }
}

/** Call immediately after the application's DOM render, alongside its existing FLIP. */
export function enhanceMotion(root, context = {}) {
  if (!root || typeof document === 'undefined') return;
  const now = clock();
  let session = sessions.get(root);
  if (!session) {
    session = { snapshot: null, effects: [], animations: [], timers: [], context, epoch: 0 };
    sessions.set(root, session); roots.add(root);
  }
  session.context = context;
  if (!visibilityBound) {
    visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      for (const activeRoot of roots) {
        if (!activeRoot.isConnected) { roots.delete(activeRoot); continue; }
        const active = sessions.get(activeRoot);
        if (active) enhanceMotion(activeRoot, active.context);
      }
    });
  }
  for (const animation of session.animations) { try { animation.cancel(); } catch {} }
  session.animations = [];
  for (const timer of session.timers) clearTimeout(timer);
  session.timers = [];
  root.querySelectorAll('[data-motion-generated]').forEach(node => node.remove());
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.toggle('motion-reduced', reduced);
  root.classList.toggle('motion-paused', document.hidden);
  root.classList.add('motion-enabled');
  const game = context.game;
  if (!game || (session.snapshot && game.seed !== session.snapshot.seed)) session.effects = [];
  const freshEvents = deriveMotionEvents(session.snapshot, game);
  if (game) session.snapshot = JSON.parse(JSON.stringify(game));
  else session.snapshot = null;
  if (!reduced && !document.hidden) {
    for (const event of freshEvents) session.effects.push({ event, started: now, duration: durationFor(event) });
  }
  session.effects = session.effects.filter(effect => now - effect.started < effect.duration);
  for (const character of root.querySelectorAll('.character')) {
    makeRig(character, now);
    const id = character.dataset.motionCharacter;
    character.classList.toggle('motion-ready', game?.phase === 'playing' && id === game.activePlayer);
    character.classList.toggle('motion-sleepy', id === 'lala' && game?.forecast?.type === 'nap');
  }
  if (reduced || document.hidden) { session.effects = []; return; }
  for (const effect of session.effects) renderEffect(root, effect, session, now);
  if (session.effects.length) {
    const remaining = Math.max(...session.effects.map(effect => effect.duration - (now - effect.started)));
    session.timers.push(setTimeout(() => {
      if (root.isConnected) enhanceMotion(root, session.context);
    }, remaining + 32));
  }
}
