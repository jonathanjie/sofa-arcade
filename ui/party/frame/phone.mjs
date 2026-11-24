import { getGame } from '/games/catalog.mjs?v=5';
import { createLookArt, LOOKS } from '../looks.mjs';
import { partyGameView } from '../games/registry.mjs';
import { cleanCode, newRequestId, partyRequest, partySession } from '../client.mjs';

const STATUS = {
  connecting: 'Connecting…', reconnecting: 'Reconnecting…', 'seat-lost': 'Your seat has closed.',
  replaced: 'Your controller is open in another tab.',
};

function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

export function mountPhoneJoin(root, initialCode, onJoin) {
  root.innerHTML = `<main class="party party-phone">
    <header class="party-bar"><a class="party-back" href="/?shelf=1">‹ Game shelf</a></header>
    <section class="party-phone-card">
      <h1>Join the party</h1>
      <p class="party-error" role="alert" hidden></p>
      <form data-code-form>
        <label for="party-code">Room code</label>
        <input id="party-code" name="code" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" required>
        <button class="party-primary" type="submit">Find party</button>
      </form>
      <form data-join-form hidden>
        <label for="party-name">Your name</label>
        <input id="party-name" name="name" maxlength="24" autocomplete="nickname" required>
        <fieldset><legend>Pick your look</legend><div class="party-looks"></div></fieldset>
        <button class="party-primary" type="submit">Ready</button>
        <button type="button" class="party-secondary" data-different>Change room code</button>
      </form>
    </section>
  </main>`;
  const find = selector => root.querySelector(selector);
  const document = root.ownerDocument;
  const art = createLookArt(document);
  const error = find('.party-error');
  const codeForm = find('[data-code-form]');
  const joinForm = find('[data-join-form]');
  const codeInput = find('#party-code');
  const nameInput = find('#party-name');
  const joinButton = joinForm.querySelector('button');
  const title = find('h1');
  const choices = find('.party-looks');
  let code;
  let receipt;
  let busy = false;

  const radios = LOOKS.map((look, index) => {
    const label = document.createElement('label');
    label.className = 'party-look';
    label.style.setProperty('--look', look.colour);
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'look';
    input.value = index;
    input.setAttribute('aria-label', look.name);
    const badge = document.createElement('canvas');
    badge.width = badge.height = 28;
    badge.setAttribute('aria-hidden', 'true');
    art.badge(badge.getContext('2d'), index, 0, 0, 4);
    label.append(input, badge);
    choices.append(label);
    return input;
  });

  function showError(message) {
    setText(error, message);
    error.hidden = !message;
  }

  function updateLooks(occupied) {
    for (const [look, radio] of radios.entries()) radio.disabled = occupied.includes(look);
    if (!radios.some(radio => radio.checked && !radio.disabled)) {
      const next = radios.find(radio => !radio.disabled);
      if (next) next.checked = true;
    }
    const full = occupied.length >= LOOKS.length;
    joinButton.disabled = full;
    if (full) showError('This party is full.');
  }

  async function lookup(value) {
    const requested = cleanCode(value);
    if (!requested) { showError('Enter the six-character room code.'); return; }
    if (busy) return;
    busy = true;
    const button = codeForm.querySelector('button');
    button.disabled = true;
    showError('');
    try {
      const room = await partyRequest('/' + requested);
      code = requested;
      updateLooks(room.occupiedLooks);
      history.replaceState({}, '', `/?party=join&code=${code}`);
      setText(title, getGame(room.gameId)?.title ?? 'Join the party');
      codeForm.hidden = true;
      joinForm.hidden = false;
      nameInput.focus();
    } catch (failure) {
      showError(failure.status ? failure.message : 'Could not reach the host. Try again.');
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  codeForm.addEventListener('submit', event => { event.preventDefault(); void lookup(codeInput.value); });
  joinForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const name = nameInput.value.normalize('NFC').replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '').trim();
    const selected = radios.find(radio => radio.checked && !radio.disabled);
    if (!name || [...name].length > 12 || !selected) {
      showError('Enter a name up to 12 characters and choose a look.');
      return;
    }
    const look = Number(selected.value);
    if (!receipt || receipt.name !== name || receipt.look !== look) receipt = { name, look, requestId: newRequestId() };
    busy = true;
    joinButton.disabled = true;
    showError('');
    try {
      const credential = await partyRequest(`/${code}/join`, receipt);
      const session = { ...credential, autoReady: true };
      partySession('player', code, session);
      onJoin(session);
    } catch (failure) {
      showError(failure.status ? failure.message : 'Could not reach the host. Tap Ready to retry.');
      if (failure.code === 'seat_lost') receipt = null;
      if (['look_taken', 'party_full', 'seat_lost'].includes(failure.code)) {
        const room = await partyRequest('/' + code).catch(() => null);
        if (room) updateLooks(room.occupiedLooks);
      }
    } finally {
      busy = false;
      joinButton.disabled = radios.every(radio => radio.disabled);
    }
  });
  find('[data-different]').addEventListener('click', () => {
    if (busy) return;
    receipt = null;
    code = null;
    history.replaceState({}, '', '/?party=join');
    codeForm.hidden = false;
    joinForm.hidden = true;
    showError('');
    setText(title, 'Join the party');
    codeInput.focus();
  });
  if (initialCode) {
    codeInput.value = initialCode;
    void lookup(initialCode);
  } else codeInput.focus();
}

function screenWakeLock(document) {
  const api = document.defaultView.navigator.wakeLock;
  let playing = false;
  let pending = false;
  let lock;
  const wanted = () => playing && !document.hidden;

  async function update() {
    if (!wanted()) {
      const held = lock;
      lock = undefined;
      if (held && !held.released) await held.release().catch(() => {});
      return;
    }
    if (!api || pending || lock) return;
    pending = true;
    try {
      const acquired = await api.request('screen');
      if (!wanted()) await acquired.release();
      else if (!acquired.released) {
        lock = acquired;
        acquired.addEventListener('release', () => {
          if (lock === acquired) lock = undefined;
        }, { once: true });
      }
    } catch { /* Play can continue when the device declines a wake lock. */ }
    finally { pending = false; }
  }

  const visibilityChanged = () => { void update(); };
  document.addEventListener('visibilitychange', visibilityChanged);
  return {
    setPlaying(value) {
      if (playing === value) return;
      playing = value;
      void update();
    },
    dispose() {
      playing = false;
      document.removeEventListener('visibilitychange', visibilityChanged);
      void update();
    },
  };
}

export function mountPartyPhone(root, { credential, actions }) {
  root.innerHTML = `<main class="party party-phone">
    <header class="party-bar"><a class="party-back" href="/?shelf=1">‹ Game shelf</a><span data-room></span></header>
    <section class="party-phone-card party-handset">
      <div class="party-phone-identity"><canvas width="64" height="64" aria-hidden="true"></canvas>
        <div><h1 data-game>Party</h1><p data-you></p></div>
      </div>
      <p data-status role="status"></p>
      <p class="party-error" role="alert" hidden></p>
      <button class="party-secondary" type="button" data-ready hidden></button>
      <div data-controls hidden></div>
      <a class="party-secondary" data-rejoin hidden>Choose a seat</a>
    </section>
  </main>`;
  const find = selector => root.querySelector(selector);
  const statusLabel = find('[data-status]');
  const errorLabel = find('.party-error');
  const readyButton = find('[data-ready]');
  const controls = find('[data-controls]');
  const art = createLookArt(root.ownerDocument);
  const phone = find('.party-phone');
  const wakeLock = screenWakeLock(root.ownerDocument);
  find('[data-room]').textContent = credential.code;
  let connection = 'connecting';
  let previous;
  let renderer;
  let autoReady = credential.autoReady ? 'pending' : null;

  function showError(message) {
    setText(errorLabel, message);
    errorLabel.hidden = !message;
  }

  function paint() {
    const active = connection === 'connected' && previous?.phase === 'playing' && !previous.waiting;
    phone.toggleAttribute('data-playing', active);
    wakeLock.setPlaying(active);
    if (connection !== 'connected' || !previous) {
      setText(statusLabel, STATUS[connection] ?? 'Connecting…');
      readyButton.hidden = true;
      controls.hidden = true;
      renderer?.update(previous?.state, false);
      return;
    }
    const view = previous;
    const lobby = view.phase === 'lobby' || view.phase === 'results';
    const practice = view.waiting && renderer?.practiceWhileWaiting === true;
    const roundName = partyGameView(view.gameId)?.roundName ?? 'round';
    const status = view.waiting ? `You’re in the next ${roundName}`
      : view.phase === 'countdown' ? `Get ready · ${Math.ceil(view.ms / 1000)}`
      : active ? 'Go!'
      : view.phase === 'results' ? (view.place ? `Place #${view.place}` : 'Round complete')
      : view.self.ready ? 'Ready for the TV' : 'Tap Ready when you’re set';
    setText(statusLabel, status);
    readyButton.hidden = !lobby || Boolean(autoReady);
    setText(readyButton, view.self.ready ? 'Not ready' : 'Ready');
    controls.hidden = !practice && (view.waiting || (!active && view.phase !== 'countdown'));
    renderer?.update(view.state, active, { practice, round: view.round });
  }

  readyButton.addEventListener('click', () => {
    if (previous) actions.send({ type: 'ready', value: !previous.self.ready });
  });
  find('[data-rejoin]').href = `/?party=join&code=${credential.code}`;

  return {
    update(view) {
      if (!previous || previous.self.look !== view.self.look) {
        art.portrait(find('canvas'), view.self.look);
        phone.style.setProperty('--phone-look', LOOKS[view.self.look].colour);
      }
      if (!previous || previous.gameId !== view.gameId) {
        renderer?.dispose();
        renderer = partyGameView(view.gameId).mountPhone(controls, { input: actions.input, serverNow: actions.serverNow });
        setText(find('[data-game]'), getGame(view.gameId)?.title ?? 'Party');
      }
      setText(find('[data-you]'), view.self.name);
      if (autoReady && view.self.ready) {
        autoReady = null;
        partySession('player', credential.code, { ...credential, autoReady: false });
      } else if (autoReady === 'pending' && actions.send({ type: 'ready', value: true })) autoReady = 'sent';
      previous = view;
      paint();
    },
    status(value) {
      connection = value;
      if (value === 'reconnecting' && autoReady === 'sent') autoReady = 'pending';
      if (value === 'seat-lost') {
        partySession('player', credential.code, null);
        find('[data-rejoin]').hidden = false;
        controls.hidden = true;
      }
      paint();
    },
    error: showError,
    dispose() {
      wakeLock.dispose();
      renderer?.dispose();
    },
  };
}
