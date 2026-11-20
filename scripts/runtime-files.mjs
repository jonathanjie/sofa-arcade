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
  { url: '/collection-game.mjs', source: 'ui/collection-game.mjs' },
  { url: '/collection-load.mjs', source: 'ui/collection-load.mjs' },
  { url: '/engine.mjs', source: 'game/engine.mjs' },
  { url: '/games/catalog.mjs', source: 'games/catalog.mjs' },
  { url: '/games/odd-laws-society/catalog.mjs', source: 'games/odd-laws-society/catalog.mjs' },
  { url: '/games/odd-laws-society/preview.mjs', source: 'games/odd-laws-society/preview.mjs' },
  { url: '/games/odd-laws-society/errors.mjs', source: 'games/odd-laws-society/errors.mjs' },
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
      /(^|\/)(?:\.git|\.env[^/]*|\.sofa-lan|node_modules|fixtures|tests?|evidence)(?:\/|$)/i.test(relative) ||
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
