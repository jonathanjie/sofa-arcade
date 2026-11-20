import {escapeHtml as esc,icon,guildLabel,buildingArt,lawName,lawDescription,scoreTable,cityGrid,buildingById,NAMES} from './shared.mjs';
function help() {return `<div class="ols-help"><p class="ols-lede">Build the city. Rewrite its rules.</p><p>Six sessions. Three city actions each session. Two shared laws. Most prestige wins.</p><button class="ols-primary" data-action="start-tutorial">${icon('book')} Guided practice</button><h3>Four ways to spend a turn</h3><dl><dt>Build</dt><dd>Buy one available district and place it permanently in your 3×3 city. Discounts use your city before the Build. Take the largest eligible discount; the price is at least 1.</dd><dt>Work</dt><dd>Gain 3 coins, or 4 under Honest Wages. Always available on your turn.</dd><dt>Lobby</dt><dd>Gain 2 influence, up to a total of 6. At the cap, you gain 0.</dd><dt>Festival</dt><dd>Pay 3 coins for 3 prestige, plus at most 1 from a Festival building. Once per player per session.</dd></dl><h3>The council</h3><p>Select a bill or keep the current law. Bid 0–3 influence, limited by your balance. Seal both together. Both players pay their bids, even the loser. Higher bid wins; the Chair breaks a tie. The non-Chair then acts first.</p><h3>Streets & income</h3><p>A horizontal row earns 2 prestige when completed with one guild or three different guilds. A two-plus-one mix earns 0. Columns and diagonals do not score.</p><p>Sessions 2–6 start with 3 coins, up to 2 extra from income buildings, and 1 influence up to 6. No income in session 1 or after session 6. The market changes in sessions 3 and 5.</p><h3>Score</h3><p>Buildings + Streets + Festivals + Civic laws + Treasury. The active Civic law awards at most 2 prestige at each session end; earlier awards remain. Treasury is 1 per 3 coins, capped at 4. Influence scores 0. Exact ties share victory.</p><h3>Controls</h3><p>Tab to move between controls, Enter or Space to select, and Escape to close a drawer. Your phone keeps an unsealed draft locally. Reconnecting restores only a sealed vote acknowledged by the host.</p></div>`;}
function catalog(ctx) {return [1,2,3].map(term=>`<section class="ols-catalog-term"><h3>Term ${term} · ${term===1?'Foundations':term===2?'Institutions':'Landmarks'}</h3><div class="ols-catalog-grid">${ctx.rules.buildings.filter(d=>d.term===term).map(d=>`<button class="ols-catalog-card" data-guild="${esc(d.guild)}" data-action="inspect-building" data-design-id="${d.id}">${buildingArt(d,ctx)}<strong>${esc(d.name)}</strong>${guildLabel(d.guild,ctx.rules)}<span>${icon('coin')} ${d.cost} printed · ${icon('prestige')} ${d.prestige}</span><small>${esc(d.abilityDescription)}</small></button>`).join('')}</div></section>`).join('');}
function agenda(ctx) {return `<p class="ols-drawer-intro">The complete public agenda. Each pair appears once; you may always keep that category’s current law.</p><ol class="ols-agenda">${ctx.view.agenda.map(item=>`<li class="${item.session===ctx.view.session?'is-current':''}"><div class="ols-agenda-label"><strong>Session ${item.session}</strong><span>${item.category} · ${ctx.view.chairSchedule[item.session-1]==='jon'?'Jon':'Lydia'} chairs</span></div><div>${item.lawIds.map(id=>`<article><h3>${esc(lawName(id,ctx.rules))}</h3><p>${esc(lawDescription(id,ctx.rules))}</p></article>`).join('')}</div></li>`).join('')}</ol>`;}
function inspect(ctx,id) {const d=ctx.rules.buildings.find(b=>b.id===id);if(!d)return '<p>This district is unavailable.</p>';const stack=ctx.view.market.find(s=>s.designId===id);return `<div class="ols-inspect-art">${buildingArt(d,ctx)}</div>${guildLabel(d.guild,ctx.rules)}<h3 class="ols-inspect-name">${esc(d.name)}</h3><div class="ols-inspect-values"><span>${icon('coin')} ${d.cost} printed cost</span><span>${icon('prestige')} ${d.prestige} prestige</span></div><p>${esc(d.abilityDescription)}</p><p class="ols-muted">Term ${d.term} · ${stack?`${stack.remaining} copies remaining`:'Not in the current market'}</p><div class="ols-inspect-quotes">${['jon','lydia'].map(playerId=>{const q=ctx.rules.buildQuote(ctx.view,playerId,id);return `<article><h4>${playerId==='jon'?'Jon':'Lydia'}’s price</h4><strong>${q.cost} coins</strong><p>Printed ${q.printedCost}${q.discount.amount?` − ${q.discount.amount} from ${esc(q.discount.sourceId==='workshop'?'Workshop':lawName(q.discount.sourceId,ctx.rules))}`:' · no discount'}</p>${q.influenceGain?`<p>+${q.influenceGain} influence on Build</p>`:''}${q.reason?`<small>${esc(q.reason)}</small>`:''}</article>`;}).join('')}</div>`;}
/** Read-only inspection. The authenticated viewer determines the city; no draft is changed. */
function city(ctx) {
 const {view,viewer,rules,ui}=ctx;
 const self=viewer.playerId;
 if(viewer.role!=='player'||!view.players[self])return '';
 const player=view.players[self];
 const districts=player.city.filter(Boolean).map(entry=>buildingById(rules,entry.designId)).filter(Boolean);
 const award=(lawId)=>view.stage==='finished'?'':`<strong class="ols-city-award">${icon('prestige')} +${rules.civicAward(view,self,lawId)} at session end with this city</strong>`;
 const counts=rules.guilds.map(g=>({guild:g,count:districts.filter(d=>d.guild===g.id).length}));
 const council=view.stage==='council'?view.council:null;
 const sealed=!!council&&(council.ready[self]||!!council.ownCommitment);
 // A sealed snapshot without its private commitment must not redisplay an old local draft.
 const choice=council?(sealed?council.ownCommitment?.choiceId:ui.choiceId||'keep'):null;
 const consideredId=choice==='keep'?view.activeLaws[council.category]:choice;
 const policy=consideredId?`<section class="ols-city-policy" aria-label="${sealed?'Your sealed policy':'Your draft policy'}"><span class="ols-city-eyebrow">${sealed?'Sealed choice':'Considering'} · ${council.category==='economy'?'Economy law':'Civic law'}</span><h3>${choice==='keep'?'Keep ':''}${esc(lawName(consideredId,rules))}</h3><p>${esc(lawDescription(consideredId,rules))}</p>${council.category==='civic'?award(consideredId):''}</section>`:'';
 return `<div class="ols-city-inspection" data-city-owner="${self}">
  <div class="ols-city-summary"><span><strong>${NAMES[self]}’s borough</strong><small>Session ${view.session} / 6</small></span><b>${districts.length} / 9 plots</b></div>
  <div class="ols-city-inspection-layout"><section class="ols-city-districts" aria-label="Your city districts">
   ${cityGrid(view,self,ctx)}
   <div class="ols-city-guild-counts" aria-label="Guilds in your city">${counts.map(({guild,count})=>`<span data-guild="${esc(guild.id)}">${guildLabel(guild.id,rules)}<strong aria-label="${count} ${esc(guild.name)} districts">${count}</strong></span>`).join('')}</div>
  </section><div class="ols-city-law-panel">
   ${policy}
   <section class="ols-city-current-laws" aria-label="Current city law effects"><h3>Laws in force</h3>${['economy','civic'].map(category=>{const id=view.activeLaws[category];return `<article data-city-law="${category}"><div class="ols-city-law-heading">${icon(category==='economy'?'coin':'stamp')}<span><small>${category==='economy'?'Economy law':'Civic law'}</small><strong>${esc(lawName(id,rules))}</strong></span></div><p>${esc(lawDescription(id,rules))}</p>${category==='civic'?award(id):''}</article>`;}).join('')}</section>
  </div></div>
 </div>`;
}

export function renderDrawer(ctx) {
 const drawer=ctx.ui.drawer;
 if(!drawer)return '';
 const titles={help:'How the Society works',agenda:'The council agenda',catalog:'District almanac',score:'Prestige ledger',building:'District inspection',city:'My city'};
 const content=drawer.type==='help'?help():drawer.type==='agenda'?agenda(ctx):drawer.type==='catalog'?catalog(ctx):drawer.type==='score'?scoreTable(ctx.view):drawer.type==='city'?city(ctx):inspect(ctx,drawer.id);
 const cityAccess=ctx.viewer.role==='player'&&drawer.type!=='city';
 return `<div class="ols-modal-backdrop" data-action="close-backdrop"><section class="ols-drawer${drawer.type==='city'?' ols-drawer-city':''}" role="dialog" aria-modal="true" aria-labelledby="ols-drawer-title" tabindex="-1">
  <header>${ctx.ui.drawerStack?.length?`<button class="ols-drawer-back" data-action="back-drawer">${icon('back')} Back</button>`:''}<h2 id="ols-drawer-title">${titles[drawer.type]||'Details'}</h2><button class="ols-close" data-action="close-drawer" aria-label="Close details">${icon('close')}</button></header>
  ${cityAccess?`<div class="ols-drawer-context"><button class="ols-my-city" data-action="open-city">${icon('build')} My city ${icon('arrow')}</button></div>`:''}
  <div class="ols-drawer-body">${content}</div>
 </section></div>`;
}
