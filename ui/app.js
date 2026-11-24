import { GAME_CATALOG, SOFA_GAME_ID, ODD_LAWS_GAME_ID, GRAVITY_ORCHARD_GAME_ID } from '/games/catalog.mjs?v=4';
import { audio } from '/audio.js?v=5';
import { enhanceMotion } from '/motion.js?v=2';
import { forecastOverlay, axisLabels, turnOrder, forecastLookahead } from '/board-view.mjs?v=5';
import { createActionQueue } from '/action-queue.mjs?v=4';
import { readTransportConfig, subscribeRoom, trustedPhoneOrigin, phoneSetupStatus } from '/transport.mjs?v=5';

const transport = readTransportConfig();
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = (s, node = document) => node.querySelector(s);
const app = $('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const stored = (key, fallback = null) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const persist = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const clientId = stored('sofa-client-id') || uid();
persist('sofa-client-id', clientId);
let engine = null;
let engineLoadFailed = false;
const engineReady = import('/engine.mjs?v=5').then(m => { engine = m; return m; });
engineReady.catch(() => {engineLoadFailed=true;if(state.gameId===SOFA_GAME_ID&&['game','tutorial'].includes(state.view))render();});
let pollTimer = null;
let pollInFlight = false;
let pollAbort = null;
let roomEpoch = 0;
let streamStop = null;
let streamConnected = false;
let streamTerminalStatus = null;
let lastPollAt = 0;
let actionQueue = null;
let createCollectionGame = null;
let collectionGame = null;
let collectionIdentity = null;
let collectionModules = null;
let collectionLoading = null;
let collectionStyles = null;
let collectionLoadError = '';
let collectionModalHTML = null;
let collectionTutorial = null;
let collectionTutorialPending = false;
let collectionTutorialSerial = 0;
let orchardGame = null, orchardIdentity = null, orchardModules = null, orchardLoading = null, orchardLoadError = '';
let orchardTutorial = null, orchardTutorialSerial = 0, orchardModalHTML = null;
let secureSetup = null, secureSetupRoot = null, secureSetupStyle = null, secureSetupSerial = 0, secureStatus = null, secureJoin = false;
let modalPreviousFocus = null;
let eventTimer = null;
let tutorialReturn = null;
const TUTORIAL_RETURN_KEY='sofa-tutorial-return-v2';
const LAST_SESSION_KEY='sofa-last-local-session-v1';
const state = {
  view: 'collection', gameId: SOFA_GAME_ID, role: null, mode: 'network', code: '', room: null,
  hostToken: null, playerToken: null, playerId: null, preferredSeat: null, busy: false,
  notice: '', error: '', network: 'connected', networkMessage: '', modal: null, preview: false,
  lastEventKey: '', eventToast: '', resultDismissed: false, mapOpen: false,
  pendingActions: 0, lureDraft: null, turnToast: '',
  tutorial: null, tutorialDone: stored('sofa-tutorial-v2', false), tutorialSeen: stored('sofa-tutorial-seen-v2', false),
  quietMenu: false,
};
const NAMES = { jon: 'Jon', lydia: 'Lydia' };
const KEYS = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };
const iconPaths = {
  paw: '<ellipse cx="12" cy="16" rx="5" ry="4"/><ellipse cx="5" cy="9" rx="2" ry="3" transform="rotate(-25 5 9)"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="10" rx="2" ry="3" transform="rotate(25 21 10)"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7"/>',
  bag: '<path d="M5 8h14l2 13H3L5 8Zm3 0V6a4 4 0 0 1 8 0v2"/>',
  toy: '<circle cx="12" cy="12" r="9"/><path d="M5 6c10 0 12 9 11 13M3 12c8-3 14 0 17 5M9 3c-3 8 3 14 11 13M5 18l13-13"/>',
  cookie: '<path d="M21 12A9 9 0 1 1 12 3a4 4 0 0 0 5 5 4 4 0 0 0 4 4Z"/><path d="M7 10h.01M10 16h.01M15 13h.01" stroke-width="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  players: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13c3 0 5 2 5 5v3"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  tv: '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8M12 18v4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2M12 17h.01"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  volume: '<path d="m11 4-5 4H2v8h4l5 4V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-5 4H2v8h4l5 4V4Zm5 5 5 6m0-6-5 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  up: '<path d="m5 14 7-7 7 7"/>',
  right: '<path d="m10 5 7 7-7 7"/>',
  down: '<path d="m5 10 7 7 7-7"/>',
  left: '<path d="m14 5-7 7 7 7"/>',
  crown: '<path d="m3 6 5 5 4-8 4 8 5-5-2 14H5L3 6ZM5 17h14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
  music: '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  shelf: '<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M2 12h20M7 3v9m5-9v9m4 0v9M7 12v9"/>',
  sparkles: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2ZM20 2v4m-2-2h4"/>',
  fruit: '<path d="M12 7c-9-8-17 9-7 14 4 2 4-1 7-1s3 3 7 1C29 16 21-1 12 7Zm0 0q0-5 4-5"/><path d="M12 5Q5 6 6 1q6-1 6 4Z"/>',
  market: '<path d="m3 3-2 6h22l-2-6H3ZM3 9v12h18V9M7 21v-7h5v7M2 9q2 5 5 0 3 5 5 0 3 5 5 0 3 5 5 0"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7M7 10h6m-3-3v6"/>',
  footprints: '<ellipse cx="7" cy="7" rx="3" ry="5" transform="rotate(-25 7 7)"/><ellipse cx="17" cy="13" rx="3" ry="5" transform="rotate(20 17 13)"/><path d="m7 16 3-1m5 7 3-1" stroke-width="4"/>',
};
function icon(name, cls = '') {
  const fill = name === 'paw' ? 'currentColor' : 'none';
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="${fill}" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.paw}</svg>`;
}
function fallbackMouse(id) {
  const isLydia = id === 'lydia';
  const scarf = isLydia ? '#c98075' : '#5e8780';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#4d382c" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 100Q22 70 50 70t32 30" fill="${scarf}"/><ellipse cx="23" cy="28" rx="17" ry="19" fill="#cebca2"/><ellipse cx="77" cy="28" rx="17" ry="19" fill="#cebca2"/><ellipse cx="23" cy="28" rx="10" ry="12" fill="#e6bcb2" stroke="none"/><ellipse cx="77" cy="28" rx="10" ry="12" fill="#e6bcb2" stroke="none"/><path d="M18 47q0-30 32-30t32 30q0 36-32 37T18 47Z" fill="#f6e6cb"/>${isLydia ? '<path d="M20 49Q12 17 44 17q26-7 35 15l2 20Q63 30 57 26q-17 24-37 23Z" fill="#74503b"/><path d="M24 48q-26 9-13 35 8 7 14-6" fill="#74503b"/>' : '<path d="M21 31q-4-14 8-17l-1 7q13-17 25-10l-2 7q16-9 25 3l-8 2 12 11q-21-3-27-11-14 14-32 8Z" fill="#4d3b30"/>'}<ellipse cx="35" cy="51" rx="14" ry="12" fill="none"/><ellipse cx="65" cy="51" rx="14" ry="12" fill="none"/><path d="M49 50h2M17 48l5 1M78 49l5-1"/><path d="M31 52q4-4 8 0m22 0q4-4 8 0M44 64q6 7 12 0" fill="none"/><path d="m47 59 3 3 3-3Z" fill="#c88e7f"/><path d="m28 75 22 13 22-13-5 22-17-5-17 5Z" fill="${scarf}"/><path d="m48 87 7 13" fill="none"/></g></svg>`;
}
function fallbackCat() {
  return '<svg viewBox="0 0 200 160" aria-hidden="true"><g stroke="#573b29" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M160 136q46 2 28-39-10-18-27-9 27 3 14 24" fill="#e4a157"/><path d="M40 66 26 17l44 25q27-13 56 0l40-27-7 55q34 83-60 78T40 66Z" fill="#efb967"/><path d="m37 33 9 30 18-17Zm111 28 8-29-22 16Z" fill="#eaa99b" stroke="none"/><path d="M71 42 80 64m17-25 2 24m17-21-6 22M40 88l20 6m-19 11 19-3m78-11 22-7m-21 20 21 3" fill="none" stroke="#bf792f" stroke-width="8"/><path d="M59 95q10-12 20 0m43 0q10-12 20 0" fill="none"/><path d="m94 107 8 7 7-7Z" fill="#d58c77"/><path d="M102 115q-4 11-13 5m13-5q4 11 13 5" fill="none"/><path d="M45 117 15 109m30 16-32 3m143-12 29-9m-30 18 32 2" fill="none" stroke-width="2"/><ellipse cx="77" cy="138" rx="22" ry="10" fill="#f9e2b4"/><ellipse cx="126" cy="138" rx="22" ry="10" fill="#f9e2b4"/></g></svg>';
}
function character(id, extra = '') {
  return `<span class="character ${id} ${extra}" data-character="${id}" role="img" aria-label="${id === 'lala' ? 'Lala the orange cat' : NAMES[id] + ' the tiny adventurer'}"><span class="character-sprite"></span><span class="character-fallback">${id === 'lala' ? fallbackCat() : fallbackMouse(id)}</span></span>`;
}
const hasCurrentRoom = () => !!state.code && state.room?.code === state.code;
function header({titleOnly=false}={}) {
  const brandTag=titleOnly?'h1':'button';
  const inMatch=state.view==='game'||state.view==='tutorial';
  const settings=audio.getSettings();
  return `<header class="topbar"><${brandTag} class="brand" ${titleOnly?'':'data-action="home" aria-label="Back to Sofa Arcade"'}><span class="brand-mark">${icon(inMatch?'paw':'shelf')}</span><span><span class="brand-title">${inMatch?esc(gameById(state.gameId).title):'Sofa Arcade'}</span>${inMatch?'':'<span class="brand-sub">The living-room game shelf</span>'}</span></${brandTag}><div class="top-actions"><span class="connection-pill" data-shell-connection role="status" ${state.network==='connected'||!hasCurrentRoom()?'hidden':''}>${connectionLabel()}</span>${hasCurrentRoom() ? `<span class="room-label hide-mobile">Room <strong>${esc(state.code)}</strong></span>` : ''}<button class="icon-button" data-action="audio" aria-label="Music and sound settings">${icon(settings.music?'music':'muted')}</button>${state.view!=='collection'&&!([ODD_LAWS_GAME_ID,GRAVITY_ORCHARD_GAME_ID].includes(state.gameId)&&state.view==='game')?`<button class="icon-button" data-action="rules" aria-label="How to play">${icon('help')}</button>`:''}<button class="icon-button hide-mobile" data-action="fullscreen" aria-label="Toggle full screen">${icon('expand')}</button></div></header>`;
}
function notices() {
  const text = state.error || state.notice;
  return text ? `<div class="notice ${state.error ? 'error' : ''}" role="${state.error ? 'alert' : 'status'}"><span>${esc(text)}</span><button data-action="dismiss-notice" aria-label="Dismiss message">×</button></div>` : '';
}
function footer() {
  if(state.view==='game'||state.view==='tutorial')return '';
  return `<footer class="footer"><span>${icon('shelf')} One shelf. Many little adventures.</span>${hasCurrentRoom() && state.mode === 'network' ? `<span class="network ${state.network === 'connected' ? '' : 'offline'}">${connectionLabel()}</span>` : `<span>Made for Jon & Lydia</span>`}</footer>`;
}
const gameById = id => GAME_CATALOG.find(g=>g.id===id)||GAME_CATALOG.find(g=>g.id===SOFA_GAME_ID);
const canPlayGame = game => game.id === GRAVITY_ORCHARD_GAME_ID ? transport.gravityOrchard === true : game.status === 'playable';
const gameIcon = id => ({'sofa-kingdoms':'paw','borrowed-minutes':'clock','gravity-orchard':'fruit','afterglow-market':'market','odd-laws-society':'sparkles','last-ninety-seconds':'search','footprints-at-midnight':'footprints'}[id]||'sparkles');
function gameArtwork(id, large = false) {
  if (id === GRAVITY_ORCHARD_GAME_ID) return `<span class="game-cover${large?' is-large':''}"><img src="/assets/gravity-orchard/cover.webp" width="1280" height="720" alt="${large?'Jon and Lydia tend floating orchards while Lala awaits her picnic.':''}" decoding="async" ${large?'fetchpriority="high"':'loading="lazy"'}></span>`;
  if (id === ODD_LAWS_GAME_ID) {
    const alt = large ? 'Lala chairs a whimsical city council while Jon and Lydia propose plans for their boroughs.' : '';
    return `<span class="game-cover${large ? ' is-large' : ''}"><img src="/assets/odd-laws-cover.webp" width="1586" height="992" alt="${alt}" decoding="async" ${large ? 'fetchpriority="high"' : 'loading="lazy"'}></span>`;
  }
  return `<span class="concept-art${large ? ' large' : ''}" aria-hidden="true"><span class="concept-orbit"></span>${icon(gameIcon(id))}</span>`;
}
function collection() {
  const sofa=gameById(SOFA_GAME_ID),planned=GAME_CATALOG.filter(g=>g.id!==SOFA_GAME_ID),ready=planned.some(g=>g.status==='playable');
  return `<main class="arcade-home"><section class="shelf-intro"><div><span class="eyebrow">Stay in. Play something wonderful.</span><h1>Your next adventure<br>starts on the sofa.</h1></div><button class="button secondary" data-action="join-menu">${icon('phone')} Join a room</button></section><section class="featured-game"><div class="featured-image"><img src="/assets/sofa-room.png" alt="Lala the orange cat towers over two tiny adventurers on a cozy sofa"><span class="playable-stamp">${icon('paw')} Ready to play</span></div><div class="featured-copy"><span class="eyebrow">Tonight’s little adventure</span><h2>${esc(sofa.title)}</h2><p>${esc(sofa.description)}</p><div class="game-meta"><span>${icon('players')} ${esc(sofa.mode)}</span><span>${icon('clock')} ${esc(sofa.duration)}</span></div><button class="button" data-action="open-game" data-game="${SOFA_GAME_ID}">Play Sofa Kingdoms</button><button class="text-button" data-action="tutorial">${icon('help')} Learn with Lala</button></div></section><section class="drawing-board"><div class="shelf-section-title"><h2>${ready?'More games on the sofa':'On the drawing board'}</h2><span>More ways to spend an evening together.</span></div><div class="game-shelf">${planned.map(g=>`<button class="game-card" data-action="open-game" data-game="${esc(g.id)}" style="--game-accent:${esc(g.accent||'#8d826e')}">${gameArtwork(g.id)}<span class="concept-status">${canPlayGame(g)?'Ready to play':'On the drawing board'}</span><h3>${esc(g.title)}</h3><p>${esc(g.tagline)}</p><span class="concept-meta">${esc(g.mode)} <span>·</span> ${esc(g.duration)}</span></button>`).join('')}</div></section></main>`;
}
function gameDetail() {
  const selected=gameById(state.gameId),planned=!canPlayGame(selected);
  if(planned)return `<main class="concept-detail" style="--game-accent:${esc(selected.accent||'#8d826e')}"><button class="text-button" data-action="home">${icon('shelf')} All games</button><div class="concept-detail-grid">${gameArtwork(selected.id,true)}<section><span class="concept-status">On the drawing board</span><h1>${esc(selected.title)}</h1><h2>${esc(selected.tagline)}</h2><p>${esc(selected.description)}</p><div class="game-meta"><span>${icon('players')} ${esc(selected.mode)}</span><span>${icon('clock')} ${esc(selected.duration)}</span></div><div class="concept-note">${selected.id===GRAVITY_ORCHARD_GAME_ID?'Gravity Orchard is being prepared for the local Mac collection.':'This game is still on the drawing board.'} Sofa Kingdoms and Odd Laws Society are ready to play.</div><button class="button" data-action="open-game" data-game="${SOFA_GAME_ID}">Play Sofa Kingdoms</button></section></div></main>`;
  if(selected.id===GRAVITY_ORCHARD_GAME_ID)return `<main class="concept-detail orchard-detail" style="--game-accent:${esc(selected.accent)}"><button class="text-button" data-action="home">${icon('shelf')} All games</button><div class="concept-detail-grid">${gameArtwork(selected.id,true)}<section><span class="eyebrow">A picnic for two</span><h1>${esc(selected.title)}</h1><h2>${esc(selected.tagline)}</h2><p>${esc(selected.description)}</p><div class="game-meta"><span>${icon('players')} ${esc(selected.mode)}</span><span>${icon('clock')} ${esc(selected.duration)}</span></div><button class="button full" data-action="create" ${state.busy?'disabled':''}>${state.busy?'<span class="spinner"></span>':icon('tv')} Host on the TV</button><button class="button secondary full" data-action="join-menu">${icon('phone')} Join with your phone</button><div class="detail-secondary"><button class="text-button" data-action="orchard-tutorial">${icon('help')} Learn with Lala</button><button class="text-button" data-action="orchard-practice" ${state.busy?'disabled':''}>${icon('fruit')} Untimed practice</button></div><p class="orchard-access-note">Touch controls work on any phone. Tilt needs a one-time setup on this Mac.</p>${nativeSecureAvailable()?'<button class="text-button" data-action="secure-setup">Set up phone tilt</button>':''}</section></div></main>`;
  if(selected.id===ODD_LAWS_GAME_ID)return `<main class="concept-detail odd-laws-detail" style="--game-accent:${esc(selected.accent)}"><button class="text-button" data-action="home">${icon('shelf')} All games</button><div class="concept-detail-grid">${gameArtwork(selected.id, true)}<section><span class="eyebrow">A council for two</span><h1>${esc(selected.title)}</h1><h2>${esc(selected.tagline)}</h2><p>${esc(selected.description)}</p><div class="game-meta"><span>${icon('players')} ${esc(selected.mode)}</span><span>${icon('clock')} ${esc(selected.duration)}</span></div><button class="button full" data-action="create" ${state.busy?'disabled':''}>${state.busy?'<span class="spinner"></span>':icon('tv')} Host on the TV</button><button class="button secondary full" data-action="join-menu">${icon('phone')} Join with your phone</button><button class="text-button" data-action="odd-tutorial">${icon('help')} Learn with Lala</button>${transport.mode==='lan'?'<p class="lan-mode-label">Home Wi-Fi play</p>':''}</section></div></main>`;
  return `<main class="welcome game-detail"><div class="welcome-art"><div class="art-fallback">${fallbackCat()}</div><img src="/assets/sofa-room.png" alt="Lala watches Jon and Lydia's tiny kingdoms on a cozy sofa"><div class="art-caption">The living room belongs to Lala.</div></div><section class="welcome-copy"><span class="eyebrow">Sofa Kingdoms</span><h1>A crumb of glory.<br><em>A little mischief.</em></h1><p>Gather crumbs, find your way home, and outsmart a cat who keeps rearranging the kingdom.</p>${!state.tutorialSeen&&!state.tutorialDone?`<div class="first-play"><span>${icon('help')}</span><div><strong>First time on the sofa?</strong><button class="link-button" data-action="tutorial">Learn by playing a short tutorial</button></div><button class="first-play-dismiss" data-action="dismiss-tutorial" aria-label="Dismiss tutorial suggestion">${icon('close')}</button></div>`:''}<button class="button" data-action="create" ${state.busy ? 'disabled' : ''}>${state.busy ? '<span class="spinner"></span>' : icon('tv')} Host on the TV</button><button class="button secondary" data-action="join-menu">${icon('phone')} Join with your phone</button><div class="detail-secondary"><button class="text-button" data-action="tutorial">${icon('help')} ${state.tutorialDone?'Replay tutorial':'Learn with Lala'}</button><button class="text-button" data-action="practice" ${state.busy?'disabled':''}>${icon('players')} Same-screen practice</button></div><div class="welcome-features"><span>${icon('players')} 2 players</span><span>${icon('clock')} 15–25 minutes</span><span>${icon('phone')} 2 phones</span></div>${transport.mode==='lan'?'<p class="lan-mode-label">Home Wi-Fi play</p>':'<button class="text-button local-play-link" data-action="local-play">Play over local Wi-Fi</button>'}</section></main>`;
}
function roomPlayers() { return state.room?.players || { jon: {}, lydia: {} }; }
function lobbySeat(id) {
  const p = roomPlayers()[id] || {};
  return `<div class="lobby-seat ${p.joined ? 'joined' : ''} ${id}"><div class="seat-portrait">${character(id)}</div>${state.role==='host'?`<a class="seat-name seat-link" href="${esc(joinUrl(id))}" target="_blank" rel="noopener" aria-label="Open ${NAMES[id]}’s phone controller">${NAMES[id]}</a>`:`<span class="seat-name">${NAMES[id]}</span>`}<span class="seat-status">${p.joined ? (p.connected === false ? 'Reconnecting' : 'Ready to play') : 'Waiting for a phone'}</span></div>`;
}
function joinUrl(seat=null) { return (secureJoin&&state.gameId===GRAVITY_ORCHARD_GAME_ID?trustedPhoneOrigin(secureStatus,transport.joinOrigin)||transport.joinOrigin:transport.joinOrigin) + '/?join=' + encodeURIComponent(state.code)+(seat?'&seat='+seat:''); }
function lobby() {
  const both = roomPlayers().jon?.joined && roomPlayers().lydia?.joined;
  return `<main class="lobby-wrap"><section class="lobby-intro"><span class="eyebrow">Make yourselves comfortable</span><h1>${state.gameId===GRAVITY_ORCHARD_GAME_ID?'Your picnic<br>is almost ready.':state.gameId===ODD_LAWS_GAME_ID?'Your council<br>is almost ready.':'Your kingdom<br>is almost ready.'}</h1><p>Leave this screen on the TV. Scan the code with each phone, then choose Jon or Lydia. Your phones become the controllers.</p><div class="lobby-cat">${character('lala')}</div><div class="lobby-steps"><span class="lobby-step"><span class="step-dot">1</span> Scan on both phones</span><span class="lobby-step"><span class="step-dot">2</span> Pick your character</span><span class="lobby-step"><span class="step-dot">3</span> ${state.gameId===GRAVITY_ORCHARD_GAME_ID?'Enter the orchard':state.gameId===ODD_LAWS_GAME_ID?'Convene the council':'Let Lala loose'}</span></div></section><section class="lobby-card"><span class="eyebrow">Join this room</span><div class="room-code" aria-label="Room code ${esc(state.code.split('').join(' '))}">${esc(state.code)}</div><div class="qr-wrap" id="room-qr"><span class="qr-fallback">Open this page on your phone<br>and enter the room code.</span></div><button class="text-button" data-action="copy-link">${icon('copy')} Copy phone link</button>${orchardJoinOptions()}<div class="lobby-players">${lobbySeat('jon')}${lobbySeat('lydia')}</div><button class="button full" data-action="start" ${!both || state.busy ? 'disabled' : ''}>${state.busy ? '<span class="spinner"></span>' : icon('paw')}${both ? (state.gameId===GRAVITY_ORCHARD_GAME_ID?'Enter the orchard':state.gameId===ODD_LAWS_GAME_ID?'Convene the council':'Let the mischief begin') : 'Waiting for both players'}</button><p class="lobby-hint">${both ? 'Both adventurers have arrived. Start when you’re ready.' : 'Each phone controls one adventurer. Keep this TV page open.'}</p></section></main>`;
}
function joinScreen() {
  const choosing = hasCurrentRoom();
  const ps = roomPlayers();
  const ownTokens=readCredentials(state.code).playerTokens||{};
  return `<main class="join-wrap"><section class="join-card"><span class="eyebrow">A seat on the sofa</span><h1>${choosing ? 'Who’s playing?' : 'Join the room.'}</h1><p>${choosing ? `You’re joining room <strong>${esc(state.code)}</strong>. Choose your adventurer.` : 'Enter the room code shown on your TV.'}</p>${choosing ? `<div class="character-choices">${['jon','lydia'].map(id => {const taken=ps[id]?.joined&&!ownTokens[id];return `<button class="character-choice ${id} ${state.preferredSeat===id?'preferred':''}" data-action="claim" data-player="${id}" ${state.busy || taken ? 'disabled' : ''}><div class="portrait">${character(id)}</div><strong>${NAMES[id]}</strong><small>${taken ? 'Already on the sofa' : ownTokens[id]?'Return to this controller':id === 'jon' ? 'The teal kingdom' : 'The rose kingdom'}</small></button>`;}).join('')}</div><button class="link-button" data-action="different-room">Use a different room code</button>` : `<form id="join-form"><label class="form-label" for="room-input">Room code</label><input class="code-input" id="room-input" name="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="ABCDEF" value="${esc(state.code)}" ${state.busy ? 'readonly' : ''} required aria-describedby="join-code-hint"><button class="button full" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? '<span class="spinner"></span>' : icon('phone')} Find my room</button></form>`}</section><p class="join-caption" id="join-code-hint">${choosing ? 'The big board stays on the TV.<br>Your moves happen here.' : 'You can also scan the QR code on the TV.'}</p></main>`;
}
function waiting() {
  const id = state.playerId;
  return `<main class="controller-shell waiting-scene"><div class="portrait">${character(id)}</div><span class="eyebrow">You’re on the sofa</span><h1>Welcome, ${NAMES[id]}.</h1><p>Your controller is ready. Start the game from the TV once you’ve both joined.</p><div class="room-label">Room <strong>${esc(state.code)}</strong></div><div class="lobby-players">${lobbySeat('jon')}${lobbySeat('lydia')}</div><button class="text-button" data-action="rules">${icon('help')} Learn the rules while you wait</button><div><button class="link-button" data-action="switch-seat">Choose another character</button></div></main>`;
}
function game() { return state.room?.state || null; }
function forecastInfo(g) {
  if(g?.phase==='finished')return {title:'A well-earned catnap',detail:'Lala’s mischief is over for now.',sentence:'The banked crumbs decide who wears the crown.'};
  const f = g?.forecast;
  if (!f || f.type === 'nap') return {title:'A little catnap',detail:'Lala leaves the board alone.',sentence:'Lala takes a nap after this round.'};
  if (f.type === 'pounce') return {title:'Pounce incoming',detail:`Cross at ${String.fromCharCode(65 + f.col)}${f.row + 1} · drop bag, return home.`,sentence:'Anyone in the pawprint drops their bag and returns home.'};
  const part = f.axis === 'row' ? `Row ${f.index + 1}` : `Column ${String.fromCharCode(65 + f.index)}`;
  const dir = f.axis === 'row' ? (f.direction > 0 ? 'right' : 'left') : (f.direction > 0 ? 'down' : 'up');
  return {title:`A little swipe ${dir}`,detail:`${part} slides one space ${dir}.`,sentence:'Tiles, crumbs, and adventurers move together. The edge wraps around.'};
}
function preview(g) { try { return engine?.previewForecast(g); } catch { return null; } }
function furniture(kind, id) {
  const r = Number(String(id).match(/\d+/)?.[0] || 0);
  if (kind === 'cushion') return `<svg class="furniture" viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(${r % 2 ? -8 : 8} 50 50)"><rect x="14" y="14" width="72" height="72" rx="19" fill="${r % 2 ? '#adc2ab' : '#c6b2a0'}" stroke="#978774" stroke-width="1.4"/><rect x="20" y="20" width="60" height="60" rx="14" fill="none" stroke="#f6eddb" stroke-dasharray="3 3"/><path d="m23 24 7 7m47-7-7 7M24 77l7-7m46 7-7-7" stroke="#998a78" fill="none"/></g></svg>`;
  if (kind === 'book') return '<svg class="furniture" viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(-11 50 50)"><rect x="23" y="19" width="57" height="66" rx="4" fill="#ba9774"/><rect x="20" y="16" width="56" height="65" rx="3" fill="#719389" stroke="#55756b" stroke-width="1.2"/><path d="M28 16v65M36 29h27m-27 5h21" stroke="#b7c7a9" stroke-width="2"/><path d="M23 81h53v5H23" fill="#f9edcd" stroke="#bfa981" stroke-width="1.2"/></g></svg>';
  if (kind === 'rug') return '<svg class="furniture" viewBox="0 0 100 100" aria-hidden="true"><rect x="14" y="20" width="72" height="61" rx="5" fill="#d5a48a" stroke="#ad846a"/><rect x="20" y="26" width="60" height="49" rx="4" fill="none" stroke="#efd9ae" stroke-width="4"/><path d="m50 33 18 17-18 17-18-17Z" fill="#c18b73" stroke="#e5c6a2" stroke-width="2"/><path d="M19 14v6m10-6v6m10-6v6m10-6v6m10-6v6m10-6v6m10-6v6M19 81v6m10-6v6m10-6v6m10-6v6m10-6v6m10-6v6m10-6v6" stroke="#ae876d" stroke-width="2"/></svg>';
  if (kind === 'blanket') return '<svg class="furniture" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 20Q48 12 82 23L85 79q-33 9-67 0Z" fill="#c8b2a6" stroke="#ad978a"/><path d="m33 18 2 64m19-65 2 65m18-62 2 61M15 37l68 3M16 57l68 3" stroke="#eee0c7" stroke-width="6" opacity=".75"/><path d="M18 80q35-7 66 0" stroke="#b39e8e" fill="none"/></svg>';
  return '<svg class="furniture" viewBox="0 0 100 100" aria-hidden="true"><path d="M0 27h100M0 60h100M0 89h100M34 0v27m35 0v33M30 60v29" stroke="#c9ac83" stroke-width="1"/><path d="M8 17q14-4 26 0m12 23q19-5 39 0M7 73q17-4 31 0m13 25q18-4 36 0" stroke="#d0b58f" fill="none"/></svg>';
}
function cookieSVG() { return '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M35 19A16 16 0 1 1 19 4a7 7 0 0 0 8 8 6 6 0 0 0 8 7Z" fill="#e2b55d" stroke="#ad7936" stroke-width="1.7"/><circle cx="13" cy="15" r="2" fill="#95653b"/><circle cx="18" cy="27" r="2.2" fill="#95653b"/><circle cx="26" cy="22" r="1.8" fill="#95653b"/><circle cx="9" cy="24" r="1.2" fill="#f8db98"/></svg>'; }
function board(g, compact = false) {
  const pv = preview(g);
  const position = p => `left:${p.col * 20}%;top:${p.row * 20}%`;
  const tiles = g.tiles.map(t => `<div class="board-tile" data-piece="${esc(t.id)}" style="${position(t)}"><div class="tile-surface ${esc(t.kind)}">${furniture(t.kind,t.id)}${t.crumbs ? `<span class="crumbs" aria-label="${t.crumbs} crumbs">${cookieSVG()}${t.crumbs > 1 ? `<b class="crumb-number">${t.crumbs}</b>` : ''}</span>` : ''}</div></div>`).join('');
  const coordinates = Array.from({length:25},(_,i)=>{const row=Math.floor(i/5),col=i%5;return `<div class="coordinate-slot" style="${position({row,col})}"><span class="tile-coordinate">${String.fromCharCode(65+col)}${row+1}</span></div>`;}).join('');
  const homes = ['jon','lydia'].map(id => `<div class="home-slot" style="${position(g.players[id].home)}"><span class="home-sign ${id}">${icon('home')} ${compact ? id[0].toUpperCase() : NAMES[id]}</span></div>`).join('');
  const marks = forecastOverlay(g, pv?.affectedCells || [], icon);
  const together = g.players.jon.row === g.players.lydia.row && g.players.jon.col === g.players.lydia.col;
  const pawns = ['jon','lydia'].map(id => `<div class="pawn-slot ${together ? 'sharing '+id : ''}" data-piece="pawn-${id}" style="${position(g.players[id])}"><span class="pawn ${id} ${g.activePlayer===id ? 'active' : ''}">${character(id)}<b class="pawn-tag">${id[0].toUpperCase()}</b></span></div>`).join('');
  const ghostTogether = pv && pv.players.jon.row === pv.players.lydia.row && pv.players.jon.col === pv.players.lydia.col;
  const ghosts = state.preview && pv ? ['jon','lydia'].filter(id => pv.players[id].row !== g.players[id].row || pv.players[id].col !== g.players[id].col).map(id => `<div class="ghost-slot ${ghostTogether ? 'sharing '+id : ''}" style="${position(pv.players[id])}"><span class="pawn ${id}">${character(id)}<b class="pawn-tag">${id[0].toUpperCase()}</b></span></div>`).join('') : '';
  const lessonTarget=state.mode==='tutorial'&&state.tutorial?.step<5?([0,1].includes(state.tutorial.step)?{row:4,col:1}:[3,4].includes(state.tutorial.step)?{row:4,col:0}:null):null;
  const tutorialTarget=lessonTarget?`<div class="tutorial-target" style="${position(lessonTarget)}" aria-hidden="true"></div>`:'';
  return `<div class="board-shell ${state.eventToast ? 'new-round' : ''}"><div class="board-axis top">${axisLabels(g,'column')}</div><div class="board-axis left">${axisLabels(g,'row')}</div><div class="board" role="img" aria-label="Living room board. Jon at ${String.fromCharCode(65+g.players.jon.col)}${g.players.jon.row+1}, Lydia at ${String.fromCharCode(65+g.players.lydia.col)}${g.players.lydia.row+1}. Highlighted squares show Lala’s next move.">${tiles}${coordinates}${homes}${marks}${tutorialTarget}${ghosts}${pawns}</div>${state.eventToast && !compact ? `<div class="board-event" role="status">${icon('paw')}<span>${esc(state.eventToast)}</span></div>` : ''}</div>`;
}

function playerCard(g, id) {
  const p = g.players[id], points = engine?.scoreFor(p) ?? p.banked + (p.bonusPoints || 0) + (p.openingBonus || 0);
  const seat = roomPlayers()[id];
  return `<section class="player-card ${id} ${g.activePlayer===id ? 'active' : ''}" aria-label="${NAMES[id]}, ${points} ${points===1?'point':'points'}: ${p.banked} banked crumbs, ${p.bonusPoints||0} delivery bonus points, and ${p.openingBonus||0} opening ${p.openingBonus===1?'point':'points'}, ${p.carried} carried"><div class="player-avatar">${character(id)}</div><div><h2 class="player-name">${NAMES[id]}</h2><div class="player-status">${g.phase==='finished' ? (g.winner===id ? 'Crumb champion' : g.winner==='tie'?'Shared crown':'Final score') : g.activePlayer===id ? `${g.actionsLeft} ${g.actionsLeft===1?'action':'actions'}` : 'Waiting'}${seat?.connected===false ? ' · offline' : ''}${g.round===1&&p.openingBonus?'<span class="opening-bonus" title="One starting point for moving second">Opening +1</span>':''}</div></div><div class="player-points" title="${p.banked} banked + ${p.bonusPoints||0} delivery bonus + ${p.openingBonus||0} opening">${points}<small>${g.version>=2?'Points':'Banked'}</small></div><div class="player-inventory"><span class="${p.carried===5?'full-bag':''}" aria-label="Bag ${p.carried} of 5${g.version>=2&&p.carried===5?', bank for 2 bonus points':''}">${icon('bag')} <b>${p.carried}/5</b></span><span aria-label="${p.lures} toys">${icon('toy')} <b>${p.lures}</b></span><span aria-label="Home ${String.fromCharCode(65+p.home.col)}${p.home.row+1}">${icon('home')} ${String.fromCharCode(65+p.home.col)}${p.home.row+1}</span></div></section>`;
}

function forecastCard(g) {
  const f = forecastInfo(g), pounce = g.forecast?.type === 'pounce';
  return `<section class="forecast-card compact-forecast"><div class="forecast-art">${character('lala')}</div><div class="forecast-top"><span class="eyebrow">${g.phase==='finished'?'That’s a wrap':'After both turns'}</span></div><h2>${g.forecast?.type==='swipe'?`${g.forecast.axis==='row'?'Row '+(g.forecast.index+1):'Column '+String.fromCharCode(65+g.forecast.index)} · ${g.forecast.axis==='row'?(g.forecast.direction>0?'Right':'Left'):(g.forecast.direction>0?'Down':'Up')}`:pounce?`Pounce · ${String.fromCharCode(65+g.forecast.col)}${g.forecast.row+1}`:'Catnap'}</h2>${pounce?'<p class="pounce-consequence">Drop bag · return home</p>':''}${g.phase==='finished'?'':`<button class="preview-button" data-action="preview" aria-label="${esc(f.detail)} Preview landing squares" aria-pressed="${state.preview}">${icon('eye')} ${state.preview ? 'Hide preview' : 'Preview'}</button>${forecastLookahead(g,engine?.upcomingForecasts(g)||[],icon)}`}</section>`;
}
function isLocal(){return state.mode==='practice'||state.mode==='tutorial';}
function isPhoneAudio(){const origin=tutorialReturn?.context;return state.role==='player'||(!state.role&&state.quietMenu)||(state.mode==='tutorial'&&(origin?.role==='player'||(!origin?.role&&origin?.quietMenu)));}
function usesMenuScore(){return state.view==='collection'||(state.view==='detail'&&!canPlayGame(gameById(state.gameId)));}
function playMenuEffect(name){const epoch=roomEpoch;void audio.unlock().then(ready=>{if(ready&&epoch===roomEpoch)audio.effect(name);});}
function legal(g, id) {try{const commands=engine?.legalActions(g,id)||[];if(state.mode!=='tutorial')return commands;const expected=TUTORIAL_STEPS[state.tutorial?.step]?.action;if(!expected)return [];return commands.filter(c=>c.type===expected.type&&(!expected.direction||c.direction===expected.direction)&&(expected.index===undefined||c.index===expected.index)&&(c.type!=='lure'||((!c.axis||c.axis===g.forecast.axis)&&(!c.direction||c.direction===g.forecast.direction))));}catch{return [];}}
function controllerControls(g, id, practice=false) {
  const commands = legal(g,id);
  const allowed = (type, dir) => !state.busy && (isLocal()||state.network==='connected') && commands.some(c=>c.type===type && (!dir || c.direction===dir));
  const disabled = (type,dir) => allowed(type,dir) ? '' : 'disabled';
  return `<div class="controller-inputs"><div class="dpad" role="group" aria-label="Move one square">${['up','left','right','down'].map(d=>`<button class="direction ${d}" data-action="game-action" data-command="move" data-direction="${d}" ${disabled('move',d)} aria-label="Move ${d}">${icon(d)}</button>`).join('')}<span class="dpad-center">${icon('paw')}</span></div><div class="action-stack"><button class="action-button collect" data-action="game-action" data-command="collect" ${disabled('collect')}>${icon('cookie')} Collect crumbs</button><button class="action-button bank" data-action="game-action" data-command="bank" ${disabled('bank')}>${icon('home')} Bank my bag${g.version>=2&&g.players[id].carried===5?'<b class="bank-bonus">+2</b>':''}</button></div></div><div class="controller-bottom"><button class="text-button" data-action="lure" ${disabled('lure')}>${icon('toy')} Use a toy ${practice?'':`(${g.players[id].lures})`}</button><button class="button secondary" data-action="game-action" data-command="end" ${disabled('end')}>${state.busy ? '<span class="spinner"></span>' : ''}End turn</button></div>`;
}
function tvBoard(g) {
  return `<main class="game-layout clean-game"><section class="play-area"><div class="turn-banner"><div class="turn-copy"><span class="turn-dot ${g.activePlayer||''}"></span>${g.phase==='finished'?'Final score':`${NAMES[g.activePlayer]}’s turn`}<span class="action-pips" aria-label="${g.actionsLeft} actions remaining"><span class="action-pip ${g.actionsLeft>=1?'active':''}"></span><span class="action-pip ${g.actionsLeft>=2?'active':''}"></span></span></div><span class="round-count">${state.mode==='practice'?'<span class="practice-label">Practice</span> ':''}<strong>${g.round} / ${g.maxRounds}</strong></span></div>${board(g)}</section><aside class="sidebar">${turnOrder(g,icon,engine.roundStarter(g))}${forecastCard(g)}${playerCard(g,'jon')}${playerCard(g,'lydia')}${state.mode==='practice' && g.phase==='playing' ? `<section class="practice-controls"><h3>${NAMES[g.activePlayer]}’s controls</h3>${controllerControls(g,g.activePlayer,true)}</section>` : ''}${g.phase==='finished'?'<button class="button secondary" data-action="results">View results</button>':''}</aside></main>`;
}
function controller(g) {
  const id = state.playerId;
  const active = g.activePlayer === id && g.phase==='playing';
  const f = forecastInfo(g);
  const p = g.players[id];
  return `<main class="controller-shell clean-controller">${playerCard(g,id)}<div class="controller-status ${active ? 'active '+id : ''}">${state.network!=='connected'?'Reconnecting…':g.phase==='finished' ? 'Final score' : active ? `Your turn · ${g.actionsLeft} ${g.actionsLeft===1?'action':'actions'}` : `${NAMES[g.activePlayer]}’s turn`}<span class="controller-round">${state.pendingActions?'<span class="input-confirming" aria-label="Confirming move"></span>':''}${g.round}/${g.maxRounds}</span><p class="controller-turn-toast" role="status">${esc(state.turnToast)}</p></div><div class="controller-location"><span>At <strong>${String.fromCharCode(65+p.col)}${p.row+1}</strong> · Home <strong>${String.fromCharCode(65+p.home.col)}${p.home.row+1}</strong></span><button class="text-button" data-action="toggle-map" aria-expanded="${state.mapOpen}">${icon('eye')} ${state.mapOpen?'Hide map':'Pocket map'}</button></div>${state.mapOpen?`<div class="controller-board">${board(g,true)}</div>`:''}${g.phase==='finished' ? '<button class="button full" data-action="results">View results</button>' : controllerControls(g,id)}<div class="mini-forecast"><div class="mini-cat">${character('lala')}</div><div><h3>Next: Lala</h3><p>${f.detail}</p></div></div></main>`;
}
const TUTORIAL_STEPS=[
  {title:'One small step.',text:'You’re Jon, starting at A5. Move right onto the three crumbs at B5. Every move costs one action.',action:{type:'move',direction:'right'},hint:'Press the right direction.'},
  {title:'A crumb of treasure.',text:'You’re on the crumbs. Collect them into your bag. Your bag can hold five; carrying them doesn’t score yet.',action:{type:'collect'},hint:'Press Collect crumbs.'},
  {title:'Two actions each.',text:'Your two actions are spent. Lydia goes next, then Lala. The next round starts with Lydia, so she acts on both sides of Lala. We’ll finish those turns to bring your crumbs home.',continue:true,hint:'Watch the middle row move.'},
  {title:'Home is one step away.',text:'Your three crumbs are still in your bag. Move left to your burrow at A5.',action:{type:'move',direction:'left'},hint:'Press the left direction.'},
  {title:'Now they’re safe.',text:'Bank your bag at home. Lala can never take banked points. A delivery of three or more restores one used toy, up to two; a full five-crumb bag also earns two bonus points.',action:{type:'bank'},hint:'Press Bank my bag.'},
  {title:'A toy changes the plan.',text:'Lala plans to swipe row 5. Spend one toy and one action to send her to row 1 instead. You start with two toys and refill one by banking at least three crumbs. In a full match, you can also change the swipe’s axis and direction.',action:{type:'lure',index:0},hint:'Use a toy, then choose row 1.'},
  {title:'See the future.',text:'Lydia is on E1. A rightward swipe will carry her around the edge to A1. Preview the landing squares before anyone moves.',preview:true,hint:'Press Preview the swipe.'},
  {title:'Let Lala do the work.',text:'End your turn. We’ll let Lydia finish, then watch her ride the moving row. Homes stay fixed while tiles, crumbs, and adventurers move.',action:{type:'end'},hint:'Press End turn.'},
];
function tutorialView(){
  const g=game(),lesson=state.tutorial?.step||0,done=lesson>=TUTORIAL_STEPS.length,step=TUTORIAL_STEPS[lesson],p=g.players.jon;
  const returnToMatch=!!tutorialReturn?.context?.room&&tutorialReturn.context.mode!=='tutorial';
  return `<main class="tutorial-layout"><div class="tutorial-toolbar"><span class="eyebrow">Learn with Lala</span><button class="text-button" data-action="tutorial-exit">${icon('close')} ${returnToMatch?'Return to game':'Exit tutorial'}</button></div><section class="tutorial-board"><div class="turn-banner"><span class="turn-copy">${done?'A fine first adventure':`Lesson ${lesson+1} of ${TUTORIAL_STEPS.length}`}</span><span class="lesson-progress" aria-label="${Math.min(lesson+1,8)} of 8 lessons">${Array.from({length:8},(_,i)=>`<i class="${i<=lesson?'complete':''}"></i>`).join('')}</span></div>${board(g)}</section><aside class="tutorial-guide">${done?`<div class="tutorial-complete"><div class="tutorial-mascot">${character('lala')}</div><span class="eyebrow">You know your way around</span><h1>Ready for a little rivalry.</h1><p>Collect crumbs. Bank them at home. Make Lala’s next move work for you. Most points after ten rounds wins. Bank a full bag for a bonus, refill toys with deliveries, and plan around the next forecast.</p><div class="tutorial-score">${icon('cookie')} <strong>${p.banked}</strong> crumbs safely banked</div>${returnToMatch?'<button class="button full" data-action="tutorial-exit">Return to your game</button>':'<button class="button full" data-action="tutorial-host">Host a TV game</button><button class="button secondary full" data-action="tutorial-practice">Same-screen practice</button>'}<button class="text-button" data-action="tutorial-restart">${icon('reset')} Replay tutorial</button></div>`:`<div class="tutorial-guide-copy"><span class="lesson-label">${String(lesson+1).padStart(2,'0')}</span><h1>${step.title}</h1><p>${step.text}</p></div><div class="tutorial-inventory"><span>${icon('bag')} Bag <strong>${p.carried}/5</strong></span><span>${icon('home')} Banked <strong>${p.banked}</strong></span><span>${icon('toy')} Toys <strong>${p.lures}</strong></span></div>${step.continue?'<button class="button full" data-action="tutorial-continue">Watch the next turns</button>':step.preview?'<button class="button full" data-action="tutorial-preview">'+icon('eye')+' Preview the swipe</button>':`<div class="tutorial-controls">${controllerControls(g,g.activePlayer,true)}</div>`}<p class="lesson-hint">${step.hint}</p>${lesson>=5?forecastCard(g):''}<button class="text-button tutorial-skip" data-action="tutorial-exit">Skip for now</button>`}</aside></main>`;
}
function rememberTutorialSeen(){state.tutorialSeen=true;persist('sofa-tutorial-seen-v2',true);}
function clearTutorialReturn(){try{sessionStorage.removeItem(TUTORIAL_RETURN_KEY);}catch{}}
function saveTutorialReturn(){try{if(tutorialReturn?.context?.room&&['network','practice'].includes(tutorialReturn.context.mode))sessionStorage.setItem(TUTORIAL_RETURN_KEY,JSON.stringify(tutorialReturn));else clearTutorialReturn();}catch{}}
function restoreTutorialReturn(){
  try{
    const saved=JSON.parse(sessionStorage.getItem(TUTORIAL_RETURN_KEY)||'null');
    if(!saved||typeof saved.url!=='string'||!saved.context||typeof saved.context!=='object')return null;
    const context=saved.context,url=new URL(saved.url,location.origin);
    if(url.origin!==location.origin||url.pathname!=='/'||!['network','practice'].includes(context.mode)||!['host','player'].includes(context.role)||!['lobby','game'].includes(context.view)||!context.room)throw new Error('Invalid tutorial return');
    if(context.mode==='network'&&(!/^[A-Z0-9]{4,8}$/.test(context.code||'')||url.searchParams.get(context.role==='host'?'room':'join')!==context.code))throw new Error('Invalid room return');
    if(context.mode==='practice'&&!url.searchParams.has('practice'))throw new Error('Invalid practice return');
    if(context.room.state&&(!Array.isArray(context.room.state.tiles)||context.room.state.tiles.length!==25||!context.room.state.players?.jon||!context.room.state.players?.lydia))throw new Error('Invalid saved board');
    const clean={};for(const key of Object.keys(state))if(Object.hasOwn(context,key))clean[key]=context[key];
    clean.eventToast='';clean.turnToast='';
    return {context:clean,url:url.pathname+url.search};
  }catch{clearTutorialReturn();return null;}
}
async function startTutorial(){
  if(state.busy)return;
  releaseActionQueue();
  if(state.mode!=='tutorial'){
    const isReload=new URLSearchParams(location.search).has('tutorial');
    const recovered=isReload?restoreTutorialReturn():null;
    if(recovered)tutorialReturn=recovered;
    else{
      const context=JSON.parse(JSON.stringify(state));context.modal=null;context.busy=false;context.eventToast='';context.turnToast='';
      let url=location.pathname+location.search;
      if(isReload){context.view='detail';context.gameId=SOFA_GAME_ID;url='/?game='+SOFA_GAME_ID;}
      tutorialReturn={context,url};
    }
    saveTutorialReturn();
  }
  stopPolling();clearTimeout(eventTimer);rememberTutorialSeen();state.busy=true;state.error='';state.modal=null;
  const epoch=roomEpoch;
  try{
    await engineReady;
    if(epoch!==roomEpoch)return;
    const g=engine.createGame({seed:'sofa-training-v2',maxRounds:10,firstPlayer:'jon'});
    g.tiles.forEach(t=>t.crumbs=t.row===4&&t.col===1?3:0);
    g.forecast={type:'swipe',axis:'row',index:2,direction:1};
    state.mode='tutorial';state.view='tutorial';state.gameId=SOFA_GAME_ID;state.role='host';state.code='';state.hostToken=null;state.playerToken=null;state.playerId=null;state.room=null;state.tutorial={step:0};state.preview=false;state.eventToast='';state.turnToast='';state.lastEventKey='';state.network='connected';
    history.replaceState({},'', '/?game='+SOFA_GAME_ID+'&tutorial=1');
    state.room={phase:g.phase,state:g,revision:0,players:{jon:{joined:true,connected:true},lydia:{joined:true,connected:true}}};
  }catch(err){if(epoch===roomEpoch)state.error='The tutorial could not start: '+err.message;}
  finally{if(epoch===roomEpoch){state.busy=false;render();}}
}
function advanceTutorial(){
  state.tutorial.step++;
  const g=game();
  if(state.tutorial.step===3)g.forecast={type:'swipe',axis:'row',index:2,direction:1};
  if(state.tutorial.step===5)g.forecast={type:'swipe',axis:'row',index:4,direction:1};
  if(state.tutorial.step>=TUTORIAL_STEPS.length){state.tutorialDone=true;persist('sofa-tutorial-v2',true);state.preview=false;audio.effect('win');}
  render();
}
function tutorialContinue(){
  if(state.mode!=='tutorial'||state.tutorial.step!==2)return;
  let g=engine.applyAction(game(),'lydia',{type:'end'});
  g=engine.applyAction(g,'lydia',{type:'end'});
  applyRoom({...state.room,state:g,phase:g.phase,revision:state.room.revision+1},true);
  advanceTutorial();
}
async function tutorialAction(action){
  const g=game(),id=g.activePlayer;
  if(action.type==='lure')action={...action,axis:g.forecast.axis,direction:g.forecast.direction};
  if(!legal(g,id).some(c=>c.type===action.type&&(!c.direction||c.direction===action.direction)&&(c.index===undefined||c.index===action.index)))return;
  state.busy=true;state.modal=null;state.error='';state.preview=false;
  try{
    let next=engine.applyAction(g,id,action);
    if(state.tutorial.step===7)next=engine.applyAction(next,'lydia',{type:'end'});
    applyRoom({...state.room,state:next,phase:next.phase,revision:state.room.revision+1},true);
    advanceTutorial();
  }catch(err){state.error=err.message;audio.effect('error');}
  finally{state.busy=false;render();}
}
function exitTutorial(destination=null){
  stopPolling();clearTimeout(eventTimer);
  const context=tutorialReturn;const seen=state.tutorialSeen,done=state.tutorialDone;
  tutorialReturn=null;
  clearTutorialReturn();
  if(context&&destination!=='detail'){
    Object.assign(state,context.context,{tutorial:null,tutorialSeen:seen,tutorialDone:done,modal:null,busy:false,eventToast:'',turnToast:'',error:'',preview:false});
    history.replaceState({},'',context.url);render();
    if(state.mode==='network'&&state.code){startPolling();poll();}
  }else{
    state.tutorial=null;state.mode='network';state.role=null;state.room=null;state.code='';state.hostToken=null;state.playerToken=null;state.playerId=null;state.view='detail';state.gameId=SOFA_GAME_ID;state.modal=null;state.busy=false;state.eventToast='';state.turnToast='';state.error='';
    history.replaceState({},'', '/?game='+SOFA_GAME_ID);render();
  }
}
function audioStatus(){const a=audio.getSettings();return !a.supported?'Audio isn’t available in this browser.':isPhoneAudio()?'Music plays on the TV.':a.music&&a.unlocked&&a.canPlayMusic&&a.volume>0?'Playing on this screen':a.music&&!a.unlocked?'Tap Enable audio to start':a.music&&a.volume===0?'Volume is muted':a.music?'Music is paused on this screen':'Background music is off';}
function modal() {
  if (!state.modal) return '';
  let content='';
  const close=`<button class="modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button>`;
  if(state.modal==='rules') {
    const advanced = !game() || game().version >= 2;
    const fairOpening = !game() || game().version >= 3;
    const rules=[['cookie','Collect a little treasure','Move onto a crumb square, then Collect. Your bag holds five crumbs. Each move, collection, or deposit costs one action.'],['home','Make the delivery count',advanced?'Bank at your own burrow: Jon at A5, Lydia at E1. Each crumb scores one point. A full five-crumb delivery adds two bonus points. Banked points are safe.':'Bank your bag at your own burrow: Jon at A5, Lydia at E1. Only banked crumbs count, and they are always safe.'],['players','A fresh opening',fairOpening?'The first player is drawn randomly for each match. The second player starts with one secured point. You each get two actions; the starter swaps each round, then Lala acts after both turns. The same player can end one round and begin the next.':'You each get two actions per turn. This existing match starts Jon, Lydia, then Lala. The starter swaps each round, so the same player can get a fresh turn after Lala. A fresh match adds a random starter and one point for moving second.'],['paw','Watch Lala’s forecast','After both turns, Lala swipes a row or column, pounces, or naps. Swipes carry tiles, crumbs, and players; the edge wraps around. Burrows stay fixed.'],['bag','Keep your bag safe','A pounce hits the marked square plus above, below, left, and right. Diagonals are safe. Caught players drop every carried crumb on their square and return home. Banked points stay safe; nobody is eliminated.'],['toy','Steer the next swipe',advanced?'Spend one toy and one action to choose any row or column and either direction. Ride it home or disrupt a rival. Banking three or more crumbs restores one toy, up to two. Toys cannot change a pounce or nap.':'Each player has two toys for the match. Spend a toy and an action to redirect a swipe to another line of the same kind.'],['eye','Plan a move ahead','The amber lane shows this round’s swipe. The coral cross shows a pounce. Preview shows landing squares; Next round shows the following event.'],['crown','Claim your kingdom',advanced?'After ten rounds, banked crumbs, delivery bonuses, and any opening point decide the winner. Equal point totals share the crown.':'After ten rounds, the most banked crumbs wins. Equal scores share the crown. A rematch uses the expanded rules.']];
    content=`<div class="modal-header"><div><span class="eyebrow">The royal rulebook</span><h2>A little strategy.<br>A lot of cat.</h2></div>${close}</div><button class="button secondary full" data-action="tutorial">${icon('help')} Replay the interactive tutorial</button>${state.room&&state.mode==='network'?'<p class="help-saved-note">Your room and controller stay saved while you learn.</p>':''}<div class="rule-list">${rules.map(([i,t,d])=>`<div class="rule-item"><span class="rule-icon">${icon(i)}</span><div><h3>${t}</h3><p>${d}</p></div></div>`).join('')}</div><button class="button full" data-action="close-modal">Back to the game</button>`;
  } else if(state.modal==='odd-rules') {
    content=`<div class="modal-header"><div><span class="eyebrow">The council handbook</span><h2>Build the city.<br>Rewrite its rules.</h2></div>${close}</div><button class="button secondary full" data-action="odd-tutorial" data-replay="true">${icon('help')} Replay the guided tutorial</button><div class="rule-list">${[
      ['market','Build a borough','Choose from six shared building stacks and place your purchase in an empty plot. Each city has nine plots. Complete a horizontal street with one or three guilds for two prestige.'],
      ['players','Six council sessions','Each player takes three city actions per session. Work gains three coins, Lobby gains two influence up to six, and Festival spends three coins for three prestige, plus one with Festival support. Each player can hold one Festival per session.'],
      ['sparkles','Seal your influence bid','Choose an offered law or Keep current, then seal a bid from zero to three influence within your budget. Both players pay, including the losing bid. Equal bids use the Chair’s choice. The non-Chair takes the first city action.'],
      ['cookie','Income and limited stock','Sessions two to six begin with three coins, up to two coins from income buildings, and one influence. Fresh building stocks arrive in sessions three and five. Unbought stock from earlier terms goes away.'],
      ['crown','Prestige decides the result','Building, street, Festival, and secured Civic prestige stay earned. The final treasury adds one prestige per three remaining coins, up to four. Equal totals share the victory.'],
    ].map(([i,title,description])=>`<div class="rule-item"><span class="rule-icon">${icon(i)}</span><div><h3>${title}</h3><p>${description}</p></div></div>`).join('')}</div><button class="button full" data-action="close-modal">Back to the council</button>`;
  } else if(state.modal==='local') {
    content=`<div class="modal-header"><div><span class="eyebrow">Your living room, connected</span><h2>Play over home Wi-Fi.</h2></div>${close}</div><div class="local-instructions"><p>Open the Sofa Arcade app on your Mac, host a room, and scan its QR code with both phones.</p><p>Keep the Mac and both phones on the same home Wi-Fi.</p><details><summary>Using the portable ZIP instead?</summary><ol><li>Download and unzip the portable game on your Mac.</li><li>Install Node.js 22.13 or newer if needed.</li><li>Open <strong>start-sofa.command</strong>, or run <code>node scripts/lan-server.mjs</code> in the extracted folder.</li><li>Open the address shown in Terminal, host a room, and scan its QR on both phones.</li></ol></details><details><summary>Changed Wi-Fi?</summary><p>In the Mac app, choose <strong>Connection → Refresh Network</strong> to update the phone link, then scan the new QR code with both phones. To finish a game you started on the old Wi-Fi, switch back to it, or host a new room.</p></details>${transport.mode==='lan'?'<p class="lan-mode-label">You’re already playing over your home Wi-Fi.</p>':'<a class="button full" href="/downloads/sofa-arcade-local.zip" download="sofa-arcade-local.zip">Download portable ZIP</a>'}<p class="connection-detail">Keep the Mac app open while you play. Rooms on your home Wi-Fi are separate from online rooms. Showing the game on the TV by screen casting can add a little delay.</p></div><button class="button secondary full" data-action="close-modal">Done</button>`;
  } else if(state.modal==='audio') {
    const a=audio.getSettings(),phone=isPhoneAudio();
    const status=audioStatus();
    content=`<div class="modal-header"><div><span class="eyebrow">Set the mood</span><h2>Music & sound</h2></div>${close}</div><p class="audio-live-status" role="status">${status}</p><label class="audio-setting"><span><strong>Background music</strong><small>${esc(a.trackTitle)}</small></span><input type="checkbox" role="switch" aria-label="Background music" data-action="toggle-music" ${a.music?'checked':''} ${phone||!a.supported?'disabled':''}></label><label class="audio-setting"><span><strong>Sound effects</strong><small>${phone?'On this phone':usesMenuScore()?'Game choices and a warm welcome.':state.gameId===GRAVITY_ORCHARD_GAME_ID?'Fruit catches, picnic orders, and Lala’s forecast.':state.gameId===ODD_LAWS_GAME_ID?'Buildings, coins, and council decisions.':'Steps, crumbs, and cat-sized trouble.'}</small></span><input type="checkbox" role="switch" aria-label="Sound effects" data-action="toggle-effects" ${a.effects?'checked':''} ${!a.supported?'disabled':''}></label><label class="audio-volume"><span>Volume <output id="volume-value">${Math.round(a.volume*100)}%</output></span><input type="range" min="0" max="100" value="${Math.round(a.volume*100)}" step="1" id="volume-slider" aria-label="Audio volume" ${!a.supported?'disabled':''}></label>${!a.unlocked&&a.supported?'<button class="button full" data-action="unlock-audio">Enable audio</button>':''}<button class="button secondary full" data-action="close-modal">Done</button>`;
  } else if(state.modal==='lure') {
    const g=game(),f=g.forecast,advanced=g.version>=2&&state.mode!=='tutorial';
    const draft=advanced?(state.lureDraft||f):f;
    const axis=draft.axis==='row'?'row':'column';
    const targets=legal(g,isLocal()?g.activePlayer:state.playerId).filter(c=>c.type==='lure'&&(!advanced||(c.axis===draft.axis&&c.direction===draft.direction))).map(c=>c.index);
    const dirs=axis==='row'?[['left',-1],['right',1]]:[['up',-1],['down',1]];
    content=`<div class="modal-header"><div><span class="eyebrow">A very tempting toy</span><h2>Steer Lala.</h2></div>${close}</div>${advanced?`<div class="lure-choice-row" role="group" aria-label="Swipe axis">${['row','column'].map(value=>`<button class="lure-choice ${axis===value?'selected':''}" data-action="lure-axis" data-axis="${value}" aria-pressed="${axis===value}">${value==='row'?'Row':'Column'}</button>`).join('')}</div><div class="lure-choice-row" role="group" aria-label="Swipe direction">${dirs.map(([name,value])=>`<button class="lure-choice ${draft.direction===value?'selected':''}" data-action="lure-direction" data-value="${value}" aria-pressed="${draft.direction===value}">${icon(name)} ${name[0].toUpperCase()+name.slice(1)}</button>`).join('')}</div>`:''}<p>Choose the ${axis} she’ll swipe ${dirs.find(([,value])=>value===draft.direction)?.[0]||''}.</p><div class="lure-grid">${[0,1,2,3,4].map(i=>`<button class="lure-option" data-action="choose-lure" data-index="${i}" ${!targets.includes(i)?'disabled':''} aria-label="Swipe ${axis} ${axis==='row'?i+1:String.fromCharCode(65+i)}">${axis==='row'?i+1:String.fromCharCode(65+i)}</button>`).join('')}</div><p>One action · One toy</p>`;
  } else if(state.modal==='results') {
    const g=game(),tie=g.winner==='tie';
    content=`<div class="modal-header"><span class="eyebrow">A royal result</span>${close}</div><div class="winner-stage"><div class="winner-art">${character(tie?'lala':g.winner)}</div><h2>${tie?'Two kingdoms.<br>One shared crown.':`${NAMES[g.winner]} takes<br>the crumb crown.`}</h2><p>${tie?'An honourable draw. Lala takes full credit.':'A fine haul, a few clever moves, and a little help from Lala.'}</p><div class="winner-scores">${['jon','lydia'].map(id=>`<div class="winner-score ${id}"><span>${NAMES[id]}</span><strong>${engine?.scoreFor(g.players[id])??g.players[id].banked}</strong><span>${g.version>=2?'points':'banked crumbs'}</span></div>`).join('')}</div>${state.role==='host'||state.mode==='practice'?`<button class="button" data-action="rematch" ${state.busy?'disabled':''}>${state.busy?'<span class="spinner"></span>':icon('reset')} A fresh kingdom</button>`:'<p>Start a fresh kingdom from the TV.<br>Your controller stays connected.</p>'}</div>`;
  } else if(state.modal==='leave') {
    content=`<div class="modal-header"><h2>Back to the sofa?</h2>${close}</div><p>Your room stays saved. You can return using the same link.</p><button class="button full" data-action="leave">Back to the menu</button><button class="button secondary full" data-action="close-modal">Keep playing</button>`;
  }
  return `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${['rules','odd-rules'].includes(state.modal)?'How to play':state.modal==='audio'?'Music and sound settings':state.modal==='lure'?'Choose a toy target':state.modal==='results'?'Game results':state.modal==='local'?'Play over home Wi-Fi':'Return to menu'}">${content}</section></div>`;
}
function nativeSecureAvailable() {return transport.mode==='lan'&&state.role!=='player'&&['getStatus','provision','exportPublicTrust','remove'].every(key=>typeof window.sofaDesktopSecureLan?.[key]==='function');}
function orchardJoinOptions() {
  if(state.gameId!==GRAVITY_ORCHARD_GAME_ID||!nativeSecureAvailable())return '';
  return `<div class="orchard-join-options">${trustedPhoneOrigin(secureStatus,transport.joinOrigin)?`<button class="text-button" data-action="secure-link" aria-pressed="${secureJoin}">${secureJoin?'Phone link with tilt':'Phone link for touch'}</button>`:''}<button class="text-button" data-action="secure-setup">Phone tilt setup</button></div>`;
}
function closeSecureSetup() {
  secureSetupSerial++; secureSetup?.dispose(); secureSetup=null;secureSetupRoot?.remove();secureSetupRoot=null;secureSetupStyle?.remove();secureSetupStyle=null;app.inert=false;
}
async function openSecureSetup() {
  if(!nativeSecureAvailable()||secureSetupRoot)return;
  const serial=++secureSetupSerial, epoch=roomEpoch;
  try {
    if(orchardGame){const paused=await orchardGame.pause('help');if(!paused.accepted)throw new Error('Pause the garden before changing phone access.');}
    const {mountSecureLanSetup}=await import('/secure-lan/setup.mjs');
    if(serial!==secureSetupSerial||epoch!==roomEpoch)return;
    const native=window.sofaDesktopSecureLan;
    secureSetupStyle=document.createElement('link');secureSetupStyle.rel='stylesheet';secureSetupStyle.href='/secure-lan/setup.css';document.head.append(secureSetupStyle);
    const update=async fn=>{const next=await fn();secureStatus=next;return phoneSetupStatus(next,transport.joinOrigin);};
    secureSetupRoot=document.createElement('div');secureSetupRoot.className='orchard-setup-layer';document.body.append(secureSetupRoot);app.inert=true;
    secureSetup=mountSecureLanSetup(secureSetupRoot,{
      getStatus:()=>update(()=>native.getStatus()),provision:options=>update(()=>native.provision(options)),
      exportPublicTrust:options=>native.exportPublicTrust(options),remove:options=>update(()=>native.remove(options)),
      onClose:()=>{closeSecureSetup();render();},
    });
  }catch(error){closeSecureSetup();state.error=error.message;render();}
}
function releaseOrchardGame() {orchardGame?.dispose();orchardGame=null;orchardIdentity=null;orchardModalHTML=null;}
function ensureOrchardModules() {
  if(orchardModules)return Promise.resolve(orchardModules);
  if(orchardLoading)return orchardLoading;
  orchardLoading=import('/games/gravity-orchard/index.mjs').then(modules=>{orchardModules=modules;orchardLoadError='';return modules;}).catch(error=>{orchardLoadError=error.message;throw error;}).finally(()=>{orchardLoading=null;});
  return orchardLoading;
}
function closeOrchardTutorial(){orchardTutorialSerial++;orchardTutorial?.dispose();orchardTutorial=null;}
async function openOrchardTutorial(){
  if(state.gameId!==GRAVITY_ORCHARD_GAME_ID||orchardTutorial)return;
  const epoch=roomEpoch,serial=++orchardTutorialSerial;
  try {
    if(orchardGame){const paused=await orchardGame.pause('help');if(!paused.accepted)throw new Error('Pause the garden before opening Help.');}
    const modules=await ensureOrchardModules();
    if(epoch!==roomEpoch||serial!==orchardTutorialSerial)return;
    state.modal=null;render();
    orchardTutorial=modules.mountTutorial(document.body,{onClose:()=>{orchardTutorial=null;},inputMode:'touch',reducedMotion:motionPreference.matches});
  }catch(error){if(epoch===roomEpoch){state.error=error.message;render();}}
}
function renderOrchardMatch(){
  const identity=[state.code,state.role,state.playerId||'',token()||''].join(':');
  if(orchardIdentity!==identity||!app.querySelector('#gravity-orchard-root')){
    releaseOrchardGame();orchardIdentity=identity;
    app.innerHTML=`<div class="app-shell orchard-match ${state.role==='player'?'is-controller':''}"><div id="orchard-chrome"></div><div id="orchard-notices"></div><main id="gravity-orchard-root"></main></div><div id="orchard-overlays"></div>`;
  }
  $('#orchard-chrome').innerHTML=state.role==='player'?'':header();
  $('#orchard-notices').innerHTML=notices();
  const markup=modal();
  if(markup!==orchardModalHTML){$('#orchard-overlays').innerHTML=markup;orchardModalHTML=markup;if(state.modal)requestAnimationFrame(()=>$('.modal button')?.focus({preventScroll:true}));}
  const root=$('#gravity-orchard-root');
  if(!orchardModules){
    root.innerHTML=orchardLoadError?`<section class="collection-loading" role="alert"><h1>The orchard could not open.</h1><p>${esc(orchardLoadError)}</p><button class="button" data-action="retry-orchard">Try again</button></section>`:'<div class="collection-loading" role="status"><span class="spinner"></span> Preparing the orchard…</div>';
    if(!orchardLoading&&!orchardLoadError)void ensureOrchardModules().then(()=>{if(orchardIdentity===identity)render();}).catch(()=>{if(orchardIdentity===identity)render();});
    return;
  }
  if(!orchardGame){
    try{
      orchardGame=orchardModules.mountGravityOrchard(root,{viewer:state.role==='player'?{role:'player',playerId:state.playerId}:{role:'host',playerId:null},code:state.code,token:token(),initialRoom:state.room,sound:audio,
        onView:view=>{if(orchardIdentity===identity&&state.room){state.room={...state.room,state:view,phase:view.phase==='finished'?'finished':'playing'};}},
        onStatus:status=>{if(orchardIdentity===identity){state.network=status.state;state.networkMessage=status.message||'';updateConnectionChrome();}},onExit:goHome,
      });
    }catch(error){orchardLoadError=error.message;root.innerHTML=`<div class="collection-loading" role="alert">${esc(error.message)}</div>`;}
  }else orchardGame.receive(state.room);
}
function releaseCollectionGame() {
  collectionGame?.dispose();
  collectionStyles?.release();
  collectionStyles=null;
  collectionGame=null;
  collectionIdentity=null;
  collectionModalHTML=null;
}
function connectionStatus(value) {
  const next=typeof value==='string'?{state:value}:value;
  return next&&['connecting','connected','reconnecting','offline','error'].includes(next.state)?next:{state:'reconnecting'};
}
function connectionLabel() {
  return {connected:'Room connected',connecting:'Connecting…',reconnecting:'Reconnecting…',offline:'Offline',error:'Needs attention'}[state.network]||'Reconnecting…';
}
function updateConnectionChrome() {
  const status=app.querySelector('[data-shell-connection]');
  if(status){status.hidden=state.network==='connected'||!hasCurrentRoom();status.textContent=connectionLabel();}
}
function setNetworkConnection(value,{terminal=false}={}) {
  const next=connectionStatus(value);
  if(terminal)streamTerminalStatus=next;
  else if(next.state==='connected')streamTerminalStatus=null;
  const changed=state.network!==next.state;
  // A live stream can recover before an uncertain command acknowledgment.
  // Keep the bridge's effective status until that original request is resolved.
  const effective=collectionGame?.setConnection(next)||next;
  state.network=effective.state;state.networkMessage=effective.message||'';
  updateConnectionChrome();
  if(changed&&state.gameId===SOFA_GAME_ID&&state.view==='game')render();
}
function ensureCollectionModules() {
  if(collectionModules)return Promise.resolve(collectionModules);
  if(collectionLoading)return collectionLoading;
  collectionLoading=Promise.all([import('/collection-game.mjs?v=1'),import('/collection-load.mjs?v=1')]).then(([bridge,loader])=>{
    createCollectionGame=bridge.createCollectionGame;return loader.loadOddLaws();
  }).then(modules=>{
    collectionModules=modules;collectionLoadError='';
    return modules;
  }).catch(error=>{collectionLoadError=error.message;throw error;}).finally(()=>{collectionLoading=null;});
  return collectionLoading;
}
function prepareCollectionModules() {
  if(collectionModules||collectionLoading||collectionLoadError)return;
  void ensureCollectionModules().then(()=>{if(state.gameId===ODD_LAWS_GAME_ID)render();}).catch(()=>{if(state.gameId===ODD_LAWS_GAME_ID)render();});
}
function closeCollectionTutorial() {
  collectionTutorialSerial++;
  collectionTutorialPending=false;
  collectionTutorial?.dispose();
  collectionTutorial=null;
}
async function openOddTutorial({replay=false}={}) {
  if(state.gameId!==ODD_LAWS_GAME_ID||state.busy||collectionTutorial||collectionTutorialPending)return;
  audio.unlock();
  const epoch=roomEpoch,serial=++collectionTutorialSerial;
  collectionTutorialPending=true;
  state.modal=null;state.error='';render();
  try{
    const [modules,{mountCollectionTutorial}]=await Promise.all([ensureCollectionModules(),import('/collection-tutorial.mjs?v=1')]);
    if(epoch!==roomEpoch||serial!==collectionTutorialSerial||state.gameId!==ODD_LAWS_GAME_ID)return;
    collectionTutorial=mountCollectionTutorial({
      shell:app,createTutorial:modules.createTutorial,rules:modules.rules,assets:modules.assets,sound:audio,
      preferences:{reducedMotion:motionPreference.matches},replay,
      onClose:()=>{collectionTutorial=null;if(document.activeElement===document.body)app.querySelector('[data-action="odd-tutorial"]')?.focus({preventScroll:true});},
    });
  }catch(error){if(epoch===roomEpoch&&serial===collectionTutorialSerial){state.error=error.message;render();}}
  finally{if(serial===collectionTutorialSerial)collectionTutorialPending=false;}
}
function renderCollectionMatch() {
  const identity=[state.code,state.role,state.playerId||'',token()||''].join(':');
  if(collectionIdentity!==identity||!app.querySelector('#collection-game-root')){
    releaseCollectionGame();collectionIdentity=identity;
    app.innerHTML=`<div class="app-shell collection-match ${state.role==='player'?'is-controller':''}"><div id="collection-chrome"></div><div id="collection-notices"></div><main id="collection-game-root"></main><div id="collection-room-actions"></div></div><div id="collection-overlays"></div>`;
  }
  $('#collection-chrome').innerHTML=header({titleOnly:state.role==='host'&&collectionStyles?.loaded});
  $('#collection-notices').innerHTML=notices();
  $('#collection-room-actions').innerHTML=state.room?.phase==='finished'&&state.role==='host'?`<button class="button" data-action="rematch" ${state.busy?'disabled':''}>${icon('reset')} Start a new council</button>`:'';
  app.querySelector('.collection-match').classList.toggle('has-room-actions',!!$('#collection-room-actions').firstElementChild);
  const overlays=$('#collection-overlays'),hadModal=!!overlays.querySelector('.modal'),markup=modal();
  if(markup!==collectionModalHTML){
    const focused=document.activeElement;
    const focusSelector=overlays.contains(focused)?focused.id?'#'+CSS.escape(focused.id):focused.dataset?.action?'[data-action="'+CSS.escape(focused.dataset.action)+'"]':null:null;
    const selection=focused?.tagName==='INPUT'?{start:focused.selectionStart,end:focused.selectionEnd}:null;
    overlays.innerHTML=markup;collectionModalHTML=markup;
    if(state.modal&&!hadModal)requestAnimationFrame(()=>$('.modal button')?.focus({preventScroll:true}));
    else if(focusSelector){const control=overlays.querySelector(focusSelector);if(control&&!control.disabled){control.focus({preventScroll:true});if(selection)try{control.setSelectionRange(selection.start,selection.end);}catch{}}}
  }
  const root=$('#collection-game-root');
  if(collectionModules&&!collectionLoadError&&!collectionStyles){
    const styles=collectionModules.prepareStyles(document,state.role);
    collectionStyles=styles;
    styles.ready.then(()=>{
      if(collectionStyles===styles){styles.loaded=true;render();}
    },error=>{
      if(collectionStyles===styles){styles.release();collectionStyles=null;collectionLoadError=error.message;render();}
    });
  }
  if(!collectionStyles?.loaded){
    root.innerHTML=collectionLoadError?`<section class="collection-loading" role="alert"><h1>The council could not open.</h1><p>${esc(collectionLoadError)}</p><button class="button" data-action="retry-collection">Try again</button><button class="text-button" data-action="home">Back to the collection</button></section>`:'<div class="collection-loading" role="status"><span class="spinner"></span> Preparing the council…</div>';
    prepareCollectionModules();return;
  }
  audio.setScore(ODD_LAWS_GAME_ID,collectionModules.score);
  if(!collectionGame){
    try{
      const initialConnection={state:state.network,...(state.networkMessage?{message:state.networkMessage}:{})};
      collectionGame=createCollectionGame({
        root,mount:collectionModules.mount,createRoomClient:collectionModules.createRoomClient,
        viewer:state.role==='player'?{role:'player',playerId:state.playerId}:{role:'host'},
        code:state.code,token:token(),initialRoom:state.room,
        rules:collectionModules.rules,assets:collectionModules.assets,sound:audio,
        preferences:{reducedMotion:motionPreference.matches},
        onRoom:room=>{if(collectionIdentity===identity)applyRoom(room);},
        onStatus:status=>{if(collectionIdentity===identity){state.network=status.state;state.networkMessage=status.message||'';updateConnectionChrome();}},
        onExit:()=>goHome(),
      });
      collectionGame.setConnection(initialConnection);
    }catch(error){collectionLoadError=error.message;root.innerHTML=`<div class="collection-loading" role="alert">${esc(error.message)}</div>`;}
  }else collectionGame.update(state.room);
}
function sofaLoadingView() {
  return engineLoadFailed?'<main class="collection-loading" role="alert"><h1>The board could not load.</h1><p>Your room is saved. Reload this screen to try again.</p><button class="button" data-action="reload-view">Reload game</button></main>':'<main class="collection-loading" role="status"><span class="spinner"></span> Preparing your board…</main>';
}
function render() {
  const current=game();
  const odd=state.gameId===ODD_LAWS_GAME_ID, orchard=state.gameId===GRAVITY_ORCHARD_GAME_ID;
  const menu=usesMenuScore();
  if(menu)audio.setScore('sofa-menu');
  else if(orchard){if(orchardModules){audio.setScore(GRAVITY_ORCHARD_GAME_ID,orchardModules.score);if(state.view!=='game')audio.setContext({scoreScene:'menu'});}else if(!orchardLoading&&!orchardLoadError)void ensureOrchardModules().then(()=>{if(state.gameId===GRAVITY_ORCHARD_GAME_ID)render();}).catch(()=>{});}
  else if(!odd)audio.setScore(SOFA_GAME_ID);
  else if(collectionModules){audio.setScore(ODD_LAWS_GAME_ID,collectionModules.score);if(state.view!=='game')audio.setScene('lobby');}
  else if(gameById(state.gameId).status==='playable')prepareCollectionModules();
  audio.setContext({role:isPhoneAudio()?'player':state.role,view:odd&&!collectionModules&&!menu?'loading':state.view,phase:current?.phase,forecastType:current?.forecast?.type,round:current?.round,maxRounds:current?.maxRounds});
  if(orchard&&state.view==='game'&&current){renderOrchardMatch();return;}
  if(orchardGame||orchardIdentity)releaseOrchardGame();
  if(odd&&state.view==='game'&&current){renderCollectionMatch();return;}
  if(collectionGame||collectionIdentity)releaseCollectionGame();
  const focused = document.activeElement;
  const hadModal = !!app.querySelector('.modal');
  const focusSelector = focused?.id ? '#'+CSS.escape(focused.id) : focused?.dataset?.action ? '[data-action="'+CSS.escape(focused.dataset.action)+'"]'+['command','direction','player','index','axis','value'].filter(k=>focused.dataset[k]!==undefined).map(k=>'[data-'+k+'="'+CSS.escape(focused.dataset[k])+'"]') .join('') : null;
  const inputState = focused?.tagName === 'INPUT' ? {value:focused.value,start:focused.selectionStart,end:focused.selectionEnd} : null;
  const old = new Map([...app.querySelectorAll('[data-piece]')].map(n=>[n.dataset.piece,n.getBoundingClientRect()]));
  let content=collection();
  if(state.view==='detail')content=gameDetail();
  if(state.view==='join') content=joinScreen();
  if(state.view==='lobby') content=state.role==='host'?lobby():waiting();
  if(state.view==='game' && game())content=engine?(state.role==='player'?controller(game()):tvBoard(game())):sofaLoadingView();
  if(state.view==='tutorial' && game())content=engine?tutorialView():sofaLoadingView();
  app.innerHTML=`<div class="app-shell ${state.role==='player'?'is-controller':''} ${state.view==='game'?'is-match':''} ${state.view==='tutorial'?'is-tutorial':''} view-${state.view}">${header()}${notices()}${content}${footer()}</div>${modal()}`;
  if(old.size && !motionPreference.matches) {
    app.querySelectorAll('[data-piece]').forEach(n=>{
      const before=old.get(n.dataset.piece), after=n.getBoundingClientRect();
      if(!before || Math.abs(before.width-after.width)>5) return;
      const x=before.x-after.x,y=before.y-after.y;
      if(Math.abs(x)+Math.abs(y)>2) n.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:Math.abs(x)+Math.abs(y)>500?650:n.dataset.piece?.startsWith('pawn-')?190:350,easing:'cubic-bezier(.2,.7,.25,1)'});
    });
  }
  enhanceMotion(app,{game:game(),role:state.role,playerId:state.playerId,mode:state.mode});
  if(state.view==='lobby'&&state.role==='host') drawQr();
  if(state.modal && !hadModal) requestAnimationFrame(()=>$('.modal button')?.focus({preventScroll:true}));
  else if(focusSelector){const next=app.querySelector(focusSelector);if(next&&!next.disabled){if(inputState&&next.tagName==='INPUT'){next.value=inputState.value;try{next.setSelectionRange(inputState.start,inputState.end);}catch{}}next.focus({preventScroll:true});}}
}
function announce(text) { $('#announcer').textContent=text; }
function openModal(name) {const el=document.activeElement;modalPreviousFocus=el?.id?'#'+CSS.escape(el.id):el?.dataset?.action?'[data-action="'+CSS.escape(el.dataset.action)+'"]':null;state.modal=name;render();}
function closeModal() {if(state.modal==='results')state.resultDismissed=true;state.modal=null;render();if(modalPreviousFocus)app.querySelector(modalPreviousFocus)?.focus?.({preventScroll:true});}
function token() { return state.role==='host'?state.hostToken:state.playerToken; }
function credentialsKey(code) { return 'sofa-room:'+code; }
function readCredentials(code) {const prev=stored(credentialsKey(code),{});const playerTokens={...(prev.playerTokens||{})};if(prev.playerId&&prev.playerToken&&!playerTokens[prev.playerId])playerTokens[prev.playerId]=prev.playerToken;return {...prev,playerTokens};}
function saveCredentials() {const prev=readCredentials(state.code);const playerTokens={...prev.playerTokens};if(state.playerId&&state.playerToken)playerTokens[state.playerId]=state.playerToken;persist(credentialsKey(state.code),{hostToken:state.hostToken||prev.hostToken,playerTokens,lastSeat:state.playerId||prev.lastSeat||prev.playerId});if(transport.mode==='lan')persist(LAST_SESSION_KEY,{code:state.code,role:state.role,playerId:state.playerId,gameId:state.gameId});}
async function api(path, options={}) {
  const headers={'Content-Type':'application/json'};
  const requestToken=Object.hasOwn(options,'token')?options.token:token();
  if(requestToken)headers.Authorization='Bearer '+requestToken;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),11000);
  const abort=()=>controller.abort();
  if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  try {
    const response=await fetch(path,{method:options.method||'GET',headers,body:options.body?JSON.stringify(options.body):undefined,cache:'no-store',signal:controller.signal});
    let body;
    try{body=await response.json();}catch{throw new Error(response.status===401||response.status===403||response.redirected||response.headers.get('content-type')?.includes('text/html')?'Open the game in your browser and sign in, then try again.':'The room could not be reached. Please try again.');}
    if(!response.ok){const message=typeof body.error==='string'?body.error:(body.error?.message||body.message||'That move could not be completed.');const err=new Error(message);err.status=response.status;err.code=body.code;throw err;}
    return body;
  } catch(err) {
    if(err.name==='AbortError')throw new Error('The room is taking a little longer to respond. Please try again.');
    throw err;
  } finally {clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);}
}
function applyRoom(room,force=false) {
  if(!room || typeof room!=='object')return;
  if(!force && state.room && room.revision < state.room.revision)return;
  const previous=state.room;
  state.room=room;
  if(room.gameId)state.gameId=room.gameId;
  if(room.code)state.code=room.code;
  if(state.role && (state.role==='host'||state.playerToken))state.view=state.mode==='tutorial'?'tutorial':room.phase==='lobby'?'lobby':'game';
  if(state.gameId===GRAVITY_ORCHARD_GAME_ID){render();return;}
  if(state.gameId===ODD_LAWS_GAME_ID){
    if(room.phase==='playing'&&previous?.phase==='finished'){state.modal=null;state.resultDismissed=false;}
    if(room.state?.phaseId!==previous?.state?.phaseId)announce(room.state?.stage==='council'?`Session ${room.state.session}. Council is open.`:room.state?.activePlayer?`${NAMES[room.state.activePlayer]}'s turn.`:'The final scores are in.');
    render();return;
  }
  const sameGame=previous?.state&&room.state&&previous.state.seed===room.state.seed;
  const openingAnnouncement=!sameGame&&room.state?.version>=3&&room.state.round===1&&room.state.actionNumber===0?`${NAMES[room.state.firstPlayer]} starts · ${NAMES[room.state.firstPlayer==='jon'?'lydia':'jon']} gets +1 point`:'';
  if(openingAnnouncement&&state.mode!=='tutorial'){
    state.turnToast=openingAnnouncement;state.eventToast=openingAnnouncement;
    clearTimeout(eventTimer);
    eventTimer=setTimeout(()=>{state.eventToast='';state.turnToast='';render();},4200);
  }
  const changedAction=sameGame&&previous.state.actionNumber!==room.state.actionNumber;
  const newCatEvent=sameGame&&room.state.lastEvent&&(previous.state.lastEvent?.round!==room.state.lastEvent.round||previous.state.lastEvent?.description!==room.state.lastEvent.description);
  if(changedAction){
    const next=room.state,old=previous.state,ids=['jon','lydia'];
    if(next.phase==='finished'&&old.phase!=='finished')audio.effect('win');
    else if(newCatEvent)audio.effect('cat');
    else if(ids.some(id=>next.players[id].banked>old.players[id].banked))audio.effect('bank');
    else if(ids.some(id=>next.players[id].carried>old.players[id].carried))audio.effect('collect');
    else if(ids.some(id=>next.players[id].lures<old.players[id].lures))audio.effect('lure');
    else if(ids.some(id=>next.players[id].row!==old.players[id].row||next.players[id].col!==old.players[id].col))audio.effect('move');
  }
  if(room.state?.lastEvent) {
    const ev=room.state.lastEvent;
    const key=ev.round+':'+ev.description;
    if(engine && previous?.state && state.lastEventKey!==key && state.view==='game'&&!state.modal&&state.mode!=='tutorial') {
      state.turnToast=room.state.phase==='playing'?`Round ${room.state.round} · ${NAMES[engine.roundStarter(room.state)]} starts`:'The final scores are in';
      state.eventToast=forecastInfo({forecast:ev}).detail+' '+state.turnToast;
      clearTimeout(eventTimer);
      eventTimer=setTimeout(()=>{state.eventToast='';state.turnToast='';render();},3200);
    }
    state.lastEventKey=key;
  }
  if(room.phase==='finished' && previous?.phase!=='finished' && !state.resultDismissed)state.modal='results';
  if(room.phase==='playing' && previous?.phase==='finished'){state.modal=null;state.resultDismissed=false;state.lastEventKey='';}
  if(openingAnnouncement)announce(openingAnnouncement);
  else if(room.state?.activePlayer!==previous?.state?.activePlayer||room.state?.round!==previous?.state?.round)announce(room.state?.activePlayer?`Round ${room.state.round}. ${NAMES[room.state.activePlayer]}'s turn. Two actions.`:'The game is finished.');
  render();
}

function releaseActionQueue() {
  if(actionQueue?.pendingCount&&state.room?.code===actionQueue.confirmedRoom.code)state.room=actionQueue.confirmedRoom;
  actionQueue?.dispose();actionQueue=null;state.pendingActions=0;
}
function receiveNetworkRoom(room) {
  // SSE heartbeats may repeat the same projected envelope. Replacing the
  // controller DOM for those repeats can detach a finger/keyboard target and
  // reset a focused dialog even though no player-visible state has changed.
  const previous=state.room;
  if(previous&&room&&['code','gameId','revision','phase','expiresAt'].every(key=>previous[key]===room[key])&&
      JSON.stringify(previous.players)===JSON.stringify(room.players)&&JSON.stringify(previous.state)===JSON.stringify(room.state))return;
  if(state.gameId===GRAVITY_ORCHARD_GAME_ID&&orchardGame){state.room={...room,state:state.room?.state||room.state};orchardGame.receive(room);return;}
  if(state.gameId===ODD_LAWS_GAME_ID&&collectionGame){collectionGame.receive(room);return;}
  if(actionQueue&&state.role==='player')actionQueue.receive(room);
  else applyRoom(room);
}
function controllerQueue() {
  if(actionQueue)return actionQueue;
  const code=state.code,epoch=roomEpoch,id=state.playerId,credential=state.playerToken;
  actionQueue=createActionQueue({
    room:state.room,playerId:id,apply:engine.applyAction,makeId:uid,
    send:async payload=>{
      let room;
      try {room=await api('/api/rooms/'+code+'/action',{method:'POST',body:payload,token:credential});}
      catch(error){
        if((error.status&&error.status<500)||epoch!==roomEpoch||code!==state.code||id!==state.playerId)throw error;
        // The same ID is retained if a response is lost: the server applies it once.
        room=await api('/api/rooms/'+code+'/action',{method:'POST',body:payload,token:credential});
      }
      if(epoch===roomEpoch&&code===state.code)state.network='connected';
      return room;
    },
    onView:(room,pending)=>{
      if(epoch!==roomEpoch||code!==state.code||id!==state.playerId)return;
      state.pendingActions=pending;applyRoom(room,true);
    },
    onError:error=>{
      if(epoch!==roomEpoch||code!==state.code)return;
      state.error=error.status===409?'The board changed. Your controller is catching up.':error.message;
      if(!error.status)state.network='offline';
      render();void poll(true);
    },
  });
  return actionQueue;
}
async function poll(force=false) {
  if(isLocal()||!state.code||pollInFlight||(state.view==='join'&&!hasCurrentRoom()))return;
  const now=Date.now();
  const interval=document.hidden?5000:orchardGame?10000:streamConnected?10000:state.room?.phase==='playing'?250:900;
  if(!force&&now-lastPollAt<interval)return;
  lastPollAt=now;
  const requestedCode=state.code,requestedEpoch=roomEpoch,abort=new AbortController();
  pollAbort=abort;pollInFlight=true;
  try {
    const room=await api('/api/rooms/'+encodeURIComponent(requestedCode),{signal:abort.signal});
    if(requestedEpoch!==roomEpoch||requestedCode!==state.code)return;
    const seats = r => ['jon','lydia'].map(id=>[!!r?.players?.[id]?.joined,r?.players?.[id]?.connected!==false]);
    const changed=!state.room||room.revision!==state.room.revision||room.state?.actionNumber!==state.room.state?.actionNumber||JSON.stringify(seats(room))!==JSON.stringify(seats(state.room))||state.network!=='connected';
    if(!orchardGame)setNetworkConnection('connected');
    if(changed||force)receiveNetworkRoom(room);
  } catch(err) {
    if(requestedEpoch!==roomEpoch||requestedCode!==state.code)return;
    const terminal=[401,403,404,410].includes(err.status)||err.code==='invalid_token'||/sign in/i.test(err.message);
    const next=terminal?streamTerminalStatus||{state:'error',message:
      err.status===404||err.status===410?'This room is no longer available. Return to the collection to create a fresh room.':err.message||'This room session ended. Rejoin from the game page.'}:{state:'offline'};
    const changed=state.network!==next.state||state.networkMessage!==(next.message||'');
    if(terminal)state.error=next.message;
    setNetworkConnection(next);
    if(terminal)stopPolling();
    if(changed||terminal)render();
  } finally {if(pollAbort===abort){pollInFlight=false;pollAbort=null;}}
}
function startPolling() {
  stopPolling({keepOrchard:true});lastPollAt=0;
  const code=state.code,epoch=roomEpoch;
  let richConnectionStatus=false;
  const updateConnection=connection=>{
    if(epoch!==roomEpoch||code!==state.code)return;
    const status=connectionStatus(connection);
    streamConnected=status.state==='connected';
    if(!orchardGame||status.state==='error')setNetworkConnection(status,{terminal:status.state==='error'});
    // Polling remains a fallback while a local stream reconnects.
    if(['offline','reconnecting'].includes(status.state)){lastPollAt=0;void poll(true);}
  };
  if(transport.realtime&&token())streamStop=subscribeRoom({code,token:token(),
    onRoom:room=>{if(epoch!==roomEpoch||code!==state.code)return;if(!orchardGame)setNetworkConnection('connected');receiveNetworkRoom(room);},
    onConnection:connection=>{
      // Older Sofa hosts provide only this string callback. WS2 invokes the
      // richer callback synchronously after it; prefer that safe message/state.
      queueMicrotask(()=>{if(!richConnectionStatus)updateConnection(connection);});
    },
    onStatus:status=>{richConnectionStatus=true;updateConnection(status);},
  });
  pollTimer=setInterval(()=>{void poll();},250);
}
function stopPolling({keepOrchard=false}={}) {
  closeCollectionTutorial();closeOrchardTutorial();closeSecureSetup();if(!keepOrchard)releaseOrchardGame();
  if(pollTimer)clearInterval(pollTimer);pollTimer=null;roomEpoch++;
  pollAbort?.abort();pollAbort=null;pollInFlight=false;
  streamStop?.();streamStop=null;streamConnected=false;streamTerminalStatus=null;releaseActionQueue();
  state.busy=false;
}
async function createRoom(mode='campaign') {
  if(state.busy||!canPlayGame(gameById(state.gameId)))return;
  if(state.gameId===SOFA_GAME_ID)rememberTutorialSeen();
  const epoch=roomEpoch,gameId=state.gameId;
  const current=()=>epoch===roomEpoch&&gameId===state.gameId;
  state.busy=true;state.error='';render();
  try {
    const room=await api('/api/rooms',{method:'POST',body:{gameId,...(gameId===GRAVITY_ORCHARD_GAME_ID?{options:{mode}}:{})}});
    if(!current())return;
    state.busy=false;
    state.role='host';state.mode='network';state.hostToken=room.hostToken;state.code=room.code;state.playerToken=null;state.playerId=null;state.resultDismissed=false;state.lastEventKey='';
    saveCredentials();history.replaceState({},'', '/?room='+encodeURIComponent(room.code));applyRoom(room,true);startPolling();
  }catch(err){if(current())state.error=err.message;}finally{if(current()){state.busy=false;render();}}
}
async function findRoom(code,preferredSeat=null,recovering=false) {
  code=code.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(code.length<4){state.error='Enter the room code shown on your TV.';render();return;}
  stopPolling();state.code=code;state.role='player';state.mode='network';state.room=null;state.playerId=null;state.playerToken=null;state.hostToken=null;state.error='';state.busy=true;state.view='join';
  const epoch=roomEpoch,current=()=>epoch===roomEpoch&&code===state.code;
  state.preferredSeat=['jon','lydia'].includes(preferredSeat)?preferredSeat:null;
  const creds=readCredentials(code),seat=state.preferredSeat||creds.lastSeat||creds.playerId;
  if(seat&&creds.playerTokens[seat]){state.playerToken=creds.playerTokens[seat];state.playerId=seat;}
  history.replaceState({},'', '/?join='+encodeURIComponent(code)+(state.preferredSeat?'&seat='+state.preferredSeat:''));render();
  try {
    const room=await api('/api/rooms/'+encodeURIComponent(code));
    if(!current())return;
    state.busy=false;applyRoom(room,true);if(state.playerToken)saveCredentials();startPolling();
  }
  catch(err){
    if(!current())return;
    const unavailable=[401,403,404,410].includes(err.status);
    if(unavailable&&stored(LAST_SESSION_KEY)?.code===code)persist(LAST_SESSION_KEY,null);
    if(recovering&&unavailable){goHome();state.notice='Your saved room is no longer available. Choose a game to start a new one.';render();}
    else {
      if(err.status===401||err.status===403){state.playerToken=null;state.playerId=null;}
      state.error=err.message;
    }
  }
  finally {
    if(current()){
      state.busy=false;render();
      const input=!hasCurrentRoom()&&$('#room-input');
      if(input){input.value=code;input.focus({preventScroll:true});input.select();}
    }
  }
}
async function claimPlayer(id) {
  if(state.busy||!hasCurrentRoom())return;
  const code=state.code,epoch=roomEpoch,current=()=>epoch===roomEpoch&&code===state.code;
  state.busy=true;state.error='';render();
  try {
    const room=await api('/api/rooms/'+code+'/join',{method:'POST',body:{playerId:id,clientId}});
    if(!current())return;
    state.busy=false;state.playerId=id;state.preferredSeat=id;state.playerToken=room.playerToken;state.role='player';saveCredentials();history.replaceState({},'', '/?join='+encodeURIComponent(code)+'&seat='+id);applyRoom(room);startPolling();audio.effect('join');
  }catch(err){if(current())state.error=err.message;}finally{if(current()){state.busy=false;render();}}
}
async function startGame(rematch=false) {
  if(state.busy)return;
  if(state.mode==='practice'){await startPractice();return;}
  const code=state.code,epoch=roomEpoch,current=()=>epoch===roomEpoch&&code===state.code;
  state.busy=true;state.error='';render();
  try{
    const room=await api('/api/rooms/'+code+'/'+(rematch?'rematch':'start'),{method:'POST',body:{}});
    if(!current())return;
    state.busy=false;state.resultDismissed=false;state.preview=false;state.modal=null;state.lastEventKey='';applyRoom(room);audio.effect('join');
  }
  catch(err){if(current())state.error=err.message;}finally{if(current()){state.busy=false;render();}}
}
async function startPractice() {
  rememberTutorialSeen();
  stopPolling();state.busy=true;state.error='';render();
  const epoch=roomEpoch;
  try {
    await engineReady;
    if(epoch!==roomEpoch)return;
    const g=engine.createGame({seed:uid(),maxRounds:10});
    state.mode='practice';state.gameId=SOFA_GAME_ID;state.role='host';state.code='';state.hostToken=null;state.playerToken=null;state.playerId=null;state.modal=null;state.resultDismissed=false;state.lastEventKey='';state.preview=false;state.tutorial=null;
    state.room=null;history.replaceState({},'', '/?game='+SOFA_GAME_ID+'&practice=1');applyRoom({phase:g.phase,state:g,revision:0,players:{jon:{joined:true,connected:true},lydia:{joined:true,connected:true}}},true);state.view='game';audio.effect('join');
  }catch(err){if(epoch===roomEpoch)state.error='Practice could not start: '+err.message;}finally{if(epoch===roomEpoch){state.busy=false;render();}}
}

async function sendAction(action) {
  if(state.busy)return;
  if(state.mode==='tutorial'){await tutorialAction(action);return;}
  const g=game();if(!g)return;
  const id=state.mode==='practice'?g.activePlayer:state.playerId;
  if(!id)return;
  state.error='';state.preview=false;state.modal=null;
  if(state.mode==='network'){
    if(state.network!=='connected'){state.error='Waiting for your controller to reconnect.';render();return;}
    const epoch=roomEpoch,code=state.code;
    try{await engineReady;if(epoch===roomEpoch&&code===state.code&&id===state.playerId)controllerQueue().dispatch(action);}
    catch(error){if(epoch===roomEpoch&&code===state.code){state.error=error.message;render();}}
    return;
  }
  state.busy=true;
  try {
    const next=engine.applyAction(g,id,action);
    applyRoom({...state.room,state:next,phase:next.phase,revision:state.room.revision+1},true);
  }catch(err){state.error=err.message;}
  finally{state.busy=false;render();}
}
async function drawQr() {
  const target=$('#room-qr');if(!target)return;
  try {
    if(typeof window.QRCode==='function' && window.QRCode.CorrectLevel) {target.innerHTML='';new window.QRCode(target,{text:joinUrl(),width:150,height:150,colorDark:'#49362d',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});}
    else if(window.QRCode?.toCanvas){target.innerHTML='<canvas></canvas>';await window.QRCode.toCanvas(target.firstChild,joinUrl(),{width:150,margin:0,color:{dark:'#49362d',light:'#ffffff'}});}
    else if(typeof window.qrcode==='function'){const qr=window.qrcode(0,'M');qr.addData(joinUrl());qr.make();target.innerHTML=qr.createSvgTag({cellSize:3,margin:12,scalable:true});}
  }catch{}
}
function goHome() {
  state.quietMenu=isPhoneAudio();
  persist(LAST_SESSION_KEY,null);
  stopPolling();clearTimeout(eventTimer);tutorialReturn=null;clearTutorialReturn();state.view='collection';state.role=null;state.mode='network';state.code='';state.room=null;state.hostToken=null;state.playerToken=null;state.playerId=null;state.error='';state.notice='';state.modal=null;state.preview=false;state.eventToast='';state.turnToast='';state.resultDismissed=false;state.tutorial=null;history.replaceState({},'', '/');render();
}
function openGame(id){persist(LAST_SESSION_KEY,null);stopPolling();clearTimeout(eventTimer);state.eventToast='';state.turnToast='';state.gameId=gameById(id).id;state.view='detail';state.mode='network';state.role=null;state.code='';state.room=null;state.playerToken=null;state.hostToken=null;state.playerId=null;state.modal=null;state.error='';history.replaceState({},'', '/?game='+encodeURIComponent(state.gameId));render();window.scrollTo({top:0,behavior:'instant'});}
// A welcoming theme starts on an intentional interaction, never on page load.
// Leaving a phone controller retains its quiet role while browsing the shelf.
app.addEventListener('pointerdown',event=>{if(event.button===0&&event.isPrimary!==false&&usesMenuScore()&&!isPhoneAudio())audio.unlock();});
app.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&usesMenuScore()&&!isPhoneAudio())audio.unlock();});
app.addEventListener('click', async event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const a=button.dataset.action;
  if(button.closest('#collection-game-root')&&collectionGame)return;
  if(['open-game','create','start','practice','tutorial','tutorial-restart','tutorial-host','tutorial-practice','audio','unlock-audio','toggle-music','toggle-effects','game-action','choose-lure','claim','rematch','tutorial-continue','tutorial-preview','orchard-tutorial','orchard-practice'].includes(a))audio.unlock();
  if(a==='backdrop'){if(event.target===button)closeModal();return;}
  if(a==='home'){if(orchardGame){const result=await orchardGame.pause('requested');if(!result.accepted)return;}if(state.mode==='tutorial')exitTutorial();else if(state.room)openModal('leave');else{goHome();playMenuEffect('menu-back');}}
  if(a==='open-game'){openGame(button.dataset.game);playMenuEffect('menu-select');}
  if(a==='leave'){goHome();playMenuEffect('menu-back');}
  if(a==='rules'){if(state.gameId===GRAVITY_ORCHARD_GAME_ID)await openOrchardTutorial();else openModal(state.gameId===ODD_LAWS_GAME_ID?'odd-rules':'rules');}
  if(a==='orchard-tutorial')await openOrchardTutorial();
  if(a==='orchard-practice')await createRoom('practice');
  if(a==='retry-orchard'){orchardLoadError='';render();}
  if(a==='secure-setup')await openSecureSetup();
  if(a==='secure-link'){secureJoin=!secureJoin;render();}
  if(a==='odd-tutorial')await openOddTutorial({replay:button.dataset.replay==='true'});
  if(a==='close-modal'){const confirm=usesMenuScore()&&state.modal==='audio';closeModal();if(confirm)playMenuEffect('menu-confirm');}
  if(a==='reload-view'){location.reload();return;}
  if(a==='retry-collection'){collectionLoadError='';render();}
  if(a==='dismiss-notice'){state.error='';state.notice='';render();}
  if(a==='audio')openModal('audio');
  if(a==='unlock-audio'){audio.unlock();render();}
  if(a==='toggle-music'){audio.setMusic(button.checked);render();}
  if(a==='toggle-effects'){audio.setEffects(button.checked);if(button.checked){if(usesMenuScore())playMenuEffect('menu-confirm');else audio.effect(state.gameId===ODD_LAWS_GAME_ID?'coin':'move');}render();}
  if(a==='tutorial'||a==='tutorial-restart')await startTutorial();
  if(a==='tutorial-exit')exitTutorial();
  if(a==='tutorial-continue')tutorialContinue();
  if(a==='tutorial-preview'&&state.tutorial?.step===6){state.preview=true;advanceTutorial();}
  if(a==='tutorial-host'){exitTutorial('detail');await createRoom();}
  if(a==='tutorial-practice'){exitTutorial('detail');await startPractice();}
  if(a==='dismiss-tutorial'){rememberTutorialSeen();render();}
  if(a==='fullscreen'){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{state.notice='Use your browser’s full-screen control to fill the TV.';render();}}
  if(a==='create')await createRoom();
  if(a==='join-menu'){persist(LAST_SESSION_KEY,null);stopPolling();state.view='join';state.role='player';state.code='';state.room=null;state.error='';render();setTimeout(()=>$('#room-input')?.focus(),50);}
  if(a==='different-room'){persist(LAST_SESSION_KEY,null);stopPolling();state.code='';state.playerId=null;state.playerToken=null;state.room=null;state.view='join';state.error='';history.replaceState({},'', '/');render();}
  if(a==='switch-seat'){stopPolling();state.playerId=null;state.playerToken=null;state.preferredSeat=null;state.view='join';state.error='';state.modal=null;history.replaceState({},'', '/?join='+encodeURIComponent(state.code));render();}
  if(a==='claim')await claimPlayer(button.dataset.player);
  if(a==='start')await startGame();
  if(a==='practice')await startPractice();
  if(a==='rematch')await startGame(true);
  if(a==='preview'){state.preview=!state.preview;render();}
  if(a==='toggle-map'){state.mapOpen=!state.mapOpen;render();}
  if(a==='local-play')openModal('local');
  if(a==='lure'){state.lureDraft={...game().forecast};openModal('lure');}
  if(a==='lure-axis'){state.lureDraft={...(state.lureDraft||game().forecast),axis:button.dataset.axis};render();}
  if(a==='lure-direction'){state.lureDraft={...(state.lureDraft||game().forecast),direction:Number(button.dataset.value)};render();}
  if(a==='results')openModal('results');
  if(a==='choose-lure'){const command={type:'lure',index:Number(button.dataset.index)};if(game().version>=2&&state.mode!=='tutorial'){command.axis=state.lureDraft.axis;command.direction=state.lureDraft.direction;}await sendAction(command);}
  if(a==='game-action'){const command={type:button.dataset.command};if(button.dataset.direction)command.direction=button.dataset.direction;await sendAction(command);}
  if(a==='copy-link'){try{await navigator.clipboard.writeText(joinUrl());state.notice='Phone link copied. Open it on each phone.';}catch{state.notice='Phone link: '+joinUrl();}render();}
});
app.addEventListener('submit',event=>{if(event.target.id==='join-form'){event.preventDefault();findRoom(new FormData(event.target).get('code')||'');}});
app.addEventListener('input',event=>{if(event.target.id==='volume-slider'){audio.unlock();audio.setVolume(Number(event.target.value)/100);const output=$('#volume-value');if(output)output.textContent=event.target.value+'%';const status=$('.audio-live-status');if(status)status.textContent=audioStatus();}});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&state.modal){closeModal();return;}
  if(state.modal&&event.key==='Tab'){
    const controls=[...document.querySelectorAll('.modal button:not(:disabled),.modal a,.modal input')];if(!controls.length)return;
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}return;
  }
  if(state.gameId!==SOFA_GAME_ID||state.modal||!['game','tutorial'].includes(state.view)||(!isLocal()&&state.role!=='player')||event.target.matches('input,textarea,select'))return;
  const direction=KEYS[event.key];if(direction){event.preventDefault();audio.unlock();const g=game(),id=isLocal()?g.activePlayer:state.playerId;if(legal(g,id).some(c=>c.type==='move'&&c.direction===direction))sendAction({type:'move',direction});}
});
motionPreference.addEventListener('change',()=>{
  const preferences={reducedMotion:motionPreference.matches};
  collectionTutorial?.setPreferences(preferences);
  if(collectionGame){
    try{collectionGame.setPreferences(preferences);}
    catch(error){releaseCollectionGame();state.error=error.message;render();}
  }else render();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.code){poll(true);}});
window.addEventListener('online',()=>{setNetworkConnection('reconnecting');poll(true);});
window.addEventListener('offline',()=>{setNetworkConnection('offline');render();});
const atlas=new Image();atlas.onload=()=>document.documentElement.classList.add('generated-art');atlas.src='/assets/characters.png';
render();
async function restoreHostRoom(code) {
  const creds=readCredentials(code);
  if(!creds.hostToken){await findRoom(code);return;}
  stopPolling();
  const epoch=roomEpoch,current=()=>epoch===roomEpoch&&code===state.code;
  state.code=code;state.role='host';state.hostToken=creds.hostToken;state.view='lobby';state.busy=true;render();
  try{
    const room=await api('/api/rooms/'+encodeURIComponent(code));
    if(!current())return;
    state.busy=false;
    history.replaceState({},'', '/?room='+encodeURIComponent(code));
    applyRoom(room,true);saveCredentials();startPolling();
  }catch(error){
    if(!current())return;
    if([401,403,404,410].includes(error.status)){
      goHome();state.notice='Your saved room is no longer available. Choose a game to start a new one.';render();
    }else{state.error=error.message;setNetworkConnection('offline');render();}
  }finally{if(current()){state.busy=false;render();}}
}
async function restoreLocalSession() {
  if(transport.mode!=='lan')return false;
  const previous=stored(LAST_SESSION_KEY);
  if(!previous)return false;
  if(!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(previous.code||'')||!['host','player'].includes(previous.role)||
      (previous.role==='player'&&!['jon','lydia'].includes(previous.playerId))){persist(LAST_SESSION_KEY,null);return false;}
  const creds=readCredentials(previous.code);
  const credential=previous.role==='host'?creds.hostToken:creds.playerTokens[previous.playerId];
  if(!credential){persist(LAST_SESSION_KEY,null);return false;}
  state.gameId=gameById(previous.gameId).id;
  if(previous.role==='host')await restoreHostRoom(previous.code);
  else await findRoom(previous.code,previous.playerId,true);
  return true;
}
async function init() {
  const params=new URLSearchParams(location.search);
  if(params.has('join')){await findRoom(params.get('join')||'',params.get('seat'));return;}
  if(params.has('room')) {
    const code=(params.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    await restoreHostRoom(code);return;
  }
  if(params.has('tutorial')){
    if(params.get('game')===GRAVITY_ORCHARD_GAME_ID){openGame(GRAVITY_ORCHARD_GAME_ID);await openOrchardTutorial();}
    else if(params.get('game')===ODD_LAWS_GAME_ID){openGame(ODD_LAWS_GAME_ID);await openOddTutorial();}
    else await startTutorial();
    return;
  }
  if(params.has('practice')){if(params.get('game')===GRAVITY_ORCHARD_GAME_ID){openGame(GRAVITY_ORCHARD_GAME_ID);await createRoom('practice');}else await startPractice();return;}
  if(params.has('game')){openGame(params.get('game'));return;}
  await restoreLocalSession();
}
let audioSnapshot='';
audio.subscribe(settings=>{const snapshot=JSON.stringify(settings);if(snapshot===audioSnapshot)return;audioSnapshot=snapshot;if(state.modal==='audio'&&document.activeElement?.id!=='volume-slider')render();});
engineReady.then(()=>{if(['game','tutorial'].includes(state.view))render();}).catch(()=>{});
init();
if(nativeSecureAvailable())void window.sofaDesktopSecureLan.getStatus().then(status=>{secureStatus=status;if(state.gameId===GRAVITY_ORCHARD_GAME_ID)render();}).catch(()=>{});
