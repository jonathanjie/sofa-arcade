import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { MANIFEST, ASSETS, CHARACTER_STATES, getAsset, getCharacterFrame, validateManifest } from './manifest.mjs';
import { fallbackSvg, fallbackDataUrl } from './fallbacks.mjs';
import { validateAssets } from './sources/validate-assets.mjs';

test('Final images decode, inventory hashes close, atlas frames are distinct and alpha gutters are safe', async()=>{
  const report = await validateAssets();
  const inventory = JSON.parse(await readFile(new URL('./runtime-files.json', import.meta.url), 'utf8'));
  const images = inventory.files.map(file => file.path).filter(file => /\.(svg|webp)$/.test(file));
  assert.deepEqual(report.assets.map(asset => 'public' + asset.src).sort(), images.sort());
  assert.equal(report.assetCount, 52);
  for (const key of ['character-jon-phone', 'character-lydia-phone', 'cover-compact']) {
    assert.ok(report.assets.some(asset => asset.key === key), `Delivered variant missing: ${key}`);
  }
  assert.deepEqual(Object.fromEntries(report.assets.filter(asset => asset.frames)
    .map(asset => [asset.key, asset.frames.length])), {
    'character-jon': 8, 'character-lydia': 8, 'character-lala': 8,
  });
  assert.ok(report.runtimeBytes > 100000);
});
test('Validation rejects missing required art, unfinished entries, unsafe URLs and authoring delivery',()=>{
  for(const corrupt of [
    m=>delete m.assets.cover,
    m=>delete m.assets['fruit-plum'],
    m=>delete m.assets['basket-pear-full'],
    m=>m.assets.cover.placeholder=true,
    m=>m.assets.cover.width=0,
    m=>m.assets.cover.height=NaN,
    m=>m.assets.cover.src='https://example.com/x.webp',
    m=>m.assets.cover.src='/assets/gravity-orchard/../cover.webp',
    m=>m.assets.cover.src='/assets/gravity-orchard/%2e%2e/cover.webp',
    m=>m.assets.cover.src='/assets/gravity-orchard/Cover.webp',
    m=>m.assets.cover.src='/assets/gravity-orchard/cover.webp?token=x',
    m=>m.runtimeFiles.push('ui/media/gravity-orchard/sources/raw.png'),
    m=>m.runtimeFiles.pop(),
    m=>m.runtimeFiles.push(m.runtimeFiles[0]),
    m=>delete m.characterStates.lala.forecast,
    m=>m.characterStates.jon.brace.frames=['missing'],
    m=>m.characterStates.lydia.cheer.reducedMotionFrame='missing',
  ]) { const copy=structuredClone(MANIFEST);corrupt(copy);assert.throws(()=>validateManifest(copy)); }
});
test('Out-of-bounds, nonfinite or empty atlas frame data is rejected',()=>{
  const key=CHARACTER_STATES.jon.idle.asset, name=CHARACTER_STATES.jon.idle.frames[0];
  for(const corrupt of [
    f=>f.x=-1,f=>f.x=ASSETS[key].width,f=>f.y=ASSETS[key].height,f=>f.width=0,
    f=>f.height=Infinity,f=>f.durationMs=NaN,f=>f.durationMs=0,f=>f.pivot.x=99999,
  ]){const copy=structuredClone(MANIFEST);corrupt(copy.assets[key].frames[name]);assert.throws(()=>validateManifest(copy));}
});
test('Animation advances real poses, loops, freezes for reduced motion and has safe unknowns',()=>{
  for(const [actor,states] of Object.entries(CHARACTER_STATES))for(const [state,record] of Object.entries(states)){
    const first=getCharacterFrame(actor,state,0);const second=getCharacterFrame(actor,state,first.durationMs+1);
    assert.notEqual(first.frameName,second.frameName);
    const total=record.frames.reduce((sum,name)=>sum+ASSETS[record.asset].frames[name].durationMs,0);
    if(record.loop)assert.equal(getCharacterFrame(actor,state,total).frameName,first.frameName);
    assert.equal(getCharacterFrame(actor,state,99999,{reducedMotion:true}).frameName,record.reducedMotionFrame);
    assert.equal(getCharacterFrame(actor,state,NaN).frameName,first.frameName);
  }
  assert.equal(getCharacterFrame('nobody','idle',0),null);
  assert.equal(getCharacterFrame('jon','unknown',0).frameName,getCharacterFrame('jon','idle',0).frameName);
  assert.equal(getAsset('__proto__'),null);assert.equal(getAsset('missing'),null);
  assert.ok(Object.isFrozen(MANIFEST)&&Object.isFrozen(ASSETS)&&Object.isFrozen(ASSETS.cover));
});
test('Error-only fallbacks remain distinct and never interpolate untrusted SVG markup',()=>{
  const images=['apple','plum','pear','starfruit'].map(type=>fallbackSvg(`fruit-${type}`));
  assert.equal(new Set(images).size,4);
  assert.ok(fallbackDataUrl('fruit-apple').startsWith('data:image/svg+xml'));
  assert.ok(!fallbackSvg('<script>alert(1)</script>').includes('<script>'));
  assert.ok(!fallbackSvg('https://remote.invalid').includes('remote.invalid'));
});
