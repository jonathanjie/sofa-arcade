/** Original, deterministic SVG artwork. No external images, fonts or randomness. */
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../../../../../public/assets/gravity-orchard/', import.meta.url);
const assets = {};
const ink = '#493c32', cream = '#fff4d7';
const fruit = {
  apple: { light: '#ee8a66', dark: '#b8323e', title: 'Apple · round with one leaf', pattern: 'one-leaf',
    path: 'M64 34C44 20 22 36 23 58C24 82 39 105 53 102C61 100 64 100 71 102C90 108 108 78 106 55C104 32 82 23 64 34Z',
    leaf: '<path d="M65 30C71 13 88 13 93 15C89 29 79 34 65 30Z" fill="#65814b"/><path d="M64 35Q62 21 67 17" fill="none"/>' },
  plum: { light: '#aa87c9', dark: '#624079', title: 'Plum · oval with split leaves', pattern: 'split-leaf',
    path: 'M62 29C39 28 26 42 28 65C30 89 47 108 64 108C83 108 101 86 102 63C103 42 88 26 62 29Z',
    leaf: '<path d="M63 28C48 27 43 17 43 11C56 10 65 17 64 27Z" fill="#a5b66b"/><path d="M66 26C69 12 80 9 87 10C87 21 77 28 66 26Z" fill="#7d9657"/><path d="M65 35L65 18" fill="none"/>' },
  pear: { light: '#d5dc7a', dark: '#869d40', title: 'Pear · tapered neck and dotted belly', pattern: 'dotted',
    path: 'M64 26C51 26 50 37 47 47C44 57 27 68 26 83C24 103 43 110 64 109C85 110 104 101 103 83C103 67 84 57 81 46C78 35 78 26 64 26Z',
    leaf: '<path d="M65 26Q64 15 70 11" fill="none"/><path d="M70 21Q91 7 96 23Q81 31 70 21Z" fill="#718c4a"/>' },
  starfruit: { light: '#ffe397', dark: '#dfa735', title: 'Starfruit · five-point cut face', pattern: 'five-point',
    path: 'M64 18L78 46L110 49L88 73L95 105L64 90L34 105L40 73L17 49L50 45Z', leaf: '' },
};
function svg(width, height, inner, extra = '') { return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke="${ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"${extra}>${inner}</svg>\n`; }
function defs(id, light, dark) { return `<defs><linearGradient id="${id}" x1=".2" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>`; }
function symbol(type, emblem = false) {
  const f = fruit[type];
  let inner = `<path d="${f.path}" fill="${emblem ? cream : 'url(#fruit)'}" stroke-width="${emblem ? 5 : 3.8}"/>${f.leaf}`;
  if (type === 'apple') inner += '<path d="M36 54Q34 67 40 78" stroke="#fff0d3" stroke-width="5" opacity=".8"/>';
  if (type === 'plum') inner += '<path d="M69 39Q51 65 65 97" stroke="#e5d0e4" stroke-width="3.5"/><path d="M39 51L42 47" stroke="#f4dfeb" stroke-width="5"/>';
  if (type === 'pear') inner += '<g fill="#556d36" stroke="none"><circle cx="48" cy="75" r="2.4"/><circle cx="61" cy="89" r="2.4"/><circle cx="77" cy="76" r="2.4"/><circle cx="44" cy="90" r="2.4"/><circle cx="83" cy="91" r="2.4"/></g><path d="M48 58L41 69" stroke="#f9f2b8" stroke-width="5"/>';
  if (type === 'starfruit') inner += '<path d="M64 36L71 55L93 57L77 70L82 91L64 79L47 91L52 70L36 57L57 55Z" fill="#fff2b4" stroke="#ba8428" stroke-width="2.5"/><g fill="#b78b3a" stroke="none"><ellipse cx="61" cy="61" rx="2.4" ry="4.5" transform="rotate(-30 61 61)"/><ellipse cx="68" cy="68" rx="2.4" ry="4.5" transform="rotate(-30 68 68)"/></g>';
  return inner;
}
async function save(key, path, width, height, inner, meta = {}) {
  await mkdir(new URL(path.split('/').slice(0,-1).join('/')+'/', root), { recursive: true });
  await writeFile(new URL(path, root), svg(width,height,inner));
  assets[key] = { src: `/assets/gravity-orchard/${path}`, width, height, kind: 'image', ...meta };
}
for (const [type, f] of Object.entries(fruit)) {
  await save(`fruit-${type}`, `fruit/${type}.svg`,128,128,defs('fruit',f.light,f.dark)+symbol(type),
    { alt:f.title, transparent:true, pivot:{x:64,y:64}, silhouette:type, pattern:f.pattern, recommendedSize:32 });
  for (const state of ['ordinary','accepting','rejecting','full']) {
    const ring = state === 'accepting' ? '#438567' : state === 'rejecting' ? '#b24c40' : state === 'full' ? '#795447' : '#a68b60';
    const rim = state === 'full' ? '#dfc493' : '#f5deaf';
    let inner = defs('wood','#e8c895','#ba874e')+defs('fruit',f.light,f.dark);
    inner += `<ellipse cx="80" cy="88" rx="67" ry="49" fill="${cream}" stroke="${ring}" stroke-width="${state === 'ordinary'?3:5}"/>`;
    inner += '<path d="M32 69L39 119Q80 142 122 119L129 69Z" fill="url(#wood)"/><path d="M39 86Q80 108 122 86M42 103Q80 124 119 103M55 84L59 128M78 90L78 132M102 84L98 128" stroke="#9b713f" stroke-width="2.2"/>';
    inner += `<ellipse cx="80" cy="67" rx="50" ry="22" fill="#695039"/><ellipse cx="80" cy="67" rx="50" ry="22" stroke="${rim}" stroke-width="7"/>`;
    inner += `<circle cx="80" cy="105" r="24" fill="${f.dark}" stroke="${cream}" stroke-width="3"/><g transform="translate(54 78) scale(.4)">${symbol(type,true)}</g>`;
    if (state === 'accepting') inner += '<circle cx="128" cy="32" r="18" fill="#357557" stroke="#fff4d7" stroke-width="3"/><path d="M119 32L126 39L138 25" stroke="#fff4d7" stroke-width="4"/><path d="M24 31L24 43M18 37L30 37" stroke="#56895b"/>';
    if (state === 'rejecting') inner += '<circle cx="128" cy="32" r="18" fill="#ad4a3f" stroke="#fff4d7" stroke-width="3"/><path d="M121 25L135 39M135 25L121 39" stroke="#fff4d7" stroke-width="4"/><path d="M36 36H14M14 36L22 28M14 36L22 44" stroke="#ad4a3f" stroke-width="4"/>';
    if (state === 'full') inner += '<path d="M37 65L123 65" stroke="#f4dbab" stroke-width="12"/><path d="M44 61L50 69M62 61L68 69M80 61L86 69M98 61L104 69" stroke="#95643c" stroke-width="4"/><g fill="#795447" stroke="#fff4d7" stroke-width="2"><circle cx="116" cy="30" r="6"/><circle cx="130" cy="30" r="6"/><circle cx="144" cy="30" r="6"/></g>';
    await save(`basket-${type}-${state}`,`baskets/${type}-${state}.svg`,160,160,inner,
      {alt:`${f.title.split(' · ')[0]} basket · ${state}`,transparent:true,pivot:{x:80,y:67},fruitType:type,state,pattern:f.pattern,recommendedSize:76});
  }
}
const stages = {
  'morning-delivery': { light:'#e9e8bd',ground:'#cfdca9',leaf:'#729663',leaf2:'#98b575',wood:'#bc864c',edge:'#6e5238', flower:'#fff0d2' },
  'switchback-grove': { light:'#dfe4ab',ground:'#b7ca8c',leaf:'#527a59',leaf2:'#81a15d',wood:'#b67d48',edge:'#5d5038',flower:'#e8b681' },
  'moonlight-picnic': { light:'#9eada1',ground:'#819c8d',leaf:'#416d67',leaf2:'#688b77',wood:'#9f8066',edge:'#384d4d',flower:'#eddaa0' },
};
for (const [stage,p] of Object.entries(stages)) {
  let inner = defs('ground',p.light,p.ground)+defs('wood','#d5ad76',p.wood);
  inner += `<rect x="4" y="8" width="504" height="372" rx="28" fill="url(#wood)" stroke="${p.edge}" stroke-width="5"/><rect x="14" y="14" width="484" height="348" rx="22" fill="url(#ground)" stroke="${p.edge}" stroke-width="3"/>`;
  inner += '<g opacity=".24" stroke="#657b4d" stroke-width="2">';
  for (let y=50;y<=320;y+=54) for (let x=42+(y%100);x<470;x+=86) inner += `<path d="M${x} ${y}l-2 -4m2 4l5 -3"/>`;
  inner += '</g><g stroke="#8a613c" stroke-width="2" opacity=".7"><path d="M22 368H490M32 375H480"/></g>';
  await save(`tray-${stage}`,`terrain/${stage}-tray.svg`,512,384,inner,{alt:`${stage} wooden garden material`,transparent:true,role:'decoration',geometry:'clip-to-authored-tray-bounds',recommendedSize:512});
  inner = defs('wood','#e6c790',p.wood)+`<rect x="2" y="4" width="252" height="88" rx="8" fill="url(#wood)" stroke="${p.edge}" stroke-width="4"/>`;
  for(let x=28;x<254;x+=28)inner+=`<path d="M${x} 5V90" stroke="${p.edge}" stroke-width="2.5"/><path d="M${x-20} 24l10 1m-11 50h12" stroke="#fff0c8" opacity=".4" stroke-width="2"/>`;
  inner+='<path d="M5 10H251M5 86H251" stroke="#f2d7a3" stroke-width="4"/>';
  await save(`bridge-${stage}`,`terrain/${stage}-bridge.svg`,256,96,inner,{alt:`${stage} bridge planks`,transparent:true,role:'decoration',geometry:'clip-to-authored-bridge-bounds'});
  inner=`<rect x="4" y="12" width="248" height="64" rx="18" fill="${p.leaf}" stroke="${p.edge}" stroke-width="4"/>`;
  for(let x=22;x<246;x+=24)inner+=`<path d="M${x-12} 38Q${x} 7 ${x+13} 37Q${x+20} 58 ${x} 64Q${x-20} 56 ${x-12} 38Z" fill="${p.leaf2}" stroke="${p.leaf}" stroke-width="2"/><path d="M${x} 34l-2 17" stroke="${p.leaf}" stroke-width="2"/>`;
  inner+=`<path d="M16 69H240" stroke="${p.edge}" stroke-width="3"/>`;
  await save(`hedge-${stage}`,`terrain/${stage}-hedge.svg`,256,88,inner,{alt:`${stage} hedge edging`,transparent:true,role:'decoration',geometry:'clip-to-authored-rect-bumper'});
  inner=defs('bump',p.flower,p.wood)+`<circle cx="64" cy="64" r="57" fill="url(#bump)" stroke="${p.edge}" stroke-width="4"/><circle cx="64" cy="64" r="44" fill="none" stroke="${p.edge}" stroke-width="2" opacity=".45"/><path d="M37 77C23 56 51 24 78 44C105 64 70 99 51 75C37 57 73 49 75 66" stroke="${p.edge}" opacity=".45" stroke-width="2.5"/><path d="M29 42Q40 22 60 22" stroke="#fff4d7" stroke-width="4" opacity=".65"/>`;
  await save(`bumper-${stage}`,`terrain/${stage}-bumper.svg`,128,128,inner,{alt:`${stage} soft wooden bumper`,transparent:true,role:'decoration',geometry:'clip-to-authored-circle-bumper',pivot:{x:64,y:64}});
}
for (const state of ['open','forecast','closed']) {
  let inner=defs('wood','#ecd3a5','#b18657')+'<path d="M19 140V20Q19 10 30 10Q40 10 40 20V140ZM120 140V20Q120 10 130 10Q141 10 141 20V140Z" fill="url(#wood)" stroke-width="3"/>';
  if(state==='closed')inner+='<rect x="39" y="53" width="82" height="61" rx="4" fill="#b98151"/><path d="M42 58L118 108M42 108L118 58" stroke="#ecd3a5" stroke-width="8"/><circle cx="80" cy="34" r="16" fill="#8f4d3f" stroke="#fff4d7"/><path d="M73 34H87" stroke="#fff4d7" stroke-width="4"/>';
  if(state==='open')inner+='<path d="M43 54L56 61V112L43 116ZM117 54L104 61V112L117 116Z" fill="#b98151"/><path d="M69 84H92M85 77L92 84L85 91" stroke="#5b8162" stroke-width="4"/><circle cx="80" cy="31" r="13" fill="#5b8162" stroke="#fff4d7"/><path d="M74 31L78 35L86 26" stroke="#fff4d7" stroke-width="3"/>';
  if(state==='forecast')inner+='<path d="M42 57H118V115H42Z" fill="#fff0cd" fill-opacity=".22" stroke="#a17633" stroke-dasharray="7 6" stroke-width="4"/><path d="M80 12L99 45H61Z" fill="#f2c161"/><path d="M80 24V32M80 38V39" stroke-width="4"/><path d="M58 82L69 88L58 94M102 82L91 88L102 94" stroke="#b08139" stroke-width="4"/>';
  await save(`gate-${state}`,`cues/gate-${state}.svg`,160,160,inner,{alt:`Bridge gate · ${state}`,transparent:true,state,pivot:{x:80,y:80}});
}
await save('compost','cues/compost.svg',128,128,
  '<circle cx="64" cy="66" r="56" fill="#d6b98a" stroke-width="4"/><circle cx="64" cy="66" r="43" fill="#493c32" stroke="#f1d8a7" stroke-width="4"/><path d="M28 41l10 8m6-25l6 12m31-12l-5 12m25 6l-12 7m-61 43l11-6m7 23l5-11m29 13l-5-12m25-9l-11-6" stroke="#8b6b45" stroke-width="5"/><path d="M43 53Q60 35 66 54Q51 68 43 53ZM66 54Q82 35 92 49Q81 69 66 54Z" fill="#b4c18b" stroke="none"/><path d="M64 61V88M52 78L64 90L76 78" stroke="#fff0ce" stroke-width="5"/>',
  {alt:'Compost opening · leaf and downward arrow',transparent:true,pivot:{x:64,y:66}});
for(const state of ['forecast','active']){
  let inner='<path d="M18 38H111L102 29M111 38L102 47M31 64H142L130 52M142 64L130 76" stroke="#fff4d7" stroke-width="11"/>';
  inner+='<path d="M18 38H111L102 29M111 38L102 47M31 64H142L130 52M142 64L130 76" stroke="#587f7b" stroke-width="5"/>';
  inner+='<path d="M16 82Q32 70 43 86Q25 96 16 82Z" fill="#bdd0a1" stroke-width="2"/>';
  if(state==='forecast')inner+='<circle cx="22" cy="19" r="14" fill="#f5ce79" stroke="#775e3d" stroke-width="2"/><path d="M22 12V22M22 27V28" stroke="#775e3d" stroke-width="3"/>';
  else inner+='<path d="M57 16Q88 2 98 16Q105 30 91 31" stroke="#fff4d7" stroke-width="7"/><path d="M57 16Q88 2 98 16Q105 30 91 31" stroke="#587f7b" stroke-width="3"/>';
  await save(`gust-${state}`,`cues/gust-${state}.svg`,160,112,inner,{alt:`Rightward gust · ${state}; rotate to public direction`,transparent:true,pivot:{x:80,y:56},baseDirection:{x:1,y:0}});
}
await save('effect-impact','effects/impact.svg',128,128,'<path d="M23 78L41 69M31 36L46 48M62 20V41M95 36L82 49M107 76L86 69" stroke="#fff0c9" stroke-width="8"/><path d="M23 78L41 69M31 36L46 48M62 20V41M95 36L82 49M107 76L86 69" stroke="#b98b45" stroke-width="3"/>',{alt:'Soft impact rays',transparent:true,pivot:{x:64,y:80}});
await save('effect-capture','effects/capture.svg',128,128,'<circle cx="64" cy="64" r="37" stroke="#fff0c9" stroke-width="10"/><circle cx="64" cy="64" r="37" stroke="#6b9471" stroke-width="4"/><path d="M42 63L58 78L88 48" stroke="#fff0c9" stroke-width="10"/><path d="M42 63L58 78L88 48" stroke="#527c5b" stroke-width="5"/>',{alt:'Captured fruit check and ring',transparent:true,pivot:{x:64,y:64}});
await save('effect-compost','effects/compost.svg',128,128,'<path d="M64 109Q37 75 24 39Q58 24 65 61Q75 20 104 36Q106 71 64 109Z" fill="#afbd85"/><path d="M64 108V57M64 86L38 54M64 86L91 49" stroke="#61754b" stroke-width="3"/><circle cx="31" cy="98" r="5" fill="#d4b185" stroke="none"/><circle cx="99" cy="88" r="4" fill="#d4b185" stroke="none"/>',{alt:'Composted fruit leaf puff',transparent:true,pivot:{x:64,y:105}});
await save('effect-order','effects/order.svg',128,128,'<path d="M64 14L78 43L110 48L87 72L93 105L64 90L35 105L41 72L18 48L50 43Z" fill="#f7d47e" stroke-width="4"/><path d="M45 63L58 76L83 51" stroke="#fff7dc" stroke-width="8"/><path d="M45 63L58 76L83 51" stroke="#7c703e" stroke-width="3"/>',{alt:'Picnic order completed',transparent:true,pivot:{x:64,y:64}});
await writeFile(new URL('fragment.json',import.meta.url),JSON.stringify({assets},null,2)+'\n');
console.log(`Authored ${Object.keys(assets).length} SVG assets.`);
