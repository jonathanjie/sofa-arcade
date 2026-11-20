/* GO6 host-only setup view. Safe callbacks are supplied by the native host;
 * this module has no native bridge, filesystem, fetch or certificate privileges. */
const mounted = new WeakMap();
const STATUSES = new Set(['disabled', 'needs-setup', 'ready', 'certificate-expired', 'address-mismatch', 'failed']);
const FINGERPRINT = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/;
const DEFAULT_STATUS = Object.freeze({ enabled: false, status: 'needs-setup', controllerOrigins: [], requiresPhoneTrust: true });

function safeOrigin(value) {
  if (typeof value !== 'string' || value.length > 300) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/' || u.origin !== value) return null;
    const h = u.hostname;
    const v4 = h.split('.').map(Number);
    const localV4 = /^\d+\.\d+\.\d+\.\d+$/.test(h) && v4.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (v4[0] === 10 || v4[0] === 127 || (v4[0] === 192 && v4[1] === 168) || (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) || (v4[0] === 169 && v4[1] === 254));
    const localName = h === 'localhost' || /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+local$/.test(h);
    const localV6 = h === '[::1]' || /^\[(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):[0-9a-f:]+\]$/.test(h);
    return localV4 || localName || localV6 ? value : null;
  } catch { return null; }
}

function safeStatus(input) {
  if (!input || typeof input.enabled !== 'boolean' || !STATUSES.has(input.status) || typeof input.requiresPhoneTrust !== 'boolean' || !Array.isArray(input.controllerOrigins) || input.controllerOrigins.length > 32) throw new Error('INVALID_STATUS');
  const origins = input.controllerOrigins.map(safeOrigin);
  if (origins.some((origin) => !origin) || (input.status === 'ready' && (!input.enabled || !origins.length))) throw new Error('INVALID_STATUS');
  const status = { enabled: input.enabled, status: input.status, controllerOrigins: [...new Set(origins)], requiresPhoneTrust: input.requiresPhoneTrust };
  if (input.certificateFingerprint !== undefined) {
    if (!FINGERPRINT.test(input.certificateFingerprint)) throw new Error('INVALID_STATUS');
    status.certificateFingerprint = input.certificateFingerprint.toUpperCase();
  }
  if (input.validUntil !== undefined) {
    if (typeof input.validUntil !== 'string' || input.validUntil.length > 40 || !Number.isFinite(Date.parse(input.validUntil))) throw new Error('INVALID_STATUS');
    status.validUntil = new Date(input.validUntil).toISOString();
  }
  return status;
}

const COPY = {
  'needs-setup': ['One-time setup', 'Give your phones a trusted way in.', 'Prepare a certificate unique to this Mac, then trust its public certificate on each phone.', 'Set up trusted access'],
  disabled: ['Trusted access off', 'Touch play is ready when you are.', 'Your saved certificate stays on this Mac. Turn trusted access on again to use phone tilt.', 'Enable trusted access'],
  ready: ['Host ready', 'Your Mac is ready. Now, each phone.', 'HTTPS is available. Each phone still needs to trust this installation and pass its own motion check.', 'Refresh certificate'],
  'certificate-expired': ['Certificate expired', 'Let’s refresh your local certificate.', 'Keep using touch while the host renews the certificate. Existing phone trust stays valid when the same root is retained.', 'Renew certificate'],
  'address-mismatch': ['Address changed', 'Your Mac has a new local address.', 'Refresh the certificate for the current network, then use the new secure join address. The existing root is retained.', 'Refresh local address'],
  failed: ['Setup needs attention', 'We couldn’t prepare trusted access.', 'Check the Mac’s local connection and retry. Touch play remains available.', 'Retry setup'],
};

function element(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function orchardGraphic() {
  return `<svg viewBox="0 0 280 135" aria-hidden="true"><path d="M44 100c-21-22-17-61 9-75 20-13 38-10 60-4 22-19 62-18 81 1 41-13 67 27 43 62-8 25-24 29-56 29H94c-21 1-36-1-50-13Z" fill="#dce6ce"/><path d="M31 86 51 52l81 8 5 44-87 7Z" fill="#79977e"/><path d="M31 78 51 45l81 8 5 43-87 7Z" fill="#bcd1a8"/><path d="m147 62 76-13 24 38-16 22-84-8Z" fill="#bd8e64"/><path d="m147 54 76-13 24 38-16 22-84-8Z" fill="#efd0a2"/><path d="m127 73 29-2 2 14-29 3Z" fill="#b3865b"/><path d="m127 70 29-2 2 10-29 3Z" fill="#f1deb8"/><path d="m131 71 1 8m7-9 1 8m7-9 1 8" stroke="#b88e63" stroke-width="2"/><circle cx="75" cy="70" r="12" fill="#d37355"/><path d="m75 57 2-8m0 5c8-6 12 0 6 4Z" stroke="#587b58" stroke-width="3" fill="#587b58"/><ellipse cx="104" cy="86" rx="8" ry="10" fill="#8c799c"/><path d="m103 75 2-6" stroke="#587b58" stroke-width="2"/><path d="M185 63c-7 0-4 9-9 13-5 5-3 16 9 16s14-9 9-15c-6-5-2-14-9-14Z" fill="#9eac64"/><path d="m185 64 1-7" stroke="#607c52" stroke-width="3"/><path d="m212 60 4 7 7 1-6 6 2 8-8-4-7 4 1-8-5-5 8-2Z" fill="#d8aa51"/><path d="M49 37c1-10 10-14 15-10-7 3-7 11-15 10ZM222 37c-2-10-11-12-15-8 8 2 8 10 15 8Z" fill="#648564"/><circle cx="143" cy="23" r="3" fill="#e7b75f"/><circle cx="25" cy="51" r="2" fill="#e7b75f"/></svg>`;
}

/**
 * mountSecureLanSetup(root, { getStatus, provision, exportPublicTrust, remove, onClose })
 * getStatus() -> Promise<SecureControllerStatus>
 * provision({replaceRoot:false|true}) -> Promise<SecureControllerStatus>
 * remove({mode:'disable'|'remove'}) -> Promise<SecureControllerStatus>
 * exportPublicTrust({format:'pem'|'mobileconfig'}) -> Promise<PublicTrustExport>
 * onClose({mode:'touch'|'close'}) -> void
 * A callback may reject {code:'CANCELLED'}; all other failures display fixed safe copy.
 * Closing/disposal ignores pending completions; it cannot undo a started host operation.
 */
export function mountSecureLanSetup(root, { getStatus, provision, exportPublicTrust, remove, onClose } = {}) {
  if (!root || !root.ownerDocument || ![getStatus, provision, exportPublicTrust, remove, onClose].every((fn) => typeof fn === 'function')) throw new TypeError('Secure setup requires a root and safe host callbacks.');
  mounted.get(root)?.dispose();
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const section = element(doc, 'section', 'go6-setup');
  section.setAttribute('aria-label', 'Trusted local access setup');
  let disposed = false;
  let epoch = 0;
  let busy = false;
  let status = DEFAULT_STATUS;
  let notice = '';
  let pendingConfirmation = null;
  let downloadURL = null;

  const header = element(doc, 'header', 'go6-header');
  const brand = element(doc, 'div', 'go6-brand');
  const logo = element(doc, 'span', 'go6-leaf', '✦');
  logo.setAttribute('aria-hidden', 'true');
  const identity = element(doc, 'div');
  identity.append(element(doc, 'p', 'go6-eyebrow', 'Sofa Arcade / Gravity Orchard'), element(doc, 'p', 'go6-brand-title', 'Trusted local access'));
  brand.append(logo, identity);
  const close = button('Close setup', 'go6-icon-close', () => closeView('close'));
  close.setAttribute('aria-label', 'Close setup');
  close.textContent = '×';
  header.append(brand, close);
  const content = element(doc, 'div', 'go6-layout');
  const main = element(doc, 'div', 'go6-main');
  const hero = element(doc, 'div', 'go6-hero');
  const badge = element(doc, 'p', 'go6-badge');
  const heading = element(doc, 'h1');
  const description = element(doc, 'p', 'go6-description');
  hero.append(badge, heading, description);
  const diagram = element(doc, 'div', 'go6-diagram');
  diagram.setAttribute('aria-label', 'One Mac and TV, with separate trust setup on Jon’s and Lydia’s phones');
  const mac = element(doc, 'div', 'go6-mac');
  const screen = element(doc, 'div', 'go6-mac-screen');
  screen.innerHTML = orchardGraphic(); // Static authored geometry only, never callback content.
  screen.append(element(doc, 'span', 'go6-screen-label', 'Your shared garden'));
  mac.append(screen, element(doc, 'div', 'go6-mac-stand'));
  const hostLabel = element(doc, 'p', 'go6-host-label');
  mac.append(hostLabel);
  const phones = element(doc, 'div', 'go6-phones');
  for (const [name, tone] of [['Jon', 'jon'], ['Lydia', 'lydia']]) {
    const phone = element(doc, 'div', `go6-phone ${tone}`);
    phone.append(element(doc, 'span', 'go6-phone-speaker'));
    const ring = element(doc, 'span', 'go6-phone-ring', '↗'); ring.setAttribute('aria-hidden', 'true');
    phone.append(ring, element(doc, 'strong', '', `${name}’s phone`), element(doc, 'span', 'go6-phone-state', 'Trust not checked'));
    phones.append(phone);
  }
  diagram.append(mac, element(doc, 'div', 'go6-connection-lines'), phones);
  const phoneNote = element(doc, 'p', 'go6-diagram-note', 'Host readiness does not confirm phone trust, a secure context, or motion readings. Check each phone separately.');
  const steps = element(doc, 'ol', 'go6-steps');
  const stepParts = [
    ['Prepare this Mac', 'Create a unique local certificate. No trust settings change automatically.'],
    ['Trust each phone', 'Transfer only the public certificate. Compare its fingerprint before installing.'],
    ['Join & check motion', 'Open the secure address on each phone, then run the motion check.'],
  ];
  for (let i = 0; i < stepParts.length; i++) {
    const li = element(doc, 'li');
    li.append(element(doc, 'span', 'go6-step-number', String(i + 1)));
    const copy = element(doc, 'div'); copy.append(element(doc, 'h2', '', stepParts[i][0]), element(doc, 'p', '', stepParts[i][1]));
    li.append(copy); steps.append(li);
  }
  main.append(hero, diagram, phoneNote, steps);
  const aside = element(doc, 'aside', 'go6-controls');
  const actions = element(doc, 'div', 'go6-action-card');
  actions.append(element(doc, 'p', 'go6-eyebrow', 'This installation'));
  const actionTitle = element(doc, 'h2', '', 'Choose how to play');
  const actionDescription = element(doc, 'p', 'go6-small', 'Touch controls work now. Set up trust once to try comfortable phone tilt.');
  const prepare = button('Set up trusted access', 'go6-button go6-primary', () => operate(() => provision({ replaceRoot: false }), 'Trusted access updated. Check each phone before enabling tilt.'));
  prepare.dataset.action = 'provision';
  const touch = button('Play with touch for now', 'go6-button go6-secondary', () => closeView('touch'));
  touch.dataset.action = 'touch';
  const alert = element(doc, 'p', 'go6-notice'); alert.setAttribute('role', 'status'); alert.setAttribute('aria-live', 'polite');
  const certificate = element(doc, 'div', 'go6-certificate');
  certificate.append(element(doc, 'h3', '', 'Public certificate fingerprint'), element(doc, 'p', 'go6-small', 'Compare this SHA-256 fingerprint with the public certificate transferred from this Mac.'));
  const fingerprint = element(doc, 'code', 'go6-fingerprint'); fingerprint.dataset.testid = 'fingerprint';
  const validity = element(doc, 'p', 'go6-validity');
  certificate.append(fingerprint, validity);
  const exports = element(doc, 'div', 'go6-export-actions');
  const appleExport = button('Export for iPhone', 'go6-button go6-outline', () => exportTrust('mobileconfig'));
  const androidExport = button('Export certificate', 'go6-button go6-outline', () => exportTrust('pem'));
  appleExport.dataset.action = 'export-apple'; androidExport.dataset.action = 'export-pem';
  exports.append(appleExport, androidExport);
  const joins = element(doc, 'div', 'go6-join');
  actions.append(actionTitle, actionDescription, prepare, touch, alert, certificate, exports, joins);
  const instructions = element(doc, 'div', 'go6-guide');
  instructions.append(element(doc, 'h2', '', 'A quick guide for each phone'));
  instructions.append(guide('iPhone / iPad', [
    'Export the iPhone profile and transfer it from this Mac using a method you trust, such as AirDrop or a cable.',
    'Open the profile on the phone. In Settings → General → VPN & Device Management, inspect and install the Sofa Arcade certificate profile.',
    'Then open Settings → General → About → Certificate Trust Settings and explicitly enable full trust for this installation’s root.',
    'Open the HTTPS address in Safari. Stop if there is a certificate warning; check the fingerprint and host status. Run the motion check and allow access when asked.',
  ], 'https://support.apple.com/en-us/102390', 'Apple’s trust instructions'));
  instructions.append(guide('Android / Chrome', [
    'Export the public certificate and transfer it from this Mac. Compare its fingerprint before adding it to the phone.',
    'In Settings, search for “Install a certificate” or “Encryption & credentials”. Choose CA certificate for local website trust. Menu names and availability vary by device; do not change Wi-Fi validation settings.',
    'Review the phone’s trust warning and install only this installation’s certificate. Managed phones may disallow user certificates.',
    'Open the HTTPS address in Chrome, without bypassing warnings, and run the motion check. Browser support must be checked on the actual phone.',
  ], 'https://support.google.com/pixelphone/answer/2844832?hl=en', 'Google’s certificate settings guide'));
  const removalGuide = guide('Trust scope & removal', [
    'A trusted root can authenticate certificates signed by this Mac’s installation key. Treat it as a real trust decision, not a permission just for one game. Keep the Mac and its private app data secure.',
    'Turning trusted access off stops HTTPS and keeps the installation material. Removing it deletes this installation’s local material; neither action removes trust from a phone.',
    'On iPhone/iPad, remove this installation’s Sofa Arcade profile in Settings → General → VPN & Device Management. On Android, find this installation under trusted/user credentials and remove only that certificate.',
    'After replacing the installation root, remove the old profile from both phones, transfer the new public certificate, verify its fingerprint, and set up trust again.',
  ]);
  const management = element(doc, 'div', 'go6-manage');
  const disable = button('Turn trusted access off', 'go6-text-button', () => operate(() => remove({ mode: 'disable' }), 'Trusted access is off. Touch play is still available.'));
  const removeButton = button('Remove this installation’s certificates', 'go6-text-button go6-danger', () => showConfirmation('remove'));
  const replaceButton = button('Replace the installation root…', 'go6-text-button go6-danger', () => showConfirmation('replace'));
  management.append(disable, removeButton, replaceButton);
  removalGuide.append(management);
  instructions.append(removalGuide);
  aside.append(actions, instructions);
  content.append(main, aside);
  const footer = element(doc, 'footer', 'go6-footer');
  footer.append(element(doc, 'span', '', 'One local game · Two phones · Touch always available'));
  const refreshButton = button('Refresh host status', 'go6-text-button', () => refresh());
  footer.append(refreshButton);
  const confirmation = element(doc, 'div', 'go6-confirmation'); confirmation.hidden = true;
  const confirmationHeading = element(doc, 'h2');
  const confirmationCopy = element(doc, 'p');
  const confirmationActions = element(doc, 'div', 'go6-confirmation-actions');
  const cancel = button('Keep current setup', 'go6-button go6-secondary', hideConfirmation);
  const confirm = button('Remove certificates', 'go6-button go6-danger-button', async () => {
    const choice = pendingConfirmation; hideConfirmation();
    if (choice === 'remove') await operate(() => remove({ mode: 'remove' }), 'Local certificates removed. Remove this installation’s profile from each phone separately.');
    if (choice === 'replace') await operate(() => provision({ replaceRoot: true }), 'New root created. Remove old phone trust, compare the new fingerprint, and set up both phones again.');
  });
  confirmationActions.append(cancel, confirm); confirmation.append(confirmationHeading, confirmationCopy, confirmationActions);
  section.append(header, content, confirmation, footer);
  root.replaceChildren(section);

  function button(label, className, callback) {
    const btn = element(doc, 'button', className, label); btn.type = 'button'; btn.addEventListener('click', callback); return btn;
  }
  function guide(title, lines, href, label) {
    const details = element(doc, 'details', 'go6-details');
    details.append(element(doc, 'summary', '', title));
    const ol = element(doc, 'ol'); for (const line of lines) ol.append(element(doc, 'li', '', line)); details.append(ol);
    if (href) { const a = element(doc, 'a', 'go6-reference', label); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; details.append(a); }
    return details;
  }
  function closeView(mode) {
    if (disposed) return;
    epoch++; busy = false;
    try { onClose({ mode }); } catch { notice = 'Could not close setup. You can retry.'; render(); }
  }
  function render() {
    if (disposed) return;
    const copy = COPY[status.status];
    section.dataset.state = status.status; section.setAttribute('aria-busy', String(busy));
    badge.textContent = copy[0]; heading.textContent = copy[1]; description.textContent = copy[2];
    prepare.textContent = busy ? 'Working on this Mac…' : copy[3];
    hostLabel.textContent = status.status === 'ready' ? 'Mac / TV · HTTPS ready' : 'Mac / TV · Setup required';
    if (status.status === 'disabled') hostLabel.textContent = 'Mac / TV · HTTPS off';
    steps.children[0].classList.toggle('is-complete', status.status === 'ready');
    alert.textContent = notice; alert.hidden = !notice;
    const hasCertificate = Boolean(status.certificateFingerprint);
    certificate.hidden = !hasCertificate;
    exports.hidden = !hasCertificate;
    fingerprint.textContent = status.certificateFingerprint || '';
    validity.textContent = status.validUntil ? `Host certificate valid until ${new Date(status.validUntil).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} (UTC).` : '';
    for (const btn of [prepare, appleExport, androidExport, disable, removeButton, replaceButton, refreshButton]) btn.disabled = busy;
    disable.hidden = !status.enabled;
    removeButton.hidden = !hasCertificate && status.status === 'needs-setup';
    joins.replaceChildren();
    if (status.status === 'ready') {
      joins.append(element(doc, 'h3', '', 'Open on each phone'));
      for (const origin of status.controllerOrigins) {
        const link = element(doc, 'a', 'go6-origin', origin); link.href = `${origin}/`; link.target = '_blank'; link.rel = 'noopener noreferrer'; joins.append(link);
      }
      const diagnostic = element(doc, 'a', 'go6-diagnostic-link', 'Open the phone motion check ↗');
      diagnostic.href = `${status.controllerOrigins[0]}/secure-lan/diagnostic`; diagnostic.target = '_blank'; diagnostic.rel = 'noopener noreferrer'; joins.append(diagnostic);
      joins.append(element(doc, 'p', 'go6-small', 'Send this address to the phone. A successful check here on the Mac does not test either phone.'));
    }
  }
  function showConfirmation(choice) {
    pendingConfirmation = choice;
    confirmation.hidden = false;
    confirmation.setAttribute('role', 'dialog'); confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', choice === 'remove' ? 'Remove local certificates?' : 'Replace installation root?');
    confirmationHeading.textContent = choice === 'remove' ? 'Remove local certificates?' : 'Replace this installation’s root?';
    confirmationCopy.textContent = choice === 'remove'
      ? 'This stops trusted access and removes only this installation’s certificate material. Touch play stays available. You must remove its profile from each phone yourself.'
      : 'Both phones will need trust setup again. Existing certificates stop working. Use this only when the root itself needs replacement; normal renewal keeps your current root.';
    confirm.textContent = choice === 'remove' ? 'Remove certificates' : 'Replace root & set up again';
    content.inert = true; header.inert = true; footer.inert = true;
    cancel.focus();
  }
  function hideConfirmation() {
    const choice = pendingConfirmation;
    pendingConfirmation = null; confirmation.hidden = true;
    content.inert = false; header.inert = false; footer.inert = false;
    (choice === 'replace' ? replaceButton : removeButton).focus();
  }
  function onKey(event) {
    if (!pendingConfirmation) return;
    if (event.key === 'Escape') { event.preventDefault(); hideConfirmation(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      (doc.activeElement === cancel ? confirm : cancel).focus();
    }
  }
  section.addEventListener('keydown', onKey);
  async function operate(operation, success) {
    if (disposed || busy) return;
    const current = ++epoch; busy = true; notice = ''; render();
    try {
      const result = await operation();
      if (disposed || current !== epoch) return;
      status = safeStatus(result); notice = success;
    } catch (error) {
      if (disposed || current !== epoch) return;
      notice = error?.code === 'CANCELLED' ? 'Cancelled. Your current setup is unchanged.' : 'This operation could not finish. Retry, or continue with touch. No automatic trust changes were made.';
    } finally { if (!disposed && current === epoch) { busy = false; render(); } }
  }
  async function refresh() {
    if (disposed || busy) return;
    const current = ++epoch;
    try {
      const result = await getStatus();
      if (disposed || current !== epoch) return;
      status = safeStatus(result); notice = ''; render();
    } catch {
      if (disposed || current !== epoch) return;
      status = { enabled: false, status: 'failed', controllerOrigins: [], requiresPhoneTrust: true };
      notice = 'Host status is unavailable. Retry the check, or continue with touch.'; render();
    }
  }
  async function exportTrust(format) {
    if (disposed || busy) return;
    const current = ++epoch; busy = true; notice = ''; render();
    try {
      const exported = await exportPublicTrust({ format });
      if (disposed || current !== epoch) return;
      validatePublicExport(exported, format, status.certificateFingerprint, view);
      if (downloadURL) view.URL.revokeObjectURL(downloadURL);
      downloadURL = view.URL.createObjectURL(new Blob([exported.contents], { type: exported.mediaType }));
      const a = element(doc, 'a'); a.href = downloadURL; a.download = exported.filename; section.append(a); a.click(); a.remove();
      notice = 'Public certificate exported. Transfer it to each phone and compare the fingerprint before trusting it.';
    } catch (error) {
      if (disposed || current !== epoch) return;
      notice = error?.code === 'CANCELLED' ? 'Export cancelled. No trust settings changed.' : 'The public certificate could not be exported. Retry from this Mac. No trust settings changed.';
    } finally { if (!disposed && current === epoch) { busy = false; render(); } }
  }
  function dispose() {
    if (disposed) return;
    disposed = true; epoch++;
    section.removeEventListener('keydown', onKey);
    if (downloadURL) view.URL.revokeObjectURL(downloadURL);
    section.remove();
    if (mounted.get(root) === api) mounted.delete(root);
  }
  const api = Object.freeze({ refresh, dispose }); mounted.set(root, api);
  render(); void refresh();
  return api;
}

function validatePublicExport(exported, format, expectedFingerprint, view) {
  if (!exported || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.(?:pem|crt|mobileconfig)$/.test(exported.filename) || typeof exported.contents !== 'string' || exported.contents.length > 48_000 || !FINGERPRINT.test(exported.certificateFingerprint) || exported.certificateFingerprint.toUpperCase() !== expectedFingerprint) throw new Error('INVALID_EXPORT');
  if (/PRIVATE KEY|<!ENTITY|file:\/\/|BEGIN (?:RSA |EC )?PRIVATE/i.test(exported.contents)) throw new Error('INVALID_EXPORT');
  if (format === 'pem') {
    if (!['application/x-pem-file', 'application/x-x509-ca-cert', 'application/pem-certificate-chain'].includes(exported.mediaType) || !/\.(?:pem|crt)$/.test(exported.filename) || !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----\r?\n?$/.test(exported.contents)) throw new Error('INVALID_EXPORT');
  } else {
    if (exported.mediaType !== 'application/x-apple-aspen-config' || !exported.filename.endsWith('.mobileconfig')) throw new Error('INVALID_EXPORT');
    const xml = new view.DOMParser().parseFromString(exported.contents, 'application/xml');
    if (xml.querySelector('parsererror') || xml.documentElement.nodeName !== 'plist') throw new Error('INVALID_EXPORT');
    const types = [...xml.querySelectorAll('key')].filter((k) => k.textContent === 'PayloadType').map((k) => k.nextElementSibling?.textContent);
    if (types.length !== 2 || !types.includes('Configuration') || !types.includes('com.apple.security.root') || xml.querySelectorAll('data').length !== 1) throw new Error('INVALID_EXPORT');
    const allowedKeys = new Set(['PayloadContent', 'PayloadType', 'PayloadVersion', 'PayloadIdentifier', 'PayloadUUID', 'PayloadDisplayName', 'PayloadDescription', 'PayloadOrganization', 'PayloadRemovalDisallowed', 'PayloadCertificateFileName']);
    if ([...xml.querySelectorAll('key')].some((k) => !allowedKeys.has(k.textContent))) throw new Error('INVALID_EXPORT');
  }
}
