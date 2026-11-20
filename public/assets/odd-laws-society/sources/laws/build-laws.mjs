import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Original geometry for Odd Laws Society. No traced, stock or external symbols.
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../..');
const repo = path.resolve(assets, '../../..');
const fragments = path.join(repo, 'ui/media/odd-laws-society/fragments');
const palette = {
  ink: '#46392f', paper: '#fff4d9', amber: '#e3ad4e', paleAmber: '#f1cb79',
  coral: '#e89776', paleCoral: '#f2b296', teal: '#387d76', paleTeal: '#aed1bd',
  plum: '#82536e', palePlum: '#d7b2c5', wood: '#bb7855',
};
const p = palette;
const line = `stroke="${p.ink}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"`;
const thin = `stroke="${p.ink}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"`;
const sprout = (x, y, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="${p.amber}" stroke="${p.ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M0 25V-4M0 3Q-23 3-24-19Q-2-21 0 3ZM0-6Q20-6 25-28Q3-29 0-6Z"/></g>`;
const star = (x, y, radius, fill = p.amber) => `<path d="M${x} ${y-radius}L${x+radius*.3} ${y-radius*.3}L${x+radius} ${y}L${x+radius*.3} ${y+radius*.3}L${x} ${y+radius}L${x-radius*.3} ${y+radius*.3}L${x-radius} ${y}L${x-radius*.3} ${y-radius*.3}Z" fill="${fill}" stroke="${p.ink}" stroke-width="7" stroke-linejoin="round"/>`;
const hammer = (x, y, scale = 1, rotation = -34) => `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})"><path d="M-11-12H11V59Q0 70-11 59Z" fill="${p.paper}" ${line}/><path d="M-39-42H39V-8H-39Z" fill="${p.coral}" ${line}/></g>`;
const smallShop = (x, y) => `<g transform="translate(${x} ${y})"><path d="M6 31H72V93H6Z" fill="${p.paleAmber}" ${thin}/><path d="M0 31L9 3H69L78 31Z" fill="${p.amber}" ${thin}/><path d="M27 5L24 30M51 5L54 30" stroke="${p.paper}" stroke-width="9"/><path d="M0 31H78" fill="none" ${thin}/><path d="M29 93V62Q39 51 49 62V93" fill="${p.paper}" ${thin}/></g>`;
const gear = (cx, cy, outer, inner, teeth = 8) => {
  const points = [];
  for (let tooth = 0; tooth < teeth; tooth++) {
    for (const [fraction, radius] of [[0, inner], [.15, outer], [.6, outer], [.75, inner]]) {
      const angle = (tooth + fraction) * Math.PI * 2 / teeth - Math.PI / 2;
      points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`);
    }
  }
  return `M${points.join('L')}Z`;
};
const clapHand = (x, flip) => `<g transform="translate(${x} 136) scale(${flip*.84} .84) rotate(-22)"><path d="M-25 28V-16Q-25-28-14-28Q-7-28-7-16V-32Q-7-44 2-44Q12-44 12-32V-27Q12-39 22-39Q32-39 32-27V4L41-9Q52-16 57-5Q60 1 53 31Q46 60 18 60H-3Q-25 60-25 28Z" fill="${p.paper}" ${line}/><path d="M-28 47H35V80H-28Z" fill="${p.palePlum}" ${line}/></g>`;

const specs = [
  {
    id: 'small-shop-supremacy', name: 'Small-Shop Supremacy', category: 'economy',
    alt: 'An amber corner shop beneath a crown, the emblem for Small-Shop Supremacy.',
    meaning: 'Crowned shop marks the Commerce building subsidy; the exact discount stays in interface text.',
    color: p.amber,
    geometry: `<path d="M88 62L82 34L110 46L128 25L146 46L174 34L168 62Z" fill="${p.amber}" ${thin}/><path d="M63 126H193V208H63Z" fill="${p.paleAmber}" ${line}/><path d="M55 126L67 85H189L201 126Z" fill="${p.amber}" ${line}/><path d="M94 87L90 124M128 87V124M162 87L166 124" stroke="${p.paper}" stroke-width="12"/><path d="M55 126H201" fill="none" ${line}/><path d="M110 208V163Q128 147 146 163V208" fill="${p.paper}" ${thin}/><path d="M84 155V172M172 155V172M58 210H198" fill="none" ${thin}/>`
  },
  {
    id: 'workshop-week', name: 'Workshop Week', category: 'economy',
    alt: 'A coral workshop hammer on a blank calendar, the emblem for Workshop Week.',
    meaning: 'Calendar and hammer distinguish the Craft subsidy from the separate Industrial Pride civic award.',
    color: p.coral,
    geometry: `<rect x="52" y="60" width="152" height="150" rx="14" fill="${p.paleCoral}" ${line}/><path d="M52 99V75Q52 60 67 60H189Q204 60 204 75V99Z" fill="${p.coral}" ${line}/><path d="M88 43V77M168 43V77" fill="none" ${line}/>${hammer(126,149,.93)}`
  },
  {
    id: 'public-grants', name: 'Public Grants', category: 'economy',
    alt: 'An amber grant coin above an open teal civic book, the emblem for Public Grants.',
    meaning: 'A grant arriving at a civic book denotes the Civic building subsidy, without a printed denomination.',
    color: p.teal,
    geometry: `<circle cx="128" cy="65" r="31" fill="${p.paleAmber}" ${thin}/>${sprout(128,68,.65)}<path d="M128 103V116M118 108L128 118L138 108" fill="none" ${thin}/><path d="M128 143Q88 117 53 132V201Q91 190 128 214Q165 190 203 201V132Q168 117 128 143Z" fill="${p.paleTeal}" ${line}/><path d="M128 143V214M73 151Q94 148 109 159M147 159Q164 148 184 151" fill="none" ${thin}/>`
  },
  {
    id: 'everything-is-art', name: 'Everything Is Art', category: 'economy',
    alt: 'A plum painter’s palette with a broad brush, the emblem for Everything Is Art.',
    meaning: 'Palette and brush signify the Culture building subsidy; it remains distinct from applause and the Culture guild mask.',
    color: p.plum,
    geometry: `<path d="M170 70C129 28 59 37 46 79C27 122 47 201 109 219C139 227 171 213 175 189C179 170 148 168 151 151C154 137 189 153 207 135C233 105 208 76 170 70Z" fill="${p.palePlum}" ${line}/><circle cx="160" cy="98" r="14" fill="${p.paper}" ${thin}/><circle cx="76" cy="90" r="12" fill="${p.paleAmber}"/><circle cx="77" cy="135" r="12" fill="${p.coral}"/><circle cx="106" cy="177" r="12" fill="${p.teal}"/><g transform="translate(181 119) rotate(36)"><path d="M-9-8H9V89Q0 101-9 89Z" fill="${p.wood}" ${thin}/><path d="M-11-28H11V-7H-11Z" fill="${p.amber}" ${thin}/><path d="M-13-28L-11-57Q-4-71 8-74Q6-54 13-48V-28Z" fill="${p.paper}" ${thin}/></g>`
  },
  {
    id: 'open-tender', name: 'Open Tender', category: 'economy',
    alt: 'An unrolled cream construction plan with an open doorway, the emblem for Open Tender.',
    meaning: 'An open building plan represents an unrestricted tender for the first construction of a session.',
    color: p.amber,
    geometry: `<path d="M57 62H198V189Q198 207 216 207H62Q42 207 42 187V77Q42 62 57 62Z" fill="#f6dfac" ${line}/><path d="M198 62V189Q198 207 216 207Q233 207 233 189V175H198" fill="${p.paper}" ${line}/><path d="M79 130L127 90L175 130" fill="none" ${line}/><path d="M93 121V176H161V121" fill="${p.paper}" ${line}/><path d="M116 176V145H138V176" fill="${p.paleTeal}" ${thin}/><path d="M58 78V170" fill="none" stroke="#bda47e" stroke-width="6" stroke-linecap="round"/>`
  },
  {
    id: 'honest-wages', name: 'Honest Wages', category: 'economy',
    alt: 'A coral-sleeved open hand receiving a sprout coin, the emblem for Honest Wages.',
    meaning: 'Payment into an open hand denotes Work income, without depicting a specific number of coins.',
    color: p.amber,
    geometry: `<circle cx="137" cy="76" r="40" fill="${p.paleAmber}" ${line}/>${sprout(137,79,.83)}<path d="M78 164L105 142Q115 134 124 142L147 162H176Q189 162 189 174Q189 180 181 184L145 207Q126 216 105 206L77 194Z" fill="${p.paper}" ${line}/><path d="M113 165L138 181H158" fill="none" ${thin}/><path d="M38 158H78V211H38Z" fill="${p.coral}" ${line}/>`
  },
  {
    id: 'shop-local', name: 'Shop Local', category: 'civic',
    alt: 'Two amber neighborhood shops under a warm heart, the emblem for Shop Local.',
    meaning: 'A loved neighborhood of shops represents a civic award for established Commerce buildings.',
    color: p.amber,
    geometry: `<path d="M128 89C93 65 86 45 100 34C111 24 123 32 128 39C133 32 145 24 156 34C170 45 163 65 128 89Z" fill="${p.coral}" ${thin}/>${smallShop(43,108)}${smallShop(135,108)}<path d="M43 211H213" fill="none" ${thin}/>`
  },
  {
    id: 'industrial-pride', name: 'Industrial Pride', category: 'civic',
    alt: 'A coral gear and hammer on a pride ribbon, the emblem for Industrial Pride.',
    meaning: 'A gear-shaped award with a hammer marks civic recognition of an established Craft city.',
    color: p.coral,
    geometry: `<path d="M96 172L84 228L122 209L146 228L160 172Z" fill="${p.paleCoral}" ${thin}/><path d="${gear(128,116,81,65)}" fill="${p.coral}" ${thin}/><circle cx="128" cy="116" r="51" fill="${p.paper}" stroke="${p.ink}" stroke-width="7"/>${hammer(128,119,.62,-32)}`
  },
  {
    id: 'public-service-day', name: 'Public Service Day', category: 'civic',
    alt: 'A teal civic pennant bearing an open book and a laurel, the emblem for Public Service Day.',
    meaning: 'A ceremonial book-bearing civic standard represents recognition of established Civic buildings.',
    color: p.teal,
    geometry: `<path d="M75 45V219M54 219H96" fill="none" ${line}/><path d="M81 49Q118 36 150 50Q178 61 205 48V134Q177 147 149 134Q116 121 81 136Z" fill="${p.paleTeal}" ${line}/><path d="M145 87Q126 74 107 79V120Q126 115 145 128Q163 115 182 120V79Q164 74 145 87Z" fill="${p.paper}" stroke="${p.ink}" stroke-width="7" stroke-linejoin="round"/><path d="M145 87V128" fill="none" stroke="${p.ink}" stroke-width="7"/><path d="M122 211Q174 201 202 160" fill="none" stroke="${p.teal}" stroke-width="8" stroke-linecap="round"/><path d="M146 204Q127 184 142 172Q161 184 146 204ZM168 193Q151 170 167 160Q184 174 168 193ZM185 177Q178 153 197 149Q210 164 185 177Z" fill="${p.teal}"/>`
  },
  {
    id: 'mandatory-applause', name: 'Mandatory Applause', category: 'civic',
    alt: 'Two cream clapping paws with plum cuffs and golden rays, the emblem for Mandatory Applause.',
    meaning: 'The required applause celebrates established Culture buildings; clapping paws suit the illustrated mouse council.',
    color: p.plum,
    geometry: `<path d="M128 35V56M84 50L99 67M172 50L157 67" fill="none" stroke="${p.amber}" stroke-width="11" stroke-linecap="round"/>${clapHand(78,1)}${clapHand(178,-1)}`
  },
  {
    id: 'fashionable-streets', name: 'Fashionable Streets', category: 'civic',
    alt: 'Three distinct buildings joined by a golden street beneath a spark, the emblem for Fashionable Streets.',
    meaning: 'A complete highlighted horizontal row represents qualifying streets; points and caps remain interface text.',
    color: p.amber,
    geometry: `${star(128,57,21)}<path d="M48 144H92V190H48Z" fill="${p.paleAmber}" ${thin}/><path d="M42 144L70 112L98 144Z" fill="${p.amber}" ${thin}/><path d="M106 126H150V190H106Z" fill="${p.paleCoral}" ${thin}/><path d="M100 126L128 94L156 126Z" fill="${p.coral}" ${thin}/><path d="M164 144H208V190H164Z" fill="${p.paleTeal}" ${thin}/><path d="M158 144L186 112L214 144Z" fill="${p.teal}" ${thin}/><path d="M69 170V190M128 154V190M186 170V190" fill="none" ${thin}/><path d="M41 207H215" fill="none" stroke="${p.ink}" stroke-width="18" stroke-linecap="round"/><path d="M41 207H215" fill="none" stroke="${p.amber}" stroke-width="8" stroke-linecap="round"/>`
  },
  {
    id: 'diversity-parade', name: 'Diversity Parade', category: 'civic',
    alt: 'Four differently shaped amber, coral, teal and plum parade pennants on one standard, the emblem for Diversity Parade.',
    meaning: 'Four differently shaped pennants celebrate guild diversity; hue is reinforced by their distinct lower silhouettes.',
    color: p.plum,
    geometry: `<path d="M128 58V219M104 219H152" fill="none" ${line}/>${star(128,44,16,p.paleAmber)}<path d="M43 98Q128 62 213 98" fill="none" ${line}/><path d="M46 98L78 86V137Q62 169 46 145Z" fill="${p.paleAmber}" ${thin}/><path d="M90 83L122 78V136L106 158L90 136Z" fill="${p.coral}" ${thin}/><path d="M134 78L166 83V153H134Z" fill="${p.paleTeal}" ${thin}/><path d="M178 86L210 98V157L194 143L178 157Z" fill="${p.palePlum}" ${thin}/>`
  },
];

const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const svg = spec => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-labelledby="title desc"><title id="title">${escape(spec.name)}</title><desc id="desc">${escape(spec.alt)}</desc><circle cx="128" cy="128" r="113" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/><circle cx="128" cy="128" r="103" fill="none" stroke="${spec.color}" stroke-width="3" opacity="0.5"/>${spec.geometry}</svg>\n`;

await mkdir(path.join(assets,'laws'), { recursive: true });
await mkdir(fragments, { recursive: true });
const fragment = {};
for (const spec of specs) {
  const content = svg(spec);
  await writeFile(path.join(assets,'laws',`${spec.id}.svg`), content);
  fragment[spec.id] = { src:`laws/${spec.id}.svg`, width:256, height:256, alt:spec.alt, status:'final', medium:'original SVG' };
}
await writeFile(path.join(fragments,'laws.json'), JSON.stringify(fragment,null,2) + '\n');
console.log(`Wrote ${specs.length} original law emblems and the exact-ID fragment.`);

if (process.argv.includes('--contact')) {
  // Optional development tool from the isolated WS4 dependencies; not a runtime import.
  const require = createRequire(path.join(repo, 'ui/media/odd-laws-society/package.json'));
  const sharp = require('sharp');
  const width = 1200, height = 450, rows = [], layers = [], checks = [];
  rows.push('<rect width="1200" height="450" fill="#f4ead7"/>', '<text x="24" y="30" font-family="sans-serif" font-size="18" fill="#46392f">Original law emblems · 80 px and 32 px · no image text</text>');
  for (const [index, spec] of specs.entries()) {
    const x = (index % 6) * 200, y = Math.floor(index / 6) * 190 + 58;
    const source = await readFile(path.join(assets,'laws',`${spec.id}.svg`));
    const metadata = await sharp(source).metadata();
    const {data,info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let transparent=0,edge=0,minX=256,minY=256,maxX=-1,maxY=-1;
    for(let py=0;py<info.height;py++) for(let px=0;px<info.width;px++) {
      const alpha=data[(py*info.width+px)*info.channels+info.channels-1];
      if(alpha===0) transparent++;
      if(alpha>8){minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);if(px===0||py===0||px===255||py===255)edge++;}
    }
    if(metadata.width!==256||metadata.height!==256||!metadata.hasAlpha||transparent===0||edge!==0) throw new Error(`Invalid dimension, alpha or bounds: ${spec.id}`);
    layers.push({input:await sharp(source).resize(80,80).png().toBuffer(),left:x+26,top:y});
    layers.push({input:await sharp(source).resize(32,32).png().toBuffer(),left:x+133,top:y+24});
    const words=spec.name.split(' '), midpoint=Math.ceil(words.length/2);
    const first=words.length>2?words.slice(0,midpoint).join(' '):spec.name;
    const second=words.length>2?words.slice(midpoint).join(' '):'';
    rows.push(`<text x="${x+14}" y="${y+111}" font-family="sans-serif" font-size="13" fill="#46392f">${escape(first)}</text>`);
    if(second) rows.push(`<text x="${x+14}" y="${y+129}" font-family="sans-serif" font-size="13" fill="#46392f">${escape(second)}</text>`);
    rows.push(`<text x="${x+14}" y="${y+153}" font-family="sans-serif" font-size="11" fill="#716257">${spec.category.toUpperCase()} · ${index<6?'subsidy / income':'civic recognition'}</text>`);
    checks.push({id:spec.id,width:256,height:256,bytes:source.length,sha256:createHash('sha256').update(source).digest('hex'),alphaBounds:[minX,minY,maxX+1,maxY+1],transparentPixels:transparent,visibleEdgePixels:edge});
  }
  const board=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rows.join('')}</svg>`);
  await sharp(board).composite(layers).png().toFile(path.join(here,'contact-80-32.png'));
  await writeFile(path.join(here,'validation.json'),JSON.stringify({schemaVersion:1,medium:'original SVG',renderedPreviewPixels:[80,32],checks},null,2)+'\n');
  console.log('Rendered all law emblems at 80 px and 32 px; checked decoded dimensions, transparency and canvas bounds.');
}
