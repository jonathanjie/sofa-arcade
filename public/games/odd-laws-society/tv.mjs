/** Public-only TV board. Never reads a phone's draft or ownCommitment. */
import {
  escapeHtml as esc, icon, guildLabel, character, buildingArt,
  lawName, lawDescription, scoreCurrent, cityGrid, buildingById,
} from './shared.mjs';

const NAMES = { jon: 'Jon', lydia: 'Lydia' };
const TERMS = ['Foundations', 'Institutions', 'Landmarks'];
const ROMAN = ['I', 'II', 'III'];

function pips(remaining) {
  return `<span class="ols-tv-pips" aria-label="${remaining} city actions remaining">${[0, 1, 2].map(index => `<i class="${index < remaining ? 'is-available' : ''}" aria-hidden="true"></i>`).join('')}</span>`;
}

function playerState(view, playerId) {
  if (view.stage === 'finished') return view.result?.winner === playerId || view.result?.winner === 'tie' ? 'celebrate' : 'disappointed';
  if (view.stage === 'council') return 'thinking';
  return view.activePlayer === playerId ? 'acting' : 'idle';
}

function borough(ctx, playerId) {
  const { view } = ctx;
  const player = view.players[playerId];
  const active = view.stage === 'actions' && view.activePlayer === playerId;
  const full = player.city.every(Boolean);
  const finished = view.stage === 'finished';
  const total = finished ? view.result?.scores[playerId] ?? player.score.total : scoreCurrent(player);
  return `<section class="ols-tv-borough ols-tv-borough-${playerId}${active ? ' is-active' : ''}" data-player-id="${playerId}" aria-label="${NAMES[playerId]}'s borough${active ? ', active player' : ''}">
    <header class="ols-tv-borough-head">
      <div class="ols-tv-portrait">${character(playerId, playerState(view, playerId), ctx)}</div>
      <div class="ols-tv-borough-title"><span class="ols-tv-kicker">${active ? 'Your move' : full ? 'City complete' : finished ? 'Final borough' : 'Borough of'}</span><h2>${NAMES[playerId]}</h2></div>
      <button type="button" class="ols-tv-score" data-action="open-score" data-player-id="${playerId}" aria-label="${NAMES[playerId]}: ${total} ${finished ? 'final' : 'current'} prestige. View score breakdown">${icon('prestige')}<strong>${total}</strong><span>${finished ? 'final prestige' : 'prestige'}</span></button>
    </header>
    <div class="ols-tv-purse" aria-label="${NAMES[playerId]}'s resources">
      <span data-resource="coins">${icon('coin')}<strong>${player.coins}</strong> <span>coins</span></span>
      <span data-resource="influence">${icon('influence')}<strong>${player.influence}</strong> <span>influence</span></span>
      ${!finished ? `<span class="ols-tv-potential" title="Potential treasury prestige, already included only in the final total">+${player.score.treasury} treasury potential</span>` : ''}
    </div>
    <div class="ols-tv-city-wrap">${cityGrid(view, playerId, ctx)}</div>
    <footer class="ols-tv-borough-foot">
      <span>${finished ? `${player.city.filter(Boolean).length} districts` : `${view.actionsRemaining[playerId]} actions left`}</span>
      ${!finished ? pips(view.actionsRemaining[playerId]) : '<span class="ols-tv-finish-seal">Borough certified</span>'}
      <span class="ols-tv-chair${view.chair === playerId ? ' is-chair' : ''}">${view.chair === playerId ? `${icon('civic')} Chair` : ''}</span>
    </footer>
  </section>`;
}

function abilitySummary(building) {
  const ability = building.ability;
  if (!ability) return `${icon('prestige')} Printed prestige`;
  if (ability.type === 'income') return `${icon('coin')} +${ability.amount} at income`;
  if (ability.type === 'firstBuildDiscount') return `${icon('craft')} First Build −${ability.amount}`;
  if (ability.type === 'influenceOnBuild') return `${icon('influence')} +${ability.amount} influence`;
  if (ability.type === 'festivalBonus') return `${icon('culture')} Festival +${ability.amount}`;
  return esc(building.abilityDescription);
}

function marketCard(ctx, stack) {
  const { view, rules } = ctx;
  const building = buildingById(rules, stack.designId);
  if (!building) return '';
  const jon = rules.buildQuote(view, 'jon', building.id);
  const lydia = rules.buildQuote(view, 'lydia', building.id);
  const samePrice = jon.cost === lydia.cost;
  const discounted = jon.cost < building.cost || lydia.cost < building.cost;
  const price = samePrice
    ? `<span class="ols-tv-live-price">${icon('coin')}<strong>${jon.cost}</strong><span>each</span></span>`
    : `<span class="ols-tv-split-price" aria-label="Jon pays ${jon.cost} coins; Lydia pays ${lydia.cost} coins">${icon('coin')}<span>J <strong>${jon.cost}</strong></span><span>L <strong>${lydia.cost}</strong></span></span>`;
  return `<button type="button" class="ols-tv-market-card guild-${esc(building.guild)}${stack.remaining === 0 ? ' is-exhausted' : ''}" data-action="inspect-building" data-design-id="${esc(building.id)}" aria-label="${esc(building.name)}, ${stack.remaining} remaining. ${esc(building.guild)}. Jon pays ${jon.cost} coins; Lydia pays ${lydia.cost} coins. ${building.prestige} prestige. ${esc(building.abilityDescription || 'No ability')}"${stack.remaining === 0 ? ' data-exhausted="true"' : ''}>
    <span class="ols-tv-card-top">${guildLabel(building.guild, rules)}<span class="ols-tv-stock">${stack.remaining === 0 ? 'Sold out' : `${stack.remaining} left`}</span></span>
    <span class="ols-tv-building-art">${buildingArt(building, ctx)}</span>
    <strong class="ols-tv-building-name">${esc(building.name)}</strong>
    <span class="ols-tv-card-values">${price}${discounted ? `<del aria-label="Printed cost ${building.cost}">${building.cost}</del>` : ''}<span class="ols-tv-card-prestige">${icon('prestige')} ${building.prestige}</span></span>
    <span class="ols-tv-ability">${abilitySummary(building)}</span>
  </button>`;
}

function market(ctx) {
  const { view } = ctx;
  return `<section class="ols-tv-market" aria-labelledby="ols-market-title">
    <div class="ols-tv-section-heading"><div><span class="ols-tv-kicker">Term ${ROMAN[view.term - 1]}</span><h2 id="ols-market-title">${TERMS[view.term - 1]}</h2></div><span class="ols-tv-market-note">Shared market</span></div>
    <div class="ols-tv-market-grid">${view.market.map(stack => marketCard(ctx, stack)).join('')}</div>
    ${view.market.every(stack => stack.remaining === 0) ? '<p class="ols-tv-stock-note">This market is sold out. Work, Lobby, or Festival.</p>' : ''}
  </section>`;
}

function publicEffect(ctx, lawId) {
  const { rules, view } = ctx;
  const law = rules.laws.find(item => item.id === lawId);
  if (!law || law.category !== 'civic') return '';
  return `<span class="ols-tv-law-preview">At current cities <span>Jon <strong>+${rules.civicAward(view, 'jon', lawId)}</strong></span><span>Lydia <strong>+${rules.civicAward(view, 'lydia', lawId)}</strong></span></span>`;
}

function council(ctx) {
  const { view, rules } = ctx;
  const council = view.council;
  if (!council) return '';
  const category = council.category;
  return `<section class="ols-tv-council" aria-labelledby="ols-council-title">
    <div class="ols-tv-section-heading"><div><span class="ols-tv-kicker">The council is in session</span><h2 id="ols-council-title">${category === 'economy' ? 'An economic question' : 'A civic occasion'}</h2></div><span class="ols-tv-lala">${character('lala', 'thinking', ctx)}</span></div>
    <div class="ols-tv-proposals">${council.optionIds.map((choiceId, index) => {
      const id = choiceId === 'keep' ? view.activeLaws[category] : choiceId;
      return `<article class="ols-tv-proposal${choiceId === 'keep' ? ' ols-tv-proposal-keep' : ''}" data-law-id="${esc(id)}"><span class="ols-tv-proposal-number" aria-hidden="true">${choiceId === 'keep' ? '↺' : String(index + 1).padStart(2, '0')}</span><div><h3>${choiceId === 'keep' ? 'Keep current law' : esc(lawName(id, rules))}</h3><p>${choiceId === 'keep' ? `${esc(lawName(id, rules))} · ` : ''}${esc(lawDescription(id, rules))}</p>${publicEffect(ctx, id)}</div></article>`;
    }).join('')}</div>
    <div class="ols-tv-ballot-tray" aria-label="Council readiness">${['jon', 'lydia'].map(playerId => `<div class="ols-tv-ballot${council.ready[playerId] ? ' is-sealed' : ''}" data-envelope="${playerId}"><span class="ols-tv-envelope" aria-hidden="true">${icon('envelope')}${council.ready[playerId] ? `<i class="ols-tv-envelope-lock">${icon('lock')}</i>` : ''}</span><strong>${NAMES[playerId]}</strong><span>${council.ready[playerId] ? 'Sealed' : 'Choosing privately'}</span></div>`).join('')}</div>
    <p class="ols-tv-council-note">${NAMES[view.chair]} chairs · votes open together</p>
  </section>`;
}

function revealedCouncil(ctx) {
  const { view, rules, ui } = ctx;
  const last = view.lastCouncil;
  if (!last || last.session !== view.session || view.stage !== 'actions' || (view.actionIndex !== 0 && !ui?.showCouncilReveal)) return '';
  return `<aside class="ols-tv-reveal" data-reveal-phase="${esc(last.phaseId)}" aria-label="Both council votes revealed">
    <div class="ols-tv-reveal-lala">${character('lala', 'stamp', ctx)}</div>
    <div class="ols-tv-reveal-heading">${icon('stamp')} <strong>${esc(lawName(last.adoptedLawId, rules))}</strong><span>adopted</span></div>
    <div class="ols-tv-revealed-votes">${['jon', 'lydia'].map(playerId => `<span data-envelope="${playerId}">${icon('envelope')}<strong>${NAMES[playerId]}</strong><span>${last.choices[playerId].choiceId === 'keep' ? 'Keep current' : esc(lawName(last.choices[playerId].choiceId, rules))}</span><b>${last.choices[playerId].bid} paid</b></span>`).join('')}</div>
  </aside>`;
}

function activeLaws(ctx) {
  const { view, rules } = ctx;
  return `<section class="ols-tv-laws" aria-label="Active laws">${['economy', 'civic'].map(category => {
    const id = view.activeLaws[category];
    return `<article class="ols-tv-active-law" data-active-law="${category}"><span class="ols-tv-law-emblem">${icon(category === 'economy' ? 'commerce' : 'civic')}</span><div><span class="ols-tv-kicker">${category === 'economy' ? 'Economy law' : 'Civic law'}</span><h3>${esc(lawName(id, rules))}</h3><p>${esc(lawDescription(id, rules))}</p></div>${category === 'civic' ? `<span class="ols-tv-civic-projection" aria-label="Current city award at session end">Jon +${rules.civicAward(view, 'jon')}<br>Lydia +${rules.civicAward(view, 'lydia')}</span>` : ''}</article>`;
  }).join('')}</section>`;
}

function results(ctx) {
  const { view } = ctx;
  const winner = view.result?.winner;
  const title = winner === 'tie' ? 'A shared victory' : `${NAMES[winner] || 'The city'} wins`;
  const labels = { buildings: 'Buildings', streets: 'Streets', festivals: 'Festivals', civic: 'Civic laws', treasury: 'Treasury' };
  return `<section class="ols-tv-results" aria-labelledby="ols-results-title"><div class="ols-tv-result-lala">${character('lala', 'celebrate', ctx)}</div><span class="ols-tv-kicker">Six sessions. Two remarkable cities.</span><h2 id="ols-results-title">${title}</h2><p class="ols-tv-result-subtitle">${winner === 'tie' ? 'The Society awards two splendid seals.' : 'Certified by Lala, Council President.'}</p><table class="ols-tv-score-table"><caption class="ols-sr-only">Final prestige breakdown</caption><thead><tr><th scope="col">Prestige</th><th scope="col">Jon</th><th scope="col">Lydia</th></tr></thead><tbody>${Object.entries(labels).map(([key, label]) => `<tr><th scope="row">${label}</th><td>${view.players.jon.score[key]}</td><td>${view.players.lydia.score[key]}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Final total</th><td>${view.result?.scores.jon ?? view.players.jon.score.total}</td><td>${view.result?.scores.lydia ?? view.players.lydia.score.total}</td></tr></tfoot></table><button type="button" class="ols-tv-return" data-action="exit">${icon('back')} Return to Sofa Arcade</button></section>`;
}

/** Renders only committed projected state; UI drafts are intentionally ignored. */
export function renderTV(ctx) {
  const { view } = ctx;
  const finished = view.stage === 'finished';
  const councilStage = view.stage === 'council';
  const stateLabel = finished ? 'Society adjourned' : councilStage ? 'Council · sealed voting' : `${NAMES[view.activePlayer]}'s turn`;
  const reveal = revealedCouncil(ctx);
  return `<div class="ols-tv${councilStage ? ' is-council' : ''}${finished ? ' is-finished' : ''}${reveal ? ' has-public-reveal' : ''}">
    <header class="ols-tv-masthead${reveal ? ' has-reveal' : ''}"><div class="ols-tv-wordmark"><span class="ols-tv-brand-seal" aria-hidden="true">${icon('civic')}</span><div><span class="ols-tv-kicker">Sofa Arcade presents</span><h1>The Odd Laws <em>Society</em></h1></div></div>${reveal}<div class="ols-tv-session"><span class="ols-tv-session-number">${view.session}<small>/ 6</small></span><div><span class="ols-tv-kicker">Session · Term ${ROMAN[view.term - 1]}</span><strong>${stateLabel}</strong></div></div></header>
    <div class="ols-tv-board">${borough(ctx, 'jon')}<div class="ols-tv-center">${finished ? results(ctx) : councilStage ? council(ctx) : market(ctx)}</div>${borough(ctx, 'lydia')}</div>
    ${finished ? '' : activeLaws(ctx)}
  </div>`;
}
