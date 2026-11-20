import { createRealtimeClient } from '/realtime/index.mjs';

const $ = (id) => document.getElementById(id);
const requested = new URL(location.href).searchParams.get('viewer');
const role = ['host', 'jon', 'lydia'].includes(requested) ? requested : 'host';
const player = role !== 'host';
const title = role === 'jon' ? 'Jon' : role === 'lydia' ? 'Lydia' : 'Host';
const nativeWebSocket = globalThis.WebSocket;
const faults = { offlineUntil: 0, staleUntil: 0, slow: false };
const faultCounts = { delayedSnapshots: 0, coalescedSnapshots: 0, staleInputs: 0, drops: 0 };
const sockets = new Set();
let latestSnapshot = null;
let client;
let session;
let commandSequence = 0;
let disposed = false;
let statsTimer;
let polling = false;
let lastMeasurement = { at: performance.now(), snapshots: 0, tick: 0, matchId: null };
let measured = { snapshotsPerSecond: null, ticksPerSecond: null };
let serverDiagnostics = null;
let lastAction = '';
let latestStatus = { state: 'connecting' };
const keys = new Set();
let pointerVector = null;
let brakeHeld = false;

/**
 * Fault injection wraps the real browser WebSocket. It never implements the
 * protocol or authenticates a seat. Snapshot delay retains ONE newest frame;
 * true socket/TCP slow-reader resource bounds are covered by server tests.
 */
class FixtureSocket extends EventTarget {
  static CONNECTING = nativeWebSocket.CONNECTING;
  static OPEN = nativeWebSocket.OPEN;
  static CLOSING = nativeWebSocket.CLOSING;
  static CLOSED = nativeWebSocket.CLOSED;
  constructor(url) {
    super();
    this.native = null;
    this.state = FixtureSocket.CONNECTING;
    this.pendingSnapshot = null;
    this.deliveryTimer = null;
    this.failureTimer = null;
    this.bindings = [];
    sockets.add(this);
    if (performance.now() < faults.offlineUntil) {
      this.failureTimer = setTimeout(() => {
        this.failureTimer = null;
        this.state = FixtureSocket.CLOSED;
        this.dispatchEvent(new Event('error'));
        this.dispatchEvent(new CloseEvent('close', { code: 1006, reason: '', wasClean: false }));
        sockets.delete(this);
      }, 10);
      return;
    }
    this.native = new nativeWebSocket(url);
    this.bind('open', () => { this.state = FixtureSocket.OPEN; this.dispatchEvent(new Event('open')); });
    this.bind('error', () => this.dispatchEvent(new Event('error')));
    this.bind('message', (event) => {
      let type;
      try { type = JSON.parse(event.data).type; } catch { /* The real client validates invalid data. */ }
      if (faults.slow && type === 'snapshot') {
        faultCounts.delayedSnapshots += 1;
        if (this.pendingSnapshot !== null) faultCounts.coalescedSnapshots += 1;
        this.pendingSnapshot = event.data;
        if (this.deliveryTimer === null) this.deliveryTimer = setTimeout(() => this.flushSnapshot(), 500);
      } else this.dispatchEvent(new MessageEvent('message', { data: event.data }));
    });
    this.bind('close', (event) => {
      this.state = FixtureSocket.CLOSED;
      this.clean();
      this.dispatchEvent(new CloseEvent('close', { code: event.code, reason: event.reason, wasClean: event.wasClean }));
      sockets.delete(this);
    });
  }
  bind(type, listener) { this.native.addEventListener(type, listener); this.bindings.push([type, listener]); }
  get readyState() { return this.native?.readyState ?? this.state; }
  get bufferedAmount() { return this.native?.bufferedAmount ?? 0; }
  send(data) {
    if (!this.native || this.readyState !== FixtureSocket.OPEN) throw new Error('fixture-socket-unavailable');
    if (performance.now() < faults.staleUntil) {
      let frame;
      try { frame = JSON.parse(data); } catch { /* Forward the original to the real server. */ }
      if (frame?.type === 'input') {
        frame.observedTick = 0;
        faultCounts.staleInputs += 1;
        data = JSON.stringify(frame);
      }
    }
    this.native.send(data);
  }
  flushSnapshot() {
    if (this.deliveryTimer !== null) clearTimeout(this.deliveryTimer);
    this.deliveryTimer = null;
    const data = this.pendingSnapshot;
    this.pendingSnapshot = null;
    if (data !== null && this.readyState === FixtureSocket.OPEN) this.dispatchEvent(new MessageEvent('message', { data }));
  }
  clean() {
    if (this.deliveryTimer !== null) clearTimeout(this.deliveryTimer);
    if (this.failureTimer !== null) clearTimeout(this.failureTimer);
    this.deliveryTimer = null;
    this.failureTimer = null;
    this.pendingSnapshot = null;
    for (const [type, listener] of this.bindings) this.native?.removeEventListener(type, listener);
    this.bindings.length = 0;
  }
  close(code = 1000, reason = '') {
    if (this.native) this.native.close(code, reason);
    else {
      this.clean();
      this.state = FixtureSocket.CLOSED;
      sockets.delete(this);
      this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean: true }));
    }
  }
}

function setStatus(status) {
  if (disposed) return;
  latestStatus = status;
  $('connection-state').dataset.state = status.state;
  $('connection-state').lastElementChild.textContent = status.state;
  if (status.state !== 'connected') neutralize();
  renderSnapshot();
}

function setMetric(id, number, unit, digits = 0) {
  const shown = Number.isFinite(number) ? number.toFixed(digits) : '—';
  $(id).replaceChildren(document.createTextNode(shown));
  if (unit) { const small = document.createElement('small'); small.textContent = ` ${unit}`; $(id).append(small); }
}

function notice(titleText, detail, icon = 'Ⅱ') {
  $('board-notice').hidden = !titleText;
  if (!titleText) return;
  $('notice-title').textContent = titleText;
  $('notice-detail').textContent = detail;
  $('board-notice').querySelector('.notice-icon').textContent = icon;
}

function renderSnapshot() {
  const view = latestSnapshot?.view;
  if (!view) return;
  $('board-tick').textContent = view.tick;
  $('phase').dataset.phase = view.phase;
  const labels = { waiting: 'Waiting for both players', countdown: `Starting in ${(view.countdownTicks / 60).toFixed(1)}s`, playing: 'Live · authoritative simulation', paused: `Paused · ${view.pauseReason ?? 'requested'}`, interlude: 'Stage complete', finished: 'Run complete' };
  const live = latestStatus.state === 'connected';
  $('phase').dataset.snapshotStale = String(!live);
  $('phase').textContent = live ? labels[view.phase] : 'Offline · last received frame';
  for (const [index, seat] of ['jon', 'lydia'].entries()) {
    const input = view.players[seat].input;
    const fruit = view.fruits[index];
    const marker = $(`${seat}-marker`);
    if (fruit) {
      marker.setAttribute('transform', `translate(${fruit.x} ${fruit.y})`);
      marker.dataset.x = fruit.x;
      marker.dataset.y = fruit.y;
    }
    $(`${seat}-vector`).setAttribute('x2', input.brake ? 0 : input.x * 100);
    $(`${seat}-vector`).setAttribute('y2', input.brake ? 0 : input.y * 100);
    $(`${seat}-vector`).setAttribute('visibility', input.brake || Math.hypot(input.x, input.y) < 0.01 ? 'hidden' : 'visible');
    $(`${seat}-brake-mark`).setAttribute('visibility', input.brake ? 'visible' : 'hidden');
    $(`${seat}-input`).textContent = `x ${input.x.toFixed(2)} · y ${input.y.toFixed(2)}`;
    $(`${seat}-brake`).textContent = input.brake ? 'BRAKE' : 'STEER';
    $(`${seat}-brake`).dataset.brake = String(input.brake);
    const presence = latestSnapshot.presence[seat];
    $(`${seat}-presence`).textContent = !live ? 'Last seen' : presence.connected ? (presence.inputFresh ? 'Live' : 'Connected') : 'Offline';
    $(`presence-${seat}`).dataset.connected = String(presence.connected);
    $(`presence-${seat}`).dataset.fresh = String(presence.inputFresh);
    $(`${seat}-ready`).textContent = view.ready[seat] ? 'Ready ✓' : 'Not ready';
    $(`${seat}-ready`).dataset.ready = String(view.ready[seat]);
  }
  if (latestStatus.state !== 'connected') notice('Connection interrupted', 'The host expires stale steering, then pauses the shared run.', '↻');
  else if (view.phase === 'waiting') notice('Connect both controllers', 'Open Jon and Lydia, then tap Ready on each phone.', '↗');
  else if (view.phase === 'countdown') notice(`Ready in ${Math.ceil(view.countdownTicks / 60)}`, 'Old steering is cleared. Both trays begin from a safe Brake.', '✓');
  else if (view.phase === 'paused') {
    const reason = { network: 'Controller connection lost', 'host-stall': 'Host clock gap detected', recovery: 'Recovered from checkpoint', requested: 'Shared pause requested', help: 'Paused for Help', recenter: 'Paused to recenter' }[view.pauseReason] ?? 'Shared run paused';
    notice(reason, 'Reconnected does not mean resumed. Both players must tap Ready.');
  } else if (view.phase === 'interlude' || view.phase === 'finished') notice('Fixture stage complete', 'No game scoring is implemented in this transport fixture.', '✓');
  else notice(null);
  const canReady = latestStatus.state === 'connected' && ['waiting', 'paused', 'interlude'].includes(view.phase);
  $('ready-button').disabled = !canReady;
  $('ready-button').textContent = player && view.ready[role] ? 'Ready ✓' : 'Ready';
  const canPause = latestStatus.state === 'connected' && ['playing', 'countdown'].includes(view.phase);
  $('host-pause').disabled = !canPause;
  $('phone-pause').disabled = !canPause;
  $('rematch').disabled = latestStatus.state !== 'connected' || !['paused', 'finished'].includes(view.phase);
  $('stale-input').disabled = !player || view.phase !== 'playing';
}

function acceptSnapshot(snapshot) {
  if (disposed) return;
  const previous = latestSnapshot?.view;
  if (!previous || previous.matchId !== snapshot.view.matchId || previous.runEpoch !== snapshot.view.runEpoch) neutralize();
  latestSnapshot = snapshot;
  renderSnapshot();
}

async function command(kind, payload) {
  try {
    const result = await client.sendCommand({ id: `fixture-${role}-${++commandSequence}`, kind, payload });
    lastAction = result.accepted ? `${kind} acknowledged` : `${kind} rejected · ${result.code ?? 'unavailable'}`;
  } catch {
    lastAction = `${kind} could not be acknowledged`;
  }
}

function neutralize() {
  keys.clear(); pointerVector = null; brakeHeld = false;
  $('joystick-thumb').style.transform = 'translate(0px,0px)';
  $('brake-button').setAttribute('aria-pressed', 'false');
  client?.setInput({ x: 0, y: 0, brake: true });
}

function emitIntent() {
  if (!player) return;
  let x = pointerVector?.x ?? (Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a')));
  let y = pointerVector?.y ?? (Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w')));
  const magnitude = Math.max(1, Math.hypot(x, y));
  x /= magnitude; y /= magnitude;
  const brake = brakeHeld || keys.has(' ') || (!pointerVector && x === 0 && y === 0);
  client?.setInput({ x, y, brake });
  const travel = $('joystick').clientWidth * 0.31;
  $('joystick-thumb').style.transform = `translate(${x * travel}px,${y * travel}px)`;
  $('brake-button').setAttribute('aria-pressed', String(brakeHeld || keys.has(' ')));
}

function steerPointer(event) {
  const box = $('joystick').getBoundingClientRect();
  const scale = box.width * 0.38;
  pointerVector = { x: Math.max(-1, Math.min(1, (event.clientX - box.left - box.width / 2) / scale)), y: Math.max(-1, Math.min(1, (event.clientY - box.top - box.height / 2) / scale)) };
  emitIntent();
}

$('joystick').addEventListener('pointerdown', (event) => { if (!player) return; event.preventDefault(); $('joystick').setPointerCapture(event.pointerId); steerPointer(event); });
$('joystick').addEventListener('pointermove', (event) => { if ($('joystick').hasPointerCapture(event.pointerId)) steerPointer(event); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(name, () => { pointerVector = null; emitIntent(); });
$('brake-button').addEventListener('pointerdown', (event) => { event.preventDefault(); $('brake-button').setPointerCapture(event.pointerId); brakeHeld = true; emitIntent(); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('brake-button').addEventListener(name, () => { brakeHeld = false; emitIntent(); });
const controlKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' ']);
window.addEventListener('keydown', (event) => { if (!player || !controlKeys.has(event.key)) return; event.preventDefault(); keys.add(event.key); emitIntent(); });
window.addEventListener('keyup', (event) => { if (!player || !controlKeys.has(event.key)) return; event.preventDefault(); keys.delete(event.key); emitIntent(); });
window.addEventListener('blur', neutralize);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { neutralize(); if (latestSnapshot?.view.phase === 'playing') void command('pause', { reason: 'requested' }); } });
$('ready-button').addEventListener('click', () => command('ready', { value: true }));
$('phone-pause').addEventListener('click', () => command('pause', { reason: 'requested' }));
$('host-pause').addEventListener('click', () => command('pause', { reason: 'requested' }));
$('rematch').addEventListener('click', () => command('rematch', { seedMode: 'same' }));
$('drop-socket').addEventListener('click', () => {
  faults.offlineUntil = performance.now() + 3000;
  faultCounts.drops += 1;
  neutralize();
  for (const socket of sockets) socket.close(4000, 'fixture-loss');
  lastAction = 'Socket loss injected; automatic reconnect follows';
});
$('restore-socket').addEventListener('click', () => {
  faults.offlineUntil = 0;
  client?.connect();
  lastAction = 'Connection restored; authenticating on the next retry';
});
$('slow-delivery').addEventListener('click', () => {
  faults.slow = !faults.slow;
  $('slow-delivery').setAttribute('aria-pressed', String(faults.slow));
  if (!faults.slow) for (const socket of sockets) socket.flushSnapshot();
  lastAction = faults.slow ? 'Snapshot delivery delayed; newest frame replaces backlog' : 'Snapshot delivery restored';
});
$('stale-input').addEventListener('click', () => { faults.staleUntil = performance.now() + 1000; lastAction = 'Observed tick forced to zero for one second'; });
$('host-stall').addEventListener('click', async () => {
  try {
    const response = await fetch('/fixture/control', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ kind: 'host-stall' }) });
    lastAction = response.ok ? 'Host monotonic clock advanced by 1 second' : 'Host clock injection rejected';
  } catch { lastAction = 'Host clock injection unavailable'; }
});

async function pollDiagnostics() {
  if (player || polling || disposed || !session) return;
  polling = true;
  try {
    const response = await fetch('/fixture/diagnostics', { headers: { Authorization: `Bearer ${session.token}` }, cache: 'no-store' });
    if (response.ok && !disposed) {
      serverDiagnostics = await response.json();
      $('checkpoint-count').textContent = serverDiagnostics.writes;
    }
  } catch { /* Keep the last measured value during a deliberate interruption. */ }
  finally { polling = false; }
}

function refreshStats() {
  if (!client || disposed) return;
  const stats = client.getStats();
  const at = performance.now();
  const elapsed = at - lastMeasurement.at;
  if (elapsed >= 1000) {
    measured.snapshotsPerSecond = Math.max(0, stats.snapshotsReceived - lastMeasurement.snapshots) * 1000 / elapsed;
    measured.ticksPerSecond = latestSnapshot?.view.matchId === lastMeasurement.matchId ? Math.max(0, latestSnapshot.view.tick - lastMeasurement.tick) * 1000 / elapsed : null;
    lastMeasurement = { at, snapshots: stats.snapshotsReceived, tick: latestSnapshot?.view.tick ?? 0, matchId: latestSnapshot?.view.matchId ?? null };
    void pollDiagnostics();
  }
  setMetric('rtt', player ? stats.ackRttEwmaMs : stats.pingRttMs, 'ms', 1);
  setMetric('tick-age', stats.observedTickAgeAtApply, 'ticks');
  setMetric('snapshot-rate', measured.snapshotsPerSecond, '/s', 1);
  setMetric('buffer-depth', stats.bufferedBytes, 'B');
  $('applied-tick').textContent = stats.lastAppliedTick ?? '—';
  $('reconnect-count').textContent = stats.reconnects;
  $('inputs-sent').textContent = stats.inputsSent;
  $('coalesced-count').textContent = stats.inputsCoalesced + faultCounts.coalescedSnapshots;
  $('tick-rate').textContent = Number.isFinite(measured.ticksPerSecond) ? measured.ticksPerSecond.toFixed(1) : '—';
  const active = faults.offlineUntil > at || faults.staleUntil > at || faults.slow;
  $('fault-status').dataset.active = String(active);
  $('fault-status').textContent = faults.offlineUntil > at ? `Socket unavailable · ${Math.ceil((faults.offlineUntil - at) / 1000)}s remaining`
    : faults.staleUntil > at ? 'Sending stale observed ticks; invalid input must not refresh the deadman'
      : faults.slow ? `500ms delivery · ${faultCounts.coalescedSnapshots} snapshots coalesced`
        : lastAction || 'No faults injected';
}

function dispose() {
  if (disposed) return;
  disposed = true;
  clearInterval(statsTimer);
  client?.dispose();
  for (const socket of sockets) { socket.clean(); socket.close(); }
  sockets.clear();
  session = null;
}
window.addEventListener('pagehide', dispose, { once: true });

document.body.classList.toggle('controller-view', player);
document.body.classList.toggle('lydia-view', role === 'lydia');
document.querySelector(`[data-role="${role}"]`)?.setAttribute('aria-current', 'page');
$('controller-panel').hidden = !player;
$('host-actions').hidden = player;
$('stale-input').hidden = !player;
$('monitor-role').textContent = role.toUpperCase();
$('controller-title').textContent = `${title}’s tray`;
$('view-description').textContent = player ? `${title}’s controller · ${role === 'jon' ? 'round marker / left tray' : 'diamond marker / right tray'}` : 'Two controllers. One authoritative room.';
$('rtt-label').textContent = player ? 'Applied ACK round-trip' : 'Ping round-trip';

// A read-only, credential-free browser-test seam. Never expose the client/session.
Object.defineProperty(window, '__go2FixtureMetrics', { value: () => ({
  role, phase: latestSnapshot?.view.phase ?? null, pauseReason: latestSnapshot?.view.pauseReason ?? null,
  matchId: latestSnapshot?.view.matchId ?? null, runEpoch: latestSnapshot?.view.runEpoch ?? null,
  stats: client?.getStats() ?? null, faults: { ...faultCounts }, measurements: { ...measured },
  checkpoints: serverDiagnostics?.writes ?? null,
}), writable: false });

try {
  const response = await fetch('/fixture/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewer: role }), cache: 'no-store' });
  if (!response.ok) throw new Error('fixture-session-unavailable');
  session = await response.json();
  if (disposed) { session = null; } else {
    client = createRealtimeClient({
      url: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/realtime/gravity-orchard`,
      roomCode: session.roomCode, token: session.token,
      onSnapshot: acceptSnapshot, onStatus: setStatus, now: () => performance.now(), WebSocketImpl: FixtureSocket,
    });
    client.connect();
    statsTimer = setInterval(refreshStats, 100);
  }
} catch {
  setStatus({ state: 'error' });
  notice('Fixture connection unavailable', 'Start the standalone GO2 fixture server and refresh this view.');
}
