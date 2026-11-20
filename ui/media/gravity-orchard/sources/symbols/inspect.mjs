import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const root=new URL('../../../../../public/assets/gravity-orchard/',import.meta.url);
const width=1000,height=610,layers=[];
const label=(text,x,y,size=14,color='#385141')=>`<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" fill="${color}">${text}</text>`;
let annotation=label('Gravity Orchard · fruit recognition and basket feedback',25,32,21)+label('Original SVG at actual small render sizes · all labels are separate from artwork',25,56,12);
for(const [index,type] of ['apple','plum','pear','starfruit'].entries()){
  const x=28+index*244;
  annotation+=label(type.toUpperCase(),x,88,13);
  for(const [size,y] of [[32,104],[64,148]])layers.push({input:await sharp(fileURLToPath(new URL(`fruit/${type}.svg`,root))).resize(size,size).png().toBuffer(),left:x,top:y});
  layers.push({input:await sharp(fileURLToPath(new URL(`fruit/${type}.svg`,root))).resize(32,32).grayscale().png().toBuffer(),left:x+48,top:104});
  layers.push({input:await sharp(fileURLToPath(new URL(`fruit/${type}.svg`,root))).resize(32,32).png().toBuffer(),left:x+8,top:245});
  annotation+=label('32 px · grayscale',x+88,125,11)+label('64 px',x+78,190,11)+label('32 px on dark',x+56,267,11,'#eee8d0');
  for(const [i,state] of ['ordinary','accepting','rejecting','full'].entries()){
    const bx=x+(i%2)*108,by=320+Math.floor(i/2)*132;
    layers.push({input:await sharp(fileURLToPath(new URL(`baskets/${type}-${state}.svg`,root))).resize(76,76).png().toBuffer(),left:bx,top:by});
    annotation+=label(state+' · 76 px',bx,by+96,11);
  }
}
const backdrop=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f6eedb"/><rect y="228" width="100%" height="65" fill="#294338"/>${annotation}</svg>`);
await mkdir(new URL('evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('evidence/symbols-32-76.png',import.meta.url),await sharp(backdrop).composite(layers).png().toBuffer());
