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
  'needs-setup': ['One-time setup', 'Let your phones use tilt.', 'Phones only share their tilt sensor with a Mac they recognise. Set up this Mac once, then add it to each phone.', 'Set up tilt'],
  disabled: ['Tilt is off', 'Touch play is ready when you are.', 'Your setup is saved on this Mac. Turn tilt on again when you want it.', 'Turn tilt on'],
  ready: ['Mac ready', 'Your Mac is ready. Now, each phone.', 'Now add this Mac to each phone, then test tilt on that phone.', 'Refresh setup'],
  'certificate-expired': ['Setup expired', 'Let’s refresh the tilt setup.', 'You can keep playing with touch. Your phones stay set up after a refresh.', 'Refresh setup'],
  'address-mismatch': ['Wi-Fi changed', 'Your Wi-Fi gave this Mac a new address.', 'Refresh the setup, then use the new phone link. Your phones stay set up.', 'Refresh setup'],
  failed: ['Setup needs attention', 'We couldn’t set up tilt.', 'Check that this Mac is on Wi-Fi, then try again. Touch controls still work.', 'Retry setup'],
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
  section.setAttribute('aria-label', 'Tilt controls setup');
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
  identity.append(element(doc, 'p', 'go6-eyebrow', 'Sofa Arcade / Gravity Orchard'), element(doc, 'p', 'go6-brand-title', 'Tilt controls'));
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
  diagram.setAttribute('aria-label', 'One Mac and TV, with tilt set up on Jon’s and Lydia’s phones');
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
    phone.append(ring, element(doc, 'strong', '', `${name}’s phone`), element(doc, 'span', 'go6-phone-state', 'Not set up yet'));
    phones.append(phone);
  }
  diagram.append(mac, element(doc, 'div', 'go6-connection-lines'), phones);
  const phoneNote = element(doc, 'p', 'go6-diagram-note', 'This Mac being ready does not mean each phone is ready. Test tilt on each phone.');
  const steps = element(doc, 'ol', 'go6-steps');
  const stepParts = [
    ['Prepare this Mac', 'Create a safety key that only this Mac has. Nothing on your phones changes yet.'],
    ['Add this Mac to each phone', 'Send the Sofa Arcade file to each phone. Check that its code matches before you add it.'],
    ['Test tilt', 'Open the phone link on each phone, then try the tilt test.'],
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
  actions.append(element(doc, 'p', 'go6-eyebrow', 'This Mac'));
  const actionTitle = element(doc, 'h2', '', 'Choose how to play');
  const actionDescription = element(doc, 'p', 'go6-small', 'Touch controls work now. Set up once to try tilt.');
  const prepare = button('Set up tilt', 'go6-button go6-primary', () => operate(() => provision({ replaceRoot: false }), 'Setup updated. Test each phone before you use tilt.'));
  prepare.dataset.action = 'provision';
  const touch = button('Play with touch for now', 'go6-button go6-secondary', () => closeView('touch'));
  touch.dataset.action = 'touch';
  const alert = element(doc, 'p', 'go6-notice'); alert.setAttribute('role', 'status'); alert.setAttribute('aria-live', 'polite');
  const certificate = element(doc, 'div', 'go6-certificate');
  certificate.append(element(doc, 'h3', '', 'Matching code'), element(doc, 'p', 'go6-small', 'On each phone, check that the Sofa Arcade file shows this same code.'));
  const fingerprint = element(doc, 'code', 'go6-fingerprint'); fingerprint.dataset.testid = 'fingerprint';
  const validity = element(doc, 'p', 'go6-validity');
  certificate.append(fingerprint, validity);
  const exports = element(doc, 'div', 'go6-export-actions');
  const appleExport = button('Save file for iPhone', 'go6-button go6-outline', () => exportTrust('mobileconfig'));
  const androidExport = button('Save file for Android', 'go6-button go6-outline', () => exportTrust('pem'));
  appleExport.dataset.action = 'export-apple'; androidExport.dataset.action = 'export-pem';
  exports.append(appleExport, androidExport);
  const joins = element(doc, 'div', 'go6-join');
  actions.append(actionTitle, actionDescription, prepare, touch, alert, certificate, exports, joins);
  const instructions = element(doc, 'div', 'go6-guide');
  instructions.append(element(doc, 'h2', '', 'A quick guide for each phone'));
  instructions.append(guide('iPhone / iPad', [
    'Save the iPhone file, then send it to the iPhone with AirDrop or a cable.',
    'Open the file on the iPhone. Then go to Settings → General → VPN & Device Management, tap Sofa Arcade and tap Install.',
    'Go to Settings → General → About → “Certificate Trust Settings” (the iPhone’s own name for this screen) and turn on Sofa Arcade.',
    'Open the phone link in Safari. If Safari shows a warning page, stop and check the setup again. Try the tilt test and tap Allow when asked.',
  ], 'https://support.apple.com/en-us/102390', 'Apple’s help page'));
  instructions.append(guide('Android / Chrome', [
    'Save the Android file and send it to the phone. Check that the code matches before you add it.',
    'In Settings, search for “Install a certificate”. Choose “CA certificate” (Android’s name for this option) and pick the Sofa Arcade file. Menu names differ between phones. Do not change any Wi-Fi settings.',
    'The phone shows a warning. Add only the Sofa Arcade file. Work phones may not allow this.',
    'Open the phone link in Chrome. If Chrome shows a warning page, stop. Try the tilt test on the phone.',
  ], 'https://support.google.com/pixelphone/answer/2844832?hl=en', 'Google’s help page'));
  const removalGuide = guide('What this allows, and how to undo it', [
    'Adding this Mac lets your phone trust websites that this Mac vouches for, not only this game. Only add a Mac you own, and keep it secure.',
    'Turning tilt off keeps the setup on this Mac. Removing the setup deletes it from this Mac. Neither one changes your phones.',
    'To undo it on an iPhone or iPad, remove Sofa Arcade in Settings → General → VPN & Device Management. On Android, search Settings for “User credentials” and remove only Sofa Arcade.',
    'If you start over with a new setup, remove the old Sofa Arcade file from both phones and add the new one.',
  ]);
  const management = element(doc, 'div', 'go6-manage');
  const disable = button('Turn tilt off', 'go6-text-button', () => operate(() => remove({ mode: 'disable' }), 'Tilt is off. Touch controls still work.'));
  const removeButton = button('Remove the setup from this Mac', 'go6-text-button go6-danger', () => showConfirmation('remove'));
  const replaceButton = button('Start over with a new setup…', 'go6-text-button go6-danger', () => showConfirmation('replace'));
  management.append(disable, removeButton, replaceButton);
  removalGuide.append(management);
  instructions.append(removalGuide);
  aside.append(actions, instructions);
  content.append(main, aside);
  const footer = element(doc, 'footer', 'go6-footer');
  footer.append(element(doc, 'span', '', 'One game · Two phones · Touch always works'));
  const refreshButton = button('Check again', 'go6-text-button', () => refresh());
  footer.append(refreshButton);
  const confirmation = element(doc, 'div', 'go6-confirmation'); confirmation.hidden = true;
  const confirmationHeading = element(doc, 'h2');
  const confirmationCopy = element(doc, 'p');
  const confirmationActions = element(doc, 'div', 'go6-confirmation-actions');
  const cancel = button('Keep current setup', 'go6-button go6-secondary', hideConfirmation);
  const confirm = button('Remove setup', 'go6-button go6-danger-button', async () => {
    const choice = pendingConfirmation; hideConfirmation();
    if (choice === 'remove') await operate(() => remove({ mode: 'remove' }), 'Setup removed from this Mac. Remove Sofa Arcade from each phone too.');
    if (choice === 'replace') await operate(() => provision({ replaceRoot: true }), 'New setup created. Remove the old Sofa Arcade file from both phones, then add the new one.');
  });
  confirmationActions.append(cancel, confirm); confirmation.append(confirmationHeading, confirmationCopy, confirmationActions);
  section.append(header, content, confirmation, footer);
  root.replaceChildren(section);

  // Keep touch/setup actions in the first narrow viewport, without duplicating
  // controls or making keyboard/screen-reader order disagree with the layout.
  const narrowLayout = view.matchMedia('(max-width: 780px)');
  function positionActions() {
    if (disposed) return;
    if (narrowLayout.matches) main.insertBefore(actions, diagram);
    else aside.prepend(actions);
  }
  narrowLayout.addEventListener('change', positionActions);
  positionActions();

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
    hostLabel.textContent = status.status === 'ready' ? 'Mac / TV · Ready for tilt' : 'Mac / TV · Not set up';
    if (status.status === 'disabled') hostLabel.textContent = 'Mac / TV · Tilt off';
    steps.children[0].classList.toggle('is-complete', status.status === 'ready');
    alert.textContent = notice; alert.hidden = !notice;
    const hasCertificate = Boolean(status.certificateFingerprint);
    certificate.hidden = !hasCertificate;
    exports.hidden = !hasCertificate;
    fingerprint.textContent = status.certificateFingerprint || '';
    validity.textContent = status.validUntil ? `Tilt setup works until ${new Date(status.validUntil).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}.` : '';
    for (const btn of [prepare, appleExport, androidExport, disable, removeButton, replaceButton, refreshButton]) btn.disabled = busy;
    disable.hidden = !status.enabled;
    removeButton.hidden = !hasCertificate && status.status === 'needs-setup';
    joins.replaceChildren();
    if (status.status === 'ready') {
      joins.append(element(doc, 'h3', '', 'Open on each phone'));
      for (const origin of status.controllerOrigins) {
        const link = element(doc, 'a', 'go6-origin', origin); link.href = `${origin}/`; link.target = '_blank'; link.rel = 'noopener noreferrer'; joins.append(link);
      }
      const diagnostic = element(doc, 'a', 'go6-diagnostic-link', 'Open the tilt test ↗');
      diagnostic.href = `${status.controllerOrigins[0]}/secure-lan/diagnostic`; diagnostic.target = '_blank'; diagnostic.rel = 'noopener noreferrer'; joins.append(diagnostic);
      joins.append(element(doc, 'p', 'go6-small', 'Open this link on each phone. Testing it on the Mac does not test the phones.'));
    }
  }
  function showConfirmation(choice) {
    pendingConfirmation = choice;
    confirmation.hidden = false;
    confirmation.setAttribute('role', 'dialog'); confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', choice === 'remove' ? 'Remove the setup from this Mac?' : 'Start over?');
    confirmationHeading.textContent = choice === 'remove' ? 'Remove the setup from this Mac?' : 'Start over with a new setup?';
    confirmationCopy.textContent = choice === 'remove'
      ? 'This turns tilt off and deletes the setup from this Mac. Touch controls still work. Remove Sofa Arcade from each phone yourself.'
      : 'Both phones will need to be set up again. Use this only if refreshing does not help.';
    confirm.textContent = choice === 'remove' ? 'Remove setup' : 'Yes, start over';
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
      notice = error?.code === 'CANCELLED' ? 'Cancelled. Your current setup is unchanged.' : 'That did not work. Try again, or keep playing with touch. Nothing on your phones changed.';
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
      notice = 'We couldn’t check this Mac. Try again, or keep playing with touch.'; render();
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
      notice = 'File saved. Send it to each phone and check the code before you add it.';
    } catch (error) {
      if (disposed || current !== epoch) return;
      notice = error?.code === 'CANCELLED' ? 'Cancelled. Nothing changed.' : 'The file could not be saved. Try again. Nothing changed.';
    } finally { if (!disposed && current === epoch) { busy = false; render(); } }
  }
  function dispose() {
    if (disposed) return;
    disposed = true; epoch++;
    section.removeEventListener('keydown', onKey);
    narrowLayout.removeEventListener('change', positionActions);
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
