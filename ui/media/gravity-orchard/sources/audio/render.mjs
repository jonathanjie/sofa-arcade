/** Full shared-scheduler renders. --verify writes nothing. --write --encode records review MP3s. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SCORE } from '../../score.mjs';
import { EFFECT_NAMES, eventsForEffect } from '../../events.mjs';

const write = process.argv.includes('--write');
const encode = process.argv.includes('--encode');
const interactive = process.argv.includes('--interactive');
if ((!write && !process.argv.includes('--verify')) || (encode && !write)) throw new Error('Use --verify or --write [--encode].');
const output = new URL('./', import.meta.url);
const repo = new URL('../../../../../', import.meta.url);
const sourcePaths = [
  'ui/audio.js', 'ui/score.mjs', 'ui/media/sofa-menu/score.mjs', 'ui/media/sofa-menu/effects.mjs',
  'ui/media/gravity-orchard/score.mjs', 'ui/media/gravity-orchard/events.mjs',
  'ui/media/gravity-orchard/sources/audio/render-harness.mjs',
];
const files = new Map(await Promise.all(sourcePaths.map(async path => [`/${path}`, await readFile(new URL(path, repo))])));
let pendingRender = null;
let nextJobId = 1;
let completion = null;
const interactiveHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Gravity Orchard audio verification</title>
<style>body{font:18px system-ui;background:#f4edda;color:#24443d;max-width:800px;margin:60px auto;padding:30px}button{font:inherit;background:#24443d;color:white;border:0;border-radius:12px;padding:18px 28px}p{line-height:1.6}iframe{width:1px;height:1px;border:0}pre{white-space:pre-wrap}</style>
<h1>Gravity Orchard · audio verification</h1><p>This uses the existing shared scheduler in an offline Web Audio graph. It produces no live sound. Seven scene arrangements, musical transitions, ten cues and quiet phone defaults are checked.</p>
<button id="start">Render and verify audio</button><p id="status" role="status">Ready. No render has started.</p><pre id="results"></pre><div id="frame"></div>
<script>let active=0;let started=false;async function poll(){if(!started)return;try{const job=await(await fetch('/pending')).json();if(job.done){document.querySelector('#status').textContent=job.summary;document.querySelector('#results').textContent=JSON.stringify(job.details,null,2);document.querySelector('#frame').replaceChildren();return;}if(job.id&&job.id!==active){active=job.id;document.querySelector('#status').textContent='Rendering '+job.label+'…';const frame=document.createElement('iframe');frame.title='Isolated offline render';frame.src='/frame?job='+job.id;document.querySelector('#frame').replaceChildren(frame);}}catch(error){document.querySelector('#status').textContent=error.message;}setTimeout(poll,250);}document.querySelector('#start').onclick=()=>{started=true;document.querySelector('#start').disabled=true;poll();};</script></html>`;
const frameHtml = `<!doctype html><html lang="en"><title>Offline render worker</title><script type="module">
const job=await(await fetch('/pending')).json();try{const {renderWithSharedScheduler}=await import('/ui/media/gravity-orchard/sources/audio/render-harness.mjs');const result=await renderWithSharedScheduler(job.options);await fetch('/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id,result})});}catch(error){await fetch('/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id,error:error.stack||error.message})});}</script></html>`;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://local.test').pathname;
  if (path === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(interactive ? interactiveHtml : '<!doctype html><html lang="en"><title>Gravity Orchard offline audio verification</title><body>Offline render fixture</body></html>');
  } else if (interactive && path === '/frame') {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); response.end(frameHtml);
  } else if (interactive && path === '/pending') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(completion ?? (pendingRender ? { id: pendingRender.id, options: pendingRender.options, label: pendingRender.label } : {})));
  } else if (interactive && path === '/complete' && request.method === 'POST') {
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 12 * 1024 * 1024) throw new Error('Render result exceeds fixture limit'); chunks.push(chunk); }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!pendingRender || value.id !== pendingRender.id) throw new Error('Out-of-order render result');
      const job = pendingRender; pendingRender = null;
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"accepted":true}');
      if (value.error) job.reject(new Error(value.error));
      else job.resolve(value.result);
    } catch (error) { response.writeHead(400); response.end(error.message); }
  } else if (path === '/favicon.ico') { response.writeHead(204); response.end(); }
  else if (files.has(path)) { response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); response.end(files.get(path)); }
  else { response.writeHead(404); response.end('Not in audio fixture inventory'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.GO5_BROWSER || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = interactive ? null : await chromium.launch({ headless: true, executablePath });
if (interactive) console.log(`Interactive offline verification ready: ${origin}`);
const beatSeconds = 60 / SCORE.bpm;
const scoreSeconds = SCORE.bars.length * SCORE.beatsPerBar * beatSeconds;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  schemaVersion: 1, title: SCORE.title, key: SCORE.key, meter: SCORE.meter, bpm: SCORE.bpm,
  beatsPerBar: SCORE.beatsPerBar, scoreSeconds, sampleRate: 32000,
  browser: browser?.version() ?? 'Managed browser, user agent recorded by fixture', sourceSha256: {}, scenes: {}, cues: {}, previews: {},
  methodology: 'Chromium OfflineAudioContext runs the unchanged ui/audio.js scheduler and synthesis graph through an authoring-only clock facade. One channel captures final output, one taps the master before the existing compressor. Two complete loops per scene, actual phrase-boundary scene requests, every cue, overlap stress and quiet phone defaults are rendered. No loudness normalization or additional runtime audio engine.',
  auditoryEvaluation: 'No human audition or physical-speaker listening was performed. Offline Web Audio rendering, finite-signal measurements, MP3 decoding and preview interaction are structural checks.',
};
for (const path of [...sourcePaths, 'ui/media/gravity-orchard/audio-preview.mjs', 'ui/media/gravity-orchard/sources/audio/render.mjs']) report.sourceSha256[path] = sha(await readFile(new URL(path, repo)));

function inspect(result, label, { silent = false, maxVoices = 24 } = {}) {
  assert.equal(result.contextsBeforeUnlock, 0, `${label}: must not construct before unlock`);
  assert.equal(result.contextsCreated, 1, `${label}: one shared graph only`);
  for (const signal of [result.preCompressor, result.output]) {
    assert.equal(signal.nonFiniteSamples, 0, `${label}: nonfinite audio`);
    assert.equal(signal.clippedSamples, 0, `${label}: clipping`);
    assert.ok(signal.peak < .6, `${label}: insufficient headroom`);
    assert.ok(Math.abs(signal.dcOffset) < .001, `${label}: DC offset`);
    assert.ok(silent ? signal.peak === 0 : signal.rms > .0001, `${label}: missing or unexpected audio`);
  }
  assert.ok(result.maxConcurrentOscillators <= maxVoices, `${label}: excessive oscillator overlap`);
  for (const seam of result.loopSeams) {
    assert.ok(seam.preCompressorSampleJump < .0003, `${label}: loop discontinuity`);
    assert.ok(seam.quietTail.peak < .0005, `${label}: cadence did not breathe before loop`);
  }
}
async function render(options) {
  if (interactive) return new Promise((resolve, reject) => {
    pendingRender = { id: nextJobId++, options, resolve, reject, label: options.role === 'player' ? 'quiet phone defaults' : options.sceneRequests ? 'musical scene transitions' : options.effects?.length ? (options.kind === 'effects' ? `${options.effects.length} effect cue(s)` : 'music and cue overlap') : `${options.scene} arrangement` };
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  page.on('request', request => { assert.equal(new URL(request.url()).origin, origin, 'Unexpected external audio request'); });
  await page.goto(origin);
  const result = await page.evaluate(async options => {
    const { renderWithSharedScheduler } = await import('/ui/media/gravity-orchard/sources/audio/render-harness.mjs');
    return renderWithSharedScheduler(options);
  }, options);
  assert.deepEqual(faults, []);
  await context.close();
  return result;
}
function measurePcm(samples) {
  let peak = 0, squares = 0, sum = 0, clippedSamples = 0, nonFiniteSamples = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) nonFiniteSamples++;
    peak = Math.max(peak, Math.abs(sample)); squares += sample * sample; sum += sample;
    if (Math.abs(sample) >= 1) clippedSamples++;
  }
  const round = value => Number(value.toFixed(9));
  const rms = Math.sqrt(squares / samples.length);
  return { peak: round(peak), peakDbFS: round(20 * Math.log10(peak)), rms: round(rms), rmsDbFS: round(20 * Math.log10(rms)), dcOffset: round(sum / samples.length), clippedSamples, nonFiniteSamples };
}
async function retainPreview(name, result) {
  if (!result.wavBase64) return;
  const wav = Buffer.from(result.wavBase64, 'base64');
  delete result.wavBase64;
  if (!write) return;
  await mkdir(new URL('previews/', output), { recursive: true });
  const wavePath = new URL(`previews/${name}.wav`, output);
  await writeFile(wavePath, wav);
  const entry = { pcmWavSha256: sha(wav), durationSeconds: result.captureSeconds };
  if (encode) {
    const destination = new URL(`previews/${name}.mp3`, output);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', fileURLToPath(wavePath), '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', '80k', fileURLToPath(destination)]);
    const bytes = await readFile(destination);
    const pcm = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', fileURLToPath(destination), '-f', 'f32le', '-ar', String(report.sampleRate), '-ac', '1', 'pipe:1'], { maxBuffer: 32 * 1024 * 1024 });
    const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
    const decodedMeasurements = measurePcm(samples);
    assert.equal(decodedMeasurements.clippedSamples, 0);
    assert.equal(decodedMeasurements.nonFiniteSamples, 0);
    assert.ok(decodedMeasurements.peak < .6 && decodedMeasurements.rms > .0001);
    Object.assign(entry, { file: `${name}.mp3`, bytes: bytes.length, sha256: sha(bytes), decodedSeconds: samples.length / report.sampleRate, decodedMeasurements });
    await rm(wavePath); // Review MP3 + reproducible renderer replace bulky intermediary PCM.
  } else Object.assign(entry, { file: `${name}.wav`, bytes: wav.length, sha256: sha(wav) });
  report.previews[name] = entry;
}
try {
  for (const scene of SCORE.scenes) {
    const result = await render({ scene, loops: 2, capture: write && ['stage1', 'stage3'].includes(scene) });
    inspect(result, scene);
    assert.equal(result.scheduledBars.length, 64);
    assert.ok(result.scheduledBars.every(bar => bar.scene === scene));
    assert.equal(result.intervalStarts, 1, 'A complete pair of loops must not restart the clock');
    await retainPreview(`over-the-little-bridge-${scene}`, result);
    report.scenes[scene] = result;
    console.log(`${scene}: ${result.eventCount} events / 2 loops; raw peak ${result.preCompressor.peakDbFS} dBFS; ${result.maxConcurrentOscillators} maximum oscillators; finite, unclipped`);
  }
  report.defaultVolumeStage1 = await render({ scene: 'stage1', loops: 1, volume: .45 });
  inspect(report.defaultVolumeStage1, 'default volume');
  const sceneRequests = [{ beforeBar: 6, scene: 'stage2' }, { beforeBar: 14, scene: 'stage3' }, { beforeBar: 22, scene: 'paused' }, { beforeBar: 26, scene: 'celebrate' }];
  report.sceneTransitions = await render({ scene: 'stage1', loops: 1, sceneRequests, capture: write });
  inspect(report.sceneTransitions, 'scene transitions');
  assert.equal(report.sceneTransitions.intervalStarts, 1);
  for (let bar = 0; bar < 32; bar++) {
    const expected = bar < 8 ? 'stage1' : bar < 16 ? 'stage2' : bar < 24 ? 'stage3' : bar < 28 ? 'paused' : 'celebrate';
    assert.equal(report.sceneTransitions.scheduledBars[bar].scene, expected, `Scene must change on musical boundary, bar ${bar}`);
    assert.equal(report.sceneTransitions.scheduledBars[bar].index, bar, 'Changing the scene must not reset the score');
  }
  await retainPreview('orchard-scene-transitions', report.sceneTransitions);

  let cueCursor = .5;
  const cueRequests = [];
  for (const name of EFFECT_NAMES) {
    const duration = Math.max(...eventsForEffect(name).map(event => event.beat + event.duration)) * beatSeconds;
    const result = await render({ kind: 'effects', effects: [{ name, atSeconds: .1 }], durationSeconds: duration + .8 });
    inspect(result, name);
    assert.equal(result.intervalStarts, 0, 'Effects cannot start a music clock');
    report.cues[name] = { atSecondsInPreview: cueCursor + .01, cueSeconds: duration, ...result };
    cueRequests.push({ name, atSeconds: cueCursor });
    cueCursor += duration + 1.0;
  }
  report.cueReel = await render({ kind: 'effects', effects: cueRequests, durationSeconds: cueCursor + .2, capture: write, captureSeconds: cueCursor + .2 });
  inspect(report.cueReel, 'cue reel');
  await retainPreview('orchard-cues', report.cueReel);
  const overlapEffects = [
    { name: 'catch', atSeconds: .5 }, { name: 'catch', atSeconds: .62 }, { name: 'reject', atSeconds: .64 },
    { name: 'order', atSeconds: .7 }, { name: 'forecast', atSeconds: 2 }, { name: 'gate-warning', atSeconds: 2 },
    { name: 'gust', atSeconds: 3 }, { name: 'compost', atSeconds: 3.1 }, { name: 'finish', atSeconds: 8 },
  ];
  report.musicAndCueOverlap = await render({ scene: 'celebrate', loops: 1, effects: overlapEffects });
  inspect(report.musicAndCueOverlap, 'music and cue overlap', { maxVoices: 24 });
  report.phoneDefaults = await render({ role: 'player', scene: 'stage1', effects: [{ name: 'catch', atSeconds: .1 }], durationSeconds: 2 });
  inspect(report.phoneDefaults, 'phone defaults', { silent: true });
  assert.equal(report.phoneDefaults.oscillatorCount, 0);
  assert.equal(report.phoneDefaults.intervalStarts, 0);
  assert.equal(report.phoneDefaults.settings.canPlayMusic, false);
  assert.equal(report.phoneDefaults.settings.effects, false);
  if (write) {
    if (encode) report.encoder = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
    await writeFile(new URL('render-report.json', output), JSON.stringify(report, null, 2) + '\n');
  }
  const details = { status: 'passed', title: SCORE.title, sceneCount: SCORE.scenes.length, cueCount: EFFECT_NAMES.length, loopSeconds: scoreSeconds, maxPreCompressorPeak: Math.max(...Object.values(report.scenes).map(value => value.preCompressor.peak)), maxConcurrentOscillators: Math.max(...Object.values(report.scenes).map(value => value.maxConcurrentOscillators)), written: write, encoded: encode, actualListening: false };
  completion = { done: true, summary: 'Passed: seven scenes, ten cues, shared-scheduler transitions and quiet phone defaults.', details };
  console.log(JSON.stringify(details, null, 2));
} finally {
  if (browser) await browser.close();
  if (!interactive) await new Promise(resolve => server.close(resolve));
}
