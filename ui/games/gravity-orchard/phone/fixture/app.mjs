import { mountPhone } from '../index.mjs';
import { publicView } from './views.mjs';
import { createSyntheticEnvironment } from './environment.mjs';

const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') || 'permission';
const playerId = params.get('player') === 'lydia' ? 'lydia' : 'jon';
const peerId = playerId === 'jon' ? 'lydia' : 'jon';
const root = document.getElementById('phone-root');
const sensor = createSyntheticEnvironment({ scenario, angle: Number(params.get('angle')) || 0 });
const inputs = [];
const statuses = [];
const commands = [];
let disposed = false;
let exited = false;
let commandFailure = null;
let connection = { state: 'connected', presence: { jon: { connected: true, inputFresh: true }, lydia: { connected: true, inputFresh: true } } };
let view = publicView({ phase: params.get('phase') || 'waiting', mode: params.get('practice') === '1' ? 'practice' : 'campaign' });
let phone;
if (params.get('mode') === 'controller') document.body.classList.add('controller-only');
document.getElementById('scenario').value = scenario;

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function retain(list, value, max = 4096) {
  list.push(structuredClone(value));
  if (list.length > max) list.splice(0, list.length - max);
}
function publish() { phone?.update(freeze(view)); }
function setPhase(phase, overrides = {}) {
  const previous = view;
  // The engine increments its epoch when starting countdown, not when that
  // countdown expires into playing. Preserve that fence in this fixture.
  const boundary = phase !== previous.phase && !(previous.phase === 'countdown' && phase === 'playing');
  view = publicView({ ...previous, ...overrides, phase,
    runEpoch: overrides.runEpoch ?? previous.runEpoch + (boundary ? 1 : 0),
    tick: overrides.tick ?? previous.tick,
    ready: overrides.ready || (boundary ? { jon: false, lydia: false } : previous.ready),
    pauseReason: phase === 'paused' ? overrides.pauseReason || 'requested' : null,
    countdownTicks: phase === 'countdown' ? overrides.countdownTicks ?? 180 : 0,
    results: overrides.results || (['finished', 'interlude'].includes(phase) ? publicView({ phase, stageIndex: previous.stageIndex }).results : previous.results),
  });
  publish();
}
function patchView(patch) { view = { ...view, ...structuredClone(patch) }; publish(); }
function setConnection(status) {
  connection = typeof status === 'string' ? { ...connection, state: status } : { ...connection, ...status };
  phone?.setConnection(connection);
}
function renderInput(value) {
  document.getElementById('input-output').textContent = `x ${value.x.toFixed(4)} · y ${value.y.toFixed(4)} · Brake ${value.brake ? 'held' : 'released'}`;
  const x = 140 + value.x * 47;
  const y = 95 + value.y * 47;
  document.getElementById('vector-line').setAttribute('d', `M140 95L${x} ${y}`);
  document.getElementById('vector-dot').setAttribute('cx', String(x));
  document.getElementById('vector-dot').setAttribute('cy', String(y));
  document.getElementById('vector-dot').setAttribute('fill', value.brake ? '#315540' : '#d97a42');
}

phone = mountPhone(root, {
  playerId,
  input: {
    environment: sensor.environment,
    now: sensor.now,
    setInput(value) {
      // Deliberately retain only the exact input contract; never raw orientation.
      const normalized = { x: value.x, y: value.y, brake: value.brake };
      retain(inputs, normalized);
      renderInput(normalized);
    },
    onStatus(status) {
      retain(statuses, status, 512);
      document.getElementById('status-output').textContent = `${status.state} · ${status.message || status.mode || ''}`;
    },
  },
  async onCommand(command) {
    retain(commands, command, 512);
    if (commandFailure) return { accepted: false, code: commandFailure };
    // This is an explicitly controlled public snapshot fixture. It does not
    // simulate ticks, collisions, scoring, transport, or the two-player game.
    if (command.kind === 'pause' && ['playing', 'countdown'].includes(view.phase)) {
      setPhase('paused', { pauseReason: command.payload.reason });
    } else if (command.kind === 'ready' && ['waiting', 'paused', 'interlude'].includes(view.phase)) {
      patchView({ ready: { ...view.ready, [playerId]: command.payload.value } });
      if (view.ready.jon && view.ready.lydia) setPhase('countdown');
    }
    return { accepted: true };
  },
  onExit() { exited = true; },
  assets: {},
  reducedMotion: params.get('reduced') === '1' ? true : undefined,
});
publish();
setConnection(connection);

window.go3Fixture = {
  evidenceKind: 'rendered DOM controls with synthetic sensors and public snapshots; no physical phone validation',
  inputs, statuses, commands,
  get view() { return structuredClone(view); },
  get connection() { return structuredClone(connection); },
  get lastInput() { return structuredClone(inputs.at(-1) || { x: 0, y: 0, brake: true }); },
  get lastStatus() { return structuredClone(statuses.at(-1) || null); },
  get exited() { return exited; },
  setPhase, patchView, setConnection,
  sensor: sensor.sample,
  stableSamples: sensor.stableSamples,
  rotate: sensor.rotate,
  setHidden: sensor.setHidden,
  blur: sensor.blur,
  focus: sensor.focus,
  pagehide: sensor.pagehide,
  advance: sensor.advance,
  get permissionCalls() { return structuredClone(sensor.permissionCalls); },
  stats() { return { ...sensor.stats(), inputs: inputs.length, statuses: statuses.length, commands: commands.length, disposed }; },
  failCommands(code = null) { commandFailure = code; },
  peerReady() {
    patchView({ ready: { ...view.ready, [peerId]: true } });
    if (view.ready.jon && view.ready.lydia) setPhase('countdown');
  },
  clearRecords() { inputs.length = 0; statuses.length = 0; commands.length = 0; },
  dispose() { if (!disposed) { phone.dispose(); disposed = true; } },
};

document.querySelectorAll('button[data-phase]').forEach(button => button.addEventListener('click', () => setPhase(button.dataset.phase)));
document.getElementById('peer-ready').addEventListener('click', () => window.go3Fixture.peerReady());
document.getElementById('disconnect').addEventListener('click', () => setConnection(connection.state === 'connected' ? 'reconnecting' : 'connected'));
document.getElementById('scenario').addEventListener('change', event => {
  params.set('scenario', event.target.value);
  location.search = params.toString();
});
document.getElementById('stable').addEventListener('click', () => sensor.stableSamples());
document.getElementById('tilt-right').addEventListener('click', () => sensor.stableSamples({ gamma: 18 }));
document.getElementById('tilt-down').addEventListener('click', () => sensor.stableSamples({ beta: 53 }));
document.getElementById('rotate').addEventListener('click', () => sensor.rotate((sensor.stats().angle + 90) % 360));
document.getElementById('wait').addEventListener('click', () => sensor.advance(5000));
document.getElementById('hide').addEventListener('click', () => sensor.setHidden(!sensor.stats().hidden));
