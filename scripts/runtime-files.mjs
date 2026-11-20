/** Explicit delivery inputs. Authority modules never belong in BROWSER_FILES. */
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export const BROWSER_FILES = Object.freeze([
  { url: '/app.js', source: 'ui/app.js' },
  { url: '/styles.css', source: 'ui/styles.css' },
  { url: '/audio.js', source: 'ui/audio.js' },
  { url: '/score.mjs', source: 'ui/score.mjs' },
  { url: '/motion.js', source: 'ui/motion.js' },
  { url: '/motion.css', source: 'ui/motion.css' },
  { url: '/board-view.mjs', source: 'ui/board-view.mjs' },
  { url: '/board-view.css', source: 'ui/board-view.css' },
  { url: '/action-queue.mjs', source: 'ui/action-queue.mjs' },
  { url: '/transport.mjs', source: 'ui/transport.mjs' },
  { url: '/room-client.mjs', source: 'ui/room-client.mjs' },
  { url: '/collection-game.mjs', source: 'ui/collection-game.mjs' },
  { url: '/collection-load.mjs', source: 'ui/collection-load.mjs' },
  { url: '/collection-tutorial.mjs', source: 'ui/collection-tutorial.mjs' },
  { url: '/engine.mjs', source: 'game/engine.mjs' },
  { url: '/games/catalog.mjs', source: 'games/catalog.mjs' },
  { url: '/games/odd-laws-society/catalog.mjs', source: 'games/odd-laws-society/catalog.mjs' },
  { url: '/games/odd-laws-society/preview.mjs', source: 'games/odd-laws-society/preview.mjs' },
  { url: '/games/odd-laws-society/errors.mjs', source: 'games/odd-laws-society/errors.mjs' },
  ...['score.mjs', 'effects.mjs'].map(file => ({
    url: `/media/odd-laws-society/${file}`, source: `ui/media/odd-laws-society/${file}`,
  })),
  ...[
    'index.mjs', 'shared.mjs', 'graphics.mjs', 'motion.mjs', 'drawers.mjs',
    'tv.mjs', 'phone.mjs', 'tutorial.mjs', 'view.css', 'tv.css', 'phone.css', 'tutorial.css',
  ].map(file => ({ url: `/games/odd-laws-society/${file}`, source: `ui/games/odd-laws-society/${file}` })),
].map(Object.freeze));

export const SERVER_FILES = Object.freeze([
  'server/lan.mjs',
  'server/rooms.mjs',
  'game/engine.mjs',
  'games/catalog.mjs',
  'games/registry.mjs',
  'games/odd-laws-society/engine.mjs',
  'games/odd-laws-society/projection.mjs',
  'drizzle/0000_green_thunderbolts.sql',
]);

export const ASSET_FILES = Object.freeze([
  'public/assets/sofa-room.png',
  'public/assets/characters.png',
  'public/assets/qrcode.js',
  'public/assets/qrcode-LICENSE.txt',
  'public/favicon.svg',
  'public/manifest.webmanifest',
  // Exact WS4 runtime image closure, plus its retained distribution notice.
  'public/assets/odd-laws-society/buildings/button-workshop.webp',
  'public/assets/odd-laws-society/buildings/clockwork-studio.webp',
  'public/assets/odd-laws-society/buildings/community-garden.webp',
  'public/assets/odd-laws-society/buildings/concert-pavilion.webp',
  'public/assets/odd-laws-society/buildings/corner-shop.webp',
  'public/assets/odd-laws-society/buildings/debate-hall.webp',
  'public/assets/odd-laws-society/buildings/grand-bazaar.webp',
  'public/assets/odd-laws-society/buildings/grand-clock.webp',
  'public/assets/odd-laws-society/buildings/high-court.webp',
  'public/assets/odd-laws-society/buildings/lala-monument.webp',
  'public/assets/odd-laws-society/buildings/night-market.webp',
  'public/assets/odd-laws-society/buildings/observatory.webp',
  'public/assets/odd-laws-society/buildings/opera-house.webp',
  'public/assets/odd-laws-society/buildings/petition-kiosk.webp',
  'public/assets/odd-laws-society/buildings/pocket-theatre.webp',
  'public/assets/odd-laws-society/buildings/public-library.webp',
  'public/assets/odd-laws-society/buildings/quilt-bridge.webp',
  'public/assets/odd-laws-society/buildings/tea-stall.webp',
  'public/assets/odd-laws-society/characters/jon-acting.webp',
  'public/assets/odd-laws-society/characters/jon-celebrate.webp',
  'public/assets/odd-laws-society/characters/jon-disappointed.webp',
  'public/assets/odd-laws-society/characters/jon-idle.webp',
  'public/assets/odd-laws-society/characters/jon-thinking.webp',
  'public/assets/odd-laws-society/characters/lala-celebrate.webp',
  'public/assets/odd-laws-society/characters/lala-idle.webp',
  'public/assets/odd-laws-society/characters/lala-stamp.webp',
  'public/assets/odd-laws-society/characters/lala-thinking.webp',
  'public/assets/odd-laws-society/characters/lydia-acting.webp',
  'public/assets/odd-laws-society/characters/lydia-celebrate.webp',
  'public/assets/odd-laws-society/characters/lydia-disappointed.webp',
  'public/assets/odd-laws-society/characters/lydia-idle.webp',
  'public/assets/odd-laws-society/characters/lydia-thinking.webp',
  'public/assets/odd-laws-society/guilds/civic.svg',
  'public/assets/odd-laws-society/guilds/commerce.svg',
  'public/assets/odd-laws-society/guilds/craft.svg',
  'public/assets/odd-laws-society/guilds/culture.svg',
  'public/assets/odd-laws-society/laws/diversity-parade.svg',
  'public/assets/odd-laws-society/laws/everything-is-art.svg',
  'public/assets/odd-laws-society/laws/fashionable-streets.svg',
  'public/assets/odd-laws-society/laws/honest-wages.svg',
  'public/assets/odd-laws-society/laws/industrial-pride.svg',
  'public/assets/odd-laws-society/laws/mandatory-applause.svg',
  'public/assets/odd-laws-society/laws/open-tender.svg',
  'public/assets/odd-laws-society/laws/public-grants.svg',
  'public/assets/odd-laws-society/laws/public-service-day.svg',
  'public/assets/odd-laws-society/laws/shop-local.svg',
  'public/assets/odd-laws-society/laws/small-shop-supremacy.svg',
  'public/assets/odd-laws-society/laws/workshop-week.svg',
  'public/assets/odd-laws-society/manifest.json',
  'public/assets/odd-laws-society/props/coin.svg',
  'public/assets/odd-laws-society/props/envelope-open.svg',
  'public/assets/odd-laws-society/props/envelope-sealed.svg',
  'public/assets/odd-laws-society/props/influence.svg',
  'public/assets/odd-laws-society/props/stamp.svg',
  'public/assets/odd-laws-society/props/street-glow.svg',
  'public/assets/odd-laws-society/LICENSE-NOTES.md',
]);

/** No directory walk: adding a source/test beside a runtime file never ships it. */
export async function runtimeFiles(root) {
  const files = [...new Set([
    'start-sofa.command', 'scripts/lan-server.mjs', 'ui/index.html', 'docs/LAN.md',
    ...SERVER_FILES, ...BROWSER_FILES.map(entry => entry.source), ...ASSET_FILES,
  ])].sort();
  for (const file of files) await checkedRuntimePath(root, file);
  return files;
}

/** Reject escaped/symlinked inputs as well as accidental private-path additions. */
export async function checkedRuntimePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') ||
      path.posix.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..') ||
      /(^|\/)(?:\.git|\.env[^/]*|\.sofa-lan|node_modules|fixtures|tests?|evidence|sources|fragments|audio-evidence)(?:\/|$)/i.test(relative) ||
      /(?:\.test\.[cm]?js|\.(?:sqlite|sqlite3|db)(?:-wal|-shm)?|\.pem)$/i.test(relative)) {
    throw new Error(`Unsafe runtime entry: ${relative}`);
  }
  const base = await realpath(root);
  const candidate = path.resolve(base, relative);
  const info = await lstat(candidate);
  const actual = await realpath(candidate);
  if (!info.isFile() || actual !== candidate || !actual.startsWith(base + path.sep)) {
    throw new Error(`Runtime entry must be a regular file inside the checkout: ${relative}`);
  }
  return candidate;
}
