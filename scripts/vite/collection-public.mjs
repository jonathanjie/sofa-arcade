/** Browser delivery is an explicit subset of authored public/ assets. */
import { copyFile, mkdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { ASSET_FILES, BROWSER_FILES, checkedRuntimePath } from '../runtime-files.mjs';

/**
 * Vite's publicDir copies and serves every file below it. Keep artwork source
 * material and stray generated authority modules in the checkout, outside that
 * delivery directory. The framework consumes only these declared browser files.
 */
export async function stagePublicDelivery(root) {
  const base = await realpath(root);
  const files = [...new Set([
    ...BROWSER_FILES.map(({ url }) => {
      if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || /[?#]/.test(url)) {
        throw new Error('Browser delivery URLs must be absolute local file paths.');
      }
      return 'public' + url;
    }),
    ...ASSET_FILES,
    'public/downloads/sofa-arcade-local.zip',
  ])].sort();

  // Validate every input before replacing previous generated output. This also
  // rejects symlink aliases, private fixture/database paths and path escapes.
  const inputs = await Promise.all(files.map(async relative => {
    if (!relative.startsWith('public/')) throw new Error('Public delivery assets must be under public/.');
    return { relative: relative.slice('public/'.length), filename: await checkedRuntimePath(base, relative) };
  }));
  const parent = path.join(base, '.sites-runtime');
  await mkdir(parent, { recursive: true });
  if (await realpath(parent) !== parent) throw new Error('Public delivery staging must remain inside the checkout.');
  const destination = path.join(parent, 'sofa-public');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const { relative, filename } of inputs) {
    const output = path.join(destination, relative);
    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(filename, output);
  }
  return destination;
}
