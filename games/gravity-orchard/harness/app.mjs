import { createRun, normalizeInput, step, applyCommand, pauseForSystem, project } from '../engine.mjs';
import { getLevel } from '../geometry.mjs';
import { FRUIT_TYPES, STAGES, RULES } from '../catalog.mjs';
import { bridgeWeights, forceAt, summarizeResults } from '../public.mjs';
import { terrainColliders } from '../physics.mjs';
import { createPilot } from '../validation/pilot.mjs';

const el = id => document.getElementById(id);
const canvas = el('board');
const ctx = canvas.getContext('2d');
const publicViewer = Object.freeze({ role: 'public', playerId: null });
const host = Object.freeze({ role: 'host', playerId: null });
const player = id => ({ role: 'player', playerId: id });
const pilot = createPilot();
const keys = new Set();
let matchSequence = 0;
let state;
let view;
let running = true;
let auto = false;
let accumulator = 0;
let previousTime = null;
let contacts = [];
let eventHistory = [];
let seenEvents = new Set();
let maxWork = { substeps: 0, iterations: 0, checks: 0 };
let controlsOverride = null;
let transcript = [];
let renderCounter = 0;

function command(actor, kind, payload) {
  const before = view;
  const result = applyCommand(state, actor, { kind, payload });
  if (result.accepted) {
    state = result.state;
    transcript.push({ kind: 'command', tick: before.tick, runEpoch: before.runEpoch, actor, command: { kind, payload } });
    refresh();
  } else el('notice').textContent = `Command declined: ${result.code}`;
  return result.accepted;
}
function readyBoth() {
  for (const id of ['jon', 'lydia']) {
    if (['waiting', 'paused', 'interlude'].includes(view.phase)) command(player(id), 'ready', { value: true });
  }
}
function newRun(seed = el('seed').value, mode = el('mode').value) {
  if (view && ['playing', 'countdown'].includes(view.phase)) command(host, 'pause', { reason: 'requested' });
  const cleanSeed = seed.trim() || 'orchard-proof-1';
  const matchId = `diagnostic-${++matchSequence}`;
  state = createRun({ seed: cleanSeed, matchId, options: { mode } });
  el('seed').value = cleanSeed;
  el('mode').value = mode;
  transcript = [{ kind: 'create', seed: cleanSeed, matchId, mode }];
  pilot.reset(); keys.clear(); contacts = []; eventHistory = []; seenEvents.clear(); controlsOverride = null;
  maxWork = { substeps: 0, iterations: 0, checks: 0 };
  accumulator = 0; previousTime = null;
  refresh();
  return view;
}
function manualControls() {
  if (controlsOverride) return controlsOverride;
  const make = (left, right, up, down, brake) => normalizeInput({
    x: Number(keys.has(right)) - Number(keys.has(left)),
    y: Number(keys.has(down)) - Number(keys.has(up)), brake
  });
  return {
    jon: make('KeyA', 'KeyD', 'KeyW', 'KeyS', keys.has('Space')),
    lydia: make('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', keys.has('ShiftLeft') || keys.has('ShiftRight'))
  };
}
function advanceOne() {
  if (auto && ['waiting', 'interlude'].includes(view.phase)) readyBoth();
  const controls = auto ? pilot.update(view) : manualControls();
  const before = view.tick;
  const next = step(state, controls);
  if (next !== state && next.tick !== before) {
    const previous = transcript.at(-1);
    const value = JSON.stringify(controls);
    if (previous?.kind === 'inputs' && previous.value === value && previous.startTick + previous.ticks === before) previous.ticks++;
    else transcript.push({ kind: 'inputs', startTick: before, ticks: 1, value });
  }
  state = next;
  refresh(false);
}
function refresh(render = true) {
  view = project(state, publicViewer);
  const work = state.diagnostics?.work;
  if (work) for (const key of Object.keys(maxWork)) maxWork[key] = Math.max(maxWork[key], work[key] || 0);
  for (const hit of state.diagnostics?.hits || []) {
    const identity = `${view.tick}:${hit.colliderId}:${hit.x}:${hit.y}`;
    if (!contacts.some(item => item.identity === identity)) contacts.push({ ...hit, identity, tick: view.tick });
  }
  contacts = contacts.filter(item => view.tick - item.tick < 90).slice(-80);
  for (const event of view.events) if (!seenEvents.has(event.id)) {
    seenEvents.add(event.id); eventHistory.push(event);
  }
  if (eventHistory.length > 1000) eventHistory.splice(0, eventHistory.length - 1000);
  if (render) draw();
}

const fruitColor = type => FRUIT_TYPES[type]?.color || '#f1cb72';
const fruitName = type => FRUIT_TYPES[type]?.name || type;
const smallId = id => id.split(':').slice(-2).join(':').slice(-15);
function roundedRect(x, y, width, height, radius = 12) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
}
function text(value, x, y, size = 14, color = '#344c36', weight = 500, align = 'center') {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}
function arrow(x, y, dx, dy, color, width = 3) {
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  const angle = Math.atan2(dy, dx), size = Math.min(10, d / 3);
  ctx.beginPath(); ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - size * Math.cos(angle - .5), y + dy - size * Math.sin(angle - .5));
  ctx.lineTo(x + dx - size * Math.cos(angle + .5), y + dy - size * Math.sin(angle + .5)); ctx.closePath(); ctx.fill();
}
function symbol(type, x, y, radius, color = fruitColor(type)) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = '#263b2c'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (type === 'starfruit') {
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2; const r = i % 2 ? radius * .5 : radius; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
  } else if (type === 'pear') {
    ctx.moveTo(0, -radius); ctx.bezierCurveTo(radius * .65, -radius, radius * .45, -radius * .35, radius * .7, 0);
    ctx.bezierCurveTo(radius * 1.5, radius * 1.1, -radius * 1.5, radius * 1.1, -radius * .7, 0);
    ctx.bezierCurveTo(-radius * .45, -radius * .35, -radius * .65, -radius, 0, -radius);
  } else if (type === 'plum') ctx.ellipse(0, 0, radius * .8, radius, -.15, 0, Math.PI * 2);
  else ctx.arc(0, 1, radius * .9, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  if (type !== 'starfruit') {
    ctx.strokeStyle = '#4c4e2d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -radius * .7); ctx.lineTo(2, -radius * 1.2); ctx.stroke();
    ctx.fillStyle = '#527a3b'; ctx.beginPath(); ctx.ellipse(5, -radius * .9, 5, 2.4, -.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawWorld(level) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#15302c'; ctx.fillRect(0, 0, 1280, 720);
  ctx.strokeStyle = '#25423a'; ctx.lineWidth = 1;
  for (let x = 0; x <= 1280; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 720); ctx.stroke(); }
  for (let y = 0; y <= 720; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y); ctx.stroke(); }
  text(STAGES[view.stageIndex].name, 640, 40, 24, '#f0ecda', 650);
  text('1280 × 720 world units · fixed geometry · both tray forces blend across the bridge', 640, 70, 13, '#b6c9b4');
  // Geometry, not illustrative pixels, owns every collider drawn below.
  const bridge = level.bridge;
  roundedRect(bridge.x, bridge.y, bridge.width, bridge.height, 2); ctx.fillStyle = '#d9c89c'; ctx.fill(); ctx.strokeStyle = '#927951'; ctx.lineWidth = 7; ctx.stroke();
  for (const tray of level.trays) {
    const b = tray.bounds;
    roundedRect(b.x, b.y, b.width, b.height, 18); ctx.fillStyle = tray.id === 'jon' ? '#efe1c4' : '#e1e9cf'; ctx.fill(); ctx.strokeStyle = '#947650'; ctx.lineWidth = 8; ctx.stroke();
    ctx.save(); roundedRect(b.x + 12, b.y + 12, b.width - 24, b.height - 24, 10); ctx.strokeStyle = '#b8ba94'; ctx.lineWidth = 1; ctx.setLineDash([5, 7]); ctx.stroke(); ctx.restore();
    text(tray.id === 'jon' ? 'JON' : 'LYDIA', b.x + b.width / 2, b.y + 28, 17, '#43593d', 750);
  }
  // Redraw the union's open connection: tray edges must not imply a closed wall.
  const gradient = ctx.createLinearGradient(bridge.x, 0, bridge.x + bridge.width, 0);
  gradient.addColorStop(0, '#e8be8170'); gradient.addColorStop(1, '#76b9aa90');
  ctx.fillStyle = gradient; ctx.fillRect(bridge.x - 5, bridge.y + 4, bridge.width + 10, bridge.height - 8);
  ctx.save(); ctx.setLineDash([8, 8]); ctx.strokeStyle = '#637d6b'; ctx.lineWidth = 2; ctx.strokeRect(bridge.x, bridge.y + 6, bridge.width, bridge.height - 12); ctx.restore();
  text('FORCE BLEND', bridge.x + bridge.width / 2, bridge.y + 24, 11, '#455d48', 750);
  for (let x = bridge.x + 24; x < bridge.x + bridge.width - 10; x += 38) {
    const weights = bridgeWeights(level, x);
    text(`${Math.round(weights.jon * 100)}:${Math.round(weights.lydia * 100)}`, x, bridge.y + bridge.height - 22, 9, '#52664a');
  }
  for (const bumper of level.bumpers) {
    ctx.fillStyle = '#71895d'; ctx.strokeStyle = '#405d40'; ctx.lineWidth = 3;
    if (bumper.kind === 'circle') { ctx.beginPath(); ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2); }
    else roundedRect(bumper.x, bumper.y, bumper.width, bumper.height, 6);
    ctx.fill(); ctx.stroke();
    const cx = bumper.x + (bumper.width || 0) / 2;
    const labelY = bumper.y - (bumper.radius || 0) - 20;
    ctx.save(); ctx.font = '600 11px system-ui, sans-serif';
    const labelWidth = ctx.measureText(bumper.id).width + 12;
    roundedRect(cx - labelWidth / 2, labelY - 9, labelWidth, 18, 4);
    ctx.fillStyle = '#223d33'; ctx.fill();
    text(bumper.id, cx, labelY, 11, '#eef3d3', 600); ctx.restore();
  }
  for (const hole of level.compost) {
    roundedRect(hole.x, hole.y, hole.width, hole.height, 4); ctx.fillStyle = '#655343'; ctx.fill(); ctx.strokeStyle = '#d3a979'; ctx.lineWidth = 3; ctx.stroke();
    text('COMPOST', hole.x + hole.width / 2, hole.y + hole.height / 2, 8, '#ffe5b7', 750);
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#d19661'; ctx.lineWidth = 1; ctx.strokeRect(hole.x - 5, hole.y - 5, hole.width + 10, hole.height + 10); ctx.restore();
  }
  for (const gate of level.gates) {
    const status = view.gateStates.find(item => item.id === gate.id);
    ctx.fillStyle = status?.state === 'closed' ? '#8d7b99' : status?.state === 'forecast' ? '#edbc6180' : '#8ebca440';
    ctx.fillRect(gate.x, gate.y, gate.width, gate.height); ctx.strokeStyle = status?.state === 'forecast' ? '#aa7132' : '#73627e'; ctx.lineWidth = 2; ctx.strokeRect(gate.x, gate.y, gate.width, gate.height);
    const cue = status?.closureDeferred ? 'WAITING FOR FRUIT' : `${status?.state.toUpperCase() || 'OPEN'} ${((status?.ticksToChange || 0) / 60).toFixed(1)}s`;
    text(cue, gate.x + gate.width / 2, gate.y - 16, 10, '#f3d58a', 750);
  }
  for (const basket of level.baskets) {
    ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = '#7a765a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(basket.x, basket.y, basket.radius + 14, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#b98c55'; ctx.strokeStyle = '#815c37'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(basket.x, basket.y, basket.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f5e8bd'; ctx.beginPath(); ctx.arc(basket.x, basket.y, basket.radius - 7, 0, Math.PI * 2); ctx.fill();
    symbol(basket.fruitType, basket.x, basket.y, 19);
    text(`${fruitName(basket.fruitType)}  ${view.baskets[basket.fruitType].count}/3`, basket.x, basket.y + basket.radius + 24, 14, '#314a36', 700);
  }
  for (const id of ['jon', 'lydia']) {
    const point = level.spawnPoints[id];
    ctx.save(); ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#769777'; ctx.beginPath(); ctx.arc(point.x, point.y, 23, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    text('SUPPLY', point.x, point.y + 34, 9, '#73816a', 700);
    const ax = id === 'jon' ? 125 : 1155, ay = 365;
    const input = view.players[id].input;
    ctx.strokeStyle = '#a4af8e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ax, ay, 35, 0, Math.PI * 2); ctx.stroke();
    const force = forceAt({ x: ax, y: ay }, { level, controls: { jon: view.players.jon.input, lydia: view.players.lydia.input }, gust: view.gust?.phase === 'active' ? view.gust : null });
    const scale = Math.min(.085, 55 / Math.max(1, Math.hypot(force.x, force.y)));
    arrow(ax, ay, force.x * scale, force.y * scale, id === 'jon' ? '#a75c32' : '#3c7a69', 4);
    text(input.brake ? 'BRAKE' : 'TILT', ax, ay + 54, 12, '#526248', 750);
    text(`${Math.round(Math.hypot(force.x, force.y))} u/s²`, ax, ay + 71, 10, '#526248');
  }
  const plan = pilot.inspect();
  if (auto && plan.route?.length) {
    const target = view.fruits.find(fruit => fruit.id === plan.target);
    if (target) {
      ctx.save(); ctx.strokeStyle = '#9c7739'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(target.x, target.y); for (const point of plan.route) ctx.lineTo(point.x, point.y); ctx.stroke(); ctx.restore();
      const aim = plan.route[0]; ctx.strokeStyle = '#c68b28'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(aim.x, aim.y, 8, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Exact exterior segment colliders expose the union boundary independently
  // from the rounded decorative tray border.
  ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = '#243d35'; ctx.lineWidth = 2;
  for (const collider of terrainColliders(level, view.gateStates.filter(gate => gate.state === 'closed').map(gate => gate.id))) {
    if (collider.kind !== 'segment') continue;
    ctx.beginPath(); ctx.moveTo(collider.x1, collider.y1); ctx.lineTo(collider.x2, collider.y2); ctx.stroke();
  }
  ctx.restore();
  for (const fruit of view.fruits) {
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#293d2c99'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(fruit.x, fruit.y, fruit.radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    arrow(fruit.x, fruit.y, fruit.vx * .2, fruit.vy * .2, '#365c5070', 2);
    symbol(fruit.type, fruit.x, fruit.y, fruit.radius * .88);
    text(smallId(fruit.id), fruit.x, fruit.y - fruit.radius - 11, 9, '#233c2c', 700);
    if (auto && fruit.id === plan.target) { ctx.strokeStyle = '#d39b37'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fruit.x, fruit.y, fruit.radius + 5, 0, Math.PI * 2); ctx.stroke(); }
  }
  for (const contact of contacts) {
    if (!Number.isFinite(contact.x) || !Number.isFinite(contact.y)) continue;
    ctx.strokeStyle = '#b67624'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(contact.x - 5, contact.y - 5); ctx.lineTo(contact.x + 5, contact.y + 5); ctx.moveTo(contact.x + 5, contact.y - 5); ctx.lineTo(contact.x - 5, contact.y + 5); ctx.stroke();
    arrow(contact.x, contact.y, (contact.nx || 0) * 24, (contact.ny || 0) * 24, '#b67624', 1.5);
  }
  for (const event of view.events.slice(-15)) {
    if (!['catch', 'compost', 'reject'].includes(event.kind) || view.tick - event.tick > 60 || !Number.isFinite(event.x)) continue;
    ctx.strokeStyle = event.kind === 'catch' ? '#567f3c' : '#a06136'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(event.x, event.y, 22, 0, Math.PI * 2); ctx.stroke();
    text(event.kind.toUpperCase(), event.x, event.y - 34, 10, '#3d5732', 800);
  }
  if (view.gust) {
    const gx = 640, gy = 655;
    text(`LALA · ${view.gust.phase === 'forecast' ? 'GUST IN' : 'GUST'} ${(view.gust.ticksRemaining / 60).toFixed(1)}s`, gx, gy - 12, 14, '#f2cd77', 700);
    arrow(gx, gy + 18, view.gust.x * 55, view.gust.y * 22, '#f0c66a', 4);
  }
  if (view.phase !== 'playing') {
    const labels = { waiting: 'Ready for the orchard?', countdown: String(Math.ceil(view.countdownTicks / 60)), paused: 'Picnic paused', interlude: 'Orchard complete', finished: 'Picnic results' };
    roundedRect(450, 290, 380, 125, 14); ctx.fillStyle = '#1c332aed'; ctx.fill(); ctx.strokeStyle = '#c5bc86'; ctx.lineWidth = 2; ctx.stroke();
    text(labels[view.phase], 640, 333, view.phase === 'countdown' ? 44 : 25, '#f5e8bd', 750);
    const caption = view.phase === 'waiting' || view.phase === 'paused' ? 'Jon + Lydia ready → 3-second countdown' : view.phase === 'interlude' ? 'Ready together for the next garden' : view.phase === 'finished' ? `${view.results.reduce((n, r) => n + r.ordersCompleted, 0)} / 12 orders · ${view.results.reduce((n, r) => n + r.stars, 0)} / 9 stars` : 'Brake held until the first active tick';
    text(caption, 640, 382, 14, '#cfd8b6');
  }
}
function ingredients(needs, current = false) {
  return Object.entries(needs).filter(([, n]) => n).map(([type, n]) => `<span class="ingredient${current && view.baskets[type].count >= n ? ' done' : ''}" title="${fruitName(type)}"><i style="background:${fruitColor(type)}">${type[0].toUpperCase()}</i>${n}</span>`).join('');
}
function updatePanels() {
  el('phase').textContent = view.phase;
  el('stage-label').textContent = `${view.stageIndex + 1} / 3 · ${STAGES[view.stageIndex].name}`;
  el('clock').textContent = view.timeRemainingTicks === null ? '∞' : `${(view.timeRemainingTicks / 60).toFixed(1)}s`;
  el('tick').textContent = `tick ${view.tick} · epoch ${view.runEpoch}`;
  el('world-count').textContent = `${view.fruits.length} / 8 fruit`;
  el('orders-count').textContent = `${view.orders.completedIds.length} / 4`;
  const active = view.orders.recipes[view.orders.activeIndex];
  el('active-recipe').innerHTML = active ? ingredients(active.needs, true) : '<span class="recipe-name">All four orders packed</span>';
  el('next-recipes').innerHTML = view.orders.recipes.slice(view.orders.activeIndex + 1, view.orders.activeIndex + 3).map((recipe, i) => `<div class="next-recipe"><span>Next ${i + 1}</span>${ingredients(recipe.needs)}</div>`).join('');
  el('buffers').innerHTML = Object.keys(FRUIT_TYPES).map(type => `<div class="buffer-row" style="--fruit:${fruitColor(type)}"><span class="label">${fruitName(type)}</span>${Array.from({ length: 3 }, (_, n) => `<i class="buffer-dot${n < view.baskets[type].count ? ' filled' : ''}"></i>`).join('')}</div>`).join('');
  el('controls').innerHTML = ['jon', 'lydia'].map(id => { const input = view.players[id].input; return `<div class="control-row"><b>${id}</b><span>${input.x.toFixed(2)}, ${input.y.toFixed(2)}</span><span class="${input.brake ? 'brake-on' : ''}">${input.brake ? 'BRAKE' : 'tilt'}</span></div>`; }).join('');
  el('hazard').textContent = view.gust ? `Gust ${view.gust.phase} · ${(view.gust.ticksRemaining / 60).toFixed(1)}s` : view.gateStates.length ? view.gateStates.map(gate => `Gate ${gate.closureDeferred ? 'waiting for fruit' : gate.state}`).join(' · ') : 'No active hazard';
  const work = state.diagnostics?.work || { substeps: 0, iterations: 0, checks: 0 };
  el('work').textContent = `substeps ${work.substeps} · iterations ${work.iterations} · checks ${work.checks} (max ${maxWork.checks})`;
  const summary = summarizeResults(view);
  el('result').textContent = view.results.length ? `${summary.ordersCompleted} orders · ${summary.stars} stars${summary.perfectPicnic ? ' · Perfect Picnic' : summary.practice ? ' · practice' : ''}` : '';
  el('event-count').textContent = `${view.events.length} / 64`;
  el('events').replaceChildren(...view.events.slice(-8).reverse().map(event => { const row = document.createElement('li'); row.textContent = `${event.tick} · ${event.kind}${event.entityId ? ` · ${smallId(event.entityId)}` : ''}`; row.title = event.id; return row; }));
  for (const id of ['jon', 'lydia']) { el(`ready-${id}`).disabled = !['waiting', 'paused', 'interlude'].includes(view.phase); el(`ready-${id}`).textContent = `${id === 'jon' ? 'Jon' : 'Lydia'} ${view.ready[id] ? '✓ ready' : 'ready'}`; }
  el('pause').disabled = !['playing', 'countdown'].includes(view.phase);
  el('retry').disabled = !['interlude', 'finished'].includes(view.phase);
  const plan = pilot.inspect();
  el('notice').textContent = view.phase === 'paused' ? `Paused: ${view.pauseReason}. Both seats must ready again.` : auto && view.phase === 'playing' ? `Route demo · ${plan.mode} · ${plan.target ? smallId(plan.target) : 'waiting'} · ordinary controls only` : view.phase === 'playing' ? 'Steer both trays. Brake steadies fruit; wrong or full baskets bounce it back.' : view.phase === 'countdown' ? 'Countdown does not consume stage time.' : view.phase === 'finished' ? 'All stages resolved. Retry the final stage or start a new match.' : 'Both gardeners ready to start. R readies both; route demo uses the real controls.';
}
function draw() { drawWorld(getLevel(view.levelId)); updatePanels(); renderCounter++; }

el('new-run').addEventListener('click', () => newRun());
for (const id of ['jon', 'lydia']) el(`ready-${id}`).addEventListener('click', () => command(player(id), 'ready', { value: !view.ready[id] }));
el('pause').addEventListener('click', () => command(host, 'pause', { reason: 'requested' }));
el('retry').addEventListener('click', () => { pilot.reset(); command(host, 'retry-stage', {}); });
el('demo').addEventListener('change', event => { auto = event.target.checked; pilot.reset(); if (auto && ['waiting', 'interlude'].includes(view.phase)) readyBoth(); });
el('help').addEventListener('click', () => { if (['playing', 'countdown'].includes(view.phase)) command(host, 'pause', { reason: 'help' }); el('help-dialog').showModal(); el('help').setAttribute('aria-expanded', 'true'); });
el('close-help').addEventListener('click', () => el('help-dialog').close());
el('help-dialog').addEventListener('close', () => el('help').setAttribute('aria-expanded', 'false'));
window.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || el('help-dialog').open) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
  if (!event.repeat && event.code === 'KeyR') readyBoth();
  if (!event.repeat && event.code === 'KeyP' && ['playing', 'countdown'].includes(view.phase)) command(host, 'pause', { reason: 'requested' });
});
window.addEventListener('keyup', event => keys.delete(event.code));
function releaseAndPause() { keys.clear(); controlsOverride = null; if (['playing', 'countdown'].includes(view.phase)) command(host, 'pause', { reason: 'requested' }); }
window.addEventListener('blur', releaseAndPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAndPause(); });

// Explicit local test API: no state setter, fruit insertion, score edits or
// variable-delta physics. advance executes the same fixed-step loop as rAF.
window.orchardLab = Object.freeze({
  getView: () => structuredClone(view),
  getStats: () => ({ maxWork: { ...maxWork }, eventHistory: structuredClone(eventHistory), renderCounter, transcriptLength: transcript.length, diagnostics: structuredClone(state.diagnostics || {}), pilot: pilot.inspect() }),
  setRunning(value) { running = Boolean(value); accumulator = 0; previousTime = null; },
  setAuto(value) { auto = Boolean(value); el('demo').checked = auto; pilot.reset(); },
  setControls(controls) {
    if (controls === null) { controlsOverride = null; return; }
    const jon = normalizeInput(controls.jon), lydia = normalizeInput(controls.lydia);
    if (!jon || !lydia) throw new TypeError('Both inputs must satisfy the normal input contract.');
    controlsOverride = { jon, lydia };
  },
  advance(ticks) { if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 30000) throw new RangeError('A bounded count of fixed ticks is required.'); for (let i = 0; i < ticks; i++) advanceOne(); draw(); return structuredClone(view); },
  readyBoth,
  command(actor, kind, payload) { return command(actor, kind, payload); },
  newRun,
  exportTranscript: () => structuredClone(transcript)
});
newRun();
function animate(time) {
  if (previousTime !== null && running) {
    const elapsed = time - previousTime;
    if (elapsed > 250 && ['playing', 'countdown'].includes(view.phase)) { state = pauseForSystem(state, 'host-stall'); accumulator = 0; refresh(false); }
    else accumulator += Math.min(elapsed, 83.3333);
    let steps = 0;
    while (accumulator >= 1000 / 60 && steps++ < 5) { advanceOne(); accumulator -= 1000 / 60; }
  }
  previousTime = time; draw(); requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
