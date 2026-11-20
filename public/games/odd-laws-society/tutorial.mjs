import { escapeHtml as esc, icon, buildingArt, buildingById, guildLabel, character } from './shared.mjs';

const KEY = 'sofa-arcade.odd-laws-tutorial.v1';
export const TUTORIAL_LESSONS = Object.freeze([
  { title: 'Welcome to your little city.', short: 'Welcome', text: 'Nine plots. Four actions. Six sessions. Build a borough and persuade the council to favour it.' },
  { title: 'Give your borough a beginning.', short: 'Build', text: 'Choose a district, then an empty plot. Pay its exact cost and keep its printed prestige. Placement is permanent.' },
  { title: 'A useful day’s work.', short: 'Work', text: 'Work earns 3 coins. Honest Wages would make it 4. An action spent earning is also a chance for your opponent to buy first.' },
  { title: 'Three buildings. One street.', short: 'Streets', text: 'A horizontal row earns 2 prestige when its third building makes either one guild or three different guilds. Two plus one earns nothing.' },
  { title: 'An established city pays back.', short: 'Income', text: 'At the start of sessions 2–6, both players gain 3 coins, up to 2 more from income icons, and 1 influence (cap 6). There is no income before session 1 or after session 6.' },
  { title: 'The same law. Different cities.', short: 'Laws', text: 'A Civic law rewards both cities at the end of the session, at most 2 prestige each. Compare the two proposals against these public boroughs.' },
  { title: 'Seal it. Mean it.', short: 'Council', text: 'Choose a bill or Keep current, and bid up to 3 influence. A vote stays private until both players seal. Both bids are spent, including the losing bid.' },
  { title: 'A little political capital.', short: 'Lobby', text: 'Lobby earns 2 influence, up to the cap of 6. It costs your action; unused influence is worth no final prestige.' },
  { title: 'Put on a splendid little show.', short: 'Festival', text: 'Once each session, spend 3 coins for 3 prestige. An established Festival icon adds 1, regardless of how many such icons you own.' },
  { title: 'Every point has a place.', short: 'Score', text: 'Add Buildings, Streets, Festivals, Civic awards, and Treasury. Treasury is one point per 3 coins, capped at 4. Exactly equal totals share the victory.' },
]);

function tryStorage(candidate) {
  if (candidate) return candidate;
  try { return globalThis.localStorage; } catch { return null; }
}

function defaultProgress() { return { version: 1, step: 0, done: false, choice: null, plot: null, inspected: null }; }

function readProgress(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) || 'null');
    if (raw?.version !== 1 || !Number.isInteger(raw.step) || raw.step < 0 || raw.step >= TUTORIAL_LESSONS.length) return defaultProgress();
    return { ...defaultProgress(), step: raw.step, done: raw.done === true, choice: typeof raw.choice === 'string' ? raw.choice : null, plot: Number.isInteger(raw.plot) && raw.plot >= 0 && raw.plot < 9 ? raw.plot : null, inspected: typeof raw.inspected === 'string' ? raw.inspected : null };
  } catch { return defaultProgress(); }
}

function meter(key, value, label) { return `<span class="ols-tutorial-meter">${icon(key)}<b>${value}</b><small>${label}</small></span>`; }

function miniCity(cells, ctx, { action, selected = null } = {}) {
  return `<div class="ols-tutorial-city" ${action ? 'role="group" aria-label="Practice city plots"' : 'aria-label="Practice city"'}>${Array.from({ length: 9 }, (_, index) => {
    const design = cells[index] && buildingById(ctx.rules, cells[index]);
    const markup = design ? `<span class="ols-tutorial-building">${buildingArt(design, ctx)}</span><small>${esc(design.name)}</small>` : `<span class="ols-tutorial-empty">+</span><small>Plot ${index + 1}</small>`;
    return action && !design ? `<button type="button" class="${selected === index ? 'selected' : ''}" data-action="${action}" data-plot="${index}" aria-label="Practice street ${Math.floor(index / 3) + 1}, plot ${index % 3 + 1}">${markup}</button>` : `<div${design ? ` data-guild="${design.guild}"` : ''}>${markup}</div>`;
  }).join('')}</div>`;
}

function feedback(text) { return `<div class="ols-tutorial-feedback" role="status">${icon('check')}<p>${text}</p></div>`; }

function lessonMarkup(state, ctx) {
  const { step, done, choice, plot, inspected } = state;
  if (step === 0) return `<div class="ols-tutorial-welcome"><div class="ols-tutorial-lala">${character('lala', 'idle', ctx)}</div><div><span class="ols-tutorial-quote">“A perfectly respectable society.”</span><span class="ols-tutorial-attribution">— Lala, self-appointed chair</span></div></div><div class="ols-tutorial-roadmap"><span>${icon('build')} Build a city</span><span>${icon('envelope-sealed')} Change the laws</span><span>${icon('prestige')} Count your triumphs</span></div><p class="ols-tutorial-isolation">This is guided practice with scripted positions. It never sends an action to your real match. Skip at any time; your progress is saved on this device.</p><button type="button" class="ols-tutorial-primary" data-action="tutorial-start">Let’s build ${icon('arrow')}</button>`;
  if (step === 1) {
    const design = buildingById(ctx.rules, 'corner-shop');
    const cells = Array(9).fill(null);
    if (done && plot !== null) cells[plot] = 'corner-shop';
    return `<div class="ols-tutorial-meters">${meter('coin', done ? 1 : 4, 'coins')}${meter('prestige', done ? 1 : 0, 'prestige')}</div><button type="button" class="ols-tutorial-card-choice ${choice ? 'selected' : ''}" data-action="tutorial-select-build" aria-pressed="${!!choice}"${done ? ' disabled' : ''}><span>${buildingArt(design, ctx)}</span><span>${guildLabel(design.guild, ctx.rules)}<strong>Corner Shop</strong><small>Pay 3 coins · 1 prestige · income icon</small></span>${icon('check')}</button>${miniCity(cells, ctx, { action: choice && !done ? 'tutorial-plot' : null })}${done ? feedback('Built! Your 4 coins became 1, and the shop contributes 1 building prestige. Its income starts at the next session.') : `<p class="ols-tutorial-prompt">${choice ? 'Tap an empty plot to place the shop.' : 'Select the Corner Shop to begin.'}</p>`}`;
  }
  if (step === 2) return `<div class="ols-tutorial-scene">${icon('coin')}<div class="ols-tutorial-calculation"><b>${done ? '4' : '1'}</b><span>coins in your purse</span></div></div><button type="button" class="ols-tutorial-primary" data-action="tutorial-work"${done ? ' disabled' : ''}>Work · +3 coins</button>${done ? feedback('One action, 3 coins earned. Work is always available—even when the city is full or the market is empty.') : '<p class="ols-tutorial-prompt">You have 1 coin. Work to afford a district next turn.</p>'}`;
  if (step === 3) return `<div class="ols-tutorial-meters">${meter('coin', done ? 1 : 4, 'coins')}${meter('prestige', done ? 2 : 0, 'street prestige')}</div>${miniCity(['tea-stall', 'button-workshop', done ? 'petition-kiosk' : null, null, null, null, null, null, null], ctx)}<div class="ols-tutorial-guild-trio">${guildLabel('commerce', ctx.rules)}${guildLabel('craft', ctx.rules)}${guildLabel('civic', ctx.rules)}</div><button type="button" class="ols-tutorial-primary" data-action="tutorial-street"${done ? ' disabled' : ''}>Build Petition Kiosk in street 1 · 3 coins</button>${done ? feedback('Commerce + Craft + Civic: three different guilds. Secure 2 street prestige once, plus the kiosk’s 2 building prestige and 2 influence (up to 6).') : '<p class="ols-tutorial-prompt">Commerce and Craft were built earlier this session, so the first-Build discount is used. Add Civic.</p>'}`;
  if (step === 4) return `<div class="ols-tutorial-income"><div class="ols-tutorial-income-building">${buildingArt(buildingById(ctx.rules, 'corner-shop'), ctx)}</div><div><strong>1 established income icon</strong><p>3 base + 1 shop = 4 coins</p><p>2 influence + 1 = 3 influence</p></div></div><div class="ols-tutorial-meters">${meter('coin', done ? 5 : 1, 'coins')}${meter('influence', done ? 3 : 2, 'influence')}</div><button type="button" class="ols-tutorial-primary" data-action="tutorial-income"${done ? ' disabled' : ''}>Begin session 2 · collect income</button>${done ? feedback('Income is simultaneous and automatic. You are now at 5 coins and 3 influence. Reconnecting cannot collect it again.') : '<p class="ols-tutorial-prompt">In this practice position, you finished session 1 with 1 coin and a Corner Shop.</p>'}`;
  if (step === 5) {
    const diversity = choice === 'diversity-parade';
    return `<div class="ols-tutorial-law-choices"><button type="button" data-action="tutorial-law" data-choice-id="diversity-parade" aria-pressed="${diversity}" class="${diversity ? 'selected' : ''}">Diversity Parade<small>3 guilds = 1 point; 4 guilds = 2</small></button><button type="button" data-action="tutorial-law" data-choice-id="mandatory-applause" aria-pressed="${choice === 'mandatory-applause'}" class="${choice === 'mandatory-applause' ? 'selected' : ''}">Mandatory Applause<small>2 Culture = 1 point; 4 = 2</small></button></div><div class="ols-tutorial-compare"><div><strong>Jon’s city</strong><span>${guildLabel('commerce', ctx.rules)}${guildLabel('craft', ctx.rules)}${guildLabel('civic', ctx.rules)}</span><b>${choice ? diversity ? '+1' : '+0' : '—'}</b></div><div><strong>Lydia’s city</strong><span>${guildLabel('culture', ctx.rules)}${guildLabel('culture', ctx.rules)}</span><b>${choice ? diversity ? '+0' : '+1' : '—'}</b></div></div>${choice ? feedback(`${diversity ? 'Diversity Parade favours Jon’s three-guild city today.' : 'Mandatory Applause favours Lydia’s two Culture buildings today.'} A law is shared, but the benefit need not be. Earlier Civic awards stay secured.`) : '<p class="ols-tutorial-prompt">Compare both bills before deciding what you would support.</p>'}`;
  }
  if (step === 6) return `<div class="ols-tutorial-council-position"><span>Jon is Chair · both start with 3 influence</span><div class="ols-tutorial-practice-vote"><strong>Your practice vote: Public Grants</strong><span>${icon('influence')} Bid 2</span></div><div class="ols-tutorial-envelopes"><div data-tutorial-envelope="jon">${icon(done ? 'envelope-open' : 'envelope-sealed')}<strong>Jon</strong><span>${done ? 'Keep current · bid 1' : 'Sealed'}</span></div><div data-tutorial-envelope="lydia">${icon(done ? 'envelope-open' : 'envelope-sealed')}<strong>You, as Lydia</strong><span>${done ? 'Public Grants · bid 2' : 'Draft · not submitted'}</span></div></div></div><button type="button" class="ols-tutorial-primary" data-action="tutorial-seal"${done ? ' disabled' : ''}>Seal practice vote · spend 2 influence</button>${done ? feedback('Both reveal together. Public Grants wins 2–1. Jon pays 1, leaving 2; Lydia pays 2, leaving 1. A 1–1 tie would use Chair Jon’s choice. A 0–0 vote is legal.') : '<p class="ols-tutorial-prompt">Both bids will be paid, even if they support the same law. No refunds.</p>'}`;
  if (step === 7) return `<div class="ols-tutorial-scene">${icon('influence')}<div class="ols-tutorial-calculation"><b>${done ? '6' : '5'}</b><span>influence, cap 6</span></div></div><button type="button" class="ols-tutorial-primary" data-action="tutorial-lobby"${done ? ' disabled' : ''}>Lobby · gain 1 influence at cap</button>${done ? feedback('Lobby normally gives 2, but only 1 fits. At 6, Lobby is still legal and gains 0. Save influence for a council that matters to your city.') : '<p class="ols-tutorial-prompt">This practice position begins with 5 influence.</p>'}`;
  if (step === 8) return `<div class="ols-tutorial-income"><div class="ols-tutorial-income-building">${buildingArt(buildingById(ctx.rules, 'pocket-theatre'), ctx)}</div><div><strong>Pocket Theatre</strong><p>Established Festival icon: +1 prestige</p></div></div><div class="ols-tutorial-meters">${meter('coin', done ? 2 : 5, 'coins')}${meter('prestige', done ? 4 : 0, 'Festival prestige')}</div><button type="button" class="ols-tutorial-primary" data-action="tutorial-festival"${done ? ' disabled' : ''}>Festival · pay 3 coins, secure 4 prestige</button>${done ? feedback('Festival spent 3 coins and secured 4 prestige. You cannot repeat it this session. A second Festival icon would not increase the bonus.') : '<p class="ols-tutorial-prompt">An established Theatre makes this celebration worth 4.</p>'}`;
  const scores = [['buildings', 'Buildings', 23, 'The printed prestige on your nine permanent districts. Never counted twice.'], ['streets', 'Streets', 4, 'Two qualifying horizontal streets, worth 2 each.'], ['festivals', 'Festivals', 8, 'Two boosted Festivals, worth 4 each.'], ['civic', 'Civic laws', 5, 'The sum of earlier session-end awards. Changing the law never removes them.'], ['treasury', 'Treasury', 3, '11 coins ÷ 3, rounded down, gives 3. Treasury is capped at 4.']];
  return `<div class="ols-tutorial-score-list">${scores.map(([id, label, value]) => `<button type="button" data-action="tutorial-score" data-score-id="${id}" aria-expanded="${inspected === id}"><span>${label}</span><b>${value}</b></button>`).join('')}<div><strong>Total prestige</strong><b>43</b></div></div>${inspected ? feedback(esc(scores.find(([id]) => id === inspected)?.[3] || '')) : '<p class="ols-tutorial-prompt">Tap any score line to see where those points came from.</p>'}<p class="ols-tutorial-isolation">In a real match, your live score excludes potential Treasury until the final result. Unspent influence adds no points.</p>`;
}

/** A scripted, resumable practice flow. It has no command sender or authority access. */
export function createTutorial({ onChange = () => {}, storage: suppliedStorage } = {}) {
  const storage = tryStorage(suppliedStorage);
  let state = { ...readProgress(storage), open: false };
  let disposed = false;
  const save = () => { try { const { open, ...progress } = state; storage?.setItem(KEY, JSON.stringify(progress)); } catch { /* Storage may be disabled; practice still works. */ } };
  const change = (patch) => { if (disposed) return; state = { ...state, ...patch }; save(); onChange(); };
  const next = () => { if (state.step < TUTORIAL_LESSONS.length - 1) change({ step: state.step + 1, done: false, choice: null, plot: null, inspected: null }); };
  return {
    open({ replay = false } = {}) { if (disposed) return; if (replay) state = { ...defaultProgress(), open: true }; else state = { ...state, open: true }; save(); onChange(); },
    close() { change({ open: false }); },
    getState() { return { ...state }; },
    render(ctx) {
      if (disposed || !state.open) return '';
      const lesson = TUTORIAL_LESSONS[state.step];
      return `<div class="ols-tutorial-overlay"><section class="ols-tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="ols-tutorial-title" tabindex="-1"><header class="ols-tutorial-top"><span>${icon('book')} GUIDED PRACTICE <b>${state.step + 1} / ${TUTORIAL_LESSONS.length}</b></span><button type="button" data-action="tutorial-skip" aria-label="Skip tutorial and return to your match">Skip for now ${icon('close')}</button></header><div class="ols-tutorial-progress" role="img" aria-label="Lesson ${state.step + 1} of ${TUTORIAL_LESSONS.length}: ${lesson.short}">${TUTORIAL_LESSONS.map((_, index) => `<i class="${index <= state.step ? 'filled' : ''}"></i>`).join('')}</div><div class="ols-tutorial-content"><span class="ols-tutorial-eyebrow">${state.step === 0 ? 'ABOUT EIGHT MINUTES · AT YOUR PACE' : `PRACTICE POSITION · ${esc(lesson.short)}`}</span><h2 id="ols-tutorial-title">${esc(lesson.title)}</h2><p class="ols-tutorial-intro">${esc(lesson.text)}</p>${lessonMarkup(state, ctx)}</div>${state.step ? `<footer class="ols-tutorial-footer"><button type="button" class="ols-tutorial-quiet" data-action="tutorial-replay">Start again</button>${state.step === TUTORIAL_LESSONS.length - 1 ? `<button type="button" class="ols-tutorial-primary" data-action="tutorial-finish"${state.done ? '' : ' disabled'}>Return to my match ${icon('arrow')}</button>` : `<button type="button" class="ols-tutorial-primary" data-action="tutorial-next"${state.done ? '' : ' disabled'}>Next lesson ${icon('arrow')}</button>`}</footer>` : ''}</section></div>`;
    },
    handleAction(action, target, ctx) {
      if (!action.startsWith('tutorial-')) return false;
      if (disposed) return true;
      if (action === 'tutorial-open') { this.open(); return true; }
      if (action === 'tutorial-replay') { this.open({ replay: true }); return true; }
      if (!state.open) return true;
      if (action === 'tutorial-skip' || action === 'tutorial-finish' && state.step === TUTORIAL_LESSONS.length - 1 && state.done) { this.close(); return true; }
      if (action === 'tutorial-start' && state.step === 0) { next(); return true; }
      if (action === 'tutorial-next' && state.done) { next(); return true; }
      if (state.step === 1 && !state.done) {
        if (action === 'tutorial-select-build') change({ choice: 'corner-shop' });
        if (action === 'tutorial-plot' && state.choice) {
          const plot = Number(target?.dataset?.plot);
          if (Number.isInteger(plot) && plot >= 0 && plot < 9) change({ plot, done: true });
        }
      }
      const singleActions = { 2: 'tutorial-work', 3: 'tutorial-street', 4: 'tutorial-income', 6: 'tutorial-seal', 7: 'tutorial-lobby', 8: 'tutorial-festival' };
      if (singleActions[state.step] === action && !state.done) change({ done: true });
      if (state.step === 5 && action === 'tutorial-law' && ['diversity-parade', 'mandatory-applause'].includes(target?.dataset?.choiceId)) change({ choice: target.dataset.choiceId, done: true });
      if (state.step === 9 && action === 'tutorial-score' && ['buildings', 'streets', 'festivals', 'civic', 'treasury'].includes(target?.dataset?.scoreId)) change({ inspected: target.dataset.scoreId, done: true });
      return true;
    },
    dispose() { if (disposed) return; save(); disposed = true; state = { ...state, open: false }; },
  };
}
