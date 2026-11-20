import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Original geometry authored for Sofa Arcade. No traced or third-party vectors.
const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repo = path.resolve(assets, '../../..');
const fragments = path.join(repo, 'ui/media/odd-laws-society/fragments');
const ink = '#46392f';
const paper = '#fff4d9';
const outline = `stroke="${ink}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"`;
const title = (name, description, width, height, geometry) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${name}</title><desc id="desc">${description}</desc>${geometry}</svg>\n`;
const paw = (cx, cy, s = 1, fill = paper) => `<g transform="translate(${cx} ${cy}) scale(${s})" fill="${fill}"><path d="M-22 14C-24 4-14-8 0-8S24 4 22 14C20 24 9 20 0 20S-20 24-22 14Z"/><ellipse cx="-27" cy="-11" rx="8" ry="11" transform="rotate(-24 -27 -11)"/><ellipse cx="-9" cy="-26" rx="8" ry="11" transform="rotate(-8 -9 -26)"/><ellipse cx="10" cy="-26" rx="8" ry="11" transform="rotate(8 10 -26)"/><ellipse cx="28" cy="-10" rx="8" ry="11" transform="rotate(24 28 -10)"/></g>`;

const guildSpecs = {
  commerce: {
    name: 'Commerce', color: '#bb7a26', shape: 'shop with striped awning',
    alt: 'Commerce guild: an amber shop with a striped awning and open doorway.',
    geometry: `<path d="M42 115H214V217H42Z" fill="#f1cb79" ${outline}/><path d="M34 115L52 43H204L222 115Z" fill="#e3ad4e" ${outline}/><path d="M81 44L73 115M128 44V115M175 44L183 115" stroke="${paper}" stroke-width="18"/><path d="M34 115H222" ${outline}/><path d="M100 217V156Q128 133 156 156V217" fill="${paper}" ${outline}/><path d="M66 152V176M191 152V176" ${outline}/><path d="M27 218H229" ${outline}/>`
  },
  craft: {
    name: 'Craft', color: '#be614b', shape: 'crossed hammer and spanner',
    alt: 'Craft guild: a coral hammer crossed with a broad spanner.',
    geometry: `<path d="M64 35L220 191Q232 204 217 219Q203 234 190 221L35 66Z" fill="#e89776" ${outline}/><path d="M32 38L63 23L113 72L73 112L23 62Z" fill="#f2b296" ${outline}/><path d="M52 211L193 70" stroke="${ink}" stroke-width="40" stroke-linecap="round"/><path d="M52 211L193 70" stroke="${paper}" stroke-width="17" stroke-linecap="round"/><path d="M160 30Q187 17 214 33L186 59L199 75L226 50Q238 80 215 102Q190 124 165 102Q138 75 160 30Z" fill="#f2b296" ${outline}/><circle cx="52" cy="211" r="7" fill="${ink}"/>`
  },
  civic: {
    name: 'Civic', color: '#387d76', shape: 'open book with civic seal',
    alt: 'Civic guild: a teal open book with a round seal and ribbon.',
    geometry: `<path d="M128 67Q76 33 30 54V195Q77 179 128 210Q179 179 226 195V54Q180 33 128 67Z" fill="#aed1bd" ${outline}/><path d="M128 67V210" ${outline}/><path d="M52 82Q83 77 104 91M52 115Q83 110 104 124M152 91Q177 78 203 82" fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round"/><path d="M161 174L151 231L174 216L197 231L187 174Z" fill="#4f998c" ${outline}/><circle cx="174" cy="155" r="32" fill="${paper}" ${outline}/><path d="M160 155L171 166L190 144" fill="none" stroke="#387d76" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  culture: {
    name: 'Culture', color: '#82536e', shape: 'smiling theatre mask',
    alt: 'Culture guild: a plum theatre mask with a broad smile and ribbon.',
    geometry: `<path d="M45 43Q128 16 211 43V119Q206 191 128 229Q50 191 45 119Z" fill="#d7b2c5" ${outline}/><path d="M69 90Q88 72 108 90M148 90Q168 72 187 90" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round"/><path d="M81 131Q128 151 175 131Q164 182 128 188Q92 182 81 131Z" fill="${paper}" ${outline}/><path d="M40 55L21 88M214 55L235 88" stroke="#82536e" stroke-width="14" stroke-linecap="round"/>`
  },
};

const propSpecs = {
  'envelope-sealed': {
    width: 256, height: 192,
    alt: 'A closed cream council envelope sealed with a coral paw-print wax seal.',
    anchors: {center:[0.5,0.5],seal:[0.5,0.61]},
    geometry: `<rect x="20" y="28" width="216" height="140" rx="12" fill="#f6dfac" ${outline}/><path d="M23 162L101 95M233 162L155 95" fill="none" stroke="#a2734d" stroke-width="7" stroke-linecap="round"/><path d="M24 34L116 104Q128 116 140 104L232 34" fill="#fff1d0" ${outline}/><circle cx="128" cy="118" r="32" fill="#bd6555" stroke="${ink}" stroke-width="7"/>${paw(128,121,.57)}`
  },
  'envelope-open': {
    width: 256, height: 256,
    alt: 'An opened cream council envelope with a blank paper rising from it.',
    anchors: {center:[0.5,0.58],paper:[0.5,0.32]},
    geometry: `<path d="M20 125L112 29Q128 11 144 29L236 125V227H20Z" fill="#e6c18b" ${outline}/><rect x="52" y="47" width="152" height="156" rx="8" fill="${paper}" ${outline}/><path d="M20 125L109 175Q128 188 147 175L236 125V228H20Z" fill="#f6dfac" ${outline}/><path d="M21 227L100 168M235 227L156 168" fill="none" stroke="#a2734d" stroke-width="7" stroke-linecap="round"/><path d="M120 214C111 207 116 194 128 191C139 196 145 210 136 214Z" fill="#bd6555"/>`
  },
  stamp: {
    width: 256, height: 256,
    alt: 'Lala’s wooden council stamp with a broad plum rubber base and a brass paw medallion.',
    anchors: {handle:[0.5,0.3],impact:[0.5,0.89]},
    geometry: `<path d="M95 118Q99 95 85 66Q76 47 91 32Q106 18 128 18Q151 18 165 33Q180 47 171 66Q157 95 161 118L178 154H78Z" fill="#bb7855" ${outline}/><path d="M110 37Q95 48 103 67" fill="none" stroke="#efc798" stroke-width="12" stroke-linecap="round"/><rect x="52" y="150" width="152" height="49" rx="11" fill="#d7a474" ${outline}/><path d="M49 200H207V228H49Z" fill="#805370" ${outline}/><circle cx="128" cy="101" r="25" fill="#eac06e" stroke="${ink}" stroke-width="6"/>${paw(128,105,.44,ink)}`
  },
  coin: {
    width: 256, height: 256,
    alt: 'A round amber coin embossed with a sprouting leaf, without a numeric denomination.',
    anchors: {center:[0.5,0.5]},
    geometry: `<circle cx="128" cy="131" r="108" fill="#d29537" ${outline}/><circle cx="128" cy="121" r="98" fill="#f0c66e" ${outline}/><circle cx="128" cy="121" r="77" fill="#ffe4a1" stroke="#b87c2b" stroke-width="6"/><path d="M128 173V116M128 132Q82 133 81 89Q124 85 128 132ZM128 114Q168 116 176 71Q132 70 128 114Z" fill="#d6a14b" stroke="${ink}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M70 53Q98 34 123 34" fill="none" stroke="${paper}" stroke-width="11" stroke-linecap="round"/>`
  },
  influence: {
    width: 256, height: 256,
    alt: 'A plum hexagonal influence seal with a cream quill, distinct from the round coin.',
    anchors: {center:[0.5,0.5]},
    geometry: `<path d="M128 19L222 73V183L128 237L34 183V73Z" fill="#855874" ${outline}/><path d="M128 42L202 86V170L128 214L54 170V86Z" fill="#ba8fa8" stroke="#e5becd" stroke-width="5"/><path d="M88 166Q80 103 124 67Q144 51 180 54Q184 89 164 118Q138 157 88 166Z" fill="${paper}" ${outline}/><path d="M75 193L155 87M105 154L133 151M122 132L152 127" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round"/>`
  },
  'street-glow': {
    width: 640, height: 160,
    alt: 'A golden horizontal glow connecting three street plots, with three small celebratory sparks.',
    anchors: {center:[0.5,0.5],left:[0.08,0.5],right:[0.92,0.5]},
    geometry: `<defs><linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2cf7b" stop-opacity="0"/><stop offset="0.5" stop-color="#ffdb8b" stop-opacity="0.33"/><stop offset="1" stop-color="#f2cf7b" stop-opacity="0"/></linearGradient></defs><rect x="10" y="25" width="620" height="112" rx="26" fill="url(#glow)"/><path d="M29 57V119Q29 131 41 131H599Q611 131 611 119V57" fill="none" stroke="#f3cb6c" stroke-width="16" opacity="0.15" stroke-linecap="round"/><path d="M29 57V119Q29 131 41 131H599Q611 131 611 119V57" fill="none" stroke="#f3cb6c" stroke-width="5" stroke-linecap="round"/><g fill="#f8da87" stroke="#986b2c" stroke-width="2"><path d="M112 24L118 41L135 47L118 53L112 70L106 53L89 47L106 41Z"/><path d="M320 12L327 33L348 40L327 47L320 68L313 47L292 40L313 33Z"/><path d="M528 24L534 41L551 47L534 53L528 70L522 53L505 47L522 41Z"/></g>`
  },
};

await Promise.all(['guilds','props'].map(d => mkdir(path.join(assets,d),{recursive:true})));
await mkdir(fragments,{recursive:true});
const guilds = {};
for (const [id, spec] of Object.entries(guildSpecs)) {
  await writeFile(path.join(assets,'guilds',`${id}.svg`),title(`${spec.name} guild`,spec.alt,256,256,spec.geometry));
  guilds[id] = {src:`guilds/${id}.svg`,width:256,height:256,alt:spec.alt,status:'final',medium:'original SVG',color:spec.color,silhouette:spec.shape};
}
const props = {};
for (const [id, spec] of Object.entries(propSpecs)) {
  await writeFile(path.join(assets,'props',`${id}.svg`),title(id,spec.alt,spec.width,spec.height,spec.geometry));
  props[id] = {src:`props/${id}.svg`,width:spec.width,height:spec.height,alt:spec.alt,status:'final',medium:'original SVG',anchors:spec.anchors};
}
await writeFile(path.join(fragments,'guilds.json'),JSON.stringify(guilds,null,2)+'\n');
await writeFile(path.join(fragments,'props.json'),JSON.stringify(props,null,2)+'\n');
console.log(`Wrote ${Object.keys(guilds).length} guild marks and ${Object.keys(props).length} props.`);
