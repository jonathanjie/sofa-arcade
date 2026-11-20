import {BUILDINGS,LAWS,GUILDS} from './catalog.mjs';
const design=id=>{const d=BUILDINGS.find(x=>x.id===id);if(!d)throw new Error('Unknown building.');return d;};
export const cityBuildings=(view,id)=>view.players[id].city.filter(Boolean).map(x=>design(x.designId));
export function buildQuote(view,playerId,designId) {
 const d=design(designId), p=view.players[playerId];if(!p)throw new Error('Unknown player.');
 const effect=LAWS.find(l=>l.id===view.activeLaws.economy)?.effect;
 const candidates=[];
 if(p.buildsThisSession===0&&cityBuildings(view,playerId).some(b=>b.ability?.type==='firstBuildDiscount')) candidates.push({amount:1,sourceId:'workshop'});
 if(effect?.type==='guildDiscount'&&effect.guild===d.guild||effect?.type==='firstBuildDiscount'&&p.buildsThisSession===0) candidates.push({amount:effect.amount,sourceId:view.activeLaws.economy});
 candidates.sort((a,b)=>b.amount-a.amount||(a.sourceId==='workshop'?1:-1));
 const choice=candidates[0]||{amount:0,sourceId:null}; const cost=Math.max(1,d.cost-choice.amount);
 const discount={amount:d.cost-cost,sourceId:d.cost-cost>0?choice.sourceId:null};
 let reason=null;
 if(view.stage!=='actions'||view.phase==='finished')reason='Construction opens during city actions.';
 else if(view.activePlayer!==playerId)reason='Wait for your turn.';
 else if(!view.market.some(s=>s.designId===designId&&s.remaining>0))reason='No copies remain in the current market.';
 else if(!p.city.includes(null))reason='Your city is full.';
 else if(p.coins<cost)reason=`You need ${cost-p.coins} more coin${cost-p.coins===1?'':'s'}.`;
 return {allowed:!reason,reason,printedCost:d.cost,cost,discount,influenceGain:d.ability?.type==='influenceOnBuild'?Math.max(0,Math.min(6-p.influence,d.ability.amount)):0,prestige:d.prestige};
}
export function streetOutcome(view,playerId,row,col,designId) {
 const d=design(designId),p=view.players[playerId]; if(!p||![row,col].every(n=>Number.isInteger(n)&&n>=0&&n<=2))throw new Error('Choose a plot inside the city.');
 if(p.city[row*3+col])return {canPlace:false,reason:'This plot is occupied.',completes:false,qualifies:false,prestige:0};
 const cards=p.city.slice(row*3,row*3+3).map((c,index)=>index===col?d:c&&design(c.designId));
 const completes=cards.every(Boolean),guilds=new Set(cards.filter(Boolean).map(b=>b.guild)),qualifies=completes&&(guilds.size===1||guilds.size===3);
 return {canPlace:true,reason:null,completes,qualifies,prestige:qualifies&&!p.streetEvaluated[row]?2:0};
}
export function civicAward(view,playerId,lawId=view.activeLaws.civic) {
 const effect=LAWS.find(l=>l.id===lawId)?.effect;if(!effect)return 0;
 const cards=cityBuildings(view,playerId);let count=0;
 if(effect.type==='guildThreshold')count=cards.filter(b=>b.guild===effect.guild).length;
 if(effect.type==='diversityThreshold')count=new Set(cards.map(b=>b.guild)).size;
 if(effect.thresholds)return Math.min(2,Math.max(0,...effect.thresholds.filter(t=>count>=t.atLeast).map(t=>t.points)));
 if(effect.type==='streetCount') {const city=view.players[playerId].city;let streets=0;for(let row=0;row<3;row++){const r=city.slice(row*3,row*3+3);const size=new Set(r.filter(Boolean).map(c=>design(c.designId).guild)).size;if(r.every(Boolean)&&(size===1||size===3))streets++;}return Math.min(effect.cap,streets*effect.pointsEach);}
 return 0;
}
export const fixtureRules=Object.freeze({buildings:BUILDINGS,laws:LAWS,guilds:GUILDS,buildQuote,streetOutcome,civicAward});
