// Display-only inventory transcribed from docs/games/odd-laws-society.md v0.2.
// This is a media acceptance fixture, not a rules engine or runtime catalog.
export const BUILDINGS = Object.freeze([
  ['corner-shop', 'Corner Shop', 'commerce', 1],
  ['tea-stall', 'Tea Stall', 'commerce', 1],
  ['button-workshop', 'Button Workshop', 'craft', 1],
  ['petition-kiosk', 'Petition Kiosk', 'civic', 1],
  ['pocket-theatre', 'Pocket Theatre', 'culture', 1],
  ['community-garden', 'Community Garden', 'culture', 1],
  ['night-market', 'Night Market', 'commerce', 2],
  ['clockwork-studio', 'Clockwork Studio', 'craft', 2],
  ['public-library', 'Public Library', 'civic', 2],
  ['debate-hall', 'Debate Hall', 'civic', 2],
  ['concert-pavilion', 'Concert Pavilion', 'culture', 2],
  ['quilt-bridge', 'Quilt Bridge', 'craft', 2],
  ['grand-bazaar', 'Grand Bazaar', 'commerce', 3],
  ['grand-clock', 'Grand Clock', 'craft', 3],
  ['high-court', 'High Court', 'civic', 3],
  ['observatory', 'Observatory', 'civic', 3],
  ['opera-house', 'Opera House', 'culture', 3],
  ['lala-monument', 'Lala Monument', 'culture', 3],
].map(([id, name, guild, term]) => Object.freeze({ id, name, guild, term })));

export const LAWS = Object.freeze([
  ['small-shop-supremacy', 'Small-Shop Supremacy', 'economy'],
  ['workshop-week', 'Workshop Week', 'economy'],
  ['public-grants', 'Public Grants', 'economy'],
  ['everything-is-art', 'Everything Is Art', 'economy'],
  ['open-tender', 'Open Tender', 'economy'],
  ['honest-wages', 'Honest Wages', 'economy'],
  ['shop-local', 'Shop Local', 'civic'],
  ['industrial-pride', 'Industrial Pride', 'civic'],
  ['public-service-day', 'Public Service Day', 'civic'],
  ['mandatory-applause', 'Mandatory Applause', 'civic'],
  ['fashionable-streets', 'Fashionable Streets', 'civic'],
  ['diversity-parade', 'Diversity Parade', 'civic'],
].map(([id, name, category]) => Object.freeze({ id, name, category })));

export const GUILDS = Object.freeze(['commerce', 'craft', 'civic', 'culture']);
export const STATES = Object.freeze({
  jon: Object.freeze(['idle', 'thinking', 'acting', 'celebrate', 'disappointed']),
  lydia: Object.freeze(['idle', 'thinking', 'acting', 'celebrate', 'disappointed']),
  lala: Object.freeze(['idle', 'thinking', 'stamp', 'celebrate']),
});
export const PROPS = Object.freeze(['envelope-sealed', 'envelope-open', 'stamp', 'coin', 'influence', 'street-glow']);

export function imageEntries(value, prefix = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const current = Object.hasOwn(value, 'src') ? [[prefix, value]] : [];
    return current.concat(Object.entries(value).flatMap(([key, child]) => imageEntries(child, prefix ? `${prefix}.${key}` : key)));
  }
  if (Array.isArray(value)) return value.flatMap((child, index) => imageEntries(child, `${prefix}.${index}`));
  return [];
}
