import { GAME_CATALOG } from '/games/catalog.mjs?v=5';
import { cleanCode, connectParty, newRequestId, partyRequest, partySession } from './client.mjs';
import { mountPartyTv } from './frame/tv.mjs';
import { mountPartyPhone, mountPhoneJoin } from './frame/phone.mjs';

export function mountParty(root, { params, joinOrigin, getSecureOrigin, sound, motionPreference }) {
  const role = params.get('party') === 'host' ? 'host' : 'player';
  const code = cleanCode(params.get('code') ?? '');
  document.title = role === 'host' ? 'Party TV — Sofa Arcade' : 'Party controller — Sofa Arcade';
  sound.setScore('sofa-kingdoms');
  sound.setContext({ role, view: role === 'host' ? 'lobby' : 'join' });

  function connect(credential) {
    let client;
    const actions = {
      send: command => client?.send(command),
      input: input => client?.input(input),
    };
    const joinUrl = new URL(`/?party=join&code=${credential.code}`, joinOrigin).href;
    const presentation = role === 'host'
      ? mountPartyTv(root, { actions, sound, motionPreference, joinUrl, code: credential.code })
      : mountPartyPhone(root, { credential, actions });
    if (role === 'host' && getSecureOrigin && new URL(joinUrl).protocol === 'http:') {
      void getSecureOrigin().then(origin => {
        if (origin) presentation.setSecureJoinUrl(new URL(`/?party=join&code=${credential.code}`, origin).href);
      }).catch(() => {});
    }
    const onStatus = value => {
      if (value === 'seat-lost' && role === 'host') partySession('host', credential.code, null);
      presentation.status(value);
    };
    client = connectParty({ credential, onView: presentation.update, onStatus, onError: presentation.error });
    // A bfcache restore reconnects from the same private session.
    window.addEventListener('pagehide', () => { client.dispose(); presentation.dispose(); }, { once: true });
    window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); }, { once: true });
  }

  const credential = code && partySession(role, code);
  if (credential?.token) { connect(credential); return; }
  if (role === 'player') { mountPhoneJoin(root, code, connect); return; }

  const requestedGame = params.get('game');
  const game = GAME_CATALOG.find(entry => entry.category === 'party' && entry.id === requestedGame);
  if (!game) {
    root.innerHTML = `<main class="party party-phone"><section class="party-phone-card">
      <a class="party-back" href="/?shelf=1">‹ Game shelf</a><h1>Choose a party game</h1></section></main>`;
    return;
  }
  root.innerHTML = `<main class="party party-phone"><section class="party-phone-card">
    <a class="party-back" href="/?shelf=1">‹ Game shelf</a><h1>Opening the party…</h1>
    <p class="party-error" role="alert" hidden></p>
    <button type="button" class="party-primary" hidden>Try again</button></section></main>`;
  const retry = root.querySelector('button');
  const error = root.querySelector('.party-error');
  const requestId = newRequestId();
  async function create() {
    retry.hidden = true;
    error.hidden = true;
    try {
      const session = await partyRequest('', { gameId: game.id, requestId });
      partySession('host', session.code, session);
      history.replaceState({}, '', `/?party=host&code=${session.code}`);
      connect(session);
    } catch (failure) {
      error.textContent = failure.status ? failure.message : 'Could not open the party. Try again.';
      error.hidden = false;
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', create);
  void create();
}
