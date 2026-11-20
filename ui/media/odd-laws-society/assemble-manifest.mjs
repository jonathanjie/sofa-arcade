import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { imageEntries } from './contract.mjs';

const base = new URL('./', import.meta.url);
const target = new URL('../../../public/assets/odd-laws-society/manifest.json', base);
const sections = ['buildings', 'laws', 'guilds', 'characters', 'props'];
const manifest = { schemaVersion: 1, gameId: 'odd-laws-society' };
for (const section of sections) {
  manifest[section] = JSON.parse(await readFile(new URL(`fragments/${section}.json`, base), 'utf8'));
}
await mkdir(new URL('./', target), { recursive: true });
await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Assembled ${fileURLToPath(target)} from all five reviewed fragments.`);
const repo = new URL('../../../', base);
const paths = [...new Set([
  'public/assets/odd-laws-society/manifest.json',
  ...imageEntries(manifest).map(([, entry]) => `public/assets/odd-laws-society/${entry.src}`),
  'ui/media/odd-laws-society/score.mjs',
  'ui/media/odd-laws-society/effects.mjs',
])].sort();
const files = [];
for (const path of paths) {
  const content = await readFile(new URL(path, repo));
  files.push({ path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
}
await writeFile(new URL('runtime-files.json', base), `${JSON.stringify({ schemaVersion: 1, gameId: 'odd-laws-society', files }, null, 2)}\n`);
console.log(`Recorded ${files.length} explicit runtime files; ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes total.`);
