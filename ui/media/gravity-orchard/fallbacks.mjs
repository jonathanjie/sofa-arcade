/** Error-only native symbols. Final art is separately required by validation. */
const paths = Object.freeze({
  apple: 'M32 19C20 10 10 21 13 34C15 48 23 55 32 51C42 55 51 43 52 31C52 18 41 12 32 19ZM32 17Q37 6 47 8Q44 17 32 17Z',
  plum: 'M32 16C18 15 12 24 15 38C19 55 43 58 49 37C53 24 45 16 32 16ZM31 15Q18 15 19 5Q30 4 31 15ZM33 15Q34 4 45 5Q45 15 33 15Z',
  pear: 'M32 10C22 10 26 23 19 30C4 47 21 57 32 55C46 57 60 46 46 31C39 23 42 10 32 10Z',
  starfruit: 'M32 5L40 23L59 25L45 39L49 58L32 49L15 58L19 39L5 25L24 23Z',
});
export function fallbackSvg(key) {
  const type = typeof key === 'string' ? key.split('-').find(part => Object.hasOwn(paths, part)) : null;
  const shape = type ? `<path d="${paths[type]}"/>` : '<circle cx="32" cy="32" r="23"/><path d="M22 32H42M32 22V42" fill="none"/>';
  const pattern = type === 'pear' ? '<path d="M23 38h1m15 0h1m-9 9h1" stroke-width="4"/>' :
    type === 'plum' ? '<path d="M34 21Q26 35 33 49" fill="none"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g fill="#fff4d7" stroke="#3d4f42" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${shape}${pattern}</g></svg>`;
}
export function fallbackDataUrl(key) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallbackSvg(key))}`; }
