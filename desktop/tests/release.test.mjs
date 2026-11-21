import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, PLATFORMS } from '../scripts/updater-manifest.mjs';
import { readVersions } from '../scripts/set-version.mjs';

const desktop = fileURLToPath(new URL('../', import.meta.url));

test('the updater manifest lists both Mac architectures with release URLs and signatures', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sofa-manifest-'));
  try {
    for (const bundle of Object.values(PLATFORMS)) await writeFile(path.join(dir, `${bundle}.sig`), `signature-for-${bundle}\n`);
    const manifest = await buildManifest({ version: '0.2.0', repo: 'owner/repo', dir, notes: 'Notes', pubDate: '2026-11-21T00:00:00.000Z' });
    assert.deepEqual(manifest, {
      version: '0.2.0',
      notes: 'Notes',
      pub_date: '2026-11-21T00:00:00.000Z',
      platforms: {
        'darwin-aarch64': {
          signature: 'signature-for-Sofa-Arcade_aarch64.app.tar.gz',
          url: 'https://github.com/owner/repo/releases/download/v0.2.0/Sofa-Arcade_aarch64.app.tar.gz',
        },
        'darwin-x86_64': {
          signature: 'signature-for-Sofa-Arcade_x86_64.app.tar.gz',
          url: 'https://github.com/owner/repo/releases/download/v0.2.0/Sofa-Arcade_x86_64.app.tar.gz',
        },
      },
    });
    await assert.rejects(buildManifest({ version: 'v0.2', repo: 'owner/repo', dir }), /Invalid version/);
    await rm(path.join(dir, `${PLATFORMS['darwin-x86_64']}.sig`));
    await assert.rejects(buildManifest({ version: '0.2.0', repo: 'owner/repo', dir }), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('all desktop version fields agree', async () => {
  const versions = await readVersions();
  assert.equal(new Set(Object.values(versions)).size, 1, JSON.stringify(versions));
  assert.match(versions.tauriConf, /^\d+\.\d+\.\d+$/);
});

test('the app checks GitHub Releases and trusts only its configured public key', async () => {
  const config = JSON.parse(await readFile(path.join(desktop, 'src-tauri/tauri.conf.json'), 'utf8'));
  assert.deepEqual(config.plugins.updater.endpoints, ['https://github.com/jonathanjie/sofa-arcade/releases/latest/download/latest.json']);
  assert.match(Buffer.from(config.plugins.updater.pubkey, 'base64').toString('utf8'), /minisign public key/);
  // Update bundles are created only by the release workflow, which holds the private key.
  assert.notEqual(config.bundle.createUpdaterArtifacts, true);
});
