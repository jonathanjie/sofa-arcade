import { GAME_CATALOG, getGame } from '/games/catalog.mjs?v=5';
import { createLookArt, LOOKS } from '../looks.mjs';
import { createSoundHooks } from '../kit/animation.mjs';
import { partyGameView } from '../games/registry.mjs';

const FINISH_DISPLAY_MS = 640;
const OVERSCAN_FRACTION = 0.03;
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
      const ready = String(player.ready && player.connected);
      if (card.node.dataset.ready !== ready) card.node.dataset.ready = ready;
      setText(card.status, player.connected ? (player.ready ? 'Ready' : 'Choosing') : 'Away · seat held');
    }
  };
}

function showPodium(container, view, art) {
  const document = container.ownerDocument;
  const title = document.createElement('h2');
  title.textContent = 'Podium';
  const summary = partyGameView(view.gameId)?.resultSummary?.(view);
  const outcome = document.createElement('p');
  outcome.className = 'party-match-result';
  if (summary) {
    outcome.textContent = summary.label;
    outcome.style.color = summary.colour;
  }
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
    node.dataset.place = result.place;
    if (index < 3) {
      node.append(place, portrait(document, art, result.look, 10), name, score);
      podium.append(node);
    } else {
      node.append(place, name, score);
      rest.append(node);
    }
  }
  container.replaceChildren(title, ...(summary ? [outcome] : []), podium, rest);
}

export function mountPartyTv(root, { code, joinUrl, actions, sound, motionPreference }) {
  root.innerHTML = `<main class="party party-tv">
    <header class="party-bar">
      <a class="party-back" href="/?shelf=1">‹ Game shelf</a>
      <div class="party-tools">
        <span data-party-connection role="status"></span>
        <button type="button" class="party-secondary" data-end disabled>End party</button>
        <details class="party-settings"><summary>Settings</summary>
          <div class="party-setting-panel">
            <strong data-menu-settings hidden>Settings</strong>
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
          <p class="party-play-hint" hidden></p>
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
        <button type="button" class="party-secondary" data-secure-link hidden>Show phone link with tilt</button>
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
      <p class="party-stage-waiting" role="status" hidden></p>
    </section>
  </main>`;
  const find = selector => root.querySelector(selector);
  const document = root.ownerDocument;
  const art = createLookArt(document);
  const main = find('.party-tv');
  const bar = find('.party-bar');
  const titleRow = find('.party-tv-title');
  const title = find('[data-party-title]');
  const back = find('.party-back');
  const tools = find('.party-tools');
  const menu = find('.party-settings');
  const menuLabel = menu.querySelector('summary');
  const menuPanel = find('.party-setting-panel');
  const menuSettings = find('[data-menu-settings]');
  let canvas = find('[data-party-canvas]');
  const emptyCanvas = canvas.cloneNode(false);
  const stage = find('.party-stage');
  const grid = find('.party-tv-grid');
  const statusLabel = find('[data-party-connection]');
  const errorLabel = find('.party-error');
  const start = find('[data-start]');
  const end = find('[data-end]');
  const togglePlayers = find('[data-toggle-players]');
  const timer = find('.party-round-label');
  const countdown = find('.party-countdown');
  const playHint = find('.party-play-hint');
  const waitingLabel = find('.party-stage-waiting');
  const lobby = find('.party-lobby');
  const results = find('[data-party-results]');
  const gameMenu = find('.party-next-game');
  const nextGame = gameMenu.querySelector('select');
  const motion = find('[data-motion]');
  const music = find('[data-music]');
  const effects = find('[data-effects]');
  const volume = find('[data-volume]');
  const updateWall = lobbyWall(find('[data-party-wall]'), art, actions);
  const phoneLink = find('[data-phone-link]');
  const secureLink = find('[data-secure-link]');
  let secureJoinUrl;
  let showingSecureLink = false;
  const playCue = createSoundHooks(sound, { count: 'move', go: 'bank', join: 'join' });
  let renderer;
  let previous;
  let playingGame;
  let podiumRound;
  let finishTimer;
  let connection = 'connecting';
  let displayedCountdown;
  let showingPlayers = false;

  function showStage(visible) {
    if (main.hasAttribute('data-stage') === visible) return;
    menu.open = false;
    back.hidden = visible;
    menuSettings.hidden = !visible;
    titleRow.hidden = visible;
    main.toggleAttribute('data-stage', visible);
    setText(menuLabel, visible ? 'Menu' : 'Settings');
    if (visible) {
      bar.prepend(title, timer);
      menuPanel.append(end);
    } else {
      titleRow.append(title, timer);
      tools.insertBefore(end, menu);
    }
  }

  function resize() {
    if (!renderer?.resize || stage.hidden) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const side = Math.ceil(width * OVERSCAN_FRACTION);
    const bottom = Math.ceil(main.clientHeight * OVERSCAN_FRACTION);
    renderer.resize({
      width, height,
      safe: { x: side, y: 0, width: width - 2 * side, height: Math.max(0, height - bottom) },
    });
  }

  const stageObserver = new ResizeObserver(resize);
  stageObserver.observe(stage);

  const cat = find('.party-lala');
  art.cat(cat.getContext('2d'), 0, 0, 6);
  find('[data-party-code]').textContent = code;
  function showJoinLink(url) {
    phoneLink.href = url;
    if (typeof window.qrcode === 'function') {
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      find('[data-party-qr]').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
    }
  }
  showJoinLink(joinUrl);
  secureLink.addEventListener('click', () => {
    showingSecureLink = !showingSecureLink;
    showJoinLink(showingSecureLink ? secureJoinUrl : joinUrl);
    setText(secureLink, showingSecureLink ? 'Show phone link for touch' : 'Show phone link with tilt');
  });
  const games = GAME_CATALOG.filter(game => game.category === 'party' && partyGameView(game.id));
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
  end.addEventListener('click', () => actions.send({ type: 'end' }));
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
    const roundName = partyGameView(view.gameId)?.roundName ?? 'round';
    setText(start, view.phase === 'results' ? `Next ${roundName}` : 'Start');
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

  function disposeRenderer() {
    if (!renderer) return;
    renderer.dispose();
    renderer = null;
    // The next game starts with a fresh canvas and the frame's default label.
    const replacement = emptyCanvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
    stage.removeAttribute('data-adaptive');
  }

  function finishDisplay() {
    clearTimeout(finishTimer);
    finishTimer = undefined;
    stage.hidden = true;
    showStage(false);
    grid.hidden = false;
    disposeRenderer();
    showRoundPanel();
  }

  function update(view) {
    const prior = previous;
    previous = view;
    const game = getGame(view.gameId);
    setText(title, game?.title ?? 'Party lobby');
    if (nextGame.value !== view.gameId) nextGame.value = view.gameId;
    const gameView = partyGameView(view.gameId);
    if (main.dataset.game !== view.gameId) main.dataset.game = view.gameId;
    const roundName = gameView?.roundName ?? 'round';
    const roundTitle = roundName[0].toUpperCase() + roundName.slice(1);
    setText(playHint, gameView?.playHint ?? '');
    playHint.hidden = !gameView?.playHint;
    const active = view.phase === 'countdown' || view.phase === 'playing';
    if (stage.dataset.phase !== view.phase) stage.dataset.phase = view.phase;
    const count = Math.max(0, Math.ceil(view.ms / 1000));
    const showRoundTimer = active && gameView?.showRoundTimer !== false;
    setText(timer, showRoundTimer ? `${roundTitle} ${view.round} · ${clockLabel(count)}`
      : view.round ? `${roundTitle} ${view.round}` : 'Party lobby');
    updateActions(view);
    updateWall(view.players);
    if (view.players.length > (prior?.players.length ?? 0)) playCue('join');
    if (view.notice === 'host_stall') showError('The host paused. Start the round again when ready.');
    else if (view.phase !== prior?.phase) showError('');
    if (active) {
      clearTimeout(finishTimer);
      finishTimer = undefined;
      showStage(true);
      stage.hidden = false;
      grid.hidden = true;
      if (!renderer || playingGame !== view.gameId) {
        disposeRenderer();
        playingGame = view.gameId;
        renderer = partyGameView(playingGame).mountTv(canvas, { art, sound });
        renderer.setReducedMotion(motion.checked);
        stage.toggleAttribute('data-adaptive', typeof renderer.resize === 'function');
        resize();
      }
      renderer.push(view);
      const locked = new Set(view.roster.map(({ id }) => id));
      const waiting = view.players.filter(player => player.ready && player.connected && !locked.has(player.id));
      const names = waiting.slice(0, 3).map(player => player.name).join(', ');
      const more = waiting.length > 3 ? ` + ${waiting.length - 3} more` : '';
      setText(waitingLabel, waiting.length ? `Next ${roundName} · ${names}${more}` : '');
      waitingLabel.hidden = waiting.length === 0;
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
      waitingLabel.hidden = true;
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
    setSecureJoinUrl(url) {
      secureJoinUrl = url;
      secureLink.hidden = false;
    },
    status(value) {
      connection = value;
      end.disabled = value !== 'connected';
      setText(statusLabel, STATUS[value] ?? '');
      if (previous) updateActions(previous);
      if (value === 'seat-lost' || value === 'replaced') {
        clearTimeout(finishTimer);
        disposeRenderer();
        stage.hidden = true;
        showStage(false);
        grid.hidden = true;
      }
    },
    dispose() {
      clearTimeout(finishTimer);
      stageObserver.disconnect();
      motionPreference.removeEventListener('change', motionChanged);
      disposeRenderer();
    },
  };
}
