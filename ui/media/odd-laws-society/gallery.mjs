import { BUILDINGS, LAWS, GUILDS, STATES, PROPS, imageEntries } from './contract.mjs';

const manifestUrl = new URL('./assets/manifest.json', location.href);
const manifest = await fetch(manifestUrl).then(response => {
  if (!response.ok) throw new Error(`Media manifest HTTP ${response.status}`);
  return response.json();
});
const title = text => text.replace(/-/g, ' ').replace(/\b[a-z]/g, x => x.toUpperCase());
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function img(entry, className = '') {
  const node = el('img', className);
  node.src = new URL(entry.src, manifestUrl).href;
  node.alt = entry.alt; node.width = entry.width; node.height = entry.height;
  node.decoding = 'async';
  node.dataset.source = entry.src;
  return node;
}
function card(entry, name, details = '', guild = null) {
  const article = el('article', 'asset-card');
  const stage = el('div', 'asset-stage');stage.append(img(entry));
  const caption = el('div', 'caption');caption.append(el('strong', '', name));
  if (guild) {
    const tag = el('span', 'guild-tag');tag.append(img(manifest.guilds[guild]), el('span', '', title(guild)));caption.append(tag);
  }
  if (details) caption.append(el('small', '', details));
  article.append(stage, caption);return article;
}
const catalog = document.querySelector('#catalog');
for (const term of [1, 2, 3]) {
  const heading = el('div', 'term-heading');heading.append(el('p', 'eyebrow', `TERM ${['I','II','III'][term - 1]}`), el('h3', '', ['Foundations','Institutions','Landmarks'][term - 1]), el('span', '', `Sessions ${term * 2 - 1}–${term * 2}`));
  const grid = el('div', 'building-grid');
  for (const building of BUILDINGS.filter(x => x.term === term)) grid.append(card(manifest.buildings[building.id], building.name, '', building.guild));
  catalog.append(heading, grid);
}

const characterRoot = document.querySelector('#characters');
for (const [name, states] of Object.entries(STATES)) {
  const row = el('section', 'character-row'), header = el('header');
  header.append(el('h3', '', name === 'lala' ? 'Lala · Council Chair' : `${title(name)} · Borough Delegate`), el('p', '', 'Independent flat illustrations; the interface supplies motion.'));
  const grid = el('div', 'character-grid');
  for (const state of states) {
    const entry = manifest.characters[name].states[state];
    grid.append(card(entry, state, entry.poseReuse || entry.reusedFrom ? 'Reused pose · declared in manifest' : 'Distinct illustrated state'));
  }
  row.append(header, grid);characterRoot.append(row);
}

const symbols = document.querySelector('#symbols');
symbols.append(el('h3', 'symbols-heading', 'Guild marks · 48 px'));
const guildGrid = el('div', 'symbol-grid guild-grid');
for (const guild of GUILDS) guildGrid.append(card(manifest.guilds[guild], title(guild)));
symbols.append(guildGrid, el('h3', 'symbols-heading', 'Law emblems · 80 px'));
const lawGrid = el('div', 'symbol-grid');
for (const law of LAWS) lawGrid.append(card(manifest.laws[law.id], law.name, title(law.category)));
symbols.append(lawGrid, el('h3', 'symbols-heading', 'Council & city props'));
const props = el('div', 'symbol-grid prop-grid');
for (const prop of PROPS) props.append(card(manifest.props[prop], title(prop)));
symbols.append(props);

const board = document.querySelector('#board');
const boardHeading = el('div', 'board-heading'), headingCopy = el('div');
headingCopy.append(el('p', 'eyebrow', 'A SOFA-SCALE MEDIA FIXTURE'),el('h2', '', 'Two boroughs. One very confident cat.'),el('p', '', '96 px city art · 144 px market art · labels stay crisp as interface text'));
const chair = el('div', 'chair'), chairText = el('p', '', 'Chair Lala');chairText.append(el('small', '', 'Order, please.'));
chair.append(img(manifest.characters.lala.states.idle),chairText);boardHeading.append(headingCopy, chair);board.append(boardHeading);
const boardLayout = el('div', 'board-layout');
function borough(name, ids) {
  const node = el('section', 'borough'), head = el('header', 'borough-heading');
  head.append(el('h3', '', `${title(name)}’s borough`), el('p', '', 'STATIC ART STUDY'));
  const grid = el('div', 'city-grid');
  for (const id of ids) {const plot = el('div', 'plot');plot.append(img(manifest.buildings[id]));grid.append(plot);}
  node.append(head, grid);return node;
}
const boardLaws = el('div', 'board-laws');
for (const id of ['small-shop-supremacy', 'fashionable-streets']) {
  const law = LAWS.find(x => x.id === id), node = el('div', 'law-board');
  node.append(el('p', 'eyebrow', title(law.category)),img(manifest.laws[id]),el('strong', '', law.name),el('small', '', 'Emblem shown at 72 px'));
  boardLaws.append(node);
}
boardLayout.append(borough('jon', ['corner-shop','button-workshop','petition-kiosk','night-market','clockwork-studio','public-library','grand-bazaar','grand-clock','observatory']), boardLaws,
  borough('lydia', ['tea-stall','pocket-theatre','community-garden','debate-hall','concert-pavilion','quilt-bridge','high-court','opera-house','lala-monument']));
board.append(boardLayout);
const marketHeading = el('div', 'market-heading');marketHeading.append(el('h3', '', 'The market, up close'),el('p', '', 'A complete term · six distinct silhouettes'));
const market = el('div', 'building-grid market');
for (const b of BUILDINGS.filter(x => x.term === 1)) market.append(card(manifest.buildings[b.id], b.name, '', b.guild));
board.append(marketHeading, market);

document.querySelector('#sound').innerHTML = `<div class="sound-layout"><div class="sound-copy"><p class="eyebrow">AN ORIGINAL CHAMBER COMEDY</p><h2>Lala Calls the House</h2><p>A recurring woodwind melody, a plucked accompaniment, and a bass with a sense of ceremony. The middle section steps into D minor before the familiar theme returns home.</p><div class="form" aria-label="AABA form: eight bars per section"><div>A<small>THE QUESTION</small></div><div>A<small>ONCE MORE</small></div><div>B<small>A DIFFERENT VIEW</small></div><div>A<small>HOME AGAIN</small></div></div><p>32 bars · F major · 4/4 · 100 BPM<br>One melody across lobby, council, all three terms, and celebration.</p><div class="sound-links"><a href="score.mjs">Score module</a><a href="effects.mjs">Effect cues</a><a href="COMPOSITION.md">Composition &amp; evidence notes</a></div></div><div><article class="track"><h3>The complete theme</h3><p>A full AABA cycle, rendered from the authored events. Press Play to listen.</p><audio controls preload="metadata" src="audio-evidence/lala-calls-the-house-play.mp3" aria-label="Play the full original Odd Laws theme"></audio></article><article class="track"><h3>A quieter council</h3><p>The same tune with a quieter, sparser accompaniment for private deliberation.</p><audio controls preload="metadata" src="audio-evidence/lala-calls-the-house-council.mp3" aria-label="Play the council arrangement"></audio></article><p class="evidence-note">These files are review renders. The integrator connects the pure score data to Sofa Arcade’s existing audio engine. Browser decode, timing, and numeric level checks are recorded separately from human listening or physical TV testing.</p></div></div>`;

let current = 'board';
const tabs = [...document.querySelectorAll('[data-tab]')];
function selectTab(id, focus = false) {
  if (!tabs.some(t => t.dataset.tab === id)) id = 'board';
  current = id;
  for (const button of tabs) {
    const selected = button.dataset.tab === id;button.setAttribute('aria-selected', String(selected));button.tabIndex = selected ? 0 : -1;
    document.querySelector(`#panel-${button.dataset.tab}`).hidden = !selected;
    if (selected && focus) button.focus();
  }
  // Preview files use native media controls, never another AudioContext/scheduler.
  if (id !== 'sound') document.querySelectorAll('audio').forEach(audio => audio.pause());
  history.replaceState(null, '', `#${id}`);
}
tabs.forEach((button, index) => {
  button.addEventListener('click', () => selectTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();selectTab(tabs[next].dataset.tab, true);
  });
});
document.querySelector('#surface').addEventListener('change', event => { document.body.dataset.surface = event.target.value; });
document.addEventListener('visibilitychange', () => { if (document.hidden) document.querySelectorAll('audio').forEach(audio => audio.pause()); });
selectTab(location.hash.slice(1));
const images = [...document.images];
await Promise.all(images.map(node => node.decode()));
const count = imageEntries(manifest).length;
const placeholders = imageEntries(manifest).filter(([, entry]) => entry.status === 'placeholder').length;
document.querySelector('#status').textContent = `${count} manifest image entries · all loaded locally · ${placeholders ? `${placeholders} placeholders` : 'no placeholders'}`;
document.documentElement.dataset.ready = 'true';
window.mediaReview = Object.freeze({ manifest, manifestUrl: manifestUrl.href, imageCount: count, get tab() { return current; } });
