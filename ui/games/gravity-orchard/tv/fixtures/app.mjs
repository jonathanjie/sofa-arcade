import { mountTV } from '../index.mjs';
import { mountTutorial } from '../../tutorial/index.mjs';
import { makeFixture, makeJourney, SCENES, geometry, CONNECTED } from './scenarios.mjs';

const params = new URLSearchParams(location.search);
if (params.get('clean') === '1') document.body.dataset.clean = 'true';
const root = document.querySelector('#fixture-root');
const select = document.querySelector('#fixture-scene');
const status = document.querySelector('#fixture-status');
for (const name of SCENES) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }

let view = null;
let mounted;
let clock = 1000;
let serial = 0;
let connection = structuredClone(CONNECTED);
let options = {};
let hold = false;
let reject = null;
let pending = [];
let autoApply = true;
let journey = makeJourney();
let journeyIndex = -1;
const commands = [];
const sounds = [];
const exits = [];
const commandResults = [];
const sound = { effect(name, detail) { sounds.push({ name, detail: structuredClone(detail ?? null) }); }, setScene(scene) { sounds.push({ scene }); } };

function applyFixtureCommand(command) {
  if (!autoApply || !view) return;
  const next = structuredClone(view);
  if (command.kind === 'pause' && ['playing', 'countdown'].includes(next.phase)) {
    next.phase = 'paused'; next.pauseReason = command.payload.reason; next.runEpoch++;
    next.ready = { jon: false, lydia: false };
    for (const player of Object.values(next.players)) player.input = { x: 0, y: 0, brake: true };
    update(next);
  } else if (command.kind === 'rematch' && ['paused', 'finished'].includes(next.phase)) {
    update(makeFixture('waiting', { matchId: `diagnostic-rematch-${++serial}` }));
  } else if (command.kind === 'retry-stage' && ['interlude', 'finished'].includes(next.phase)) {
    next.phase = 'waiting'; next.runEpoch++; next.results.pop(); next.fruits = []; next.timeRemainingTicks = 5400;
    next.ready = { jon: false, lydia: false }; next.pauseReason = null;
    next.orders = { ...next.orders, activeIndex: 0, completedIds: [] };
    next.events = []; update(next);
  }
}

function onCommand(command) {
  commands.push(structuredClone(command));
  return new Promise(resolve => {
    const complete = () => {
      if (reject) { const result = { accepted: false, code: reject }; reject = null; commandResults.push(result); resolve(result); return; }
      applyFixtureCommand(command);
      const result = { accepted: true }; commandResults.push(result); resolve(result);
    };
    if (hold) { hold = false; pending.push(complete); }
    else queueMicrotask(complete);
  });
}

function remount(nextOptions = {}) {
  mounted?.dispose(); options = { ...options, ...nextOptions };
  mounted = mountTV(root, { geometry, assets: {}, onCommand, onExit: () => exits.push(clock), sound, now: () => clock, ...options });
  mounted.setConnection(connection);
  if (view) mounted.update(view);
}

function update(next) { view = next && structuredClone(next); mounted.update(next); return view; }
function setConnection(next) { connection = structuredClone(next); mounted.setConnection(next); }
function show(scene) {
  select.value = scene;
  setConnection(scene === 'reconnect' ? { state: 'reconnecting', presence: { jon: { connected: true, inputFresh: true }, lydia: { connected: false, inputFresh: false } } } : structuredClone(CONNECTED));
  update(makeFixture(scene, { matchId: `diagnostic-${scene}-${++serial}` }));
  status.textContent = `Injected ${scene} snapshot · no live room`;
}
function nextJourney() {
  if (journeyIndex + 1 >= journey.length) return null;
  const frame = journey[++journeyIndex];
  update(frame.view); status.textContent = `Transcript ${journeyIndex + 1}/${journey.length} · ${frame.name}`;
  return frame.name;
}

remount();
if (params.get('scene') !== 'missing') show(SCENES.includes(params.get('scene')) ? params.get('scene') : 'playing');
select.addEventListener('change', () => show(select.value));
document.querySelector('#fixture-next').addEventListener('click', nextJourney);
document.querySelector('#fixture-reset').addEventListener('click', () => { journey = makeJourney({ matchId: `diagnostic-journey-${++serial}` }); journeyIndex = -1; nextJourney(); });

window.fixture = {
  show, update, setConnection, remount, commands, sounds, exits, commandResults, geometry,
  view: () => structuredClone(view), makeFixture, makeJourney,
  advance(ms = 50) { clock += ms; return clock; }, now: () => clock,
  setAutoApply(value) { autoApply = Boolean(value); },
  holdNext() { hold = true; }, rejectNext(code = 'fixture-rejected') { reject = code; },
  releaseNext() { const callbacks = pending; pending = []; callbacks.forEach(callback => callback()); },
  dispose() { mounted?.dispose(); },
  mountTutorial(options = {}) { mounted?.dispose(); root.replaceChildren(); mounted = mountTutorial(root, { onClose: () => exits.push('tutorial'), inputMode: 'touch', ...options }); },
  get mounted() { return mounted; },
  journeyNext: nextJourney,
};
