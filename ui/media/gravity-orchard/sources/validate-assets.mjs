import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { MANIFEST, validateManifest, REQUIRED_STATES } from '../manifest.mjs';
const repo = new URL('../../../../', import.meta.url);
const media = new URL('../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function walk(directory) {
  const entries = await readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(new URL(`${entry.name}/`,directory)) : [fileURLToPath(new URL(entry.name,directory))]))).flat();
}
export async function validateAssets() {
  const canonical = JSON.parse(await readFile(new URL('public/assets/gravity-orchard/manifest.json',repo),'utf8'));
  assert.deepEqual(MANIFEST,canonical,'Browser adapter must equal the canonical JSON');
  validateManifest(canonical);
  const inventory = JSON.parse(await readFile(new URL('runtime-files.json',media),'utf8'));
  assert.deepEqual(inventory.runtimeFiles,MANIFEST.runtimeFiles);
  assert.deepEqual(inventory.files.map(file => file.path),MANIFEST.runtimeFiles);
  assert.deepEqual(inventory.productionDependencies,[]);
  assert.equal(inventory.totalBytes,inventory.files.reduce((sum,file)=>sum+file.bytes,0));
  const reports = [];
  for (const item of inventory.files) {
    const bytes = await readFile(new URL(item.path,repo));
    assert.equal(bytes.length,item.bytes,`${item.path} measured bytes`);
    assert.equal(hash(bytes),item.sha256,`${item.path} SHA-256`);
  }
  const publicFiles = (await walk(new URL('public/assets/gravity-orchard/',repo)))
    .map(path => path.slice(fileURLToPath(repo).length)).sort();
  assert.deepEqual(publicFiles,MANIFEST.runtimeFiles.filter(path=>path.startsWith('public/')).sort(),
    'No public files may hide outside the exact inventory');
  for (const [key,asset] of Object.entries(MANIFEST.assets)) {
    const bytes = await readFile(new URL(`public${asset.src}`,repo));
    if (asset.src.endsWith('.svg')) {
      const xml = bytes.toString('utf8');
      assert.ok(!/<(?:script|foreignObject|image|text)\b|\bon[a-z]+\s*=|(?:href|src)\s*=|@import|url\(\s*[^#]/i.test(xml),`${key}: self-contained text-free SVG`);
    }
    const info = await sharp(bytes).metadata();
    assert.equal(info.width,asset.width,`${key} decoded width`);
    assert.equal(info.height,asset.height,`${key} decoded height`);
    const {data,info:raw} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let transparent = 0, opaque = 0;
    for (let offset=3;offset<data.length;offset+=4) { if(data[offset]===0)transparent++;if(data[offset]===255)opaque++; }
    const needsAlpha = asset.transparent || asset.kind === 'atlas' || /^fruit-|^basket-|^gate-|^gust-|^effect-|^compost$/.test(key);
    if (needsAlpha) {
      assert.ok(transparent>raw.width*raw.height*.005,`${key}: true transparent padding`);
      assert.ok(opaque>0,`${key}: visible opaque art`);
      for (const [x,y] of [[0,0],[raw.width-1,0],[0,raw.height-1],[raw.width-1,raw.height-1]]) assert.equal(data[(y*raw.width+x)*4+3],0,`${key}: transparent corners`);
    }
    const frames = [];
    if(asset.kind === 'atlas') {
      const hashes = new Set();
      for(const [name,frame] of Object.entries(asset.frames)) {
        const {data:frameData,info:fi}=await sharp(bytes).extract({left:frame.x,top:frame.y,width:frame.width,height:frame.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        let covered = 0, edgeAlpha = 0;
        for(let y=0;y<fi.height;y++)for(let x=0;x<fi.width;x++){
          const alpha=frameData[(y*fi.width+x)*4+3];if(alpha>16)covered++;
          if((x<2||y<2||x>=fi.width-2||y>=fi.height-2)&&alpha>16)edgeAlpha++;
        }
        assert.ok(covered>fi.width*fi.height*.08,`${key}/${name}: visible pose`);
        assert.equal(edgeAlpha,0,`${key}/${name}: no frame-edge clipping`);
        const digest=hash(frameData);assert.ok(!hashes.has(digest),`${key}/${name}: genuine distinct frame`);hashes.add(digest);
        frames.push({name,coveredPixels:covered,edgeAlpha,sha256:digest});
      }
    }
    reports.push({key,src:asset.src,width:info.width,height:info.height,bytes:bytes.length,format:info.format,
      transparentPixels:transparent,opaquePixels:opaque,...(frames.length?{frames}:{})});
  }
  const cover=reports.find(item=>item.key==='cover');assert.ok(cover.width>=1280 && cover.width/cover.height>=1.6);
  for(const [actor,states] of Object.entries(REQUIRED_STATES))for(const state of states) {
    const item = MANIFEST.characterStates[actor][state];
    assert.ok(item.frames.length>=2,`${actor}/${state} multiple poses`);
  }
  assert.ok(inventory.totalBytes < 6*1024*1024,'Runtime media budget is 6 MiB');
  return {schemaVersion:1,status:'passed',assetCount:reports.length,runtimeFiles:inventory.files.length,
    runtimeBytes:inventory.totalBytes,productionDependencies:inventory.productionDependencies,assets:reports};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result=await validateAssets();
  const output=new URL('evidence/latest/',import.meta.url);await mkdir(output,{recursive:true});
  await writeFile(new URL('asset-validation.json',output),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,assets:result.assetCount,runtimeFiles:result.runtimeFiles,runtimeBytes:result.runtimeBytes}));
}
