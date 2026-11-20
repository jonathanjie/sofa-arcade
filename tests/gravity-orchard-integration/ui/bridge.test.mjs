import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOrchardAssets, createOrchardSound, mountGravityOrchard, realtimeURL } from '../../../ui/games/gravity-orchard/index.mjs';
import { MANIFEST } from '../../../ui/media/gravity-orchard/manifest.mjs';
import { readTransportConfig, trustedPhoneOrigin } from '../../../ui/transport.mjs';

const waiting = JSON.parse(await readFile(new URL('../../../games/gravity-orchard/fixtures/projected/waiting.json', import.meta.url)));
const publicView = waiting.view || waiting;
const tick = () => new Promise(resolve => queueMicrotask(resolve));

function harness(role = 'host') {
  const events = [], mounts = [], sent = [], input = [], snapshots = [];
  let callbacks, connects = 0, disposed = 0, presentationDisposed = 0;
  const viewer = {role, playerId: role === 'player' ? 'jon' : null};
  const root = {dataset: {}, ownerDocument: {defaultView: {performance: {now: () => 500}}}, querySelector: () => null};
  const client = {
    connect() {connects++;}, dispose() {disposed++;},
    setInput(value) {input.push(value);return true;},
    sendCommand(value) {sent.push(value);return Promise.resolve({accepted:true,id:value.id});},
    getStats() {return {viewer,connected:true};},
  };
  const mount = (_root, options) => {
    mounts.push(options);
    return {update(view) {events.push(['view',view]);},setConnection(status) {events.push(['connection',status]);},dispose() {presentationDisposed++;}};
  };
  const game = mountGravityOrchard(root,{viewer,code:'ABC234',token:'test-credential',origin:'http://127.0.0.1:4177',initialRoom:{state:publicView},onView:view=>snapshots.push(view)}, {
    createRealtimeClient(options) {callbacks=options;return client;},mountPhone:mount,mountTV:mount,
  });
  return {game,root,events,mounts,sent,input,snapshots,client,viewer,get callbacks(){return callbacks;},get connects(){return connects;},get disposed(){return disposed;},get presentationDisposed(){return presentationDisposed;}};
}

function message(view) {return {view,presence:{jon:{connected:true,inputFresh:true},lydia:{connected:true,inputFresh:true}}};}

test('GO5 final character records become bounded per-pose GO4 atlases and basket keys resolve', () => {
  const media = createOrchardAssets();
  for(const [actor,states] of Object.entries(MANIFEST.characterStates))for(const [pose,state] of Object.entries(states)){
    const entry=media.assets[media.characterStates[actor][pose]];
    assert.equal(entry.src,MANIFEST.assets[state.asset].src);
    assert.deepEqual(entry.frames[0],MANIFEST.assets[state.asset].frames[state.reducedMotionFrame]);
    assert.equal(entry.frames.length,state.frames.length);
    for(const frame of entry.frames){assert.ok(frame.x+frame.width<=entry.width);assert.ok(frame.y+frame.height<=entry.height);}
    assert.equal(media.resolve(`character.${actor}.${pose}`),entry);
  }
  for(const fruit of ['apple','plum','pear','starfruit']){
    assert.equal(media.resolve(`fruit.${fruit}`).src,MANIFEST.assets[`fruit-${fruit}`].src);
    assert.equal(media.resolve(`basket.${fruit}`).src,MANIFEST.assets[`basket-${fruit}-ordinary`].src);
    assert.equal(media.resolve(`basket.${fruit}.full`).src,MANIFEST.assets[`basket-${fruit}-full`].src);
  }
  assert.equal(media.resolve('unknown'),null);
});

test('same-origin endpoint derives WS or WSS without copying query, fragment or bearer', () => {
  assert.equal(realtimeURL('http://127.0.0.1:4177/?room=ABC234'),'ws://127.0.0.1:4177/api/realtime/gravity-orchard');
  assert.equal(realtimeURL('https://192.168.0.4:4178'),'wss://192.168.0.4:4178/api/realtime/gravity-orchard');
  assert.throws(()=>realtimeURL('ftp://127.0.0.1'));
});

test('candidate capability requires explicit local host metadata; existing config shape stays compatible', () => {
  const document = values => ({querySelector: key => values[key] ? {getAttribute:()=>values[key]} : null});
  const meta = {'meta[name="sofa-transport"]':'lan','meta[name="sofa-gravity-orchard"]':'candidate'};
  assert.equal(readTransportConfig({document:document(meta),origin:'http://127.0.0.1:4177'}).gravityOrchard,true);
  assert.equal(readTransportConfig({document:document({...meta,'meta[name="sofa-transport"]':'cloud'}),origin:'http://127.0.0.1:4177'}).gravityOrchard,undefined);
  assert.equal(readTransportConfig({document:document({}),origin:'http://192.168.1.9:4177'}).gravityOrchard,undefined);
});

test('trusted phone QR chooses the current LAN address and excludes local-only origins', () => {
  const status={status:'ready',controllerOrigins:['https://127.0.0.1:4178','https://192.168.2.8:4178','https://192.168.1.7:4178','https://localhost:4178']};
  assert.equal(trustedPhoneOrigin(status,'http://192.168.1.7:4177'),'https://192.168.1.7:4178');
  assert.equal(trustedPhoneOrigin(status,'http://127.0.0.1:4177'),'https://192.168.2.8:4178');
  assert.equal(trustedPhoneOrigin({...status,status:'disabled'},'http://192.168.1.7:4177'),null);
  assert.equal(trustedPhoneOrigin({status:'ready',controllerOrigins:['https://127.0.0.1:4178','https://[::1]:4178','https://localhost:4178','http://192.168.1.7:4177']},'http://127.0.0.1:4177'),null);
  assert.equal(trustedPhoneOrigin({status:'ready',controllerOrigins:['https://jon-mac.local:4178']},'http://jon-mac.local:4177'),'https://jon-mac.local:4178');
});

test('one authenticated realtime client forwards presence before views and survives whole-run rematches', () => {
  const h=harness();
  assert.equal(h.connects,1);assert.equal(h.mounts.length,1);
  assert.equal(h.callbacks.token,'test-credential');assert.ok(!h.callbacks.url.includes(h.callbacks.token));
  assert.ok(!Object.hasOwn(h.mounts[0],'token'));assert.ok(!Object.hasOwn(h.mounts[0],'room'));
  h.events.length=0;
  const view={...publicView,phase:'playing',tick:30};h.callbacks.onSnapshot(message(view));
  assert.equal(h.events[0][0],'connection');assert.equal(h.events[0][1].state,'connected');assert.equal(h.events[0][1].presence.jon.connected,true);assert.equal(h.events[1][0],'view');
  h.callbacks.onSnapshot(message({...view,matchId:'rematch-1',runEpoch:0,tick:0,phase:'waiting'}));
  assert.equal(h.mounts.length,1);assert.equal(h.connects,1);assert.equal(h.root.dataset.matchId,'rematch-1');
  h.game.dispose();
});

test('late HTTP/SSE and obsolete epochs cannot rewind the ordered realtime presentation', () => {
  const h=harness();
  const active={...publicView,phase:'playing',runEpoch:3,tick:100};h.callbacks.onSnapshot(message(active));
  h.game.receive({code:'ABC234',gameId:'gravity-orchard',state:{...publicView,tick:3}});
  h.callbacks.onSnapshot(message({...active,runEpoch:2,tick:99}));
  h.callbacks.onSnapshot(message({...active,tick:99}));
  assert.equal(h.root.dataset.tick,'100');
  h.callbacks.onSnapshot(message({...active,runEpoch:4,tick:50,phase:'paused',pauseReason:'recovery'}));
  assert.equal(h.root.dataset.tick,'50');assert.equal(h.root.dataset.runEpoch,'4');
  h.game.dispose();
});

test('phone input and commands stay at the narrow control seam; explicit IDs remain unchanged', async () => {
  const h=harness('player');
  const input={x:.5,y:-.2,brake:false};h.mounts[0].input.setInput(input);
  assert.deepEqual(h.input.at(-1),input);
  await h.mounts[0].onCommand({id:'phone-7',kind:'ready',payload:{value:true}});
  assert.deepEqual(h.sent.at(-1),{id:'phone-7',kind:'ready',payload:{value:true}});
  assert.ok(!Object.hasOwn(h.sent[0],'playerId'));assert.ok(!Object.hasOwn(h.sent[0],'actor'));
  h.game.dispose();
});

test('host pause is reliable and neutralizes local input without inventing player readiness', async () => {
  const h=harness();
  h.callbacks.onSnapshot(message({...publicView,phase:'playing',tick:10}));
  await h.game.pause('help');
  assert.deepEqual(h.input.at(-1),{x:0,y:0,brake:true});
  assert.equal(h.sent.at(-1).kind,'pause');assert.deepEqual(h.sent.at(-1).payload,{reason:'help'});
  assert.ok(h.sent.at(-1).id);assert.equal(h.sent.filter(c=>c.kind==='ready').length,0);
  h.game.dispose();
});

test('authenticated viewer mismatch fails closed and does not display the foreign view', () => {
  const h=harness('player');
  const count=h.snapshots.length;
  h.viewer.playerId='lydia';
  h.callbacks.onSnapshot(message({...publicView,tick:20}));
  assert.equal(h.snapshots.length,count);assert.equal(h.events.at(-1)[1].state,'error');assert.equal(h.disposed,1);
  h.game.dispose();
});

test('disposal is idempotent and fences late socket callbacks and generated audio work', async () => {
  const h=harness();const count=h.snapshots.length;
  h.game.dispose();h.game.dispose();
  h.callbacks.onSnapshot(message({...publicView,tick:20}));h.callbacks.onStatus({state:'connected'});
  assert.equal(h.snapshots.length,count);assert.equal(h.disposed,1);assert.equal(h.presentationDisposed,1);
  assert.deepEqual(h.root.dataset,{});
  await assert.rejects(h.game.sendCommand({kind:'pause',payload:{reason:'help'}}),/closed/);
});

test('canonical cue priority, cooldown and stable event IDs survive pause and reset only on a new match', async () => {
  let now=0;const effects=[],contexts=[];
  const sound=createOrchardSound({effect:name=>effects.push(name),setContext:context=>contexts.push(context)},{now:()=>now});
  sound.reset({matchId:'one',runEpoch:0});sound.setScene('stage1');sound.setScene('bogus');
  sound.effect('catch',{id:'1'});sound.effect('order',{id:'2'});await tick();
  assert.deepEqual(effects,['order']);assert.deepEqual(contexts,[{scoreScene:'stage1'}]);
  sound.effect('order',{id:'3'});await tick();assert.deepEqual(effects,['order']);
  now=1000;sound.effect('order',{id:'2'});await tick();assert.deepEqual(effects,['order']);
  sound.reset({matchId:'one',runEpoch:1});sound.effect('order',{id:'2'});await tick();assert.deepEqual(effects,['order']);
  sound.reset({matchId:'two',runEpoch:0});sound.effect('order',{id:'2'});await tick();assert.deepEqual(effects,['order','order']);
  sound.effect('finish',{id:'4'});sound.dispose();await tick();assert.deepEqual(effects,['order','order']);
});

test('phone cue adapter never produces effects or scene mutations even if asked', async () => {
  const sound=createOrchardSound({effect(){assert.fail('phone effect');},setContext(){assert.fail('phone scene');}},{role:'player'});
  sound.reset({matchId:'one',runEpoch:0});sound.setScene('stage1');sound.effect('finish',{id:'1'});await tick();sound.dispose();
});
