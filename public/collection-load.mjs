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
    importer('/media/odd-laws-society/effects.mjs'),
    fetcher(manifestUrl, { cache: 'no-store' }),
  ]);
  if (!response.ok) throw new Error('The Odd Laws artwork is unavailable.');
  const manifest = await response.json();
  if (manifest.schemaVersion !== 1 || manifest.gameId !== 'odd-laws-society') {
    throw new Error('The Odd Laws artwork manifest is invalid.');
  }
  return Object.freeze({
    mount: view.mount,
    tutorial: view.mountTutorial,
    createRoomClient: client.createRoomClient,
    rules: Object.freeze({
      buildings: catalog.BUILDINGS, laws: catalog.LAWS, guilds: catalog.GUILDS,
      buildQuote: previews.buildQuote, streetOutcome: previews.streetOutcome, civicAward: previews.civicAward,
    }),
    assets: Object.freeze({ manifest, manifestUrl }),
    score: Object.freeze({ SCORE: score.SCORE, eventsForBar: score.eventsForBar, eventsForEffect: effects.eventsForEffect }),
  });
}
