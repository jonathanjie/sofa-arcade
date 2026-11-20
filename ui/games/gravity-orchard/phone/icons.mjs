// Code-native control symbols; final character artwork is injected by GO5/GO7.
const paths = Object.freeze({
  leaf: '<path d="M19 4C10 3 4 7 5 14c6 5 13 0 14-10Z"/><path d="m5 20 9-10"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  center: '<circle cx="12" cy="12" r="5"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  brake: '<path d="M7 4h10l4 8-4 8H7l-4-8Z"/><path d="M9 8v8m6-8v8"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  touch: '<path d="M8 12V5a2 2 0 0 1 4 0v6l2-1 4 2v5l-3 4H9l-5-7a2 2 0 0 1 3-2l1 1"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  arrow: '<path d="m9 5 7 7-7 7M4 12h12"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  exit: '<path d="M10 4H4v16h6m4-13 5 5-5 5M8 12h11"/>',
  signal: '<path d="M3 9a15 15 0 0 1 18 0M6 13a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".5"/>',
  star: '<path d="m12 2 3 7 7 .5-5.5 5 1.5 7L12 18l-6 3.5 1.5-7L2 9.5 7 9Z"/>',
  basket: '<path d="m3 10 3 10h12l3-10H3Zm3 0 6-7 6 7m-9 4v3m6-3v3"/>',
});

export function icon(name, className = '') {
  return `<svg class="go3-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.leaf}</svg>`;
}
