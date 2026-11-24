import {mount} from '../index.mjs';
import {fixtureRules,SCENES} from '../fixtures.mjs';
import {createFixtureController} from './controller.mjs';
const params=new URLSearchParams(location.search),seat=params.get('viewer')||'host';
const viewer=['jon','lydia'].includes(seat)?{role:'player',playerId:seat}:{role:seat==='public'?'public':'host'};
const initialScene=SCENES.includes(params.get('scene'))?params.get('scene'):'council';
const root=document.getElementById('game'),controls=document.getElementById('fixture-controls');
controls.innerHTML=`<strong>WS3 FIXTURE</strong><span>Local simulation · not integrated multiplayer</span><label><span>Scene </span><select aria-label="Fixture scene">${SCENES.map(scene=>`<option${scene===initialScene?' selected':''}>${scene}</option>`).join('')}</select></label><nav aria-label="Fixture viewers"><a href="/?viewer=host&scene=${initialScene}">TV</a><a href="/?viewer=jon&scene=${initialScene}">Jon</a><a href="/?viewer=lydia&scene=${initialScene}">Lydia</a><a href="/?table=1&scene=${initialScene}">Table</a></nav>`;
const select=controls.querySelector('select');
const controller=createFixtureController({scene:initialScene,viewer});

if(params.has('table')) {
 root.className='fixture-table';
 for(const id of ['host','jon','lydia']){const iframe=document.createElement('iframe');iframe.title=id==='host'?'TV public projected fixture':`${id==='jon'?'Jon':'Lydia'} private projected fixture`;iframe.src=`/?viewer=${id}&embedded=1&scene=${initialScene}`;iframe.dataset.seat=id;root.append(iframe);}
 function broadcast(){for(const frame of root.querySelectorAll('iframe')){const id=frame.dataset.seat;frame.contentWindow.postMessage({fixture:true,type:'snapshot',room:controller.snapshot(id==='host'?{role:'host'}:{role:'player',playerId:id})},location.origin);}}
 window.addEventListener('message',event=>{if(event.origin!==location.origin||!event.data?.fixture)return;const frame=[...root.querySelectorAll('iframe')].find(f=>f.contentWindow===event.source);if(!frame)return;if(event.data.type==='ready'){broadcast();return;}if(event.data.type==='command'){try{controller.actAs(frame.dataset.seat,event.data.action);broadcast();event.source.postMessage({fixture:true,type:'ack',id:event.data.id,room:controller.snapshot({role:'player',playerId:frame.dataset.seat})},location.origin);}catch(error){event.source.postMessage({fixture:true,type:'reject',id:event.data.id,message:error.message},location.origin);}}});
 select.addEventListener('change',()=>{controller.setScene(select.value);broadcast();});
 window.fixtureTable={snapshot:target=>controller.snapshot(target),setScene:scene=>{controller.setScene(scene);broadcast();}};
} else {
 const commands=[],events=[],pendingAcks=new Map();let view=null,displayed=controller.snapshot(),rejectMessage=null,hold=false,release=null,disposed=false;
 const embedded=params.has('embedded')&&parent!==window;let initialized=!embedded;
 if(embedded){controls.querySelector('nav').remove();controls.querySelector('label').remove();}
 const assets=params.get('media')==='broken'?{manifestUrl:new URL('/missing/manifest.json',location.href).href,manifest:{buildings:Object.fromEntries(fixtureRules.buildings.map(d=>[d.id,{src:`${d.id}.png`,width:120,height:100,alt:d.name,status:'placeholder'}])),characters:{jon:{states:{acting:{src:'jon.png',width:120,height:120,alt:'Jon',status:'placeholder'}}}}}}:{manifest:{schemaVersion:1,gameId:'odd-laws-society',buildings:{},laws:{},guilds:{},characters:{},props:{}},manifestUrl:new URL('/placeholder/manifest.json',location.href).href};
 const sound={unlock(){events.push({type:'unlock'});},setScene(scene){events.push({type:'scene',scene});},effect(name){events.push({type:'effect',name});}};
 function receive(room){const accepted=view?.update(room);if(accepted){initialized=true;displayed=structuredClone(room);}return accepted;}
 async function dispatch(action) {
  commands.push(structuredClone(action));events.push({type:'dispatch',actionType:action.type});
  if(rejectMessage){const message=rejectMessage;rejectMessage=null;throw new Error(message);}
  let next;
  if(embedded){next=await new Promise((resolve,reject)=>{const id=commands.length;pendingAcks.set(id,{resolve,reject});parent.postMessage({fixture:true,type:'command',id,action},location.origin);});}
  else next=controller.actAs(viewer.playerId,action);
  if(hold){hold=false;await new Promise(resolve=>{release=resolve;});}
  if(!disposed&&next.revision>displayed.revision)displayed=structuredClone(next);
  return next;
 }
 function remount(){view?.dispose();disposed=false;view=mount(root,{viewer,dispatch,rules:fixtureRules,assets,sound,preferences:{reducedMotion:params.get('reduced')==='1'},onExit(){disposed=true;root.innerHTML='<div class="fixture-exited"><h1>Returned to Sofa Arcade</h1><p>The fixture view has been disposed.</p><a href="/">Open a fresh fixture</a></div>';},onHelp(){events.push({type:'help'});}});if(initialized)view.update(displayed);}
 remount();
 if(embedded){window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||!event.data?.fixture)return;const data=event.data;if(data.type==='snapshot')receive(data.room);if(data.type==='ack'||data.type==='reject'){const pending=pendingAcks.get(data.id);if(!pending)return;pendingAcks.delete(data.id);if(data.type==='ack')pending.resolve(data.room);else pending.reject(new Error(data.message));}});parent.postMessage({fixture:true,type:'ready'},location.origin);}
 select.addEventListener('change',()=>receive(controller.setScene(select.value)));
 window.fixture={
  get room(){return structuredClone(displayed);},viewer,commands,events,rules:fixtureRules,
  snapshot(){return structuredClone(displayed);},
  setScene(scene){select.value=scene;return receive(controller.setScene(scene));},
  update:receive,setConnection(status){view?.setConnection(status);},
  rejectNext(message){rejectMessage=message;},holdNext(){hold=true;},async releaseNext(){
   if (!release) throw new Error('No fixture response is pending.');
   release();
   release=null;
   // The awaiting dispatch and UI update finish in microtasks before the next frame.
   await new Promise(resolve=>requestAnimationFrame(resolve));
  },
  dispose(){disposed=true;view?.dispose();},remount,
  actAs(playerId,action){const v=controller.snapshot().state;const next=controller.actAs(playerId,{matchId:v.matchId,phaseId:v.phaseId,...action});receive(next);return next;},
  project(target){return controller.snapshot(target);},
 };
}
