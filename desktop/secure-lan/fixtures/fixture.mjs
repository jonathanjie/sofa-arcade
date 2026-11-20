import { mountSecureLanSetup } from './index.mjs';

// This development-only file is excluded from the production browser inventory.
// All host mutations below are in-memory stubs. There is no native bridge.
const sampleFingerprint = Array.from({ length: 32 }, (_, i) => (i * 7 + 19).toString(16).padStart(2, '0').toUpperCase()).join(':');
let fingerprint = sampleFingerprint;
const validUntil = '2027-02-18T00:00:00.000Z'; // Simulated leaf expiry, not the exported root's expiry.
let state = 'initial';
let mounted;
const operations = [];
const root = document.getElementById('setup-root');
const select = document.getElementById('fixture-state');
const sampleOrigin = 'https://192.168.1.24:4178';

function snapshot() {
  const s = ({ initial: 'needs-setup', ready: 'ready', 'missing-trust': 'ready', 'permission-denied': 'ready', expired: 'certificate-expired', 'address-changed': 'address-mismatch', failed: 'failed', disabled: 'disabled' })[state] || 'needs-setup';
  const withCert = !['needs-setup', 'failed'].includes(s);
  return {
    enabled: !['needs-setup', 'disabled', 'failed'].includes(s),
    status: s,
    controllerOrigins: s === 'ready' ? [sampleOrigin] : [],
    ...(withCert ? { certificateFingerprint: fingerprint, validUntil: s === 'certificate-expired' ? '2026-10-01T00:00:00.000Z' : validUntil } : {}),
    requiresPhoneTrust: true,
  };
}
function simulatedChecks() {
  const examples = {
    ready: ['HTTPS connected · secure context confirmed · finite samples (simulated)', 'HTTPS connected · secure context confirmed · finite samples (simulated)'],
    'missing-trust': ['Certificate not trusted · HTTPS not connected (simulated)', 'Trust not checked · no secure context or sensor evidence (simulated)'],
    'permission-denied': ['HTTPS connected · secure context confirmed · motion denied (simulated)', 'HTTPS connected · secure context confirmed · finite samples (simulated)'],
  };
  const text = examples[state] || ['Not connected · no trust or sensor evidence (simulated)', 'Not connected · no trust or sensor evidence (simulated)'];
  document.getElementById('jon-probe').textContent = `Jon: ${text[0]}`;
  document.getElementById('lydia-probe').textContent = `Lydia: ${text[1]}`;
}
const callbacks = {
  async getStatus() { return snapshot(); },
  async provision({ replaceRoot }) {
    operations.push({ operation: replaceRoot ? 'replace-root' : 'provision', result: 'simulated-success' });
    state = 'ready'; select.value = state; simulatedChecks(); return snapshot();
  },
  async exportPublicTrust({ format }) {
    const response = await fetch(`/fixture/public-trust?format=${format}`, { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw { code: 'CANCELLED' };
    const data = await response.json();
    operations.push({ operation: `export-${format}`, result: 'public-only' });
    return data;
  },
  async remove({ mode }) {
    operations.push({ operation: mode, result: 'simulated-success' });
    state = mode === 'disable' ? 'disabled' : 'initial'; select.value = state; simulatedChecks(); return snapshot();
  },
  onClose({ mode }) {
    operations.push({ operation: 'close', mode, result: 'simulated-success' });
    mounted.dispose();
    const closed = document.createElement('div'); closed.className = 'go6-fixture-closed';
    const h = document.createElement('h1'); h.textContent = mode === 'touch' ? 'Continue with touch' : 'Setup closed';
    const p = document.createElement('p'); p.textContent = 'The host can now return to the existing HTTP game. This fixture does not implement gameplay or change trust settings.';
    const a = document.createElement('a'); a.href = '/secure-lan/setup'; a.textContent = 'Open setup fixture again';
    closed.append(h, p, a); root.append(closed);
  },
};
function mount() { mounted = mountSecureLanSetup(root, callbacks); simulatedChecks(); return mounted; }
async function setScenario(next) {
  state = [...select.options].some((option) => option.value === next) ? next : 'initial';
  select.value = state; simulatedChecks(); await mounted.refresh();
}

// Public bootstrap only; unavailable on a minimal HTTP UI harness.
try {
  const response = await fetch('/fixture/public-trust?format=pem', { credentials: 'omit', cache: 'no-store' });
  if (response.ok) {
    const publicExport = await response.json();
    if (/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(publicExport.certificateFingerprint)) {
      fingerprint = publicExport.certificateFingerprint;
    }
  }
} catch { /* A UI-only fixture can use its visibly simulated metadata. */ }
mount();
void setScenario(new URLSearchParams(location.search).get('state') || 'initial');
select.addEventListener('change', () => { void setScenario(select.value); });
// Test control is intentionally confined to this excluded, development-only module.
window.__go6Fixture = { setScenario, callbacks, operations, snapshot, mount, get view() { return mounted; } };
