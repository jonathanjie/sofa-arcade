// One vector cut-paper illustration, rasterized once for all three shelf assets.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const plane = (x, y, scale, turn, colour, shade) => `<g transform="translate(${x} ${y}) rotate(${turn}) scale(${scale})" stroke-linejoin="round">
  <path d="M-165 -96 L177 0 -158 110 -98 12 Z" fill="#604d52" stroke="#514c58" stroke-width="7"/>
  <path d="M-165 -96 L177 0 -98 12Z" fill="#fff2d8"/><path d="M-158 110 L177 0 -98 12Z" fill="${colour}"/>
  <path d="M-98 12 L177 0 -113 41Z" fill="${shade}"/><path d="M-165 -96 L177 0 -130 -54Z" fill="${colour}"/>
  <path d="M-142 89 L143 9 -128 67Z" fill="#fff6de"/><path d="M-98 12 L148 2" stroke="#fffceb" stroke-width="3"/></g>`;
const puff = (x,y,s,colour) => `<path transform="translate(${x} ${y}) scale(${s})" fill="${colour}" d="M-120 16 Q-134 -12 -91 -17 Q-85 -58 -46 -46 Q-16 -94 18 -53 Q58 -61 64 -28 Q116 -33 123 2 Q134 32 66 31 L-74 31 Q-117 32 -120 16Z"/>`;
const balloon = (x,y,s,colour) => `<g transform="translate(${x} ${y}) scale(${s}) rotate(12)"><path d="M0 34 Q12 53 1 70 T5 101" stroke="#706276" fill="none" stroke-width="3"/><path d="M0 35 C-35 23 -40 -37 -4 -42 C39 -49 43 17 0 35Z" fill="${colour}" stroke="#705875" stroke-width="3"/><ellipse cx="-12" cy="-19" rx="6" ry="11" fill="#fff0cf"/><path d="M0 31 l-5 9 10 0Z" fill="#945e6d"/></g>`;
const sky = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs><linearGradient id="sky" x2="0.35" y2="1"><stop stop-color="#53b5bf"/><stop offset=".55" stop-color="#f4d799"/><stop offset="1" stop-color="#ec946e"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#sky)"/><circle cx="945" cy="149" r="128" fill="#ffe5a1"/><circle cx="945" cy="149" r="101" fill="#fff0bb"/>
${puff(185,157,1.45,'#f7eac7')}${puff(1110,225,0.95,'#fff2d0')}${puff(534,210,0.56,'#f8e8c8')}
<path d="M0 509 Q180 364 405 505 Q535 407 735 500 Q1000 340 1280 472 V720 H0Z" fill="#8cb2aa"/>
<path d="M0 601 Q274 459 523 585 T1000 525 Q1148 477 1280 543 V720 H0Z" fill="#c5ba8e"/>
<path d="M1085 502 Q750 575 905 604 T559 720 H190 Q813 637 787 602 T1085 502Z" fill="#90c3c0"/>
<g fill="none" stroke="#fff3cf" stroke-linecap="round"><path d="M-50 574 Q152 589 292 484 T590 381" stroke-width="12"/><path d="M-30 602 Q185 588 309 490 T590 386" stroke-width="4"/><path d="M44 287 Q204 355 307 286" stroke-width="5" stroke-dasharray="20 15"/></g>
${balloon(1085,266,0.97,'#e88383')}${balloon(1166,325,0.65,'#9882b8')}${balloon(506,135,0.43,'#ec9371')}
${plane(324,268,0.59,-19,'#59b7ba','#397e8e')}
<g transform="translate(770 333) rotate(23)" fill="none"><ellipse rx="128" ry="204" stroke="#ae6746" stroke-width="36"/><ellipse cx="-4" cy="-5" rx="128" ry="204" stroke="#f9b34c" stroke-width="26"/><ellipse cx="-7" cy="-7" rx="128" ry="204" stroke="#ffe6a1" stroke-width="7"/></g>
${plane(633,378,1.46,-18,'#ee765e','#974e57')}
<path d="M814 143 C891 162 917 230 895 308" fill="none" stroke="#ffd57a" stroke-width="14" stroke-linecap="round"/>
${puff(69,703,2,'#f8dfb9')}${puff(1169,696,2,'#e1c6af')}
<!-- Lala in the near cloud, with tabby stripes and a little aviator scarf. -->
<g transform="translate(1090 599) rotate(8)" stroke="#704835" stroke-width="5" stroke-linejoin="round">
<path d="M-55 18 Q-72 -2 -62 -85 L-27 -62 Q0 -72 26 -62 L62 -86 Q73 -29 58 17 Q35 55 -8 52 Q-43 50 -55 18Z" fill="#e99851"/>
<path d="M-53 -72 l18 17 -19 10Z M53 -72 l-18 17 18 9Z" fill="#f4b49a" stroke="none"/>
<path d="M-21 -62 l11 22 4 -25 M5 -64 l6 26 11 -24" fill="#b3653e" stroke="none"/>
<g fill="#503f42" stroke="none"><ellipse cx="-27" cy="-19" rx="6" ry="9"/><ellipse cx="29" cy="-19" rx="6" ry="9"/></g>
<ellipse cy="8" rx="30" ry="20" fill="#ffddb0" stroke="none"/><path d="M-6 -3 Q0 -8 6 -3 L0 4Z" fill="#a85a52"/>
<path d="M0 4 Q-5 15 -13 9 M0 4 Q5 15 13 9 M-33 0 l-38 -8 M-34 8 l-35 2 M33 0 l38 -8 M34 8 l35 2" fill="none" stroke-width="3"/>
<path d="M-41 36 Q3 49 47 31 L41 50 Q9 70 -35 55Z" fill="#488f94"/></g>
${puff(1024,714,1.65,'#fff0d2')}${puff(1262,684,1.6,'#ffefce')}
</svg>`;
const source = new URL('./raw/', import.meta.url);
const covers = new URL('../covers/paper-skies/', import.meta.url);
await Promise.all([source, covers].map(dir => mkdir(dir, { recursive: true })));
const master = sharp(Buffer.from(sky));
for (const [dir, name, width, options] of [[source, 'paper-skies.webp', 1280, { lossless: true }],
  [covers, 'cover.webp', 1280, { quality: 87 }], [covers, 'cover-560.webp', 560, { quality: 84 }]]) {
  await master.clone().resize(width).webp({ effort: 6, ...options }).toFile(fileURLToPath(new URL(name, dir)));
}
