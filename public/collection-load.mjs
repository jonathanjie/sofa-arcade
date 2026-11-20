/** Load only browser-safe Odd Laws components; authority remains on the host. */
export async function loadOddLaws({
  importer = path => import(path),
  fetcher = globalThis.fetch,
  origin = globalThis.location?.origin,
} = {}) {
  const manifestUrl = new URL('/assets/odd-laws-society/manifest.json', origin).href;
  const [view, catalog, previews, client, score, effects, response] = await Promise.all([
    importer('/games/odd-laws-society/index.mjs'),
    importer('/games/odd-laws-society/catalog.mjs'),
    importer('/games/odd-laws-society/preview.mjs'),
    importer('/room-client.mjs'),
    importer('/media/odd-laws-society/score.mjs'),
    Promise.resolve().then(() => importer('/media/odd-laws-society/effects.mjs')).catch(() => ({})),
    Promise.resolve().then(() => fetcher(manifestUrl, { cache: 'no-store' })).catch(() => null),
  ]);
  let manifest = null;
  try { if (response?.ok) manifest = await response.json(); } catch {}
  const mediaAvailable = manifest?.schemaVersion === 1 && manifest?.gameId === 'odd-laws-society';
  // Artwork failure must not remove the phone's legal controls. The view has
  // code-native fallback illustrations for absent entries. Release validation
  // separately requires the complete final manifest and all referenced assets.
  if (!mediaAvailable) manifest = { schemaVersion: 1, gameId: 'odd-laws-society', buildings: {}, laws: {}, guilds: {}, characters: {}, props: {} };
  return Object.freeze({
    mount: view.mount,
    tutorial: view.mountTutorial,
    createRoomClient: client.createRoomClient,
    rules: Object.freeze({
      buildings: catalog.BUILDINGS, laws: catalog.LAWS, guilds: catalog.GUILDS,
      buildQuote: previews.buildQuote, streetOutcome: previews.streetOutcome, civicAward: previews.civicAward,
    }),
    assets: Object.freeze({ manifest, manifestUrl }),
    mediaAvailable,
    score: Object.freeze({ SCORE: score.SCORE, eventsForBar: score.eventsForBar, eventsForEffect: effects.eventsForEffect }),
  });
}
