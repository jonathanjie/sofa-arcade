import {
  escapeHtml as esc, icon, guildLabel, character, buildingArt,
  lawName, lawDescription, scoreCurrent, resourceStrip, cityGrid, buildingById,
} from './shared.mjs';

const name = (id) => id === 'jon' ? 'Jon' : 'Lydia';
const other = (id) => id === 'jon' ? 'lydia' : 'jon';
const terms = ['Foundations', 'Institutions', 'Landmarks'];
const attrDisabled = (disabled) => disabled ? ' aria-disabled="true"' : '';
const playerFor = (ctx) => ctx.view.players[ctx.viewer.playerId];
const isTurn = (ctx) => ctx.view.stage === 'actions' && ctx.view.activePlayer === ctx.viewer.playerId;
const disconnected = (ctx) => !!ctx.status && ctx.status.state !== 'connected';

function actionPips(count) {
  return `<span class="ols-phone-pips" role="img" aria-label="${count} actions remaining">${[0, 1, 2].map((i) => `<i class="${i < count ? 'available' : ''}" aria-hidden="true"></i>`).join('')}</span>`;
}

function header(ctx) {
  const { view, viewer } = ctx;
  const id = viewer.playerId;
  const player = playerFor(ctx);
  const finished = view.stage === 'finished';
  const displayedScore = finished ? player.score.total : scoreCurrent(player);
  const state = view.stage === 'council' ? 'thinking' : view.stage === 'finished' ? (view.result?.winner === id || view.result?.winner === 'tie' ? 'celebrate' : 'disappointed') : view.activePlayer === id ? 'acting' : 'idle';
  return `<header class="ols-phone-header" data-player-id="${id}">
    <div class="ols-phone-portrait">${character(id, state, ctx)}</div>
    <div class="ols-phone-identity"><span class="ols-phone-kicker">YOUR BOROUGH</span><h1>${name(id)}<span class="ols-phone-session">${view.session} / 6</span></h1>${resourceStrip(player)}</div>
    <button type="button" class="ols-phone-score" data-action="open-score" data-player-id="${id}" aria-label="${name(id)}: ${displayedScore} ${finished ? 'final' : 'current'} prestige${finished ? '' : `; ${player.score.treasury} potential treasury`}. Show score breakdown"><strong>${displayedScore}</strong><span>prestige</span><small>${finished ? 'final score' : `+${player.score.treasury} potential`}</small></button>
  </header>`;
}

function lawOptions(ctx) {
  const { view, rules, ui } = ctx;
  return view.council.optionIds.map((id) => {
    const keep = id === 'keep';
    const actualId = keep ? view.activeLaws[view.council.category] : id;
    const selected = (ui.choiceId || 'keep') === id;
    return `<button type="button" class="ols-phone-law ${selected ? 'selected' : ''}" data-action="phone-law" data-choice-id="${esc(id)}" aria-pressed="${selected}"${attrDisabled(ui.busy)}>
      <span class="ols-phone-law-seal" aria-hidden="true">${icon(keep ? 'keep' : view.council.category === 'economy' ? 'coin' : 'civic')}</span>
      <span><strong>${keep ? 'Keep current law' : esc(lawName(id, rules))}</strong><small>${keep ? `${esc(lawName(actualId, rules))} · ` : ''}${esc(lawDescription(actualId, rules))}</small></span>
      <span class="ols-phone-radio" aria-hidden="true">${selected ? '✓' : ''}</span>
    </button>`;
  }).join('');
}

function council(ctx) {
  const { view, viewer, rules, ui } = ctx;
  const self = viewer.playerId;
  const opponent = other(self);
  const own = view.council.ownCommitment;
  const ready = view.council.ready;
  if (ready[self] || own) {
    const chosen = own?.choiceId === 'keep' ? `Keep ${lawName(view.activeLaws[view.council.category], rules)}` : own ? lawName(own.choiceId, rules) : null;
    return `<section class="ols-phone-locked" aria-labelledby="ols-phone-locked-title">
      <div class="ols-phone-locked-envelope" data-envelope="${self}">${icon('envelope-sealed')}</div>
      <span class="ols-phone-kicker">PRIVATE · ONLY ON YOUR PHONE</span>
      <h2 id="ols-phone-locked-title">Your vote is sealed.</h2>
      ${own ? `<p class="ols-phone-locked-law">${esc(chosen)}</p><p class="ols-phone-locked-bid">${icon('influence')} <strong>${own.bid}</strong> influence committed</p>` : ''}
      <p class="ols-phone-secondary">${ready[opponent] ? 'Both envelopes are sealed. Waiting for the council result.' : `Waiting for ${name(opponent)} to seal.`}</p>
      <div class="ols-phone-ready-line"><span>${name(self)} <b>Sealed</b></span><span>${name(opponent)} <b>${ready[opponent] ? 'Sealed' : 'Choosing'}</b></span></div>
      <p class="ols-phone-footnote">Your bid is spent at reveal, even if it loses. Your public influence changes when both votes reveal.</p>
      <button type="button" class="ols-phone-secondary-button" data-action="open-agenda">Look ahead ${icon('arrow')}</button>
    </section>`;
  }
  const max = Math.min(3, playerFor(ctx).influence);
  const bid = Math.max(0, Math.min(max, Number(ui.bid) || 0));
  return `<section class="ols-phone-council" aria-labelledby="ols-phone-council-title">
    <div class="ols-phone-section-title"><div><span class="ols-phone-kicker">${esc(view.council.category)} COUNCIL</span><h2 id="ols-phone-council-title">A little civic persuasion.</h2></div></div>
    <div class="ols-phone-council-meta"><span>${name(view.chair)} chairs · breaks ties</span><span>${name(opponent)}: ${ready[opponent] ? 'sealed' : 'choosing'}</span></div>
    <div class="ols-phone-laws" role="group" aria-label="Choose your council vote">${lawOptions(ctx)}</div>
    <div class="ols-phone-bid-title"><strong>Influence bid</strong><span>Private until you seal</span></div>
    <div class="ols-phone-bids" role="group" aria-label="Influence bid, maximum ${max}">${[0, 1, 2, 3].map((value) => `<button type="button" data-action="phone-bid" data-bid="${value}" aria-label="Bid ${value} influence${value > max ? ', unavailable' : ''}" aria-pressed="${value === bid}" class="${value === bid ? 'selected' : ''}"${attrDisabled(value > max || ui.busy)}>${icon('influence')}<strong>${value}</strong></button>`).join('')}</div>
    <button type="button" class="ols-phone-primary ols-phone-seal" data-action="phone-seal"${attrDisabled(ui.busy || disconnected(ctx))}>${icon('envelope-sealed')} ${ui.busy ? 'Sealing…' : `Seal vote · ${bid} influence`}</button>
    <p class="ols-phone-all-pay">Both bids are spent, even the losing bid. Sealing is final.</p>
  </section>`;
}

function activeLaws(ctx) {
  const { view, rules } = ctx;
  return `<div class="ols-phone-active-laws" aria-label="Active laws">${['economy', 'civic'].map((category) => `<div>${icon(category === 'economy' ? 'coin' : 'civic')}<span><small>${category}</small><strong>${esc(lawName(view.activeLaws[category], rules))}</strong></span></div>`).join('')}</div>`;
}

function gains(ctx) {
  const { view, rules } = ctx;
  const player = playerFor(ctx);
  const economy = rules.laws.find((law) => law.id === view.activeLaws.economy);
  const work = economy?.effect?.type === 'workIncome' ? economy.effect.coins : 3;
  const festival = 3 + Math.min(1, player.city.reduce((sum, item) => {
    const ability = item && buildingById(rules, item.designId)?.ability;
    return sum + (ability?.type === 'festivalBonus' ? ability.amount : 0);
  }, 0));
  const available = view.market.map((stack) => rules.buildQuote(view, ctx.viewer.playerId, stack.designId));
  const buildReason = !player.city.some((cell) => cell === null) ? 'Your city is full. Work, Lobby, or hold a Festival.' : view.market.every((stack) => stack.remaining === 0) ? 'The market is exhausted. New stock arrives next term.' : available.every((quote) => !quote.allowed) ? 'No affordable building. Work to earn coins, or inspect the market.' : null;
  const festivalReason = player.festivalUsed ? 'Festival already held this session.' : player.coins < 3 ? 'Festival costs 3 coins.' : null;
  return { work, lobby: Math.min(2, 6 - player.influence), festival, buildReason, festivalReason };
}

function lastReveal(ctx) {
  const { view, rules } = ctx;
  const reveal = view.lastCouncil;
  if (!reveal || reveal.session !== view.session || view.actionIndex !== 0) return '';
  return `<details class="ols-phone-reveal"><summary>${icon('stamp')} ${esc(lawName(reveal.adoptedLawId, rules))} adopted</summary><div>${['jon', 'lydia'].map((id) => `<p data-revealed-envelope="${id}"><strong>${name(id)}</strong>: ${esc(reveal.choices[id].choiceId === 'keep' ? 'Keep current' : lawName(reveal.choices[id].choiceId, rules))} · paid ${reveal.choices[id].bid}</p>`).join('')}<p>Both bids paid. ${name(view.chair)} breaks equal bids.</p></div></details>`;
}

function ordinary(ctx) {
  const { view, viewer, ui } = ctx;
  const self = viewer.playerId;
  const turn = isTurn(ctx);
  const gain = gains(ctx);
  return `<section class="ols-phone-turn ${turn ? 'your-turn' : 'waiting'}" aria-label="Turn status"><div><span class="ols-phone-kicker">TERM ${view.term} · ${terms[view.term - 1]}</span><h2>${turn ? 'Your city, your move.' : `${name(view.activePlayer)} is making a move.`}</h2></div>${actionPips(view.actionsRemaining[self])}</section>
    ${lastReveal(ctx)}
    <div class="ols-phone-actions" aria-label="City actions">
      <button type="button" class="ols-phone-action build" data-action="phone-build"${attrDisabled(!turn || ui.busy)}><span class="ols-phone-action-icon">${icon('build')}</span><span><strong>Build</strong><small>${gain.buildReason ? !playerFor(ctx).city.includes(null) ? 'City full · inspect' : view.market.every((stack) => !stack.remaining) ? 'Stock exhausted' : 'Inspect the market' : 'Choose a district'}</small></span>${icon('arrow')}</button>
      <button type="button" class="ols-phone-action work" data-action="phone-work"${attrDisabled(!turn || ui.busy || disconnected(ctx))}><span class="ols-phone-action-icon">${icon('coin')}</span><span><strong>Work</strong><small>+${gain.work} coins</small></span></button>
      <button type="button" class="ols-phone-action lobby" data-action="phone-lobby"${attrDisabled(!turn || ui.busy || disconnected(ctx))}><span class="ols-phone-action-icon">${icon('influence')}</span><span><strong>Lobby</strong><small>+${gain.lobby} influence${gain.lobby === 0 ? ' · at cap' : ''}</small></span></button>
      <button type="button" class="ols-phone-action festival" data-action="phone-festival"${attrDisabled(!turn || ui.busy || disconnected(ctx) || !!gain.festivalReason)}><span class="ols-phone-action-icon">${icon('culture')}</span><span><strong>Festival</strong><small>${gain.festivalReason || `3 coins → ${gain.festival} prestige`}</small></span></button>
    </div>
    ${!turn ? `<p class="ols-phone-wait-note">Your ${view.actionsRemaining[self]} remaining ${view.actionsRemaining[self] === 1 ? 'action' : 'actions'} will be here when it’s your turn.</p>` : ''}
    ${ui.phoneNotice ? `<p class="ols-phone-notice" role="status">${esc(ui.phoneNotice)}</p>` : ''}
    <div class="ols-phone-city-preview"><div class="ols-phone-small-heading"><h3>Your streets</h3><span>${playerFor(ctx).city.filter(Boolean).length} / 9 plots</span></div>${cityGrid(view, self, ctx)}</div>
    ${activeLaws(ctx)}`;
}

function market(ctx) {
  const { view, viewer, rules, ui } = ctx;
  const gain = gains(ctx);
  return `<section class="ols-phone-market"><div class="ols-phone-panel-heading"><button type="button" class="ols-phone-back" data-action="phone-back">${icon('arrow')} <span>Actions</span></button><span>TERM ${view.term} MARKET</span></div>
    <h2>One district. Yours forever.</h2>
    ${gain.buildReason ? `<p class="ols-phone-notice" role="status">${esc(gain.buildReason)}</p>` : ''}
    <div class="ols-phone-market-grid">${view.market.map((stack) => {
      const design = buildingById(rules, stack.designId);
      const quote = rules.buildQuote(view, viewer.playerId, stack.designId);
      return `<article class="ols-phone-market-card ${quote.allowed ? '' : 'unavailable'}" data-guild="${esc(design.guild)}"><button type="button" class="ols-phone-market-select" data-action="phone-design" data-design-id="${esc(design.id)}" aria-label="${esc(design.name)}. ${esc(rules.guilds.find(g=>g.id===design.guild)?.name||design.guild)} guild. Pay ${quote.cost} coins, ${quote.prestige} prestige. ${stack.remaining} remaining.${quote.allowed ? '' : ` ${esc(quote.reason)}`}"${attrDisabled(ui.busy)}>
        <div class="ols-phone-market-art">${buildingArt(design, ctx)}<span class="ols-phone-stock">${stack.remaining} left</span></div>
        <span class="ols-phone-market-copy">${guildLabel(design.guild, rules)}<strong>${esc(design.name)}</strong><span class="ols-phone-market-values"><span>${icon('coin')} <b>${quote.cost}</b>${quote.discount.amount ? `<s>${quote.printedCost}</s>` : ''}</span><span>${icon('prestige')} <b>${quote.prestige}</b></span></span><small>${esc(design.abilityDescription || 'Printed prestige')}</small></span>
      </button><button type="button" class="ols-phone-card-info" data-action="inspect-building" data-design-id="${esc(design.id)}" aria-label="Inspect ${esc(design.name)}">Details ${icon('inspect')}</button></article>`;
    }).join('')}</div>
  </section>`;
}

function placement(ctx) {
  const { view, viewer, rules, ui } = ctx;
  const design = buildingById(rules, ui.selectedDesignId);
  if (!design) return market(ctx);
  const player = playerFor(ctx);
  const quote = rules.buildQuote(view, viewer.playerId, design.id);
  const plot = ui.selectedPlot;
  const outcome = plot ? rules.streetOutcome(view, viewer.playerId, plot.row, plot.col, design.id) : null;
  const source = quote.discount.sourceId === 'workshop' ? 'Workshop' : quote.discount.sourceId ? lawName(quote.discount.sourceId, rules) : null;
  const streetText = !outcome ? 'Choose an empty plot.' : !outcome.canPlace ? outcome.reason : outcome.completes ? outcome.qualifies ? `Street complete · +${outcome.prestige} prestige` : 'Street complete · no street bonus' : 'Room to finish this street later.';
  const canBuild = quote.allowed && !!outcome?.canPlace && !ui.busy && !disconnected(ctx);
  return `<section class="ols-phone-placement"><div class="ols-phone-panel-heading"><button type="button" class="ols-phone-back" data-action="phone-market">${icon('arrow')} <span>Market</span></button><span>PLACE A DISTRICT</span></div>
    <div class="ols-phone-placement-card" data-guild="${esc(design.guild)}"><div>${buildingArt(design, ctx)}</div><div>${guildLabel(design.guild, rules)}<h2>${esc(design.name)}</h2><span>${quote.prestige} building prestige</span></div><button type="button" class="ols-phone-details" data-action="inspect-building" data-design-id="${esc(design.id)}" aria-label="Inspect ${esc(design.name)}">${icon('inspect')}</button></div>
    <div class="ols-phone-price-line"><span>Printed <b>${quote.printedCost}</b></span><span>${source ? `${esc(source)} <b>−${quote.discount.amount}</b>` : 'No discount'}</span><strong>Pay ${quote.cost} ${icon('coin')}</strong></div>
    <div class="ols-phone-small-heading"><h3>Choose a plot</h3><span>Placement is permanent</span></div>
    <div class="ols-phone-placement-grid" role="group" aria-label="Choose one of nine city plots">${player.city.map((cell, index) => {
      const row = Math.floor(index / 3), col = index % 3;
      const selected = plot?.row === row && plot?.col === col;
      const existing = cell && buildingById(rules, cell.designId);
      return `<button type="button" class="ols-phone-plot ${cell ? 'occupied' : ''} ${selected ? 'selected' : ''}" ${existing?`data-guild="${esc(existing.guild)}"`:selected?`data-guild="${esc(design.guild)}"`:''} data-action="phone-plot" data-row="${row}" data-col="${col}" aria-label="Street ${row + 1}, plot ${col + 1}: ${existing ? esc(existing.name) + ', occupied' : 'empty'}" aria-pressed="${selected}"${attrDisabled(!!cell || ui.busy)}>${existing ? `${buildingArt(existing, ctx)}<small>${esc(existing.name)}</small><span class="ols-plot-guild" aria-hidden="true">${icon(existing.guild)}</span>` : `${selected ? buildingArt(design, ctx) : '<span class="ols-phone-plot-plus">+</span>'}<span class="ols-phone-plot-coordinate">${row + 1}.${col + 1}</span>`}</button>`;
    }).join('')}</div>
    <div class="ols-phone-build-preview" aria-live="polite"><strong>${esc(streetText)}</strong><span>${quote.influenceGain ? `+${quote.influenceGain} influence · ` : ''}${player.coins >= quote.cost ? `Coins after payment: ${player.coins - quote.cost}` : `Need ${quote.cost - player.coins} more ${quote.cost - player.coins === 1 ? 'coin' : 'coins'}`}${outcome?.canPlace ? ` · ${quote.prestige + outcome.prestige} prestige if built` : ''}</span></div>
    ${!quote.allowed ? `<p class="ols-phone-notice" role="status">${esc(quote.reason)}</p>` : ''}
    <button type="button" class="ols-phone-primary" data-action="phone-confirm-build"${attrDisabled(!canBuild)}>${icon('build')} ${ui.busy ? 'Building…' : `Build for ${quote.cost} coins`}</button>
    <p class="ols-phone-footnote">${esc(design.abilityDescription || 'This district adds its printed prestige to your city.')}</p>
  </section>`;
}

function results(ctx) {
  const { view, viewer } = ctx;
  const self = viewer.playerId;
  const tie = view.result.winner === 'tie';
  const won = tie || view.result.winner === self;
  const rows = [['buildings', 'Buildings'], ['streets', 'Streets'], ['festivals', 'Festivals'], ['civic', 'Civic laws'], ['treasury', 'Treasury']];
  return `<section class="ols-phone-results"><span class="ols-phone-kicker">THE SIXTH SESSION IS CLOSED</span><h2>${tie ? 'A shared triumph.' : won ? 'Your city takes the crown.' : `${name(view.result.winner)} takes the crown.`}</h2><div class="ols-phone-result-total">${view.result.scores[self]}<small>final prestige</small></div><table><caption>Final score breakdown</caption><thead><tr><th scope="col">Prestige</th><th scope="col">Jon</th><th scope="col">Lydia</th></tr></thead><tbody>${rows.map(([key, label]) => `<tr><th scope="row">${label}</th><td>${view.players.jon.score[key]}</td><td>${view.players.lydia.score[key]}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total</th><td>${view.result.scores.jon}</td><td>${view.result.scores.lydia}</td></tr></tfoot></table><p class="ols-phone-secondary">${tie ? 'Exactly tied. Both boroughs share the victory.' : 'Six councils. Eighteen choices. One city that is yours.'}</p><button type="button" class="ols-phone-primary" data-action="exit">Return to Sofa Arcade ${icon('arrow')}</button></section>`;
}

export function renderPhone(ctx) {
  const { view, ui } = ctx;
  const panel = view.stage === 'council' ? council(ctx) : view.stage === 'finished' ? results(ctx) : isTurn(ctx) && ui.phonePanel === 'market' ? market(ctx) : isTurn(ctx) && ui.phonePanel === 'placement' ? placement(ctx) : ordinary(ctx);
  return `<main class="ols-phone" data-seat="${ctx.viewer.playerId}">${header(ctx)}${panel}</main>`;
}

/** Local drafts never leave this controller until the explicit Seal or Build confirmation. */
export function handlePhoneAction(action, target, ctx) {
  if (!action.startsWith('phone-')) return false;
  const { view, viewer, ui, rules } = ctx;
  if (ui.busy) return true;
  const self = viewer.playerId;
  if (action === 'phone-back') { ctx.setState({ phonePanel: 'actions', selectedDesignId: null, selectedPlot: null, phoneNotice: null }); return true; }
  if (action === 'phone-market') { ctx.setState({ phonePanel: 'market', selectedPlot: null }); return true; }
  if (view.stage === 'council') {
    if (view.council.ready[self] || view.council.ownCommitment) return true;
    const max = Math.min(3, playerFor(ctx).influence);
    if (action === 'phone-law' && view.council.optionIds.includes(target.dataset.choiceId)) ctx.setState({ choiceId: target.dataset.choiceId });
    if (action === 'phone-bid') {
      const bid = Number(target.dataset.bid);
      if (Number.isInteger(bid) && bid >= 0 && bid <= max) ctx.setState({ bid });
    }
    if (action === 'phone-seal') {
      if (disconnected(ctx)) return true;
      const choiceId = ui.choiceId || 'keep';
      const bid = Number(ui.bid) || 0;
      if (view.council.optionIds.includes(choiceId) && Number.isInteger(bid) && bid >= 0 && bid <= max) ctx.submit({ type: 'commitCouncil', choiceId, bid });
    }
    return true;
  }
  if (!isTurn(ctx)) return true;
  if (action === 'phone-build') { ctx.setState({ phonePanel: 'market', selectedDesignId: null, selectedPlot: null, phoneNotice: null }); return true; }
  if (action === 'phone-design') {
    const designId = target.dataset.designId;
    if (view.market.some((stack) => stack.designId === designId)) ctx.setState({ phonePanel: 'placement', selectedDesignId: designId, selectedPlot: null });
    return true;
  }
  if (action === 'phone-plot') {
    const row = Number(target.dataset.row), col = Number(target.dataset.col);
    if (!ui.selectedDesignId || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 2 || col < 0 || col > 2) return true;
    const outcome = rules.streetOutcome(view, self, row, col, ui.selectedDesignId);
    if (outcome.canPlace) ctx.setState({ selectedPlot: { row, col } });
    return true;
  }
  if (action === 'phone-confirm-build') {
    if (disconnected(ctx)) return true;
    if (!ui.selectedDesignId || !ui.selectedPlot) return true;
    const { row, col } = ui.selectedPlot;
    const quote = rules.buildQuote(view, self, ui.selectedDesignId);
    const outcome = rules.streetOutcome(view, self, row, col, ui.selectedDesignId);
    if (quote.allowed && outcome.canPlace) ctx.submit({ type: 'build', designId: ui.selectedDesignId, row, col });
    return true;
  }
  if (action === 'phone-work' && !disconnected(ctx)) ctx.submit({ type: 'work' });
  if (action === 'phone-lobby' && !disconnected(ctx)) ctx.submit({ type: 'lobby' });
  if (action === 'phone-festival') {
    if (disconnected(ctx)) return true;
    const reason = gains(ctx).festivalReason;
    if (reason) ctx.setState({ phoneNotice: reason });
    else ctx.submit({ type: 'festival' });
  }
  return true;
}
