#!/usr/bin/env node
/** Build-time-only downloads. The installed application never invokes this. */
import { readFile, writeFile, mkdir, rm, copyFile, chmod, lstat, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopRoot, sha256, stageRuntime, verifyRuntime } from './runtime-files.mjs';

export function nativeTarget(platform = process.platform, arch = process.arch) {
  const target = { 'darwin:arm64': 'aarch64-apple-darwin', 'darwin:x64': 'x86_64-apple-darwin', 'linux:x64': 'x86_64-unknown-linux-gnu', 'linux:arm64': 'aarch64-unknown-linux-gnu' }[`${platform}:${arch}`];
  if (!target) throw new Error(`Unsupported build host ${platform}/${arch}.`);
  return target;
}

export function cleanNodeEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (/^(?:NODE_|NPM_|npm_|DYLD_|LD_PRELOAD|LD_LIBRARY_PATH)/.test(key)) delete environment[key];
  return environment;
}

export async function checkedDownload(url, filename, expected) {
  if (!url.startsWith('https://nodejs.org/dist/')) throw new Error('Only the official Node release origin is permitted.');
  let contents;
  try { contents = await readFile(filename); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const partial = filename + '.partial';
    try {
      execFileSync('curl', ['--fail', '--silent', '--show-error', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '20', '--max-time', '300', '--retry', '2', '--output', partial, url], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1024 * 1024 });
      contents = await readFile(partial);
      if (sha256(contents) !== expected) throw new Error(`Official Node checksum mismatch: ${path.basename(filename)}`);
      const { rename } = await import('node:fs/promises');
      await rename(partial, filename);
    } finally { await rm(partial, { force: true }); }
  }
  if (sha256(contents) !== expected) throw new Error(`Cached Node checksum mismatch: ${path.basename(filename)}. Remove the corrupt cache file and retry.`);
  return contents;
}

export async function verifyNode(executable, expected) {
  const probe = `import { DatabaseSync } from 'node:sqlite'; const db=new DatabaseSync(':memory:'); db.exec('CREATE TABLE test(value TEXT)'); db.prepare('INSERT INTO test VALUES (?)').run('ESM + SQLite'); const value=db.prepare('SELECT value FROM test').get().value; db.close(); console.log(JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch,esm:true,sqlite:value}));`;
  const output = execFileSync(executable, ['--no-warnings', '--input-type=module', '--eval', probe], { encoding: 'utf8', env: { ...cleanNodeEnvironment(), PATH: '/nonexistent' }, timeout: 15_000, maxBuffer: 8192 });
  const actual = JSON.parse(output);
  if (actual.version !== expected.version || actual.platform !== expected.platform || actual.arch !== expected.arch || actual.sqlite !== 'ESM + SQLite' || !actual.esm) throw new Error('Bundled Node capability/architecture verification failed.');
  return actual;
}

export async function prepare({ target = nativeTarget() } = {}) {
  const pin = JSON.parse(await readFile(path.join(desktopRoot, 'node-runtime.json'), 'utf8'));
  const selected = pin.targets[target];
  if (!selected) throw new Error(`Unpinned Node target: ${target}`);
  if (target !== nativeTarget()) throw new Error('Stage on a matching native host so the exact bundled runtime can be executed and verified.');
  const cache = path.join(desktopRoot, '.cache/node', pin.version);
  await mkdir(cache, { recursive: true });
  const checksums = await checkedDownload(pin.checksumsUrl, path.join(cache, 'SHASUMS256.txt'), pin.checksumsSha256);
  const signed = await checkedDownload(pin.signedChecksumsUrl, path.join(cache, 'SHASUMS256.txt.asc'), pin.signedChecksumsSha256);
  const checksum = checksums.toString('utf8').split('\n').find(line => line.endsWith('  ' + selected.archive))?.split('  ')[0];
  if (checksum !== selected.sha256) throw new Error('Pinned archive digest differs from the official release checksums.');
  const archiveUrl = `https://nodejs.org/dist/v${pin.version}/${selected.archive}`;
  const archive = path.join(cache, selected.archive);
  await checkedDownload(archiveUrl, archive, selected.sha256);
  const temporary = await mkdtemp(path.join(cache, 'extract-'));
  try {
    const prefix = selected.archive.replace(/\.tar\.gz$/, '');
    execFileSync('tar', ['-xzf', archive, '-C', temporary, '--strip-components=1', `${prefix}/bin/node`, `${prefix}/LICENSE`], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1024 * 1024 });
    for (const name of ['bin/node', 'LICENSE']) if (!(await lstat(path.join(temporary, name))).isFile()) throw new Error('Official archive is missing a required regular file.');
    const verified = await verifyNode(path.join(temporary, 'bin/node'), { version: pin.version, ...selected });
    const binary = path.join(desktopRoot, 'src-tauri/binaries', `node-${target}`);
    await mkdir(path.dirname(binary), { recursive: true });
    await copyFile(path.join(temporary, 'bin/node'), binary);
    await chmod(binary, 0o755);
    const inventory = await stageRuntime();
    await verifyRuntime();
    const licenses = path.join(desktopRoot, 'stage/licenses');
    await rm(licenses, { recursive: true, force: true });
    await mkdir(licenses, { recursive: true });
    await copyFile(path.join(temporary, 'LICENSE'), path.join(licenses, 'NODE-LICENSE.txt'));
    await writeFile(path.join(licenses, 'NODE-SHASUMS256.txt'), checksums);
    await writeFile(path.join(licenses, 'NODE-SHASUMS256.txt.asc'), signed);
    const provenance = {
      schemaVersion: 1, version: pin.version, target, archiveUrl,
      archiveSha256: selected.sha256, binarySha256: sha256(await readFile(binary)),
      checksumsUrl: pin.checksumsUrl, checksumsSha256: pin.checksumsSha256,
      signedChecksumsUrl: pin.signedChecksumsUrl, signedChecksumsSha256: pin.signedChecksumsSha256,
      verification: 'Pinned SHA-256 of official TLS-downloaded archive and release checksum documents; OpenPGP signature retained for independent verification, not verified by this script.',
      capabilities: verified,
    };
    await writeFile(path.join(licenses, 'NODE-PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n');
    const result = { target, runtimeVersion: pin.version, files: inventory.length, binary, runtime: path.join(desktopRoot, 'stage/runtime'), verified };
    await mkdir(path.join(desktopRoot, 'artifacts'), { recursive: true });
    await writeFile(path.join(desktopRoot, 'artifacts/runtime-verification.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  try {
    if (args.length && (args.length !== 2 || args[0] !== '--target')) throw new Error('Usage: node desktop/scripts/prepare.mjs [--target TARGET]');
    console.log(JSON.stringify(await prepare({ target: args[1] || nativeTarget() }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
