/** Isolated local fixture model. This is NOT room authority or multiplayer. */
import {makeFixture,projectFixture,refreshScores,BUILDINGS,fixtureRules} from '../fixtures.mjs';
const other=id=>id==='jon'?'lydia':'jon';
export function createFixtureController({scene='council',viewer={role:'host'}}={}) {
 let envelope=makeFixture(scene,viewer),commitments={},serial=0;
 if(envelope.state.council?.ownCommitment)commitments[viewer.playerId]={...envelope.state.council.ownCommitment};
 for(const id of ['jon','lydia'])if(envelope.state.council?.ready[id]&&!commitments[id])commitments[id]={choiceId:'keep',bid:0};
 if(envelope.state.council)envelope.state.council.ownCommitment=null;
 function snapshot(target=viewer) {return {...structuredClone(envelope),state:projectFixture(envelope.state,target,commitments)};}
 function setScene(name) {const revision=envelope.revision+1;envelope=makeFixture(name,viewer);envelope.revision=revision;commitments={};if(envelope.state.council?.ownCommitment)commitments[viewer.playerId]={...envelope.state.council.ownCommitment};for(const id of ['jon','lydia'])if(envelope.state.council?.ready[id]&&!commitments[id])commitments[id]={choiceId:'keep',bid:0};if(envelope.state.council)envelope.state.council.ownCommitment=null;return snapshot();}
 function actAs(playerId,action) {
  if(!['jon','lydia'].includes(playerId))throw new Error('A player seat is required.');
  const v=structuredClone(envelope.state),p=v.players[playerId];
  if(action.matchId!==v.matchId||action.phaseId!==v.phaseId)throw new Error('That turn has ended. Choose an action for the current turn.');
  if(v.stage==='finished')throw new Error('This fixture match is complete.');
  if(action.type==='commitCouncil') {
   if(v.stage!=='council'||v.council.ready[playerId])throw new Error('This council vote is already sealed.');
   if(!v.council.optionIds.includes(action.choiceId)||!Number.isInteger(action.bid)||action.bid<0||action.bid>Math.min(3,p.influence))throw new Error('Choose an offered law and an available bid.');
   commitments[playerId]={choiceId:action.choiceId,bid:action.bid};v.council.ready[playerId]=true;
   if(v.council.ready.jon&&v.council.ready.lydia) {
    const winner=commitments.jon.bid===commitments.lydia.bid?v.chair:commitments.jon.bid>commitments.lydia.bid?'jon':'lydia';const choice=commitments[winner].choiceId;const category=v.council.category;
    if(choice!=='keep')v.activeLaws[category]=choice;
    for(const id of ['jon','lydia'])v.players[id].influence-=commitments[id].bid;
    v.lastCouncil={session:v.session,phaseId:v.phaseId,choices:structuredClone(commitments),adoptedLawId:v.activeLaws[category],category};commitments={};v.council=null;v.stage='actions';v.activePlayer=other(v.chair);v.actionIndex=0;v.phaseId=`${v.matchId}:s${v.session}:a0`;
   }
  } else {
   if(v.stage!=='actions'||v.activePlayer!==playerId)throw new Error('Wait for your city action.');
   if(action.type==='build') {const q=fixtureRules.buildQuote(v,playerId,action.designId);const o=fixtureRules.streetOutcome(v,playerId,action.row,action.col,action.designId);if(!q.allowed||!o.canPlace)throw new Error(q.reason||o.reason);p.coins-=q.cost;p.influence+=q.influenceGain;p.city[action.row*3+action.col]={instanceId:`fixture-built-${playerId}-${++serial}`,designId:action.designId};p.buildsThisSession++;if(o.completes)p.streetEvaluated[action.row]=true;p.score.streets+=o.prestige;v.market.find(s=>s.designId===action.designId).remaining--;}
   else if(action.type==='work')p.coins+=v.activeLaws.economy==='honest-wages'?4:3;
   else if(action.type==='lobby')p.influence=Math.min(6,p.influence+2);
   else if(action.type==='festival') {if(p.coins<3||p.festivalUsed)throw new Error(p.festivalUsed?'Festival already held this session.':'Festival costs 3 coins.');p.coins-=3;p.festivalUsed=true;p.score.festivals+=3+(p.city.some(c=>c&&BUILDINGS.find(d=>d.id===c.designId).ability?.type==='festivalBonus')?1:0);}
   else throw new Error('Unknown fixture action.');
   v.actionsRemaining[playerId]--;v.actionIndex++;
   if(v.actionIndex<6) {v.activePlayer=other(playerId);v.phaseId=`${v.matchId}:s${v.session}:a${v.actionIndex}`;}
   else {
    for(const id of ['jon','lydia'])v.players[id].score.civic+=fixtureRules.civicAward(v,id);
    if(v.session===6) {refreshScores(v);v.phase='finished';v.stage='finished';v.activePlayer=null;v.actionIndex=null;v.phaseId=`${v.matchId}:finished`;const j=v.players.jon.score.total,l=v.players.lydia.score.total;v.result={winner:j===l?'tie':j>l?'jon':'lydia',scores:{jon:j,lydia:l}};}
    else {v.session++;v.term=Math.ceil(v.session/2);v.chair=v.chairSchedule[v.session-1];v.phaseId=`${v.matchId}:s${v.session}:council`;v.stage='council';v.activePlayer=null;v.actionIndex=null;v.actionsRemaining={jon:3,lydia:3};const agenda=v.agenda[v.session-1];v.council={category:agenda.category,optionIds:[...agenda.lawIds,'keep'],ready:{jon:false,lydia:false},ownCommitment:null};for(const seat of Object.values(v.players)){const income=seat.city.filter(Boolean).reduce((n,c)=>n+(BUILDINGS.find(d=>d.id===c.designId).ability?.type==='income'?1:0),0);seat.coins+=3+Math.min(2,income);seat.influence=Math.min(6,seat.influence+1);seat.buildsThisSession=0;seat.festivalUsed=false;}if(v.session===3||v.session===5)v.market=BUILDINGS.filter(d=>d.term===v.term).map(d=>({designId:d.id,remaining:2}));}
   }
  }
  refreshScores(v);envelope={...envelope,revision:envelope.revision+1,phase:v.phase,state:v};return snapshot();
 }
 return {snapshot,setScene,actAs};
}
