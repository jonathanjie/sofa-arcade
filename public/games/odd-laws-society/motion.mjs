/** UI-only public transition cues. No engine, forecasts, or secret drafts. */
export function publicChanges(previous,next) {
 if(!previous||previous.matchId!==next.matchId)return [];
 const events=[];const event=(type,key,extra={})=>events.push({type,id:`${next.matchId}:${key}`,...extra});
 if(previous.stage==='council'&&next.stage==='council') {
   for(const id of ['jon','lydia'])if(!previous.council?.ready[id]&&next.council?.ready[id])event('seal',`${next.phaseId}:seal:${id}`,{playerId:id});
   // Council balances must remain fixed. Even malformed snapshots never animate a first bid.
   return events;
 }
 if(next.lastCouncil&&next.lastCouncil.phaseId!==previous.lastCouncil?.phaseId)event('reveal',`${next.lastCouncil.phaseId}:reveal`);
 for(const id of ['jon','lydia']) {
   const before=previous.players[id],after=next.players[id];
   const seen=new Set(before.city.filter(Boolean).map(b=>b.instanceId));
   for(const tile of after.city.filter(Boolean))if(!seen.has(tile.instanceId))event('build',`build:${tile.instanceId}`,{playerId:id,instanceId:tile.instanceId});
   if(after.score.streets>before.score.streets)event('street',`${next.phaseId}:${id}:streets`,{playerId:id,amount:after.score.streets-before.score.streets,rows:after.streetEvaluated.flatMap((done,row)=>done&&!before.streetEvaluated[row]?[row]:[])});
   if(after.score.festivals>before.score.festivals)event('festival',`${next.phaseId}:${id}:festival`,{playerId:id,amount:after.score.festivals-before.score.festivals});
   if(after.coins!==before.coins)event('coin',`${next.phaseId}:${id}:coins`,{playerId:id,amount:after.coins-before.coins});
   if(after.influence!==before.influence)event('influence',`${next.phaseId}:${id}:influence`,{playerId:id,amount:after.influence-before.influence});
 }
 if(next.session>previous.session)event('income',`session:${next.session}:income`,{session:next.session});
 if(next.phaseId!==previous.phaseId&&next.stage==='actions')event('turn',`${next.phaseId}:turn`,{playerId:next.activePlayer});
 if(previous.stage!=='finished'&&next.stage==='finished')event(next.result?.winner==='tie'?'tie':'win','result');
 return events;
}
export function createMotion(root,{sound={},reducedMotion=false}={}) {
 const seen=new Set(),animations=new Set(),timers=new Set();let stopped=false;
 const play=name=>{try{sound.effect?.(name);}catch{}};
 const animate=(nodes,frames,options={})=>{for(const node of nodes){if(!node?.animate)continue;const a=node.animate(reducedMotion?[{opacity:.65},{opacity:1}]:frames,{duration:480,easing:'cubic-bezier(.2,.7,.2,1)',...options,...(reducedMotion?{duration:120}:{})});animations.add(a);a.finished.then(()=>animations.delete(a),()=>animations.delete(a));}};
 const clear=()=>{for(const a of animations)a.cancel();animations.clear();for(const timer of timers)clearTimeout(timer);timers.clear();root.querySelectorAll('[data-ols-floating]').forEach(n=>n.remove());};
 function consume(previous,next,{animate:shouldAnimate=true}={}) {
  if(stopped)return [];
  const changes=publicChanges(previous,next),fresh=changes.filter(e=>!seen.has(e.id));
  for(const e of changes)seen.add(e.id);
  // A bounded set is enough for an entire six-session match; reset on rematch.
  if(previous&&previous.matchId!==next.matchId){seen.clear();return [];}
  if(!shouldAnimate)return [];
  for(const e of fresh) {
    const playerNodes=e.playerId?[...root.querySelectorAll(`[data-player-id="${e.playerId}"]`)]:[];
    if(e.type==='build') {const node=[...root.querySelectorAll('[data-instance-id]')].filter(n=>n.dataset.instanceId===e.instanceId);animate(node,[{transform:'translateY(-12px) scale(.85)',opacity:.2},{transform:'translateY(0) scale(1)',opacity:1}]);play('build');}
    if(e.type==='coin'||e.type==='influence') {
      const selector=`[data-resource="${e.type==='coin'?'coins':'influence'}"]`;
      const nodes=playerNodes.flatMap(n=>[...n.querySelectorAll(selector)]);
      animate([...new Set(nodes)],[{transform:'translateY(-4px)',backgroundColor:'#ebd69a'},{transform:'translateY(0)',backgroundColor:'transparent'}]);
      if(e.amount>0)play(e.type);
      const node=nodes[0];if(node&&e.amount){const label=document.createElement('span');label.className='ols-resource-float';label.dataset.olsFloating='';label.textContent=`${e.amount>0?'+':''}${e.amount}`;node.append(label);animate([label],[{transform:'translateY(6px)',opacity:1},{transform:'translateY(-18px)',opacity:0}],{duration:650});const t=setTimeout(()=>{label.remove();timers.delete(t);},700);timers.add(t);}
    }
    if(e.type==='seal') {animate(root.querySelectorAll(`[data-envelope="${e.playerId}"]`),[{transform:'translateY(-8px) rotate(-3deg)'},{transform:'translateY(0) rotate(0)'}]);play('seal');}
    if(e.type==='reveal') {animate(root.querySelectorAll('[data-envelope], [data-revealed-envelope]'),[{transform:'rotateX(-55deg)',opacity:.3},{transform:'rotateX(0)',opacity:1}]);animate(root.querySelectorAll('[data-character="lala"], [data-active-law]'),[{transform:'translateY(-6px)'},{transform:'translateY(3px)',offset:.7},{transform:'translateY(0)'}]);play('reveal');play('stamp');}
    if(e.type==='street') {animate(playerNodes.flatMap(n=>[...n.querySelectorAll('.ols-street')].filter(row=>e.rows.includes(Number(row.dataset.street)))),[{boxShadow:'0 0 0 3px #c69d4e',backgroundColor:'#efdda8'},{boxShadow:'0 0 0 0 transparent',backgroundColor:'transparent'}],{duration:800});play('street');}
    if(['festival','win','tie'].includes(e.type)){animate(root.querySelectorAll('[data-character]'),[{transform:'rotate(-4deg) translateY(0)'},{transform:'rotate(4deg) translateY(-6px)',offset:.5},{transform:'rotate(0) translateY(0)'}]);play(e.type);}
    if(e.type==='turn')animate(root.querySelectorAll(`[data-character="${e.playerId}"]`),[{transform:'translateY(0)'},{transform:'translateY(-5px)',offset:.5},{transform:'translateY(0)'}]);
  }
  return fresh;
 }
 return {consume,clear,dispose(){stopped=true;clear();seen.clear();}};
}
