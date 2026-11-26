import { createSensorDiagnostic } from './diagnostic.mjs';

const $ = (id) => document.getElementById(id);
const labels = {
  idle: 'Ready to check this phone.',
  insecure: 'This phone can’t use tilt yet. Use touch, or finish the tilt setup on your Mac.',
  unsupported: 'This browser does not expose the required orientation API. Use touch controls.',
  'awaiting-permission': 'Choose whether to allow motion in the browser prompt.',
  waiting: 'Allowed. Now tilt the phone a little…',
  'samples-received': 'Tilt readings arrived. Tilt works on this phone.',
  'no-samples': 'No tilt readings arrived. You can play with touch.',
  denied: 'Motion access was not granted. You can play with touch.',
  paused: 'Check paused. Tap again when this page is visible.',
  error: 'Motion access could not be requested. Try again, or use touch.',
};
const permissionLabels = { unrequested: 'Not requested', unavailable: 'Not available here', 'not-required': 'Not needed on this phone', granted: 'Granted', denied: 'Not granted', error: 'Request failed' };
function onStatus(state) {
  $('probe-status').textContent = labels[state.status] || 'Check stopped.';
  $('https-state').textContent = state.httpsLoaded ? 'Yes' : 'No';
  $('context-state').textContent = state.secureContext ? 'Yes' : 'Not ready';
  $('permission-state').textContent = permissionLabels[state.permission];
  $('sample-state').textContent = state.sampleCount ? `${state.sampleCount} reading${state.sampleCount === 1 ? '' : 's'}` : 'None yet';
  $('evidence').textContent = state.evidence === 'synthetic' ? 'Test signal detected — this is not a real phone' : 'Real phone readings only';
  $('start-probe').disabled = state.status === 'awaiting-permission';
  $('start-probe').textContent = ['idle', 'insecure'].includes(state.status) ? 'Check motion on this phone' : 'Check again';
  $('stop-probe').hidden = !['waiting', 'samples-received', 'awaiting-permission'].includes(state.status);
  document.querySelector('.probe-art').classList.toggle('has-samples', state.sampleCount > 0);
}
let probe = createSensorDiagnostic({ onStatus });
$('start-probe').addEventListener('click', () => { void probe.startFromGesture(); });
$('stop-probe').addEventListener('click', () => probe.stop());
window.addEventListener('pagehide', () => probe.dispose());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) probe = createSensorDiagnostic({ onStatus });
});
