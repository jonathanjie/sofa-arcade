/** Real GO7 browser acceptance. Observers retain public data only; authority stays in the host. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {startLanServer} from '../../../server/lan.mjs';

export const root=fileURLToPath(new URL('../../../',import.meta.url));
export const evidenceRoot=path.resolve(process.env.SOFA_GO7_EVIDENCE_DIR||process.env.SOFA_EVIDENCE_DIR||path.join(root,'tests/gravity-orchard-integration/evidence'));
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(fn,label,timeout=15000){const end=performance.now()+timeout;while(performance.now()<end){const value=await fn();if(value)return value;await sleep(35);}throw new Error(`Timed out: ${label}`);}
export function distribution(values){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);const q=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:null;return {count:sorted.length,min:q(0),median:q(.5),p95:q(.95),p99:q(.99),max:q(1)};}

export async function createSession(){
 const temp=await mkdtemp(path.join(tmpdir(),'sofa-go7-browser-'));
 const options={root,databasePath:path.join(temp,'rooms.sqlite'),host:'127.0.0.1',port:0,enableGravityOrchard:true,realtimeSeed:'orchard-proof-1',heartbeatMs:500};
 let server=await startLanServer(options);const origin=server.origin,port=server.port;let browser;
 try{browser=await chromium.launch({headless:true,...(process.env.SOFA_CHROMIUM?{executablePath:process.env.SOFA_CHROMIUM}:{})});}
 catch(error){await server.close();await rm(temp,{recursive:true,force:true});throw error;}
 await mkdir(evidenceRoot,{recursive:true});
 const secrets=new Set(),pages=[],screenshots=[],checks=[],errors=[],external=[],failed=[];
 const redact=value=>{let text=String(value);for(const secret of secrets)text=text.split(secret).join('[REDACTED]');return text.replace(/Bearer\s+[A-Za-z0-9_-]{24,128}/g,'Bearer [REDACTED]');};
 const evidence={suite:'gravity-orchard-integration',startedAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirtyPaths:execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean),environment:{platform:process.platform,arch:process.arch,node:process.version,browser:browser.version()},method:'One real Node/SQLite LAN host and three isolated rendered Chromium contexts. Initial seed only pinned to orchard-proof-1. Real GO3 touch pointers, GO2 WebSockets, GO1 60 Hz authority, GO4 TV and GO5 final artwork/score. No engine state setters, teleports, frame advancement or client score authority. Sensor cases use labelled synthetic browser events. Loopback results do not establish phone hardware, certificate trust, home Wi-Fi, casting, human comfort or physical audio.',checks,screenshots,errors,externalRequests:external,failedResponses:failed};
 return {origin,evidence,browser,
  protect(value){if(typeof value==='string'&&value)secrets.add(value);},
  check(name,detail=true){checks.push({name,result:'passed',detail});console.log(`GO7 browser: ${name}`);},
  diagnostics(code){return server.realtimeDiagnostics(code);},
  async restart(){await server.close();server=await startLanServer({...options,port});},
  async page(name,viewport,{permission='denied',reducedMotion='reduce',phone=false}={}){
   const context=await browser.newContext({viewport,reducedMotion,hasTouch:phone,isMobile:phone});
   await context.addInitScript(installProbe,{permission});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){external.push({page:name,path:url.origin+url.pathname});return route.abort('blockedbyclient');}return route.continue();});
   const page=await context.newPage();page.setDefaultTimeout(15000);
   page.on('pageerror',error=>errors.push({page:name,message:redact(error.message)}));
   page.on('response',response=>{if(response.status()>=400&&!response.url().includes('/api/'))failed.push({page:name,status:response.status(),path:new URL(response.url()).pathname});});
   pages.push({name,page,context});return page;
  },
  async screenshot(page,name){
   await page.evaluate(async()=>{await document.fonts?.ready;await Promise.all([...document.images].filter(image=>image.getBoundingClientRect().width>0).map(image=>image.decode()));});
   const file=`gravity-orchard-${name}.png`;await page.screenshot({path:path.join(evidenceRoot,file),animations:'disabled'});screenshots.push({file,viewport:page.viewportSize()});
  },
  async finish(error){
   if(error){evidence.result='failed';error.message=redact(error.message);error.stack=redact(error.stack);evidence.failure={message:error.message,stack:error.stack};for(const {name,page} of pages)try{await this.screenshot(page,`failure-${name}`);}catch{}}
   else evidence.result='passed';
   evidence.finishedAt=new Date().toISOString();
   await writeFile(path.join(evidenceRoot,'gravity-orchard-browser.json'),redact(JSON.stringify(evidence,null,2))+'\n');
   await browser.close();await server.close();await rm(temp,{recursive:true,force:true});
  },
 };
}

/** Installed before app scripts. It never stores the first auth message or credentials. */
function installProbe({permission}){
 const NativeSocket=window.WebSocket;
 const sockets=[],receivedInputs=new Map(),seenEvents=new Set(),events=[],commands=[],lifecycle=[];
 const observeLifecycle=event=>{lifecycle.push({type:event.type,trusted:event.isTrusted,visibility:document.visibilityState,at:performance.now()});if(lifecycle.length>256)lifecycle.shift();};
 for(const type of ['visibilitychange','freeze','resume'])document.addEventListener(type,observeLifecycle);
 for(const type of ['pagehide','pageshow','blur','focus'])window.addEventListener(type,observeLifecycle);
 let view=null,presence=null,lastInput=null,dropKind=null,dropId=null,drops=0,frames=0,inputs=0,connections=0,serverSeq=-1;
 const rtts=[],appliedAges=[];let secretFrame=false,maxBuffered=0;
 const frameIntervals=[];let previousFrame=null,frameSamples=0,over25Ms=0,over33_4Ms=0,over50Ms=0,over100Ms=0;
 // Observe callback cadence in visible, actively playing documents. This does
 // not measure GPU work or paint completion; automation and screenshots share
 // this browser and remain part of the reported timing environment.
 function sampleFrame(timestamp){
  const active=document.visibilityState==='visible'&&view?.phase==='playing'&&document.querySelector('#gravity-orchard-root');
  if(active&&previousFrame!==null){const interval=timestamp-previousFrame;frameSamples++;if(frameIntervals.length<60000)frameIntervals.push(interval);if(interval>25)over25Ms++;if(interval>33.4)over33_4Ms++;if(interval>50)over50Ms++;if(interval>100)over100Ms++;}
  previousFrame=active?timestamp:null;
  requestAnimationFrame(sampleFrame);
 }
 requestAnimationFrame(sampleFrame);
 class ObservedSocket extends NativeSocket{
  constructor(...args){
   super(...args);connections++;sockets.push(this);this.acceptanceNativeSend=super.send.bind(this);
   this.addEventListener('message',event=>{
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(/"(?:token|hostToken|playerToken|bearer|credentialHash|hostTokenHash|playerTokenHash|checkpoint|seed)"\s*:/.test(event.data))secretFrame=true;
    const snapshot=message.type==='welcome'?message.snapshot:message.type==='snapshot'?message:message.type==='command-result'?message.snapshot:null;
    if(snapshot?.view?.gameId==='gravity-orchard'){
     frames++;
     if(message.type==='welcome')serverSeq=-1;
     const next=snapshot.view;
     if(snapshot.serverSeq>serverSeq&&(!view||next.matchId!==view.matchId||next.runEpoch>view.runEpoch||next.runEpoch===view.runEpoch&&next.tick>=view.tick)){view=next;presence=snapshot.presence;serverSeq=snapshot.serverSeq;}
     for(const item of snapshot.view.events){const key=`${snapshot.view.matchId}:${item.id}`;if(!seenEvents.has(key)){seenEvents.add(key);events.push({...item,matchId:snapshot.view.matchId,stageIndex:snapshot.view.stageIndex});}}
     const ack=snapshot.ack;
     if(ack){const key=`${ack.controllerEpoch}:${ack.seq}`,receipt=receivedInputs.get(key);if(receipt){rtts.push(performance.now()-receipt.at);appliedAges.push(ack.appliedTick-receipt.observedTick);receivedInputs.delete(key);}}
    }
    if(message.type==='command-result'&&message.id===dropId){dropId=null;drops++;event.stopImmediatePropagation();}
   });
  }
  send(data){
   let message;try{message=JSON.parse(data);}catch{return super.send(data);}
   if(message.type==='input'){
    inputs++;lastInput={...message};receivedInputs.set(`${message.controllerEpoch}:${message.seq}`,{at:performance.now(),observedTick:message.observedTick});
    while(receivedInputs.size>128)receivedInputs.delete(receivedInputs.keys().next().value);
   }else if(message.type==='command'){
    commands.push({id:message.id,kind:message.kind,matchId:message.matchId,runEpoch:message.runEpoch,payload:message.payload});
    if(dropKind===message.kind){dropId=message.id;dropKind=null;}
   }
   const result=super.send(data);maxBuffered=Math.max(maxBuffered,this.bufferedAmount);return result;
  }
 }
 window.WebSocket=ObservedSocket;
 const nativeContext=window.AudioContext||window.webkitAudioContext;
 let audioContexts=0,notes=0;
 if(nativeContext){class ObservedAudio extends nativeContext{constructor(...args){super(...args);audioContexts++;}createOscillator(...args){const osc=super.createOscillator(...args),start=osc.start.bind(osc);osc.start=(...values)=>{notes++;return start(...values);};return osc;}}window.AudioContext=ObservedAudio;if(window.webkitAudioContext)window.webkitAudioContext=ObservedAudio;}
 let permissionValue=permission;
 class SyntheticOrientation extends Event{constructor(type,options={}){super(type,options);for(const key of ['alpha','beta','gamma','absolute'])Object.defineProperty(this,key,{value:options[key]??null});}static requestPermission(){return Promise.resolve(permissionValue);}}
 window.DeviceOrientationEvent=SyntheticOrientation;
 window.__go7Probe={
  view:()=>view,presence:()=>presence,
  stats:()=>({frames,inputs,connections,droppedAcks:drops,secretFrame,maxBufferedBytes:maxBuffered,ackRttMs:[...rtts],observedTickAgeAtApply:[...appliedAges],commands:[...commands],events:[...events],audio:{contexts:audioContexts,notes}}),
  frameCadence:()=>({samples:frameSamples,omittedSamples:Math.max(0,frameSamples-frameIntervals.length),over25Ms,over33_4Ms,over50Ms,over100Ms,intervalsMs:[...frameIntervals]}),
  lifecycle:()=>lifecycle.map(event=>({...event})),
  dropNextAck(kind){dropKind=kind;},
  captureInput:()=>lastInput?{...lastInput}:null,
  replayInput(input){const current=sockets.findLast(socket=>socket.readyState===1);if(current)current.acceptanceNativeSend(JSON.stringify(input));},
  disconnect(){sockets.findLast(socket=>socket.readyState===1)?.close(4000,'acceptance_reconnect');},
  permission(value){permissionValue=value;},
  orientation(beta,gamma){window.dispatchEvent(new SyntheticOrientation('deviceorientation',{beta,gamma,alpha:0,absolute:false}));},
 };
}

export async function view(page){return page.evaluate(()=>window.__go7Probe.view());}
export async function waitPhase(page,phase,timeout=15000){return until(async()=>{const next=await view(page);return next?.phase===phase&&next;},`public phase ${phase}`,timeout);}
export async function roomCredential(run,page,code,role){const token=await page.evaluate(({code,role})=>{const saved=JSON.parse(localStorage.getItem('sofa-room:'+code)||'{}');return role==='host'?saved.hostToken:saved.playerTokens?.[role];},{code,role});run.protect(token);assert.equal(typeof token,'string');return token;}
export async function request(run,path,{token,body}={}){run.protect(token);const response=await fetch(run.origin+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json',Origin:run.origin})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();run.protect(value.hostToken);run.protect(value.playerToken);assert.equal(response.status,200,`${path}: ${value.code||response.status}`);return value;}

export async function touchDriver(page){
 const session=await page.context().newCDPSession(page),points=new Map();let brake=false,steering=false;
 const point=(id,x,y)=>({id,x,y,radiusX:7,radiusY:7,force:1});
 const bounds=async name=>{const box=await page.locator(`[data-go3="${name}"]`).boundingBox();assert.ok(box,`${name} rendered bounds`);return box;};
 async function down(id,x,y){const value=point(id,x,y);points.set(id,value);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[value]});}
 async function up(id){const value=points.get(id);if(!value)return;points.delete(id);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[value]});}
 return {
  async apply(input){
   const box=await bounds('joystick'),radius=Math.min(box.width,box.height)*.34,x=box.x+box.width/2+input.x*radius,y=box.y+box.height/2+input.y*radius;
   if(!steering){await down(1,x,y);steering=true;}else{points.set(1,point(1,x,y));await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[...points.values()]});}
   if(input.brake&&!brake){const b=await bounds('brake');await down(2,b.x+b.width/2,b.y+b.height/2);brake=true;}
   else if(!input.brake&&brake){await up(2);brake=false;}
  },
  async release(){await up(1);await up(2);steering=brake=false;},
  async close(){await this.release();await session.detach();},
 };
}
