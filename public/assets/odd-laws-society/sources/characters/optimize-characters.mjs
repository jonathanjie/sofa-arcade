import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Technical conversion only: no painting, recoloring, background reconstruction,
// pose synthesis, or image content editing. Original illustration is imagegen.
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../..');
const repo = path.resolve(assets, '../../..');
const require = createRequire(path.join(repo, 'ui/media/odd-laws-society/package.json'));
const sharp = require('sharp');
const sourceDirectory = process.argv[2];
if (!sourceDirectory) throw new Error('Usage: node optimize-characters.mjs /absolute/path/to/generated-originals');
const records = JSON.parse(await readFile(path.join(here, 'generation-prompts.json'), 'utf8'));
const sha256 = data => createHash('sha256').update(data).digest('hex');
const poseDescriptions = {
  'jon-idle': 'Jon mouse stands at ease with a blank civic folio, navy rectangular glasses, teal scarf and gold seal pin.',
  'jon-thinking': 'Jon mouse rests a paw thoughtfully at his chin while holding a civic folio, in navy glasses and a teal scarf.',
  'jon-acting': 'Jon mouse presents a blank rolled plan with an open-paw gesture and an enthusiastic smile.',
  'jon-celebrate': 'Jon mouse celebrates with lifted paws and a happy closed-eye smile, wearing his teal scarf and civic pin.',
  'jon-disappointed': 'Jon mouse lowers his gaze and holds his folio with both paws in mild, good-natured disappointment.',
  'lydia-idle': 'Lydia mouse stands attentively with a civic folio, round glasses, chestnut ponytail, coral scarf and gold leaf pin.',
  'lydia-thinking': 'Lydia mouse looks upward with a paw to her chin, considering her civic folio thoughtfully.',
  'lydia-acting': 'Lydia mouse presents an open blank civic folio with a welcoming open-paw gesture.',
  'lydia-celebrate': 'Lydia mouse claps happily with a closed-eye smile, keeping her round glasses and coral scarf.',
  'lydia-disappointed': 'Lydia mouse gives a small resigned shrug while holding her civic folio, with a gently lowered gaze.',
  'lala-idle': 'Lala the orange tabby sits proudly as council Chair, wearing a teal and plum sash with a brass medallion.',
  'lala-thinking': 'Lala the orange tabby Chair considers a decision with one paw beneath her chin and curious upturned eyes.',
  'lala-stamp': 'Lala the orange tabby Chair presses a wooden council stamp onto a blank cream sheet with a proud smile.',
  'lala-celebrate': 'Lala the orange tabby Chair raises her front paws and smiles with joy, her striped tail curled beside her.',
};
const required = {
  jon: ['idle','thinking','acting','celebrate','disappointed'],
  lydia: ['idle','thinking','acting','celebrate','disappointed'],
  lala: ['idle','thinking','stamp','celebrate'],
};
const face = {
  jon: [0.56, 0.35], lydia: [0.55, 0.35], lala: [0.43, 0.37],
};
const footX = { jon: 0.52, lydia: 0.51, lala: 0.43 };
const evidence = {schemaVersion:1, tool:'sharp', version:sharp.versions.sharp,
  processing:{resize:{width:480,height:480,fit:'contain',background:'transparent'},padding:16,
    output:{format:'webp',width:512,height:512,quality:88,alphaQuality:100,effort:6}},
  originalImagesIncluded:false, originalsNote:'Oversized generation intermediates are deliberately excluded. The optimized original illustrations are the shipped sources; exact prompts and hashes are retained.',
  referenceFiles:{},images:[]};
for (const ref of ['public/assets/characters.png','public/assets/sofa-room.png']) {
  evidence.referenceFiles[ref] = sha256(await readFile(path.join(repo, ref)));
}
const sourceHashes = {};
for (const record of records.records) {
  if (!/^exec-[0-9a-f-]+\.png$/.test(record.sourceFile)) throw new Error(`Unexpected source filename: ${record.sourceFile}`);
  sourceHashes[record.id] = sha256(await readFile(path.join(sourceDirectory, record.sourceFile)));
}
const characters = {};
for (const [name, states] of Object.entries(required)) {
  characters[name] = {
    medium: 'AI-generated watercolor raster',
    representation: 'independent flat state cutouts',
    animation: {type:'state-cutouts', frameByFrame:false, poseReuse:false,
      notes:'Each required state has a distinct generated illustration. UI may swap states, translate, tilt or scale the whole image around the foot anchor. No separated body-part rig or animation loop is supplied.'},
    states:{},
  };
  for (const state of states) {
    const id = `${name}-${state}`;
    const record = records.records.find(r => r.id === id);
    if (!record) throw new Error(`Missing generation provenance for ${id}`);
    const source = await readFile(path.join(sourceDirectory, record.sourceFile));
    const original = await sharp(source).metadata();
    const output = path.join(assets, record.output);
    await mkdir(path.dirname(output), {recursive:true});
    await sharp(source).resize(480,480,{fit:'contain',background:'#00000000'})
      .extend({top:16,bottom:16,left:16,right:16,background:'#00000000'})
      .webp({quality:88,alphaQuality:100,effort:6}).toFile(output);
    const bytes = await readFile(output);
    const {data,info} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let minX = 512, minY = 512, maxX = 0, maxY = 0, transparent = 0, opaque = 0, border = 0;
    for (let y=0;y<info.height;y++) for (let x=0;x<info.width;x++) {
      const alpha = data[(y*info.width+x)*info.channels+3];
      if (alpha === 0) transparent++;
      if (alpha >= 128) { opaque++; minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); }
      if ((x===0||x===511||y===0||y===511) && alpha) border++;
    }
    if (info.width!==512 || info.height!==512 || !transparent || !opaque || border) throw new Error(`Unsafe dimensions/alpha/border in ${id}`);
    const anchors = {foot:[footX[name],Number((maxY/512).toFixed(4))],face:face[name]};
    if (id==='lala-stamp') {
      anchors.foot = [0.49,0.90]; // Paw contact; the separate paper extends lower.
      anchors.stamp = [0.24,0.88]; // Rubber base contact, not the wooden handle.
    }
    characters[name].states[state] = {src:record.output,width:512,height:512,alt:poseDescriptions[id],status:'final',
      medium:'AI-generated watercolor raster',poseId:id,poseReuse:false,anchors};
    evidence.images.push({id,output:record.output,sourceFile:record.sourceFile,sourceSha256:sourceHashes[id],
      sourceDimensions:[original.width,original.height],outputSha256:sha256(bytes),bytes:bytes.length,
      dimensions:[512,512],hasAlpha:true,transparentPixels:transparent,opaquePixels:opaque,borderNontransparentPixels:border,
      opaqueBounds:[minX,minY,maxX+1,maxY+1],
      references:record.references.map(ref=>({...ref,sha256:ref.repoPath?evidence.referenceFiles[ref.repoPath]:sourceHashes[ref.generation]}))});
  }
}
evidence.totalBytes=evidence.images.reduce((total,image)=>total+image.bytes,0);
await writeFile(path.join(repo,'ui/media/odd-laws-society/fragments/characters.json'),JSON.stringify(characters,null,2)+'\n');
await writeFile(path.join(here,'validation.json'),JSON.stringify(evidence,null,2)+'\n');

// An inspection contact at actual 144px board size, on alternating light/dark rows.
const overlays = [];
const paper = '#f6ecd5', ink = '#46392f', dark = '#29443f';
let markup = `<rect width="960" height="690" fill="${paper}"/><rect x="0" y="260" width="960" height="210" fill="${dark}"/><text x="24" y="35" font-size="22" font-family="sans-serif" fill="${ink}">Civic cast · distinct flat states at 144 px</text>`;
for (const [row,[name,states]] of Object.entries(required).entries()) {
  const y = 65+row*210;
  const color = row===1 ? paper : ink;
  markup += `<text x="24" y="${y+12}" font-size="16" font-family="sans-serif" fill="${color}">${name}</text>`;
  for (const [column,state] of states.entries()) {
    const x = 30+column*186;
    overlays.push({input:await sharp(path.join(assets,characters[name].states[state].src)).resize(144,144).png().toBuffer(),left:x,top:y+24});
    markup += `<text x="${x}" y="${y+189}" font-size="14" font-family="sans-serif" fill="${color}">${state}</text>`;
  }
}
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="690">${markup}</svg>`))
  .composite(overlays).png().toFile(path.join(here,'contact.png'));
console.log(`Optimized and validated ${evidence.images.length} unique state cutouts: ${evidence.totalBytes} bytes.`);
