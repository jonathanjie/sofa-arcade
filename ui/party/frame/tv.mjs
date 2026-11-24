import { GAME_CATALOG, getGame } from '/games/catalog.mjs?v=5';
import { createLookArt, LOOKS } from '../looks.mjs';
import { createSoundHooks } from '../kit/animation.mjs';
import { partyGameView } from '../games/registry.mjs';

const FINISH_DISPLAY_MS = 640;
const MOTION_KEY = 'sofa-party-reduced-motion';
const STATUS = {
  connecting: 'Opening room…', reconnecting: 'Reconnecting…',
  'seat-lost': 'This party has closed.', replaced: 'The TV is open in another tab.',
};

function storedMotion(value) {
  try {
    if (value !== undefined) localStorage.setItem(MOTION_KEY, String(value));
    return localStorage.getItem(MOTION_KEY) === 'true';
  } catch { return false; }
}

function clockLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function portrait(document, art, look, scale = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = 16 * scale;
  canvas.height = 16 * scale;
  canvas.setAttribute('aria-hidden', 'true');
  art.portrait(canvas, look);
  return canvas;
}

function lobbyWall(container, art, actions) {
  const document = container.ownerDocument;
  const cards = new Map();
  return players => {
    for (const [id, card] of cards) {
      if (players.some(player => player.id === id)) continue;
      card.node.remove();
      cards.delete(id);
    }
    for (const player of players) {
      let card = cards.get(player.id);
      if (!card) {
        const node = document.createElement('article');
        node.className = 'party-player';
        const mouse = portrait(document, art, player.look);
        const identity = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = player.name;
        const status = document.createElement('small');
        identity.append(name, status);
        const remove = document.createElement('button');
        remove.className = 'party-remove';
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove ${player.name}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => actions.send({ type: 'kick', playerId: player.id }));
        node.style.setProperty('--look', LOOKS[player.look].colour);
        node.append(mouse, identity, remove);
        container.append(node);
        card = { node, status };
        cards.set(player.id, card);
      }
      card.node.dataset.ready = String(player.ready && player.connected);
      setText(card.status, player.connected ? (player.ready ? 'Ready' : 'Choosing') : 'Away · seat held');
    }
  };
}

function showPodium(container, view, art) {
  const document = container.ownerDocument;
  const title = document.createElement('h2');
  title.textContent = 'Podium';
  const podium = document.createElement('div');
  podium.className = 'party-podium';
  const rest = document.createElement('ol');
  rest.className = 'party-ranks';
  const finishers = view.results.map(result => ({
    ...result, ...view.roster.find(player => player.id === result.playerId),
  }));
  if (!finishers.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No finishers this round.';
    podium.append(empty);
  }
  for (const [index, result] of finishers.entries()) {
    const node = document.createElement(index < 3 ? 'article' : 'li');
    const name = document.createElement('strong');
    name.textContent = result.name;
    const score = document.createElement('small');
    score.textContent = `${result.score} pts`;
    const place = document.createElement('span');
    place.className = 'party-place';
    place.textContent = `#${result.place}`;
    node.style.setProperty('--look', LOOKS[result.look].colour);
    if (index < 3) {
      node.append(place, portrait(document, art, result.look, 10), name, score);
      podium.append(node);
    } else {
      node.append(place, name, score);
      rest.append(node);
    }
  }
  container.replaceChildren(title, podium, rest);
}

export function mountPartyTv(root, { code, joinUrl, actions, sound, motionPreference }) {
  root.innerHTML = `<main class="party party-tv">
    <header class="party-bar">
      <a class="party-back" href="/?shelf=1">‹ Game shelf</a>
      <div class="party-tools">
        <span data-party-connection role="status"></span>
        <details class="party-settings"><summary>Settings</summary>
          <div class="party-setting-panel">
            <label><input type="checkbox" data-music> Music</label>
            <label><input type="checkbox" data-effects> Sound effects</label>
            <label class="party-volume">Volume <input type="range" min="0" max="100" data-volume></label>
            <label><input type="checkbox" data-motion> Reduce motion</label>
          </div>
        </details>
      </div>
    </header>
    <div class="party-tv-title"><h1 data-party-title>Party lobby</h1><span class="party-round-label"></span></div>
    <p class="party-error" role="alert" hidden></p>
    <div class="party-tv-grid" hidden>
      <section class="party-lounge">
        <div class="party-lobby">
          <div class="party-lobby-top"><h2>Players</h2><span data-party-ready></span></div>
          <div class="party-wall" data-party-wall></div>
          <p class="party-empty" hidden>Scan the code to fill the couch.</p>
        </div>
        <section data-party-results hidden></section>
      </section>
      <aside class="party-invite">
        <canvas width="96" height="96" class="party-lala" aria-hidden="true"></canvas>
        <h2>Join the party</h2>
        <div data-party-qr class="party-qr" aria-label="Scan to join"></div>
        <strong class="party-code" data-party-code></strong>
        <a data-phone-link>Open phone link</a>
        <div class="party-host-controls">
          <button type="button" class="party-primary" data-start>Start</button>
          <button type="button" class="party-secondary" data-toggle-players hidden>Players</button>
          <label class="party-next-game" hidden>Next game<select></select></label>
          <p data-start-hint></p>
        </div>
      </aside>
    </div>
    <section class="party-stage" hidden aria-label="Game board">
      <canvas data-party-canvas role="img" aria-label="Live game scene"></canvas>
      <div class="party-countdown" hidden></div>
    </section>
  </main>`;
  const find = selector => root.querySelector(selector);
  const document = root.ownerDocument;
  const art = createLookArt(document);
  const canvas = find('[data-party-canvas]');
  const stage = find('.party-stage');
  const grid = find('.party-tv-grid');
  const statusLabel = find('[data-party-connection]');
  const errorLabel = find('.party-error');
  const start = find('[data-start]');
  const togglePlayers = find('[data-toggle-players]');
  const timer = find('.party-round-label');
  const countdown = find('.party-countdown');
  const lobby = find('.party-lobby');
  const results = find('[data-party-results]');
  const gameMenu = find('.party-next-game');
  const nextGame = gameMenu.querySelector('select');
  const motion = find('[data-motion]');
  const music = find('[data-music]');
  const effects = find('[data-effects]');
  const volume = find('[data-volume]');
  const updateWall = lobbyWall(find('[data-party-wall]'), art, actions);
  const playCue = createSoundHooks(sound, { count: 'move', go: 'bank', join: 'join' });
  let renderer;
  let previous;
  let playingGame;
  let podiumRound;
  let finishTimer;
  let connection = 'connecting';
  let displayedCountdown;
  let showingPlayers = false;

  const cat = find('.party-lala');
  art.cat(cat.getContext('2d'), 0, 0, 6);
  find('[data-party-code]').textContent = code;
  find('[data-phone-link]').href = joinUrl;
  if (typeof window.qrcode === 'function') {
    const qr = window.qrcode(0, 'M');
    qr.addData(joinUrl);
    qr.make();
    find('[data-party-qr]').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  }
  const games = GAME_CATALOG.filter(game => game.category === 'party');
  for (const game of games) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.title;
    nextGame.append(option);
  }
  gameMenu.hidden = games.length < 2;
  nextGame.addEventListener('change', () => actions.send({ type: 'select', round: previous.round, gameId: nextGame.value }));
  start.addEventListener('click', () => {
    start.disabled = true;
    void sound.unlock();
    actions.send({ type: 'start', round: previous.round });
  });
  togglePlayers.addEventListener('click', () => {
    showingPlayers = !showingPlayers;
    showRoundPanel();
  });
  const settings = sound.getSettings();
  music.checked = settings.music;
  effects.checked = settings.effects;
  volume.value = Math.round(settings.volume * 100);
  motion.checked = storedMotion();
  music.addEventListener('change', () => { void sound.unlock(); sound.setMusic(music.checked); });
  effects.addEventListener('change', () => { void sound.unlock(); sound.setEffects(effects.checked); });
  volume.addEventListener('input', () => { void sound.unlock(); sound.setVolume(volume.valueAsNumber / 100); });
  motion.addEventListener('change', () => {
    storedMotion(motion.checked);
    renderer?.setReducedMotion(motion.checked);
    if (motion.checked && finishTimer) finishDisplay();
  });
  const motionChanged = () => {
    renderer?.setReducedMotion(motion.checked);
    if (motionPreference.matches && finishTimer) finishDisplay();
  };
  motionPreference.addEventListener('change', motionChanged);

  function showError(message) {
    setText(errorLabel, message);
    errorLabel.hidden = !message;
  }

  function updateActions(view) {
    const ready = view.players.filter(player => player.ready && player.connected).length;
    setText(find('[data-party-ready]'), `${ready} of 16 ready`);
    const canStart = ready >= view.minPlayers && connection === 'connected';
    start.disabled = !canStart;
    nextGame.disabled = connection !== 'connected';
    setText(start, view.phase === 'results' ? 'Next round' : 'Start');
    setText(find('[data-start-hint]'), ready < view.minPlayers ? `Start with ${view.minPlayers} ready players.` : '');
    find('.party-empty').hidden = view.players.length > 0;
  }

  function showRoundPanel() {
    const hasResults = previous?.phase === 'results';
    lobby.hidden = hasResults && !showingPlayers;
    results.hidden = !hasResults || showingPlayers;
    togglePlayers.hidden = !hasResults;
    setText(togglePlayers, showingPlayers ? 'Podium' : 'Players');
  }

  function finishDisplay() {
    clearTimeout(finishTimer);
    finishTimer = undefined;
    stage.hidden = true;
    grid.hidden = false;
    renderer?.dispose();
    renderer = null;
    showRoundPanel();
  }

  function update(view) {
    const prior = previous;
    previous = view;
    const game = getGame(view.gameId);
    setText(find('[data-party-title]'), game?.title ?? 'Party lobby');
    if (nextGame.value !== view.gameId) nextGame.value = view.gameId;
    const active = view.phase === 'countdown' || view.phase === 'playing';
    const count = Math.max(0, Math.ceil(view.ms / 1000));
    setText(timer, active && view.phase === 'playing' ? `Round ${view.round} · ${clockLabel(count)}`
      : view.round ? `Round ${view.round}` : 'Party lobby');
    updateActions(view);
    updateWall(view.players);
    if (view.players.length > (prior?.players.length ?? 0)) playCue('join');
    if (view.notice === 'host_stall') showError('The host paused. Start the round again when ready.');
    else if (view.phase !== prior?.phase) showError('');
    if (active) {
      clearTimeout(finishTimer);
      finishTimer = undefined;
      if (!renderer || playingGame !== view.gameId) {
        renderer?.dispose();
        playingGame = view.gameId;
        renderer = partyGameView(playingGame).mountTv(canvas, { art, sound });
        renderer.setReducedMotion(motion.checked);
      }
      renderer.push(view);
      stage.hidden = false;
      grid.hidden = true;
      countdown.hidden = view.phase !== 'countdown';
      if (view.phase === 'countdown' && count !== displayedCountdown) {
        displayedCountdown = count;
        setText(countdown, String(count));
        playCue('count');
      }
      if (view.phase === 'playing' && prior?.phase === 'countdown') playCue('go');
      return;
    }
    displayedCountdown = undefined;
    if (view.phase === 'results' && podiumRound !== view.round) {
      podiumRound = view.round;
      showingPlayers = false;
      showPodium(results, view, art);
      if (renderer && !motion.checked && !motionPreference.matches) {
        renderer.push(view);
        countdown.hidden = true;
        finishTimer = setTimeout(finishDisplay, FINISH_DISPLAY_MS);
      } else {
        renderer?.push(view);
      }
    }
    if (finishTimer) return;
    finishDisplay();

  }

  return {
    update,
    error: showError,
    status(value) {
      connection = value;
      setText(statusLabel, STATUS[value] ?? '');
      if (previous) updateActions(previous);
    },
    dispose() {
      clearTimeout(finishTimer);
      motionPreference.removeEventListener('change', motionChanged);
      renderer?.dispose();
    },
  };
}
