/** Code-native placeholders. WS4's manifest can replace every illustration. */
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10m3-8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9"/>',
  commerce: '<path d="M4 10h16v10H4zM3 10l2-6h14l2 6M8 10v10m8-10v10M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0"/>',
  craft: '<path d="m4 20 9-9m-5-7 3-2 10 10-3 3L8 4ZM3 16l5 5"/>',
  civic: '<path d="m3 8 9-5 9 5H3Zm2 3v7m7-7v7m7-7v7M3 21h18M3 18h18"/>',
  culture: '<path d="M12 4c7-5 11 4 4 7 9 5-1 13-4 5-4 9-13 0-5-5-8-3-3-12 5-7Z"/><circle cx="12" cy="11" r="2"/>',
  influence: '<path d="m12 3 7 3v6c0 5-7 9-7 9s-7-4-7-9V6l7-3Z"/><path d="m8 11 3 3 5-6"/>',
  prestige: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.7l6.4-.9L12 3Z"/>',
  build: '<path d="M4 20V9l8-6 8 6v11H4ZM9 20v-7h6v7M2 10l10-8 10 8"/>',
  work: '<path d="M3 8h18v12H3zM8 8V4h8v4M3 13h18M10 13v3h4v-3"/>',
  lobby: '<path d="M5 17H3V4h18v13h-9l-7 4v-4ZM7 8h10M7 12h7"/>',
  festival: '<path d="m4 21 4-13 9 9-13 4ZM10 3v3m6-1-2 3m5 3 3-1M4 4l2 2m12 2 2-3M14 19l1 3"/>',
  envelope: '<rect x="2" y="5" width="20" height="15" rx="2"/><path d="m3 6 9 7 9-7M3 19l7-7m11 7-7-7"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3m0 3v.1"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v16"/>',
  street: '<path d="M4 3v18m16-18v18M12 3v4m0 3v4m0 3v4M2 3h4m12 0h4M2 21h4m12 0h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
  paw: '<ellipse cx="12" cy="16" rx="6" ry="5"/><ellipse cx="4" cy="10" rx="2" ry="3"/><ellipse cx="9" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="11" rx="2" ry="3"/>',
  income: '<path d="M4 15v5h16v-5M12 3v12m-5-5 5 5 5-5"/>',
  stamp: '<path d="M4 18h16v3H4zM7 18v-4h10v4M9 14V7a3 3 0 1 1 6 0v7"/>',
};
export function svgIcon(key, className = '') {
  key=({'envelope-sealed':'envelope','envelope-open':'envelope',keep:'back',inspect:'help'})[key]||key;
  return `<svg class="ols-icon ${escape(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key] || paths.prestige}</svg>`;
}
const colors = { commerce:['#c69444','#f3d79b'], craft:['#bb715a','#edc2a9'], civic:['#537d73','#b9d5c7'], culture:['#8a6188','#d9bfd7'] };
export function fallbackBuilding(design) {
  const [dark,light] = colors[design?.guild] || colors.civic;
  const id=design?.id || ''; const landmark=design?.term===3;
  let details='<rect x="51" y="58" width="18" height="27" rx="8" fill="#51463d"/><path d="M34 55v13m0-7h10m-10-6h10v13H34m43-13v13m0-7h10m-10-6h10v13H77" stroke="#5a5146" stroke-width="2" fill="#f7e5b4"/>';
  if (/shop|stall|market|bazaar/.test(id)) details='<path d="M22 48h76l-5 17H27Z" fill="'+dark+'"/><path d="m35 48-3 17m16-17-1 17m15-17 1 17m13-17 3 17m11-17 4 17" stroke="#fff4d3" stroke-width="7"/><rect x="31" y="70" width="58" height="15" rx="2" fill="'+dark+'"/><path d="M39 77h12m8 0h10m8 0h6" stroke="#f4ddb0" stroke-width="5"/>';
  if (/clock|workshop/.test(id)) details='<circle cx="60" cy="53" r="13" fill="#fff2cd" stroke="'+dark+'" stroke-width="4"/><path d="M60 44v9l7 4" stroke="#51463d" stroke-width="2"/><rect x="50" y="71" width="20" height="15" rx="3" fill="'+dark+'"/>';
  if (/library|hall|court/.test(id)) details='<path d="M30 52h60M30 80h60M37 52v28m15-28v28m16-28v28m15-28v28" stroke="'+dark+'" stroke-width="7"/><path d="M30 87h60" stroke="#fff0d2" stroke-width="4"/>';
  if (/theatre|pavilion|opera/.test(id)) details='<path d="M31 49h58v35H31Z" fill="#574554"/><path d="M31 49c24 0 12 25 0 28m58-28c-24 0-12 25 0 28" fill="'+dark+'"/><path d="M30 84h60" stroke="#f1d794" stroke-width="5"/><circle cx="60" cy="39" r="5" fill="#f1d794"/>';
  if (/garden/.test(id)) return `<svg viewBox="0 0 120 100" aria-hidden="true"><ellipse cx="60" cy="89" rx="51" ry="7" fill="#c6b99b" opacity=".35"/><path d="M20 82V48m80 34V48M20 65h80M20 77h80" stroke="#c6a875" stroke-width="5"/><path d="M60 82V43" stroke="#647552" stroke-width="5"/><circle cx="58" cy="36" r="21" fill="#89a37b"/><circle cx="42" cy="47" r="17" fill="#9db98b"/><circle cx="74" cy="45" r="19" fill="#b4c995"/><path d="M31 88V71m59 17V69" stroke="#6d8c64" stroke-width="3"/><circle cx="31" cy="69" r="7" fill="${dark}"/><circle cx="90" cy="67" r="7" fill="${light}"/></svg>`;
  if (/bridge/.test(id)) return `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M12 87q48-15 96 0" stroke="#adc9be" stroke-width="10" fill="none"/><path d="M14 82Q60 20 106 82" stroke="${dark}" stroke-width="17" fill="none"/><path d="M14 65Q60 3 106 65" stroke="${dark}" stroke-width="4" fill="none"/><path d="M24 67V52m20-2V35m32 15V35m20 32V52" stroke="${dark}" stroke-width="4"/></svg>`;
  if (/monument/.test(id)) details='<path d="M42 80V44l4-14 14 9 14-9 4 14v36Z" fill="#bf9b64"/><path d="M45 55h30m-24 0 3 2m12-2 3 2M57 65l3 3 3-3" stroke="#73583c" stroke-width="2"/><path d="M35 84h50" stroke="#73583c" stroke-width="6"/>';
  if (/observatory/.test(id)) details='<path d="M34 52a26 26 0 0 1 52 0" fill="'+dark+'"/><path d="m60 41 21-16" stroke="#e2bd73" stroke-width="9"/><rect x="52" y="65" width="16" height="20" rx="8" fill="'+dark+'"/><circle cx="29" cy="23" r="2" fill="#b4934f"/><path d="M90 12v8m-4-4h8" stroke="#b4934f" stroke-width="2"/>';
  return `<svg viewBox="0 0 120 100" aria-hidden="true"><ellipse cx="60" cy="90" rx="48" ry="6" fill="#b9aa8d" opacity=".3"/><path d="M26 86V42h68v44Z" fill="${light}" stroke="${dark}" stroke-width="2"/><path d="M20 43 60 ${landmark?10:20}l40 ${landmark?33:23}Z" fill="${dark}"/><path d="M28 86h64" stroke="${dark}" stroke-width="6"/>${details}<path d="M16 87V72" stroke="#71815a" stroke-width="2"/><ellipse cx="13" cy="72" rx="5" ry="8" fill="#98aa7a"/><path d="M105 87V76" stroke="#71815a" stroke-width="2"/><ellipse cx="107" cy="75" rx="5" ry="7" fill="#a3b68c"/></svg>`;
}
export function fallbackCharacter(id,state='idle') {
  const cat=id==='lala', lydia=id==='lydia';
  const fur=cat?'#dba05f':lydia?'#c8b5a3':'#b4b7a5', shirt=cat?'#e7d4aa':lydia?'#a66878':'#537e74';
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="60" cy="110" rx="38" ry="5" fill="#584834" opacity=".12"/><path d="M25 99q-22-27-12-34" stroke="${fur}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M31 107V87q29-25 58 0v20" fill="${shirt}"/>${cat?'<path d="M29 51 27 16 53 34m39 17 2-35-27 18" fill="'+fur+'"/>':'<circle cx="31" cy="33" r="20" fill="'+fur+'"/><circle cx="89" cy="33" r="20" fill="'+fur+'"/><circle cx="31" cy="33" r="13" fill="#e5b8ac"/><circle cx="89" cy="33" r="13" fill="#e5b8ac"/>'}<ellipse cx="60" cy="59" rx="36" ry="33" fill="${fur}"/><ellipse cx="60" cy="72" rx="23" ry="16" fill="#f3e6cf"/>${state==='celebrate'?'<path d="m43 56 5-4 5 4m14 0 5-4 5 4" stroke="#45392f" stroke-width="3" fill="none"/>':'<circle cx="47" cy="55" r="3" fill="#45392f"/><circle cx="73" cy="55" r="3" fill="#45392f"/>'}<path d="m55 67 5 4 5-4Z" fill="#73544d"/><path d="M60 71v5m-8 0q8 8 16 0" stroke="#73544d" stroke-width="2" fill="none"/><path d="M37 70 16 65m21 10-22 2m68-7 21-5m-21 10 22 2" stroke="#8a7764" stroke-width="1.5"/>${lydia?'<path d="m70 25 16-8-1 17-15-9 0 0-11-8-1 17Z" fill="#9b5469"/>':''}${cat?'<path d="M53 29 56 39m8-10-1 10" stroke="#b87339" stroke-width="4"/>':''}<path d="m45 91 15 10 15-10" fill="none" stroke="#f0dfb9" stroke-width="2"/></svg>`;
}
export function mediaPicture(entry,fallback,manifestUrl,className='',label='') {
  let src=null;
  try { if(entry?.src && manifestUrl) {const url=new URL(entry.src,manifestUrl); if(['http:','https:','file:','blob:','data:'].includes(url.protocol)) src=url.href;} } catch {}
  return `<span class="ols-media ${escape(className)}"${label?` role="img" aria-label="${escape(label)}"`:' aria-hidden="true"'}><span class="ols-fallback">${fallback}</span>${src?`<img class="ols-sprite" src="${escape(src)}" alt="" width="${Number(entry.width)||120}" height="${Number(entry.height)||100}" draggable="false" decoding="async" data-ols-media>`:''}</span>`;
}
