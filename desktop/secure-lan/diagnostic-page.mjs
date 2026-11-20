import { createSensorDiagnostic } from './diagnostic.mjs';

const $ = (id) => document.getElementById(id);
const labels = {
  idle: 'Ready to check this phone.',
  insecure: 'This page is not a secure context. Use touch, or finish trusted HTTPS setup.',
  unsupported: 'This browser does not expose the required orientation API. Use touch controls.',
  'awaiting-permission': 'Choose whether to allow motion in the browser prompt.',
  waiting: 'Permission checked. Waiting for finite motion readings…',
  'samples-received': 'Finite browser readings received on this page.',
  'no-samples': 'No finite readings arrived. Touch controls are available.',
  denied: 'Motion access was not granted. You can play with touch.',
  paused: 'Check paused. Tap again when this page is visible.',
  error: 'Motion access could not be requested. Try again, or use touch.',
};
const permissionLabels = { unrequested: 'Not requested', unavailable: 'Unavailable here', 'not-required': 'No explicit prompt API', granted: 'Granted', denied: 'Not granted', error: 'Request failed' };
function onStatus(state) {
  $('probe-status').textContent = labels[state.status] || 'Check stopped.';
  $('https-state').textContent = state.httpsLoaded ? 'Yes' : 'No — HTTP';
  $('context-state').textContent = state.secureContext ? 'Confirmed' : 'Not secure';
  $('permission-state').textContent = permissionLabels[state.permission];
  $('sample-state').textContent = state.sampleCount ? `${state.sampleCount} browser sample${state.sampleCount === 1 ? '' : 's'}` : 'None yet';
  $('evidence').textContent = state.evidence === 'synthetic' ? 'Synthetic event detected — not phone sensor evidence' : 'Browser check · no simulated readings';
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
