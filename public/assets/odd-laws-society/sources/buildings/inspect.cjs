// Exact-size visual/alpha checks for the shipped building pack. Requires nested WS4 deps.
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname,'../../../../..');
const sharp = createRequire(path.join(root,'ui/media/odd-laws-society/package.json'))('sharp');
const entries = JSON.parse(fs.readFileSync(path.join(root,'ui/media/odd-laws-society/fragments/buildings.json')));
const order = ['corner-shop','tea-stall','button-workshop','petition-kiosk','pocket-theatre','community-garden','night-market','clockwork-studio','public-library','debate-hall','concert-pavilion','quilt-bridge','grand-bazaar','grand-clock','high-court','observatory','opera-house','lala-monument'];
const evidence = path.join(__dirname,'evidence');fs.mkdirSync(evidence,{recursive:true});
(async()=>{
 const checks=[];
 for(const id of order){
  const e=entries[id];if(!e)throw new Error('Missing '+id);
  const file=path.join(root,'public/assets/odd-laws-society',e.src);
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let minX=info.width,minY=info.height,maxX=-1,maxY=-1,opaque=0,clear=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const a=data[(y*info.width+x)*4+3];if(a>0){minX=Math.min(x,minX);minY=Math.min(y,minY);maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);}else clear++;
   if(a===255)opaque++;
  }
  if(info.width!==512||info.height!==512||minX<24||minY<24||maxX>487||maxY>487||!opaque||!clear)throw new Error(id+' invalid size or alpha border');
  checks.push({id,width:info.width,height:info.height,bytes:fs.statSync(file).size,alphaBounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},transparentBorder:Math.min(minX,minY,511-maxX,511-maxY),status:'final'});
 }
 fs.writeFileSync(path.join(evidence,'image-checks.json'),JSON.stringify({images:checks,totalBytes:checks.reduce((n,x)=>n+x.bytes,0),note:'Structural checks plus exact-size contact sheets. No atlas used; every building is a standalone alpha WebP.'},null,2)+'\n');
 for(const size of [96,144]){
  const cellW=size+32,cellH=size+54,width=cellW*6+32,height=cellH*3+72;
  const title=Buffer.from(`<svg width="${width}" height="72"><text x="16" y="28" fill="#483329" font-family="sans-serif" font-size="19" font-weight="700">ODD LAWS SOCIETY · BUILDING PACK</text><text x="16" y="52" fill="#6d5849" font-family="sans-serif" font-size="13">All eighteen original illustrations · rendered at ${size} × ${size} pixels · labels are outside the artwork</text></svg>`);
  const layers=[{input:title,left:0,top:0}];
  for(let i=0;i<order.length;i++){
   const id=order[i],col=i%6,row=Math.floor(i/6),x=16+col*cellW,y=72+row*cellH;
   const img=await sharp(path.join(root,'public/assets/odd-laws-society',entries[id].src)).resize(size,size).png().toBuffer();
   layers.push({input:img,left:x+16,top:y});
   const label=Buffer.from(`<svg width="${cellW}" height="40"><text x="${cellW/2}" y="18" text-anchor="middle" fill="#483329" font-family="sans-serif" font-size="${size===96?10:12}">${id}</text></svg>`);
   layers.push({input:label,left:x,top:y+size+2});
  }
  await sharp({create:{width,height,channels:3,background:'#f7eddd'}}).composite(layers).png().toFile(path.join(evidence,`contact-sheet-${size}.png`));
 }
 console.log(JSON.stringify({buildings:checks.length,bytes:checks.reduce((n,x)=>n+x.bytes,0),minBorder:Math.min(...checks.map(x=>x.transparentBorder)),contactSheets:[96,144]}));
})().catch(e=>{console.error(e);process.exitCode=1;});
