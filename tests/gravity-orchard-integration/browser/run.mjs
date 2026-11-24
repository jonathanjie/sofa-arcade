/** Full rendered Gravity Orchard journey. Run against the exact candidate head. */
import assert from 'node:assert/strict';
import {createPilot} from '../../../games/gravity-orchard/validation/pilot.mjs';
import {createBasketExercise} from './basket-exercise.mjs';
import {createSession,until,sleep,view,waitPhase,roomCredential,request,touchDriver,distribution} from './support.mjs';

const run=await createSession();let failure;
const IDS=['jon','lydia'],phones={},drivers={};let tv,code,hostToken;
const phoneSelector=name=>`[data-go3="${name}"]`;
async function readyBoth(){
 for(const id of IDS){
  await phones[id].waitForFunction(()=>document.querySelector('[data-go3="ready"]')&&!document.querySelector('[data-go3="ready"]').disabled);
  const ready=await phones[id].evaluate(id=>window.__go7Probe.view()?.ready[id],id);
  if(!ready)await phones[id].locator(phoneSelector('ready')).click();
 }
 await waitPhase(tv,'playing');
 await Promise.all(IDS.map(id=>phones[id].waitForFunction(()=>document.querySelector('[data-go3="phone"]')?.dataset.controlling==='true')));
}
async function releaseAll(){await Promise.all(IDS.map(id=>drivers[id]?.release()));}
async function chooseTouch(page){await page.locator(phoneSelector('touch-mode')).click();await page.waitForFunction(()=>document.querySelector('[data-go3="phone"]')?.dataset.mode==='touch');}
async function checkLayout(page, phone = false) {
 const targets = phone
   ? ['joystick', 'brake', 'pause', 'recenter', 'help'].map(name => [name, phoneSelector(name)])
   : [['tv', '[data-go-tv]'], ['jon-tray', '[data-tray="jon"]'], ['lydia-tray', '[data-tray="lydia"]']];
 const layout = await page.evaluate(targets => {
   const bounds = targets.flatMap(([name, selector]) => [...document.querySelectorAll(selector)]
     .filter(node => node.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
     .map(node => {
       const { x, y, width, height, bottom } = node.getBoundingClientRect();
       return { name, x, y, width, height, bottom };
     }));
   return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, bounds };
 }, targets);
 assert.deepEqual(layout.bounds.map(item => item.name), targets.map(([name]) => name),
   'Each required control or tray is visible exactly once');
 assert.ok(layout.scrollWidth <= layout.width + 1, `No horizontal overflow (${layout.width})`);
 for (const box of layout.bounds) {
   assert.ok(box.width > 0 && box.height > 0, `${box.name} has visible area`);
   assert.ok(box.x >= -1 && box.x + box.width <= layout.width + 1, `${box.name} horizontal bounds`);
   assert.ok(box.y >= -1 && box.bottom <= layout.height + 1, `${box.name} visible without scrolling`);
   if (phone) assert.ok(box.width >= 47.9 && box.height >= 47.9, `${box.name} touch size`);
 }
 return layout;
}

async function checkPausedAcrossHostTicks(tick, observationMs) {
 await run.waitForHostTicks(observationMs);
 const authority = run.diagnostics(code).coordinator;
 assert.equal(authority.phase, 'paused');
 assert.equal(authority.tick, tick);
}
async function mountPhones(newCode){
 for(const id of IDS){
  await phones[id].goto(`${run.origin}/?join=${newCode}&seat=${id}`);
  await phones[id].locator(`[data-action="claim"][data-player="${id}"]`).click();
  await roomCredential(run,phones[id],newCode,id);
 }
 await tv.locator('[data-action="start"]').click();
 await Promise.all(IDS.map(id=>phones[id].locator(phoneSelector('phone')).waitFor()));
 await waitPhase(tv,'waiting');
}
async function audioSnapshot(page){return page.evaluate(async()=>{const {audio}=await import('/audio.js?v=5');return {settings:audio.getSettings(),native:window.__go7Probe.stats().audio};});}

try{
 tv=await run.page('tv',{width:1280,height:720},{permission:'granted',reducedMotion:'no-preference'});
 phones.jon=await run.page('jon',{width:360,height:800},{phone:true,permission:'denied'});
 phones.lydia=await run.page('lydia',{width:390,height:844},{phone:true,permission:'granted'});
 await tv.goto(run.origin);
 await tv.locator('[data-action="open-game"][data-game="gravity-orchard"]').click();
 await tv.locator('[data-action="orchard-tutorial"]').click();
 await tv.locator('[data-go-tutorial]').waitFor();
 await run.screenshot(tv,'isolated-tutorial');
 await tv.locator('[data-tutorial-action="close"]').click();
 assert.equal(await tv.evaluate(()=>window.__go7Probe.stats().connections),0,'Menu tutorial opens no room or socket');
 await run.screenshot(tv,'collection-cover');
 await tv.locator('[data-action="create"]').click();
 await tv.waitForURL(/\?room=/);code=new URL(tv.url()).searchParams.get('room');
 hostToken=await roomCredential(run,tv,code,'host');
 await mountPhones(code);
 run.check('Ordinary collection card creates one room with TV and two authenticated phone views');
 await phones.jon.locator(phoneSelector('enable-tilt')).click();
 await phones.jon.waitForFunction(()=>document.querySelector('[data-go3="phone"]')?.dataset.sensorState==='denied');
 await run.screenshot(phones.jon,'360-permission-denied');
 await phones.lydia.locator(phoneSelector('enable-tilt')).click();
 await phones.lydia.waitForFunction(()=>document.querySelector('[data-go3="phone"]')?.dataset.sensorState==='no-samples',undefined,{timeout:6000});
 await run.screenshot(phones.lydia,'390-permission-without-samples');
 await Promise.all(IDS.map(id=>chooseTouch(phones[id])));
 run.check('Gesture permission denial and granted-without-samples retain complete touch fallback','Synthetic permission surface on real loopback secure context; no physical sensor or phone trust claim.');
 await readyBoth();
 for(const id of IDS)drivers[id]=await touchDriver(phones[id]);
 run.evidence.layouts=[await checkLayout(tv),...await Promise.all(IDS.map(id=>checkLayout(phones[id],true)))];
 await run.screenshot(tv,'1280-touch-playing');await run.screenshot(phones.jon,'360-touch-playing');await run.screenshot(phones.lydia,'390-touch-playing');
 await tv.setViewportSize({width:1920,height:1080});await run.screenshot(tv,'1920-touch-playing');run.evidence.layouts.push(await checkLayout(tv));await tv.setViewportSize({width:1280,height:720});
 const audio=await audioSnapshot(tv);assert.equal(audio.settings.trackTitle,'Over the Little Bridge');assert.ok(audio.settings.unlocked&&audio.settings.canPlayMusic);assert.equal(audio.native.contexts,1);assert.ok(audio.native.notes>0);
 for(const id of IDS){const quiet=await audioSnapshot(phones[id]);assert.equal(quiet.settings.canPlayMusic,false);assert.equal(quiet.native.notes,0);}
 run.check('One host scheduler plays the composed orchard score; both phones remain silent',audio);

 await drivers.jon.apply({x:.55,y:0,brake:false});await drivers.lydia.apply({x:-.3,y:.2,brake:true});await sleep(250);
 await until(async()=>{const v=await view(tv);return v.players.jon.input.x>.3&&v.players.lydia.input.brake;},'Real steering and simultaneous held Brake');
 const stale=await phones.jon.evaluate(()=>window.__go7Probe.captureInput());
 await releaseAll();
 await phones.jon.evaluate(()=>window.__go7Probe.dropNextAck('pause'));
 await phones.jon.locator(phoneSelector('recenter')).click();
 const paused=await waitPhase(tv,'paused');
 assert.equal(paused.pauseReason,'recenter');
 await until(async()=>phones.jon.evaluate(()=>{const s=window.__go7Probe.stats();return s.droppedAcks===1&&s.commands.some(c=>c.kind==='pause'&&s.commands.filter(other=>other.id===c.id).length>=2);}), 'Lost command acknowledgment retried with the identical ID');
 const beforeReplay=run.diagnostics(code);await phones.jon.evaluate(input=>window.__go7Probe.replayInput(input),stale);
 await until(()=>run.diagnostics(code).coordinator.inputsRejected>beforeReplay.coordinator.inputsRejected,'Old-epoch backlog rejected');
 const afterReplay=await view(tv);assert.equal(afterReplay.runEpoch,paused.runEpoch);assert.equal(afterReplay.phase,'paused');
 run.check('Recenter pauses both gardeners; lost ACK replays once; obsolete input cannot cross the epoch',{epoch:paused.runEpoch,rejectedReasons:run.diagnostics(code).coordinator.rejectedInputReasons});
 await tv.locator('[data-go-action="help"]').click();await tv.locator('[data-go-tutorial]').waitFor();await run.screenshot(tv,'help-paused');
 const beforeTutorial=await view(tv);await checkPausedAcrossHostTicks(beforeTutorial.tick,300);const duringTutorial=await view(tv);assert.equal(duringTutorial.tick,beforeTutorial.tick);assert.deepEqual(duringTutorial.orders,beforeTutorial.orders);
 await tv.locator('[data-tutorial-action="close"]').click();assert.equal((await view(tv)).phase,'paused');
 const oldConnections=await phones.jon.evaluate(()=>window.__go7Probe.stats().connections);await phones.jon.evaluate(()=>window.__go7Probe.disconnect());
 await until(async()=>phones.jon.evaluate(n=>window.__go7Probe.stats().connections>n&&document.querySelector('[data-go3="phone"]')?.dataset.connection==='connected',oldConnections),'Authenticated phone reconnect');
 assert.equal((await view(tv)).phase,'paused');
 run.check('Help is isolated and closes without resuming; socket reconnect retains the same authenticated seat');
 await readyBoth();

 await drivers.jon.apply({x:.65,y:0,brake:false});
 await until(async()=>{const current=await view(tv);return current.players.jon.input.x>.4;},'Held steering before actual browser pagehide');
 const beforeBackground=await view(tv),lifecycleStart=await phones.jon.evaluate(()=>window.__go7Probe.lifecycle().length);
 // Playwright's own foreground capture prevents a CDP freeze from genuinely
 // hiding this document. A real navigation reliably exercises trusted pagehide
 // and socket loss without forging document.hidden or a lifecycle event.
 await phones.jon.goto('about:blank');await drivers.jon.abandonAfterNavigation();delete drivers.jon;
 const backgroundPause=await waitPhase(tv,'paused',10000);
 assert.ok(['requested','network'].includes(backgroundPause.pauseReason));
 assert.ok(backgroundPause.runEpoch>beforeBackground.runEpoch);
 for(const id of IDS)assert.deepEqual(backgroundPause.players[id].input,{x:0,y:0,brake:true});
 await checkPausedAcrossHostTicks(backgroundPause.tick,350);assert.equal((await view(tv)).tick,backgroundPause.tick,'Shared simulation remains stopped while the phone document is absent');
 await phones.jon.goBack();await phones.jon.locator(phoneSelector('phone')).waitFor();await roomCredential(run,phones.jon,code,'jon');
 const lifecycle=await phones.jon.evaluate(start=>window.__go7Probe.lifecycle().slice(start),lifecycleStart);
 assert.ok(lifecycle.some(event=>event.type==='pagehide'&&event.trusted),'Chromium delivered an actual pagehide event');
 await waitPhase(phones.jon,'paused');await chooseTouch(phones.jon);drivers.jon=await touchDriver(phones.jon);await releaseAll();
 assert.equal((await view(tv)).phase,'paused','Returning to the saved phone page never silently resumes the authority');
 assert.deepEqual((await view(tv)).ready,{jon:false,lydia:false});
 await run.screenshot(phones.jon,'360-returned-after-pagehide');
 await phones.jon.locator(phoneSelector('ready')).click();
 await until(async()=>{const current=await view(tv);return current.ready.jon;},'Returned gardener explicitly readies');
 await checkPausedAcrossHostTicks(backgroundPause.tick,300);assert.equal((await view(tv)).phase,'paused','One gardener cannot resume the run alone');
 await readyBoth();
 run.check('Actual pagehide navigation clears held steering; the saved seat returns paused and requires both gardeners ready',{method:'Real navigation to about:blank and browser Back. A test-only sessionStorage key retains trusted pagehide observer records across document replacement; no saved credentials, visibility properties or game state are rewritten. Playwright foreground emulation made CDP freeze ineffective, so this verifies navigation/pagehide and socket loss, not physical phone background/lock behavior.',pauseReason:backgroundPause.pauseReason,fromEpoch:beforeBackground.runEpoch,pausedEpoch:backgroundPause.runEpoch,lifecycle});

 const pilot=createPilot(),started=performance.now(),captured=new Set();let complete=null,lastPhase='playing';const loopDurations=[];let lastNote=0;
 while(performance.now()-started<420000){
  const begin=performance.now(),current=await view(tv);if(!current){await sleep(30);continue;}
  if(current.phase==='finished'){await releaseAll();complete=current;break;}
  if(current.phase==='interlude'){
   await releaseAll();await run.screenshot(tv,`stage-${current.stageIndex+1}-result`);run.check(`Authored stage ${current.stageIndex+1} completed through rendered touch controls`,current.results.at(-1));
   assert.equal(current.results.at(-1).ordersCompleted,4,'Every authored stage completes four recipes');
   await readyBoth();lastPhase='playing';continue;
  }
  if(current.phase==='paused')throw new Error(`Unexpected shared pause during campaign: ${current.pauseReason}`);
  if(current.phase==='playing'){
   if(lastPhase!=='playing')pilot.reset();
   const controls=pilot.update(current);
   try{await Promise.all(IDS.map(id=>drivers[id].apply(controls[id])));}
   catch(error){
    // Play can end between reading the TV and touching the phones: the last
    // buffered fruit may complete two orders on one tick, and the joystick
    // then leaves the phone. That alone is expected; anything else still fails.
    const latest=await view(tv);
    if(latest?.phase==='playing')throw error;
    continue;
   }
   if(!captured.has(current.stageIndex)&&current.fruits.length>=2){captured.add(current.stageIndex);await Promise.all(IDS.map(id=>drivers[id].apply({x:0,y:0,brake:true})));await run.screenshot(tv,`stage-${current.stageIndex+1}-active`);}
  }
  lastPhase=current.phase;
  loopDurations.push(performance.now()-begin);
  if(performance.now()-lastNote>10000){lastNote=performance.now();console.log(`GO7 campaign stage ${current.stageIndex+1}, tick ${current.tick}, orders ${current.orders.completedIds.length}/4`);}
  await sleep(Math.max(0,50-(performance.now()-begin)));
 }
 assert.ok(complete,'Real-time campaign reached its final result');
 assert.equal(complete.results.length,3);assert.equal(complete.results.reduce((n,r)=>n+r.ordersCompleted,0),12);assert.equal(complete.results.reduce((n,r)=>n+r.stars,0),9);
 run.evidence.campaign={results:complete.results,wallMs:performance.now()-started,controlLoopMs:distribution(loopDurations),method:'Public-view route planner, nominal 20 Hz; real rendered CDP touch pointers and held Brake; real 60 Hz host. Planner can only read public positions/geometry.'};
 const observed=await tv.evaluate(()=>window.__go7Probe.stats().events);const spawns=new Map(observed.filter(e=>e.kind==='spawn').map(e=>[e.entityId,e]));const crossings=observed.filter(e=>e.kind==='catch'&&spawns.get(e.entityId)?.playerId!==e.playerId).map(e=>({from:spawns.get(e.entityId).playerId,to:e.playerId,stageIndex:e.stageIndex,fruit:spawns.get(e.entityId).data.fruitType}));
 assert.ok(crossings.some(e=>e.from==='jon'&&e.to==='lydia'));assert.ok(crossings.some(e=>e.from==='lydia'&&e.to==='jon'));
 run.evidence.crossings=crossings;run.check('All three stages finish with twelve orders and nine stars, including transfers in both directions',complete.results);
 await run.screenshot(tv,'1280-final-results');await tv.setViewportSize({width:1920,height:1080});await run.screenshot(tv,'1920-final-results');await tv.setViewportSize({width:1280,height:720});await run.screenshot(phones.jon,'360-final-results');await run.screenshot(phones.lydia,'390-final-results');

 const finalMatch=complete.matchId;
 await tv.locator('[data-go-action="retry-stage"]').click();const retry=await waitPhase(tv,'waiting');assert.equal(retry.stageIndex,2);assert.equal(retry.results.length,2);assert.equal(retry.matchId,finalMatch);assert.ok(retry.runEpoch>complete.runEpoch);
 await readyBoth();await phones.jon.locator(phoneSelector('pause')).click();await waitPhase(tv,'paused');
 await tv.locator('[data-go-action="rematch-same"]').click();const same=await waitPhase(tv,'waiting');assert.notEqual(same.matchId,finalMatch);assert.equal(same.stageIndex,0);assert.equal(same.results.length,0);
 await readyBoth();await phones.jon.locator(phoneSelector('pause')).click();await waitPhase(tv,'paused');
 await tv.locator('[data-go-action="rematch-new"]').click();const fresh=await waitPhase(tv,'waiting');assert.notEqual(fresh.matchId,same.matchId);assert.equal(fresh.stageIndex,0);assert.equal(fresh.results.length,0);
 run.check('Completed-stage retry retains earlier results; same/new-seed rematches allocate fresh matches',{retryStage:retry.stageIndex,retainedResults:retry.results.length,oldMatch:finalMatch,sameMatch:same.matchId,newMatch:fresh.matchId});

 run.evidence.transport={host:run.diagnostics(code),phones:{}};
 for(const id of IDS){const stats=await phones[id].evaluate(()=>window.__go7Probe.stats());assert.equal(stats.secretFrame,false);assert.ok(stats.ackRttMs.length>20);run.evidence.transport.phones[id]={frames:stats.frames,inputs:stats.inputs,connections:stats.connections,droppedAcks:stats.droppedAcks,maxBufferedBytes:stats.maxBufferedBytes,ackRttMs:distribution(stats.ackRttMs),observedTickAgeAtApply:distribution(stats.observedTickAgeAtApply)};}
 assert.ok(run.evidence.transport.host.coordinator.inputsAccepted>1000);assert.ok(run.evidence.transport.host.checkpointWrites<run.evidence.transport.host.coordinator.inputsAccepted/20,'Checkpoint writes remain far below motion samples');
 run.evidence.transport.method='Applied-input ACK RTT measured within each browser performance clock, from sending a sequence to receipt of its applied acknowledgment. Tick age is appliedTick minus that input’s observedTick. Host counters are read directly from the same actual coordinator. No unsynchronized wall-clock subtraction and no one-way latency claim.';
 run.check('Measured bounded transport and checkpoint writes without serializing credentials',run.evidence.transport);
 run.evidence.renderCadence={method:'requestAnimationFrame timestamp intervals, only while each document is visible and the authoritative game phase is playing. Counts above 25, 33.4, 50 and 100 ms expose callback gaps. These are same-machine Chromium scheduling measurements with active automation/screenshots, not GPU render duration, paint completion, physical display refresh or TV casting latency.',pages:{}};
 for(const [name,page] of [['tv',tv],...IDS.map(id=>[id,phones[id]])]){const {intervalsMs,...counts}=await page.evaluate(()=>window.__go7Probe.frameCadence());assert.ok(counts.samples>60,`${name} records visible playing-frame cadence`);run.evidence.renderCadence.pages[name]={...counts,callbackIntervalMs:distribution(intervalsMs)};}
 run.check('Recorded visible TV and phone frame-callback cadence without claiming GPU render time',run.evidence.renderCadence);
 await Promise.all(IDS.map(id=>drivers[id].close()));for(const id of IDS)delete drivers[id];
 await phones.jon.reload();await phones.jon.locator(phoneSelector('phone')).waitFor();await chooseTouch(phones.jon);
 await readyBoth();assert.equal(await phones.jon.evaluate(()=>window.__go7Probe.stats().connections),1,'Saved-room restoration keeps its one live socket owner');
 await phones.jon.locator(phoneSelector('pause')).click();await waitPhase(tv,'paused');
 run.check('A saved phone reload restores the mounted authenticated controller and resumes through both-ready');
 await tv.locator('[data-go-action="exit"]').click();await tv.locator('.arcade-home').waitFor();
 await tv.locator('[data-action="open-game"][data-game="gravity-orchard"]').click();await tv.locator('[data-action="orchard-practice"]').click();await tv.waitForURL(/\?room=/);const practiceCode=new URL(tv.url()).searchParams.get('room');assert.notEqual(practiceCode,code);code=practiceCode;hostToken=await roomCredential(run,tv,code,'host');await mountPhones(code);
 await chooseTouch(phones.jon);
 await phones.lydia.locator(phoneSelector('enable-tilt')).click();
 await phones.lydia.evaluate(async()=>{for(let i=0;i<50;i++){window.__go7Probe.orientation(35,0);await new Promise(resolve=>setTimeout(resolve,16));}});
 await phones.lydia.waitForFunction(()=>document.querySelector('[data-go3="ready"]')&&!document.querySelector('[data-go3="ready"]').disabled);
 await readyBoth();
 assert.equal((await view(tv)).mode,'practice');assert.equal((await view(tv)).timeRemainingTicks,null);
 await phones.lydia.evaluate(()=>window.__go7Probe.orientation(35,18));
 await until(async()=>{const current=await view(tv);return current.players.lydia.input.x>.25;},'Synthetic calibrated tilt reaches authoritative simulation');
 await run.screenshot(phones.lydia,'390-synthetic-tilt-practice');await sleep(600);
 assert.ok((await view(tv)).players.lydia.input.x>.25,'Unchanged synthetic orientation retains its latest vector');
 await phones.lydia.locator(phoneSelector('recenter')).click();await waitPhase(tv,'paused');
 await phones.lydia.locator(phoneSelector('help')).click();await phones.lydia.locator(phoneSelector('help-touch')).click();
 await readyBoth();
 for(const id of IDS)drivers[id]=await touchDriver(phones[id]);
 const basketExercise=createBasketExercise(),basketStarted=performance.now();let fullBasketCaptured=false,lastBasketNote=0;
 try{
  while(!basketExercise.done&&performance.now()-basketStarted<105000){
   const begin=performance.now(),current=await view(tv);
   assert.equal(current.phase,'playing','Practice remains active during the deliberate contact exercise');
   const controls=basketExercise.update(current);await Promise.all(IDS.map(id=>drivers[id].apply(controls[id])));
   const progress=basketExercise.inspect();
   if(progress.full&&!fullBasketCaptured){fullBasketCaptured=true;await Promise.all(IDS.map(id=>drivers[id].apply({x:0,y:0,brake:true})));await run.screenshot(tv,'1280-full-basket');}
   if(performance.now()-lastBasketNote>10000){lastBasketNote=performance.now();console.log(`GO7 basket contact ${progress.mode}, tick ${current.tick}, plum buffer ${current.baskets.plum.count}/3`);}
   await sleep(Math.max(0,50-(performance.now()-begin)));
  }
 }finally{
  await releaseAll();run.evidence.basketExercise={...basketExercise.inspect(),wallMs:performance.now()-basketStarted,method:'Untimed practice through real rendered CDP touch pointers, using public fruit positions, public basket coordinates and the unchanged GO1 findRoute helper. Fill plums, pears and starfruit while withholding apples from the first recipe. Route one surplus plum to its full basket, then the same fruit to the wrong apple basket. No engine imports, state setters, private supply access or synthetic snapshots.'};
 }
 assert.ok(basketExercise.done,'Deliberate full/wrong basket exercise completes within its bounded wall time; diagnostic state is retained in evidence');
 const {full,wrong,captures}=run.evidence.basketExercise;
 assert.equal(full.baskets.plum.count,3);assert.equal(full.event.data.reason,'full');assert.ok(full.fruit,'Full rejection retains the active fruit');
 assert.equal(wrong.event.data.reason,'wrong');assert.equal(wrong.event.entityId,full.event.entityId);assert.ok(wrong.fruit,'Wrong rejection retains the same active fruit');
 assert.equal(wrong.fruit.id,full.fruit.id);assert.equal(wrong.fruit.type,'plum');assert.equal(wrong.baskets.plum.count,3);assert.equal(wrong.baskets.apple.count,full.baskets.apple.count);
 assert.equal(captures.filter(event=>event.entityId===full.fruit.id).length,0,'Neither rejected contact consumes the surplus plum');
 assert.equal(new Set(captures.map(event=>event.entityId)).size,captures.length,'Successful buffered fruit are captured exactly once');
 await run.screenshot(tv,'1280-wrong-basket');await run.screenshot(phones.jon,'360-buffered-practice');
 run.check('Rendered practice fills real buffers and preserves the same fruit across full and wrong basket rejection',{wallMs:run.evidence.basketExercise.wallMs,full,wrong,capturedFruit:captures.length});
 await Promise.all(IDS.map(id=>drivers[id].close()));for(const id of IDS)delete drivers[id];
 const beforeRecovery=await view(tv);await run.restart();
 const restored=await until(async()=>{const current=await view(tv);return current?.phase==='paused'&&current.pauseReason==='recovery'&&current.runEpoch>beforeRecovery.runEpoch&&current;},'Durable host recovery in live TV and phones',20000);
 assert.equal(restored.matchId,beforeRecovery.matchId);assert.equal(restored.timeRemainingTicks,null);
 const durable=await request(run,`/api/rooms/${code}`,{token:hostToken});assert.equal(durable.state.matchId,restored.matchId);assert.equal(durable.state.runEpoch,restored.runEpoch);
 await run.screenshot(tv,'paused-recovery');
 run.check('Practice uses the same authority; synthetic tilt works; restart restores paused with a fresh epoch',{sensor:'Synthetic beta/gamma events through the real mounted controller; not physical phone evidence.',before:{tick:beforeRecovery.tick,epoch:beforeRecovery.runEpoch},after:{tick:restored.tick,epoch:restored.runEpoch},mode:restored.mode});
 await readyBoth();
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,350);
 const stalled=await waitPhase(tv,'paused');assert.equal(stalled.pauseReason,'host-stall');
 run.check('An actual 350 ms host event-loop stall pauses rather than fast-forwarding',run.diagnostics(code).coordinator);
 await tv.emulateMedia({reducedMotion:'reduce'});await tv.waitForFunction(()=>document.querySelector('[data-go-tv]')?.dataset.reducedMotion==='true');await run.screenshot(tv,'reduced-motion-paused');
 const imageReport=await tv.evaluate(async()=>{const urls=[...new Set([...document.querySelectorAll('[data-go-tv] image')].map(n=>n.getAttribute('href')).filter(Boolean))];for(const url of urls){const img=new Image();img.src=url;await img.decode();}return urls;});
 assert.ok(imageReport.some(url=>url.includes('/assets/gravity-orchard/characters/')),'Final character atlases are rendered');assert.ok(imageReport.some(url=>url.includes('/assets/gravity-orchard/environments/')),'Final orchard environment is rendered');run.evidence.renderedAssets=imageReport;
 assert.deepEqual(run.evidence.externalRequests,[]);assert.deepEqual(run.evidence.failedResponses,[]);assert.deepEqual(run.evidence.errors,[]);
 run.check('Final local assets decode, reduced motion preserves state, and no external runtime requests or browser errors occur',imageReport.length);
 await tv.locator('[data-go-action="exit"]').click();await tv.locator('.arcade-home').waitFor();const menu=await audioSnapshot(tv);assert.equal(menu.native.contexts,1);assert.notEqual(menu.settings.trackTitle,'Over the Little Bridge');
 run.check('Leaving the orchard disposes gameplay and returns to the composed collection menu',menu);
}catch(error){failure=error;}finally{for(const driver of Object.values(drivers))try{await driver.close();}catch{}await run.finish(failure);}
if(failure)throw failure;
