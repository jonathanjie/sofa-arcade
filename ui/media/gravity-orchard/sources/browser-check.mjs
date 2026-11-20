import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startPreview } from './preview-server.mjs';
import { validateAssets } from './validate-assets.mjs';
const directory=resolve(process.argv[2]||fileURLToPath(new URL('evidence/latest/',import.meta.url)));
await mkdir(directory,{recursive:true});
const assetReport=await validateAssets();
await writeFile(`${directory}/asset-validation.json`,JSON.stringify(assetReport,null,2)+'\n');
const server=await startPreview();let browser;
const failures=[],externalRequests=[],shots=[],audioPlayback=[];
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,reducedMotion:'no-preference'});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(server.origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
    externalRequests.push(url);return route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(error.message));
  page.on('response',response=>{if(response.status()>=400)failures.push(`${response.status()} ${response.url()}`);});
  async function ready(){
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
    await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));
    assert.deepEqual(await page.evaluate(()=>window.goMediaReview.decodeFailures),[],'Every required final asset must decode');
    assert.equal(await page.getAttribute('html','data-assets-valid'),'true');
  }
  await page.goto(server.origin,{waitUntil:'networkidle'});await ready();
  assert.equal(await page.evaluate(()=>window.goMediaReview.decodeChecks.length),assetReport.assetCount);
  assert.equal(await page.locator('.thumbnail').evaluate(el=>Math.round(el.getBoundingClientRect().width)),320,'Collection-card check at intended width');
  async function capture(name,tab,width,height,fullPage=true){
    await page.setViewportSize({width,height});await page.locator(`[data-tab="${tab}"]`).click();
    await page.evaluate(()=>window.scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} horizontal overflow`);
    await page.screenshot({path:`${directory}/${name}.png`,fullPage});shots.push({name:`${name}.png`,tab,width,height,fullPage});
  }
  await capture('collection-1280','overview',1280,720,false);
  await capture('fruit-and-baskets-1280','symbols',1280,720,true);
  const fruitWidths=await page.locator('.fruit-32').evaluateAll(images=>images.map(img=>Math.round(img.getBoundingClientRect().width)));
  assert.ok(fruitWidths.length===8&&fruitWidths.every(n=>n===32));
  const baskets=await page.locator('.basket-states img').evaluateAll(images=>images.map(img=>Math.round(img.getBoundingClientRect().width)));
  assert.ok(baskets.length===32&&baskets.every(n=>n===76));
  await capture('cast-normal-1280','characters',1280,900,true);
  const original=await page.locator('[data-character="jon"][data-state="lean"]').getAttribute('data-frame');
  await page.waitForFunction(frame=>document.querySelector('[data-character="jon"][data-state="lean"]').dataset.frame!==frame,original);
  await page.locator('#motion').check();
  await page.waitForFunction(()=>document.documentElement.dataset.reduced==='true');
  const reducedBefore=await page.locator('[data-character]').evaluateAll(nodes=>nodes.map(node=>node.toDataURL()));
  await page.waitForTimeout(1200); // Span more than one pose duration to prove the reduced view freezes.
  const reducedAfter=await page.locator('[data-character]').evaluateAll(nodes=>nodes.map(node=>node.toDataURL()));
  assert.deepEqual(reducedAfter,reducedBefore,'All animation samples must honor reduced motion');
  await capture('cast-reduced-1280','characters',1280,900,true);
  await page.locator('#night').check();await capture('cast-dark-1280','characters',1280,900,true);await page.locator('#night').uncheck();
  for(const [width,height] of [[360,800],[390,844]]){
    await capture(`fruit-phone-${width}`,'symbols',width,height,true);
    await capture(`cast-phone-${width}`,'characters',width,height,true);
    await capture(`cover-phone-${width}`,'overview',width,height,true);
    await page.locator('.go-audio-recordings').evaluate(node=>{node.open=true;});
    await capture(`audio-phone-${width}`,'sound',width,height,true);
    // Hidden panes have zero layout; inspect exact sizes while their tab is active.
    await page.locator('[data-tab="symbols"]').click();
    assert.ok((await page.locator('.fruit-32').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().width)))).every(n=>n===32));
    assert.ok((await page.locator('.basket-states img').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().width)))).every(n=>n===60));
  }
  await capture('audio-preview-1280','sound',1280,900,true);
  assert.equal(await page.evaluate(()=>window.goMediaReview.audio.getState().playing),false,'Live music does not autoplay');
  await page.locator('[data-audio-play]').click();
  await page.waitForFunction(()=>window.goMediaReview.audio.getState().playing===true);
  await page.waitForFunction(async()=>{const {audio}=await import('/ui/audio.js');const s=audio.getSettings();return s.unlocked&&s.canPlayMusic;});
  for(const scene of ['menu','practice','stage1','stage2','stage3','paused','celebrate'])await page.locator('[data-audio-scene]').selectOption(scene);
  await page.locator('[data-audio-cue="catch"]').click();
  await page.locator('[data-audio-stop]').click();
  assert.equal(await page.evaluate(()=>window.goMediaReview.audio.getState().playing),false);
  const audios=page.locator('audio');assert.equal(await audios.count(),3);
  for(let i=0;i<3;i++){
    const audio=audios.nth(i);await audio.evaluate(node=>{node.preload='auto';node.load();});
    await page.waitForFunction(index=>{const a=document.querySelectorAll('audio')[index];return a.readyState>=2&&Number.isFinite(a.duration)&&a.duration>1;},i);
    await audio.evaluate(node=>node.play());
    await page.waitForFunction(index=>document.querySelectorAll('audio')[index].currentTime>.12,i);
    const record=await audio.evaluate(node=>({src:node.getAttribute('src'),duration:node.duration,currentTime:node.currentTime,readyState:node.readyState,error:node.error?.message||null}));
    assert.equal(record.error,null);audioPlayback.push(record);await audio.evaluate(node=>node.pause());
    if(i<2){await audio.evaluate(node=>{node.currentTime=40;});await page.waitForFunction(index=>{const a=document.querySelectorAll('audio')[index];return !a.seeking&&a.currentTime>=40&&a.readyState>=2;},i);}
  }
  await capture('fallbacks-final','fallbacks',1280,720,false);
  await page.locator('#simulate-missing').click();await page.waitForFunction(()=>[...document.querySelectorAll('#fallbacks img')].every(img=>img.dataset.fallback==='true'&&img.complete&&img.naturalWidth>0));
  const fallbackSources=await page.locator('#fallbacks img').evaluateAll(nodes=>nodes.map(node=>node.src));assert.equal(new Set(fallbackSources).size,4);
  await page.screenshot({path:`${directory}/fallbacks-unavailable.png`,fullPage:false});
  await page.locator('#simulate-missing').click();await page.waitForFunction(()=>[...document.querySelectorAll('#fallbacks img')].every(img=>img.dataset.fallback==='false'&&img.complete&&img.naturalWidth===128));
  await page.locator('[data-tab="overview"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-tab="symbols"]').getAttribute('aria-selected'),'true');
  for(const stage of ['morning-delivery','switchback-grove','moonlight-picnic'])for(const [width,height] of [[1280,720],[1920,1080]]){
    await page.setViewportSize({width,height});await page.goto(`${server.origin}/?tab=gardens&capture=1&motion=reduce&stage=${stage}`);await ready();
    await page.screenshot({path:`${directory}/garden-${stage}-${width}.png`,fullPage:false});shots.push({name:`garden-${stage}-${width}.png`,tab:'gardens',width,height,fullPage:false});
  }
  for(const path of ['/AGENTS.md','/.git/config','/server/rooms.mjs','/ui/media/gravity-orchard/sources/environments/provenance.json','/ui/media/gravity-orchard/package.json'])assert.equal((await context.request.get(server.origin+path)).status(),404);
  const blocked=await context.newPage();await blocked.route('**/assets/gravity-orchard/fruit/apple.svg',route=>route.abort());
  await blocked.goto(server.origin+'/?tab=fallbacks');await blocked.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  assert.deepEqual(await blocked.evaluate(()=>window.goMediaReview.decodeFailures.map(x=>x.key)),['fruit-apple']);
  assert.equal(await blocked.getAttribute('html','data-assets-valid'),'false','Missing final artwork is reported as failure, never completeness');
  assert.ok((await blocked.locator('#fallbacks [data-asset="fruit-apple"]').getAttribute('src')).startsWith('data:image/svg+xml'));
  await blocked.screenshot({path:`${directory}/fallback-real-missing-url.png`,fullPage:false});await blocked.close();
  const missingAtlas=await context.newPage();await missingAtlas.route('**/assets/gravity-orchard/characters/jon-atlas.webp',route=>route.abort());
  await missingAtlas.goto(server.origin+'/?tab=characters');await missingAtlas.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  assert.deepEqual(await missingAtlas.evaluate(()=>window.goMediaReview.decodeFailures.map(x=>x.key)),['character-jon']);
  assert.equal(await missingAtlas.getAttribute('html','data-assets-valid'),'false');
  await missingAtlas.waitForFunction(()=>[...document.querySelectorAll('[data-character="jon"]')].every(c=>c.dataset.frame==='fallback'));
  assert.ok((await missingAtlas.locator('[data-character="jon"]').evaluateAll(nodes=>nodes.map(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((value,index)=>index%4===3&&value>128)))).every(Boolean),'A failed atlas draws a full native symbol in every state');
  await missingAtlas.screenshot({path:`${directory}/fallback-real-missing-atlas.png`,fullPage:true});await missingAtlas.close();
  assert.deepEqual(externalRequests,[]);assert.deepEqual(failures,[]);
  const report={schemaVersion:1,status:'passed',testedSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:await browser.version(),assetCount:assetReport.assetCount,
    externalRequests,consoleErrors:failures,screenshots:shots,audioDecodeAndPlayback:audioPlayback,realMissingUrlFallback:true,realMissingAtlasFallback:true,liveSharedSchedulerUnlocked:true,reducedMotionFreezesAllSamples:true,
    notes:['Browser rendering, decode and shared-scheduler playback only; no human speaker audition.','Material review fixture, not the integrated game or physical phones/TV.']};
  await writeFile(`${directory}/browser-validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await context.close();
}finally{await browser?.close();await server.close();}
