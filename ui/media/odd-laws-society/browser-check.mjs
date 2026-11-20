import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startPreview } from './preview-server.mjs';
import { validateManifest } from './validate-manifest.mjs';

const directory = resolve(process.argv[2] || fileURLToPath(new URL('evidence/latest/', import.meta.url)));
await mkdir(directory, { recursive: true });
const manifestReport = await validateManifest();
await writeFile(`${directory}/manifest-validation.json`, `${JSON.stringify(manifestReport,null,2)}\n`);
const server = await startPreview();
let browser;
const failures = [], externalRequests = [], shots = [], decodeChecks = [];
try {
  browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}) });
  const context = await browser.newContext({viewport:{width:1920,height:1080}, deviceScaleFactor:1, reducedMotion:'reduce'});
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(server.origin + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    externalRequests.push(url);return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);});
  await page.goto(server.origin, {waitUntil:'networkidle'});
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  const imageChecks = await page.evaluate(() => [...document.images].map(image => ({src:image.dataset.source,width:image.naturalWidth,height:image.naturalHeight,loaded:image.complete && image.naturalWidth>0,alt:!!image.alt})));
  assert.ok(imageChecks.length >= 54);
  assert.ok(imageChecks.every(image => image.loaded && image.alt), 'Every flat image must decode and retain its alt text');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'TV page overflows horizontally');
  const boardSizes = await page.locator('.plot img').evaluateAll(images => images.map(image => Math.round(image.getBoundingClientRect().width)));
  assert.ok(boardSizes.every(width => width === 96), 'Board review must render actual 96 px art');
  const marketSizes = await page.locator('.market .asset-stage img').evaluateAll(images => images.map(image => Math.round(image.getBoundingClientRect().width)));
  assert.ok(marketSizes.length === 6 && marketSizes.every(width => width === 144), 'Market review must render actual 144 px art');

  async function screenshot(name, tab, width, height, fullPage = true) {
    await page.setViewportSize({width,height});
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.evaluate(() => window.scrollTo(0,0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`${name} overflows horizontally`);
    await page.screenshot({path:`${directory}/${name}.png`,fullPage});
    shots.push({name:`${name}.png`,tab,width,height,fullPage});
  }
  await screenshot('board-1920','board',1920,1080,false);
  await screenshot('catalog-144px','catalog',1600,1200,true);
  await screenshot('character-states','characters',1600,1050,true);
  await screenshot('symbols','symbols',1440,1000,true);
  await page.selectOption('#surface','ink');
  await screenshot('alpha-on-dark','characters',1600,1050,true);
  await page.selectOption('#surface','paper');
  await screenshot('phone-390','catalog',390,844,false);
  await screenshot('phone-360','catalog',360,800,false);
  await screenshot('board-1280','board',1280,720,true);

  // Keyboard roving tabs and offline assets are verified without networking.
  await page.locator('[data-tab="board"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-tab="catalog"]').getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');
  assert.equal(await page.locator('[data-tab="sound"]').getAttribute('aria-selected'),'true');
  const audios = page.locator('audio');
  assert.equal(await audios.count(),2);
  for (let index = 0; index < await audios.count(); index++) {
    const audio = audios.nth(index);
    await audio.evaluate(node => {node.preload='auto';node.load();});
    await page.waitForFunction(i => {const a=document.querySelectorAll('audio')[i];return a.readyState >= 2 && a.duration > 70 && Number.isFinite(a.duration);}, index);
    const result = await audio.evaluate(async node => {
      await node.play();
      return new Promise((resolve,reject) => {
        const timeout=setTimeout(() => reject(new Error('Media playback did not advance')),3000);
        const tick=() => {if(node.currentTime>.12){node.removeEventListener('timeupdate',tick);clearTimeout(timeout);node.pause();resolve({src:node.getAttribute('src'),duration:node.duration,currentTime:node.currentTime,readyState:node.readyState,error:node.error?.message || null});}};
        node.addEventListener('timeupdate',tick);tick();
      });
    });
    assert.equal(result.error,null);decodeChecks.push(result);
    await audio.evaluate(node => {node.currentTime=40;});
    await page.waitForFunction(i => {const a=document.querySelectorAll('audio')[i];return Math.abs(a.currentTime-40)<.1 && !a.seeking && a.readyState>=2;},index);
    await audio.evaluate(node => node.play());
    await page.waitForFunction(i => document.querySelectorAll('audio')[i].currentTime > 40.12,index);
    await audio.evaluate(node => node.pause());
    result.seekIntoContrastingSection = true;
  }
  await screenshot('soundtrack','sound',1440,900,false);
  await audios.first().evaluate(node => node.play());
  await page.locator('[data-tab="board"]').click();
  assert.equal(await audios.first().evaluate(node => node.paused),true,'Leaving sound review pauses native playback');

  // File allowlist cannot accidentally expose private repo files.
  for (const path of ['/server/rooms.mjs','/AGENTS.md','/assets/../characters.png','/.git/config']) {
    const response = await context.request.get(server.origin+path);assert.equal(response.status(),404);
  }
  assert.deepEqual(externalRequests,[],'Preview must load with all non-loopback requests blocked');
  assert.deepEqual(failures,[],'Browser must not report errors or missing assets');
  const report = {schemaVersion:1,status:'passed',browser:await browser.version(),viewports:shots,imagesDecoded:imageChecks.length,
    externalRequests,consoleErrors:failures,audioDecodeAndPlayback:decodeChecks,boardImageCssPixels:96,marketImageCssPixels:144,
    notes:['All non-loopback HTTP requests blocked during preview.','Native media decode/play/seek verified; this is not a human auditory evaluation.','Static media fixtures, not the WS3 game UI or physical phone/TV tests.']};
  await writeFile(`${directory}/browser-validation.json`,`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify(report,null,2));
  await context.close();
} finally { await browser?.close();await server.close(); }
