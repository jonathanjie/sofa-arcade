import { MANIFEST, ASSETS, FRUIT_TYPES, STAGE_IDS, CHARACTER_STATES, getCharacterFrame } from '../manifest.mjs';
import { fallbackDataUrl } from '../fallbacks.mjs';
import { mountAudioPreview } from '../audio-preview.mjs';
const $=selector=>document.querySelector(selector), query=new URLSearchParams(location.search);
const labels={'morning-delivery':'Morning Delivery','switchback-grove':'Switchback Grove','moonlight-picnic':'Lala’s Moonlight Picnic'};
const descriptions={apple:'Round silhouette · single leaf',plum:'Oval silhouette · split leaves',pear:'Tapered neck · dotted belly',starfruit:'Five-point cut face · inset star'};
const bitmap=new Map(), decodeChecks=[], decodeFailures=[];
for(const [key,asset] of Object.entries(ASSETS)){
  const img=new Image();img.src=asset.src;
  try {
    await img.decode();
    if(img.naturalWidth!==asset.width||img.naturalHeight!==asset.height)throw new Error(`Unexpected image dimensions: ${key}`);
    decodeChecks.push({key,src:asset.src,width:img.naturalWidth,height:img.naturalHeight});
  } catch(error) {
    decodeFailures.push({key,src:asset.src,error:error.message});img.src=fallbackDataUrl(key);await img.decode();
  }
  bitmap.set(key,img);
}
const image=(key,className='')=>`<img src="${bitmap.get(key).src}" alt="${ASSETS[key].alt}" class="${className}" data-asset="${key}" width="${ASSETS[key].width}" height="${ASSETS[key].height}">`;
$('#overview').innerHTML=`<div class="overview-grid"><div class="hero-frame">${image('cover')}<div class="card-caption"><span>A COOPERATIVE PICNIC FOR TWO</span><strong>Gravity Orchard</strong></div></div><aside class="overview-aside"><p class="eyebrow">THE NEXT LITTLE ADVENTURE</p><h2>Pass a pear.<br>Make a picnic.</h2><p>Jon and Lydia tend two floating gardens. Lala has big plans for lunch. A warm illustrated world, with every gameplay shape kept clear.</p><div class="thumbnail">${image('cover')}</div><div class="micro">Collection thumbnail · 320 × 180</div></aside></div><div class="chapter-row">${STAGE_IDS.map((stage,index)=>`<div class="chapter">${image(`environment-${stage}`)}<div><strong>0${index+1} · ${labels[stage]}</strong><small>${['Sunlit grass & honey wood','Deep hedges & warm earth','Teal dusk & lantern gold'][index]}</small></div></div>`).join('')}</div>`;
$('#symbols').innerHTML=`<div class="section-heading"><div><h2>Four fruits. Four familiar homes.</h2><p>Fruit: 32 / 48 / 64 px on desktop, 32 / 40 / 52 px on phones. Baskets: 76 px on desktop, 60 px on phones.</p></div><span class="pill">BRIGHT · DARK · GRAYSCALE</span></div><div class="symbols-grid">${FRUIT_TYPES.map(type=>`<article class="identity-card"><div class="identity-header"><h3>${type}</h3><p>${descriptions[type]}</p></div>${['',' dark'].map(surface=>`<div class="surface${surface}"><div class="fruit-showcase">${[32,48,64].map(size=>image(`fruit-${type}`,`fruit-${size}`)).join('')}</div><p class="size-caption"><span class="desktop-sizes">32 / 48 / 64 px</span><span class="phone-sizes">32 / 40 / 52 px</span></p><div class="basket-states">${['ordinary','accepting','rejecting','full'].map(state=>`<figure>${image(`basket-${type}-${state}`)}<figcaption>${state}</figcaption></figure>`).join('')}</div></div>`).join('')}</article>`).join('')}</div><div class="compare-strip"><p>Colour-independent identity check<br><small>The same four silhouettes, at 32 pixels.</small></p>${FRUIT_TYPES.map(type=>image(`fruit-${type}`,'grayscale')).join('')}</div><div class="cue-grid">${['gate-open','gate-forecast','gate-closed','gust-forecast','gust-active','compost','effect-impact','effect-capture','effect-compost','effect-order'].map(key=>`<div class="cue-card">${image(key)}<p>${ASSETS[key].alt}</p></div>`).join('')}</div>`;
$('#characters').innerHTML=`<div class="section-heading"><div><h2>Small gestures, full of character</h2><p>Real alternate poses at 112 pixels. The two source poses beneath each player make frame changes reviewable.</p></div><span class="pill">24 POSES · 12 STATES</span></div>${Object.entries(CHARACTER_STATES).map(([actor,states],index)=>`<div class="cast-row ${index===1?'dark':''}"><div class="cast-title"><h3>${actor}</h3><span>${actor==='lala'?'Picnic host & weather maker':'Garden keeper · stable foot pivot'}</span></div><div class="states">${Object.entries(states).map(([state,record])=>`<figure class="state-card"><canvas class="state-canvas" width="224" height="224" data-character="${actor}" data-state="${state}" role="img" aria-label="${actor} ${state} animation"></canvas><figcaption>${state}</figcaption><div class="pose-pair">${record.frames.map(name=>`<canvas width="112" height="112" data-still-actor="${actor}" data-still-state="${state}" data-still-frame="${name}" role="img" aria-label="${actor} ${name} source pose"></canvas>`).join('')}</div><span class="micro">distinct drawn poses</span></figure>`).join('')}</div></div>`).join('')}<div class="motion-comparison"><div class="motion-sample"><canvas width="168" height="168" data-character="jon" data-state="cheer" data-motion-sample="normal" aria-label="Jon cheering with full motion" role="img"></canvas><div><strong>Normal motion</strong><small>Frame changes + a small local bounce.<br>The board never tilts.</small></div></div><div class="motion-sample"><canvas width="168" height="168" data-character="jon" data-state="cheer" data-motion-sample="reduced" aria-label="Jon cheering in reduced motion" role="img"></canvas><div><strong>Reduced motion</strong><small>One clear cheer pose.<br>Feedback remains visible.</small></div></div></div>`;
$('#fallbacks').innerHTML=`<div class="section-heading"><div><h2>A missed file should not hide the fruit</h2><p>Error-only symbols preserve silhouette and contrast. Missing final assets still fail the production checks.</p></div></div><div class="fallback-grid">${FRUIT_TYPES.map(type=>`<div class="fallback-card">${image(`fruit-${type}`)}<span data-fallback-caption="fruit-${type}"></span></div>`).join('')}</div><button id="simulate-missing" type="button">Simulate unavailable fruit assets</button><p id="fallback-status" role="status">Checking final fruit image availability…</p>`;
const audioPreview=mountAudioPreview($('#audio-preview'));
let activeTab='overview',stage=STAGE_IDS.includes(query.get('stage'))?query.get('stage'):STAGE_IDS[0];
let reduced=query.get('motion')==='reduce'||matchMedia('(prefers-reduced-motion: reduce)').matches;
$('#motion').checked=reduced;$('#stage').value=stage;
$('#motion').addEventListener('change',()=>{reduced=$('#motion').checked;document.documentElement.dataset.reduced=String(reduced);draw(performance.now());});
$('#night').addEventListener('change',()=>{document.body.dataset.dark=String($('#night').checked);});
function selectTab(name,focus=false){
  if(!document.getElementById(name)?.matches('[role=tabpanel]'))return;
  if(activeTab==='sound'&&name!=='sound')audioPreview.stop();
  activeTab=name;for(const tab of document.querySelectorAll('[role=tab]')){
    const active=tab.dataset.tab===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    if(active&&focus)tab.focus();
  }
  for(const pane of document.querySelectorAll('[role=tabpanel]'))pane.hidden=pane.id!==name;
  draw(performance.now());
}
for(const tab of document.querySelectorAll('[role=tab]')){
  tab.addEventListener('click',()=>selectTab(tab.dataset.tab));
  tab.addEventListener('keydown',event=>{
    const list=[...document.querySelectorAll('[role=tab]')],i=list.indexOf(tab);
    const next=event.key==='ArrowRight'?(i+1)%list.length:event.key==='ArrowLeft'?(i+list.length-1)%list.length:event.key==='Home'?0:event.key==='End'?list.length-1:null;
    if(next!==null){event.preventDefault();selectTab(list[next].dataset.tab,true);}
  });
}
function terrainCatalog(){
  const keys=[`tray-${stage}`,`bridge-${stage}`,`hedge-${stage}`,`bumper-${stage}`,'gate-forecast','compost'];
  $('#terrain-catalog').innerHTML=keys.map(key=>`<div class="material">${image(key)}<span>${key.replace(`-${stage}`,'')}</span></div>`).join('');
}
$('#stage').addEventListener('change',()=>{stage=$('#stage').value;terrainCatalog();draw(performance.now());});terrainCatalog();
let simulated=false, fallbackRevision=0;
const unavailableFruit=FRUIT_TYPES.filter(type=>decodeFailures.some(failure=>failure.key===`fruit-${type}`));
const unavailableKeys=new Set(unavailableFruit.map(type=>`fruit-${type}`));
function fallbackCaption(img,simulation=false){
  const key=img.dataset.asset, type=key.slice('fruit-'.length), unavailable=unavailableKeys.has(key);
  const description=simulation?(unavailable?'native fallback (simulated failure; file also unavailable)':'native fallback (simulated failure)'):
    unavailable?'native fallback (file unavailable)':'final artwork';
  $(`[data-fallback-caption="${key}"]`).textContent=`${type} · ${description}`;
  img.alt=simulation||unavailable?`${type} native silhouette fallback`:ASSETS[key].alt;
}
function updateFallbackStatus(){
  if(simulated){
    const count=[...$('#fallbacks').querySelectorAll('img')].filter(img=>img.dataset.fallback==='true').length;
    const actual=unavailableFruit.length?` ${unavailableFruit.length} actual fruit file${unavailableFruit.length===1?' is':'s are'} also unavailable (${unavailableFruit.join(', ')}); ending simulation retains ${unavailableFruit.length===1?'its':'their'} fallback.`:'';
    $('#fallback-status').textContent=`Simulation active: ${count} of four fruit images use native fallbacks.${actual}`;
  } else if(unavailableFruit.length){
    const count=unavailableFruit.length;
    $('#fallback-status').textContent=`${count} final fruit image${count===1?'':'s'} unavailable (${unavailableFruit.join(', ')}). ${count} native fallback${count===1?'':'s'} active; ${FRUIT_TYPES.length-count} final fruit images decoded.`;
  } else $('#fallback-status').textContent='All final fruit images decoded. No fallback is currently active.';
  $('#simulate-missing').textContent=simulated?'End simulated failure':'Simulate unavailable fruit assets';
}
function restoreDetectedFruit(){
  for(const img of $('#fallbacks').querySelectorAll('img')){
    const unavailable=unavailableKeys.has(img.dataset.asset);
    img.onerror=null;img.dataset.fallback=String(unavailable);img.dataset.fallbackReason=unavailable?'unavailable':'';
    // Restore the sources actually decoded on entry, including genuine missing-file fallbacks.
    img.src=bitmap.get(img.dataset.asset).src;fallbackCaption(img);
  }
  updateFallbackStatus();
}
restoreDetectedFruit();
$('#simulate-missing').addEventListener('click',()=>{
  simulated=!simulated;const revision=++fallbackRevision;
  if(!simulated){restoreDetectedFruit();return;}
  for(const img of $('#fallbacks').querySelectorAll('img')){
    // Deliberately invalid image decoding exercises the error handler without changing real availability.
    img.onerror=()=>{
      if(!simulated||revision!==fallbackRevision)return;
      img.onerror=null;img.src=fallbackDataUrl(img.dataset.asset);img.dataset.fallback='true';img.dataset.fallbackReason='simulated';
      fallbackCaption(img,true);updateFallbackStatus();
    };
    img.dataset.fallback='false';img.dataset.fallbackReason='pending-simulation';
    $(`[data-fallback-caption="${img.dataset.asset}"]`).textContent=`${img.dataset.asset.slice('fruit-'.length)} · simulating file failure`;
    img.src='data:image/png;base64,broken';
  }
  updateFallbackStatus();
});
function paintCharacter(canvas,actor,state,time,forceReduced=false,explicitFrame=null){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  let frame=getCharacterFrame(actor,state,time,{reducedMotion:forceReduced});
  if(decodeFailures.some(failure=>failure.key===frame.asset)){
    ctx.drawImage(bitmap.get(frame.asset),0,0,canvas.width,canvas.height);canvas.dataset.frame='fallback';return;
  }
  if(explicitFrame){const record=CHARACTER_STATES[actor][state];frame={...frame,...ASSETS[record.asset].frames[explicitFrame],frameName:explicitFrame};}
  const still=forceReduced||explicitFrame;
  const bounce=!still&&state==='cheer'?Math.sin(time/180)*2.4:0;
  const breathe=!still&&state==='idle'?1+Math.sin(time/510)*.008:1;
  ctx.save();ctx.translate(canvas.width/2,canvas.height*.94+bounce);ctx.scale(1,breathe);
  const scale=canvas.width/frame.width;
  ctx.drawImage(bitmap.get(frame.asset),frame.x,frame.y,frame.width,frame.height,-frame.pivot.x*scale,-frame.pivot.y*scale,canvas.width,canvas.height);
  ctx.restore();canvas.dataset.frame=frame.frameName;
}
for(const canvas of document.querySelectorAll('[data-still-frame]'))paintCharacter(canvas,canvas.dataset.stillActor,canvas.dataset.stillState,0,true,canvas.dataset.stillFrame);
const board=$('#board'),ctx=board.getContext('2d');
function rr(x,y,w,h,r,fill,stroke=null){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
function stamp(key,x,y,w,h=w){ctx.drawImage(bitmap.get(key),x,y,w,h);}
function text(content,x,y,size=18,color='#355040',weight=500,align='left'){ctx.font=`${weight} ${size}px system-ui,sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(content,x,y);}
function cast(actor,state,x,y,size,time){const frame=getCharacterFrame(actor,state,time,{reducedMotion:reduced});if(decodeFailures.some(failure=>failure.key===frame.asset))ctx.drawImage(bitmap.get(frame.asset),x,y,size,size);else ctx.drawImage(bitmap.get(frame.asset),frame.x,frame.y,frame.width,frame.height,x,y,size,size);}
function drawBoard(time){
  ctx.clearRect(0,0,1280,720);stamp(`environment-${stage}`,0,0,1280,720);
  rr(38,27,1204,66,20,'#fff8e8ec');text(labels[stage],62,68,25,'#2f5140',600);
  text('PICNIC ORDER',603,51,10,'#77836a',700);['apple','apple','pear'].forEach((f,i)=>stamp(`fruit-${f}`,603+i*37,55,31));
  rr(1100,41,116,38,19,'#e2e8cf');text('01:30',1158,68,23,'#34543e',600,'center');
  for(const [x,key] of [[60,'jon'],[710,'lydia']]){
    stamp(`tray-${stage}`,x,177,510,394);rr(x+8,185,494,374,24,null,stage==='moonlight-picnic'?'#577a68':'#798d58');
    text(key==='jon'?'JON’S GARDEN':'LYDIA’S GARDEN',x+145,156,14,stage==='moonlight-picnic'?'#fff4db':'#345641',700);
  }
  stamp(`bridge-${stage}`,560,324,160,102);
  ctx.setLineDash([6,7]);ctx.strokeStyle='#fff5d9';ctx.lineWidth=2;ctx.strokeRect(570,332,140,84);ctx.setLineDash([]);
  cast('jon','lean',74,82,102,time);cast('lydia','brace',1072,82,102,time);
  const basketPositions=[['apple',98,459],['plum',436,459],['pear',746,459],['starfruit',1084,459]];
  for(const [type,x,y] of basketPositions){stamp(`basket-${type}-${type==='pear'?'accepting':'ordinary'}`,x,y,82);text(type.toUpperCase(),x+41,y+88,13,'#39513f',700,'center');}
  stamp(`bumper-${stage}`,246,275,68);stamp(`bumper-${stage}`,1024,270,68);
  if(stage!=='morning-delivery'){
    stamp(`hedge-${stage}`,297,354,182,54);stamp(`hedge-${stage}`,814,306,182,54);
    stamp('compost',483,248,66);stamp('compost',738,388,66);stamp('gate-forecast',593,297,94,134);
  }
  const positions=[['apple',166,304],['plum',478,409],['pear',610,354],['starfruit',861,430],['apple',968,240],['pear',333,444]];
  positions.forEach(([type,x,y],i)=>{
    const dx=reduced?0:Math.sin(time/1700+i)*8,dy=reduced?0:Math.cos(time/2000+i)*5;
    stamp(`fruit-${type}`,x+dx,y+dy,36); // Explicit 36-world-unit sprite, not a collision radius.
  });
  cast('lala',stage==='moonlight-picnic'?'forecast':'pleased',582,532,116,time);
  if(stage==='moonlight-picnic'){rr(506,112,268,49,16,'#fdf1d8e8');stamp('gust-forecast',523,114,66,42);text('GUST IN 3 SECONDS',607,143,13,'#5b6650',700);}
  rr(339,647,602,43,20,'#fff8e8e8');text('FRUIT AT 36 px  ·  BASKETS AT 82 px  ·  ARTWORK REVIEW',640,674,11,'#65725a',600,'center');
}
function draw(time){
  if(activeTab==='gardens')drawBoard(time);
  if(activeTab==='characters')for(const canvas of document.querySelectorAll('[data-character]')){
    const mode=canvas.dataset.motionSample;
    paintCharacter(canvas,canvas.dataset.character,canvas.dataset.state,time,reduced||mode==='reduced');
  }
}
let raf=0,disposed=false;
function loop(time){if(disposed)return;draw(time);raf=requestAnimationFrame(loop);}
const start=query.get('tab');if(start)selectTab(start);if(query.get('capture')==='1'){document.body.dataset.capture='true';selectTab('gardens');}
raf=requestAnimationFrame(loop);
window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(raf);audioPreview.dispose();},{once:true});
document.documentElement.dataset.reduced=String(reduced);
$('#asset-status').textContent=decodeFailures.length ? `${decodeFailures.length} required assets unavailable · fallback active · verification failed` : `${decodeChecks.length} final assets decoded · local files only`;
document.documentElement.dataset.assetsValid=String(decodeFailures.length===0);
document.documentElement.dataset.ready='true';
window.goMediaReview=Object.freeze({manifest:MANIFEST,decodeChecks,decodeFailures,selectTab,getState:()=>({activeTab,reduced,stage}),audio:audioPreview});
