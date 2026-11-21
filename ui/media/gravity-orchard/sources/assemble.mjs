import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const media = new URL('../', import.meta.url), repo = new URL('../../../', media);
const fragments = await Promise.all(['symbols','environments','characters'].map(async name =>
  JSON.parse(await readFile(new URL(`${name}/fragment.json`, import.meta.url),'utf8'))));
const assets = {}, characterStates = {};
for (const fragment of fragments) {
  for (const [key, asset] of Object.entries(fragment.assets)) {
    if (Object.hasOwn(assets, key)) throw new Error(`Duplicate asset ${key}`);
    assets[key] = asset;
  }
  Object.assign(characterStates, fragment.characterStates);
}
const runtimeFiles = [
  'public/assets/gravity-orchard/manifest.json',
  ...Object.values(assets).map(asset => `public${asset.src}`),
  ...['manifest.mjs','manifest-data.mjs','fallbacks.mjs','score.mjs','events.mjs'].map(name => `ui/media/gravity-orchard/${name}`),
].sort();
const manifest = { schemaVersion:1, gameId:'gravity-orchard', assets, characterStates, runtimeFiles };
const json = JSON.stringify(manifest,null,2)+'\n';
await writeFile(new URL('public/assets/gravity-orchard/manifest.json', repo),json);
await writeFile(new URL('manifest-data.mjs',media),`// Generated from the canonical JSON by sources/assemble.mjs. Do not edit by hand.\nexport default ${json.trim()};\n`);
const files = [];
for (const path of runtimeFiles) {
  const buffer = await readFile(new URL(path,repo));
  files.push({ path, bytes:(await stat(new URL(path,repo))).size,
    sha256:createHash('sha256').update(buffer).digest('hex') });
}
await writeFile(new URL('runtime-files.json',media),JSON.stringify({
  schemaVersion:1,gameId:'gravity-orchard',runtimeFiles,files,
  totalBytes:files.reduce((sum,file) => sum+file.bytes,0),
  productionDependencies:[],
  excludedAuthoring:['ui/media/gravity-orchard/sources/**','ui/media/gravity-orchard/*.test.mjs',
    'ui/media/gravity-orchard/package.json','ui/media/gravity-orchard/package-lock.json',
    'ui/media/gravity-orchard/audio-preview.mjs','ui/media/gravity-orchard/runtime-files.json'],
},null,2)+'\n');
console.log(`Assembled ${Object.keys(assets).length} final assets; ${files.length} explicit runtime files.`);
