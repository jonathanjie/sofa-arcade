import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here,'../..');
const repo = path.resolve(assets,'../../..');
const require = createRequire(path.join(repo,'ui/media/odd-laws-society/package.json'));
const sharp = require('sharp');
const fragments = path.join(repo,'ui/media/odd-laws-society/fragments');
const guilds = JSON.parse(await readFile(path.join(fragments,'guilds.json'),'utf8'));
const props = JSON.parse(await readFile(path.join(fragments,'props.json'),'utf8'));
const evidence = {schemaVersion:1,medium:'original self-contained SVG',images:[]};
for (const [key,entry] of Object.entries({...guilds,...props})) {
  const bytes = await readFile(path.join(assets,entry.src));
  const svg = bytes.toString('utf8');
  if (/<(?:script|image|text|foreignObject)\b/i.test(svg) || /(?:href|xlink:href)\s*=/i.test(svg) || /https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg',''))) throw new Error(`SVG not self-contained: ${key}`);
  if (!/<title\b/.test(svg) || !/<desc\b/.test(svg) || !entry.alt.trim()) throw new Error(`Missing accessible description: ${key}`);
  const {data,info} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if (info.width!==entry.width || info.height!==entry.height) throw new Error(`Wrong dimensions: ${key}`);
  let transparent=0,visible=0,border=0;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    const a=data[(y*info.width+x)*info.channels+3];
    if(a===0)transparent++;else visible++;
    if((x===0||y===0||x===info.width-1||y===info.height-1)&&a)border++;
  }
  if(!transparent||!visible||border)throw new Error(`Unsafe alpha or clipped art: ${key}`);
  evidence.images.push({id:key,src:entry.src,width:info.width,height:info.height,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,transparentPixels:transparent,visiblePixels:visible,borderNontransparentPixels:border,externalDependencies:0});
}
evidence.totalBytes=evidence.images.reduce((n,e)=>n+e.bytes,0);
await writeFile(path.join(here,'validation.json'),JSON.stringify(evidence,null,2)+'\n');

const overlays=[];
let body='';
function text(x,y,s,t){body+=`<text x="${x}" y="${y}" font-size="${s}" font-family="sans-serif" fill="#46392f">${t}</text>`;}
text(24,30,19,'Guilds at 96 px and 32 px · council props at 128 px');
for(const [i,[key,e]] of Object.entries(guilds).entries()){
  const x=24+i*212;
  overlays.push({input:await sharp(path.join(assets,e.src)).resize(96,96).png().toBuffer(),left:x,top:56});
  overlays.push({input:await sharp(path.join(assets,e.src)).resize(32,32).png().toBuffer(),left:x+112,top:112});
  text(x,176,15,key);
}
for(const [i,[key,e]] of Object.entries(props).entries()){
  const x=24+(i%3)*280,y=230+Math.floor(i/3)*200;
  overlays.push({input:await sharp(path.join(assets,e.src)).resize(160,128,{fit:'contain',background:'#00000000'}).png().toBuffer(),left:x,top:y});
  text(x,y+150,15,key);
}
const bg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="880" height="640"><rect width="880" height="640" fill="#f4ead2"/>${body}</svg>`);
await sharp(bg).composite(overlays).png().toFile(path.join(here,'contact.png'));
console.log(`Validated ${evidence.images.length} SVG assets: ${evidence.totalBytes} bytes; no external references or clipped borders.`);
