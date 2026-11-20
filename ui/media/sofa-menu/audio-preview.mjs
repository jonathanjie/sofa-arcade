/** Development-only audio evidence. --verify writes nothing; --write --encode needs ffmpeg. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCORE, eventsForBar, eventsForEffect } from './score.mjs';
import { createOfflineRenderer } from './offline-render.mjs';

const write = process.argv.includes('--write');
const encode = process.argv.includes('--encode');
if ((!write && !process.argv.includes('--verify')) || (encode && !write)) throw new Error('Use --verify or --write [--encode].');
const output = new URL('./audio-evidence/', import.meta.url);
const renderer = createOfflineRenderer({ bpm: SCORE.bpm });
const { render, measurements, pcmWav, sampleRate, beatSeconds, tailSeconds } = renderer;
const musicBus = .7, effectsBus = .75, defaultVolume = .45;
const scoreSeconds = SCORE.bars.length * SCORE.beatsPerBar * beatSeconds;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inspect = (samples, bus) => {
  const sourceMix = measurements(samples);
  assert.equal(sourceMix.nonFiniteSamples,0); assert.equal(sourceMix.clippedSamples,0);
  assert.ok(sourceMix.peak < .6 && sourceMix.rms > .002 && Math.abs(sourceMix.dcOffset) < .0005, 'Unsafe signal, missing audio or DC offset');
  return { sourceMix, volume100:measurements(samples,bus), defaultVolume45:measurements(samples,bus*defaultVolume) };
};
const timeline = mode => SCORE.bars.flatMap((_,bar) => eventsForBar(bar,mode).map(event => ({...event,atSeconds:(bar*SCORE.beatsPerBar+event.beat)*beatSeconds})));
const events = timeline('play');
for (const mode of ['menu','lobby','unknown']) assert.deepEqual(timeline(mode),events,`${mode} must preserve the complete welcoming theme`);
const music = render(events,scoreSeconds);
const report = {
  schemaVersion:1,title:SCORE.title,key:SCORE.key,bpm:SCORE.bpm,beatsPerBar:SCORE.beatsPerBar,
  scoreSeconds,releaseTailSeconds:tailSeconds,sampleRate,channels:1,pcmBits:16,
  previewVolume:1,defaultSharedVolume:defaultVolume,musicBusGain:musicBus,effectsBusGain:effectsBus,
  methodology:'Deterministic oscillator, envelope, lowpass and room-reflection approximation of ui/audio.js. No compressor, limiter or normalization. The one menu arrangement is rendered once; its lobby/menu/unknown aliases are checked event-for-event.',
  sourceSha256:{},music:{eventCount:events.length,verifiedModeAliases:['play','menu','lobby','unknown'],...inspect(music,musicBus)},effects:{},
  auditoryEvaluation:'No human audition performed. Numeric signal checks, encoded-file decoding and browser playback tests do not establish listening quality on physical speakers.',
};
for (const file of ['score.mjs','effects.mjs','offline-render.mjs','audio-preview.mjs']) report.sourceSha256[file]=hash(await readFile(new URL(file,import.meta.url)));
const cueEvents=[];
let cursor=.5;
for (const name of ['menu-select','menu-back','menu-confirm']) {
  const cue=eventsForEffect(name);
  const duration=Math.max(...cue.map(event=>event.beat+event.duration))*beatSeconds;
  const localEvents=cue.map(event=>({...event,atSeconds:event.beat*beatSeconds}));
  report.effects[name]={atSecondsInPreview:cursor,eventCount:cue.length,...inspect(render(localEvents,duration,'effects'),effectsBus)};
  cueEvents.push(...localEvents.map(event=>({...event,atSeconds:event.atSeconds+cursor})));
  cursor+=duration+1.1;
}
const effects=render(cueEvents,cursor,'effects');
report.effectsPreview={durationSeconds:effects.length/sampleRate,...inspect(effects,effectsBus)};
if(write){
  await mkdir(new URL('wav/',output),{recursive:true});
  const previews=[['make-yourself-at-home',music,musicBus],['menu-effects',effects,effectsBus]];
  report.previews={};
  for(const [name,samples,gain] of previews){
    const wav=pcmWav(samples,gain), file=`${name}.wav`;
    await writeFile(new URL(`wav/${file}`,output),wav);
    report.previews[name]={pcmWavSha256:hash(wav),decodedSeconds:samples.length/sampleRate};
    if(encode){
      const target=new URL(`${name}.mp3`,output);
      execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',fileURLToPath(new URL(`wav/${file}`,output)),'-map_metadata','-1','-codec:a','libmp3lame','-b:a','80k',fileURLToPath(target)]);
      const bytes=await readFile(target);
      const pcm=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',fileURLToPath(target),'-f','f32le','-ar',String(sampleRate),'-ac','1','pipe:1'],{maxBuffer:32*1024*1024});
      const decoded=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4);
      const checks=measurements(decoded);
      assert.equal(checks.nonFiniteSamples,0);assert.equal(checks.clippedSamples,0);assert.ok(checks.peak<.6);
      report.previews[name]={...report.previews[name],file:`${name}.mp3`,bytes:bytes.length,sha256:hash(bytes),decodedSeconds:decoded.length/sampleRate,decodedMeasurements:checks};
    }
  }
  if(encode)report.encoder=execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0];
  await writeFile(new URL('render-report.json',output),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:'passed',title:SCORE.title,scoreSeconds,eventCount:events.length,sourcePeakDbFS:report.music.sourceMix.peakDbFS,previewRmsDbFS:report.music.volume100.rmsDbFS,clippedSamples:0,effects:Object.keys(report.effects),filesWritten:write},null,2));
