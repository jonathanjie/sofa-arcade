#!/usr/bin/env node
/**
 * Writes the updater manifest (latest.json) that installed apps read from the
 * newest GitHub Release. It lists, for each Mac architecture, the download URL
 * of the signed update bundle and the bundle's signature.
 *
 *   node desktop/scripts/updater-manifest.mjs --version 0.2.0 \
 *     --repo jonathanjie/sofa-arcade --dir release-assets --out release-assets/latest.json
 *
 * The directory must contain, for each architecture below, the update bundle
 * and its `.sig` file, named as the release workflow names them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Tauri platform keys and the bundle file names the release workflow uploads. */
export const PLATFORMS = Object.freeze({
  'darwin-aarch64': 'Sofa-Arcade_aarch64.app.tar.gz',
  'darwin-x86_64': 'Sofa-Arcade_x86_64.app.tar.gz',
});

export async function buildManifest({ version, repo, dir, notes = '', pubDate = new Date().toISOString() }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version: ${version}`);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`Invalid repository: ${repo}`);
  const platforms = {};
  for (const [platform, bundle] of Object.entries(PLATFORMS)) {
    const signature = (await readFile(path.join(dir, `${bundle}.sig`), 'utf8')).trim();
    if (!signature) throw new Error(`Empty signature for ${bundle}`);
    platforms[platform] = {
      signature,
      url: `https://github.com/${repo}/releases/download/v${version}/${bundle}`,
    };
  }
  return { version, notes, pub_date: pubDate, platforms };
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await buildManifest({
    version: option('version'),
    repo: option('repo'),
    dir: option('dir'),
    notes: option('notes') ?? '',
  });
  await writeFile(option('out'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote updater manifest for ${manifest.version}: ${Object.keys(manifest.platforms).join(', ')}`);
}
