import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SCORE, eventsForBar, eventsForEffect } from './score.mjs';
import { eventsForEffect as directEffects } from './effects.mjs';
import { SCORE as kingdoms } from '../../score.mjs';
import { SCORE as oddLaws } from '../odd-laws-society/score.mjs';
import { createOfflineRenderer } from './offline-render.mjs';

const theme = (score,start=0) => score.bars.slice(start,start+8).map(bar=>bar.melody.map(({pitch,beat,duration})=>({pitch,beat,duration})));
const average = values => values.reduce((total,value)=>total+value,0)/values.length;
const notes = start => SCORE.bars.slice(start,start+8).flatMap(bar=>bar.melody).filter(note=>note.pitch!==null);
const effects=['menu-select','menu-back','menu-confirm'];
const instruments=new Set(['woodwind','bass','pizzicato','bell']);
function validate(events,limit){
  let previous=-1;
  for(const event of events){
    assert.deepEqual(Object.keys(event).sort(),['beat','duration','instrument','level','pitch']);
    assert.ok(instruments.has(event.instrument));
    assert.ok(Number.isInteger(event.pitch)&&event.pitch>=36&&event.pitch<=84);
    assert.ok(Number.isFinite(event.beat)&&event.beat>=0&&event.beat>=previous);
    assert.ok(Number.isFinite(event.duration)&&event.duration>0&&event.beat+event.duration<=limit);
    assert.ok(Number.isFinite(event.level)&&event.level>0&&event.level<=.14);
    previous=event.beat;
  }
}

test('welcoming menu has a complete original AABA tune with a returning hook',()=>{
  assert.equal(SCORE.title,'Make Yourself at Home');
  assert.equal(SCORE.key,'G major');assert.equal(SCORE.contrastingKey,'E minor');
  assert.equal(SCORE.bpm,92);assert.equal(SCORE.beatsPerBar,3);assert.equal(SCORE.meter,'3/4');
  assert.equal(SCORE.bars.length,32);assert.equal(SCORE.form,'AABA');
  assert.equal([0,8,16,24].map(index=>SCORE.bars[index].section).join(''),'AABA');
  assert.deepEqual(theme(SCORE),theme(SCORE,8));assert.deepEqual(theme(SCORE),theme(SCORE,24));
  assert.deepEqual(SCORE.bars[0].melody,SCORE.bars[4].melody);
  assert.deepEqual(SCORE.bars[0].melody.filter(note=>note.pitch!==null).map(note=>note.pitch),[62,67,71,69,67]);
  assert.notDeepEqual(theme(SCORE),theme(kingdoms),'not the existing Sofa Kingdoms waltz');
  assert.notDeepEqual(theme(SCORE),theme(oddLaws),'not the Odd Laws composition');
});

test('every bar accounts for all three beats and every phrase has an authored breath',()=>{
  for(const bar of SCORE.bars){
    let beat=0;
    for(const note of bar.melody){
      assert.equal(note.beat,beat);
      assert.ok(note.duration>0&&note.duration<=3);
      assert.ok(note.pitch===null||Number.isInteger(note.pitch)&&note.pitch>=62&&note.pitch<=79);
      assert.ok(note.accent>=.75&&note.accent<=1.05);
      beat+=note.duration;
    }
    assert.equal(beat,3);
    assert.equal(bar.melody.at(-1).pitch,null);
    assert.ok(bar.melody.at(-1).duration>=.25);
  }
});

test('B contrasts through E minor, B7 leading tone, register, rhythm and turnaround',()=>{
  const a=notes(0),b=notes(16);
  assert.notDeepEqual(theme(SCORE),theme(SCORE,16));
  assert.equal(SCORE.bars[16].harmony.name,'Em');
  assert.equal(SCORE.bars[17].harmony.name,'B7/D#');
  assert.ok(b.some(note=>note.pitch===75),'D# establishes the E-minor dominant');
  assert.ok(a.every(note=>note.pitch%12!==3));
  assert.ok(average(b.map(note=>note.pitch))>average(a.map(note=>note.pitch))+3);
  assert.ok(average(b.map(note=>note.duration))>average(a.map(note=>note.duration))*1.1);
  assert.equal(SCORE.bars[23].harmony.name,'D7');
  assert.equal(SCORE.bars[24].harmony.name,'G');
  assert.equal(SCORE.bars[23].cadence,'turnaround');
  assert.ok(SCORE.bars[22].melody[0].pitch===67&&SCORE.bars[22].melody[1].pitch===66,'suspension resolves to the dominant third');
});

test('tonic cadences and the loop leave the entire last beat clear',()=>{
  for(const index of [7,15,31]){
    assert.equal(SCORE.bars[index-1].harmony.name,'D7');assert.equal(SCORE.bars[index].harmony.name,'G');
    assert.equal(SCORE.bars[index].melody[0].pitch,67);
    assert.equal(SCORE.bars[index].melody.at(-1).duration,1.25);
    assert.ok(eventsForBar(index).every(event=>event.beat+event.duration<=2));
  }
  assert.ok(eventsForBar(23).every(event=>event.beat+event.duration<=2));
  assert.deepEqual(SCORE.bars.flatMap((_,index)=>eventsForBar(index).filter(event=>event.instrument==='bell').map(()=>index)),[7,15,31]);
});

test('all arrangements are safe aliases with bounded events, headroom and subordinate accompaniment',()=>{
  for(let index=0;index<32;index++){
    const events=eventsForBar(index);
    validate(events,3);
    for(const mode of ['menu','lobby','play','unknown','__proto__','toString',null,{},Symbol('mode')]) assert.deepEqual(eventsForBar(index,mode),events);
    const points=[...new Set(events.flatMap(event=>[event.beat,event.beat+event.duration]))];
    for(const beat of points) assert.ok(events.filter(event=>event.beat<=beat&&event.beat+event.duration>beat).reduce((sum,event)=>sum+event.level,0)<.3);
    const lead=events.filter(event=>event.instrument==='woodwind');
    for(let i=1;i<lead.length;i++)assert.ok(lead[i-1].beat+lead[i-1].duration<=lead[i].beat);
    assert.ok(events.filter(event=>event.instrument==='pizzicato').every(event=>event.level<=.018&&event.pitch<=64));
  }
});

test('indices wrap predictably and mutable results cannot change the frozen composition',()=>{
  assert.deepEqual(eventsForBar(32),eventsForBar(0));assert.deepEqual(eventsForBar(-1),eventsForBar(31));
  assert.deepEqual(eventsForBar(4.9),eventsForBar(4));assert.deepEqual(eventsForBar(-.1),eventsForBar(31));
  for(const index of [NaN,Infinity,-Infinity,'2',null,undefined,{},1n,Symbol('index')]) assert.deepEqual(eventsForBar(index),eventsForBar(0));
  function frozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));Object.values(value).forEach(frozen);}}
  frozen(SCORE);
  const expected=eventsForBar(0),modified=eventsForBar(0);modified[0].pitch=127;modified.pop();
  assert.deepEqual(eventsForBar(0),expected);
});

test('menu cues echo the theme in beat units and unknown effects remain silent',()=>{
  assert.equal(eventsForEffect,directEffects);
  for(const name of effects){
    const cue=eventsForEffect(name);assert.ok(cue.length>0&&cue.length<=4);validate(cue,1.5);
    assert.ok(cue.every(event=>[55,67,71,74].includes(event.pitch)));
    const modified=eventsForEffect(name);modified[0].level=1;modified.push({});
    assert.deepEqual(eventsForEffect(name),cue);
  }
  for(const name of [undefined,null,{},4,'unknown','__proto__','toString',Symbol('cue')])assert.deepEqual(eventsForEffect(name),[]);
});

test('runtime modules import and generate events without browser, I/O, randomness or clocks',()=>{
  const url=new URL('./score.mjs',import.meta.url).href;
  const script=`
    const forbidden=()=>{throw new Error('forbidden runtime dependency');};
    Math.random=forbidden;Date.now=forbidden;globalThis.setTimeout=forbidden;globalThis.setInterval=forbidden;
    for(const key of ['window','document','localStorage','AudioContext','fetch'])Object.defineProperty(globalThis,key,{get:forbidden});
    const {SCORE,eventsForBar,eventsForEffect}=await import(${JSON.stringify(url)});
    for(let bar=0;bar<SCORE.bars.length;bar++)eventsForBar(bar,'lobby');
    eventsForEffect('menu-confirm');
  `;
  assert.doesNotThrow(()=>execFileSync(process.execPath,['--input-type=module','-e',script],{timeout:10000}));
});

test('offline renderer is deterministic, tempo-aware and writes a correctly sized WAV',()=>{
  const renderer=createOfflineRenderer({bpm:92,sampleRate:16000,tailSeconds:.2});
  const event={instrument:'woodwind',pitch:67,beat:0,duration:.5,level:.1,atSeconds:.125};
  const samples=renderer.render([event],1),again=renderer.render([event],1);
  assert.deepEqual(samples,again);assert.equal(samples.length,19200);
  assert.equal(renderer.beatSeconds,60/92);
  assert.ok(renderer.measurements(samples).peak>0&&renderer.measurements(samples).peak<.2);
  const wav=renderer.pcmWav(samples,.7);
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),16000);
  assert.equal(wav.readUInt32LE(40),samples.length*2);assert.equal(wav.length,44+samples.length*2);
  assert.throws(()=>createOfflineRenderer({bpm:0}),RangeError);
  assert.throws(()=>renderer.render([{...event,atSeconds:-1}],1),RangeError);
});

test('retained preview evidence matches exact sources and decoded files',async()=>{
  const report=JSON.parse(await readFile(new URL('./audio-evidence/render-report.json',import.meta.url),'utf8'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  for(const file of ['score.mjs','effects.mjs','offline-render.mjs','audio-preview.mjs'])assert.equal(hash(await readFile(new URL(file,import.meta.url))),report.sourceSha256[file],`${file} changed: regenerate evidence`);
  assert.equal(report.scoreSeconds,32*3*60/92);assert.equal(report.bpm,92);
  assert.deepEqual(Object.keys(report.effects),effects);
  for(const entry of [report.music,...Object.values(report.effects),report.effectsPreview]){
    for(const gain of ['sourceMix','volume100','defaultVolume45']){
      assert.equal(entry[gain].clippedSamples,0);assert.equal(entry[gain].nonFiniteSamples,0);
      assert.ok(entry[gain].peak>0&&entry[gain].peak<.6);
    }
  }
  assert.match(report.auditoryEvaluation,/No human audition/);
  assert.deepEqual(Object.keys(report.previews),['make-yourself-at-home','menu-effects']);
  for(const entry of Object.values(report.previews)){
    const bytes=await readFile(new URL(`./audio-evidence/${entry.file}`,import.meta.url));
    assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);
    assert.equal(entry.decodedMeasurements.clippedSamples,0);assert.equal(entry.decodedMeasurements.nonFiniteSamples,0);
  }
});
