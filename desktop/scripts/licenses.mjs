#!/usr/bin/env node
/** Preserve license texts shipped by the exact resolved native dependency graph. */
import { execFileSync } from 'node:child_process';
import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopRoot, sha256 } from './runtime-files.mjs';
import { nativeTarget } from './prepare.mjs';

const noticeName = /^(?:(?:un)?licen[cs]e|copying|copyright|notice|authors)(?:[-_.].*)?$/i;
async function licenseFiles(root, directory = root, depth = 0) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isFile() && noticeName.test(entry.name)) found.push(filename);
    if (entry.isDirectory() && depth < 2 && /^licenses?$/i.test(entry.name)) found.push(...await licenseFiles(root, filename, depth + 1));
  }
  return found;
}

export async function collectLicenses({ target = nativeTarget(), metadata } = {}) {
  metadata ||= JSON.parse(execFileSync('cargo', ['metadata', '--manifest-path', path.join(desktopRoot, 'src-tauri/Cargo.toml'), '--locked', '--format-version', '1', '--filter-platform', target, '--no-default-features', '--features', 'native'], { encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
  const packages = new Map(metadata.packages.map(pkg => [pkg.id, pkg]));
  const selected = new Set();
  const visit = id => {
    if (selected.has(id)) return;
    selected.add(id);
    for (const dependency of nodes.get(id)?.deps || []) if (dependency.dep_kinds.some(kind => kind.kind !== 'dev')) visit(dependency.pkg);
  };
  visit(metadata.resolve.root);
  const fallbackRoot = path.join(desktopRoot, 'scripts/license-fallbacks');
  const fallback = JSON.parse(await readFile(path.join(fallbackRoot, 'sources.json'), 'utf8'));
  const notices = [
    'SOFA ARCADE — NATIVE THIRD-PARTY NOTICES',
    `Target: ${target}`,
    'Generated from Cargo.lock and the native feature graph. Development/test-only dependencies are excluded. Build dependencies are included conservatively. Each section preserves the upstream crate licensing expression and all notice/license files present in its published source archive. For published crates omitting full license text, pinned upstream notices and canonical license texts are supplied with their exact source URLs and digests. Canonical texts retain any placeholder copyright text verbatim; declared crate authors are recorded separately without inventing a copyright statement.',
  ];
  const index = [];
  for (const id of [...selected].sort()) {
    if (id === metadata.resolve.root) continue;
    const pkg = packages.get(id);
    if (!pkg?.license && !pkg?.license_file) throw new Error(`Dependency has no licensing metadata: ${pkg?.name}`);
    const directory = path.dirname(pkg.manifest_path);
    const filenames = await licenseFiles(directory);
    if (pkg.license_file) {
      const explicit = path.resolve(directory, pkg.license_file);
      if (explicit !== directory && !explicit.startsWith(directory + path.sep)) throw new Error(`License path escapes crate: ${pkg.name}`);
      if (!(await lstat(explicit)).isFile()) throw new Error(`License is not a regular file: ${pkg.name}`);
      if (!filenames.includes(explicit)) filenames.push(explicit);
    }
    const names = filenames.sort().map(filename => path.relative(directory, filename));
    notices.push('\n' + '='.repeat(72), `${pkg.name} ${pkg.version}`, `License: ${pkg.license || '(see supplied license file)'}`, `Source: ${pkg.source || 'local'}`, `Repository: ${pkg.repository || '(not declared)'}`);
    const supplemental = [];
    notices.push(`Declared crate authors: ${(pkg.authors || []).join('; ') || '(not declared)'}`, `Unmodified crate source: https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`);
    if (!filenames.length) {
      const entries = fallback.packages[`${pkg.name}@${pkg.version}`];
      if (!entries?.length) throw new Error(`Missing full license text for ${pkg.name}@${pkg.version}; add an audited pinned fallback.`);
      for (const name of entries) {
        const source = fallback.files[name];
        const contents = await readFile(path.join(fallbackRoot, name));
        if (!source || sha256(contents) !== source.sha256) throw new Error(`Supplemental license checksum mismatch: ${name}`);
        notices.push(`\n--- Supplemental ${name} ---`, `Source: ${source.url}`, `SHA-256: ${source.sha256}`, contents.toString('utf8'));
        supplemental.push({ file: name, ...source });
      }
    }
    for (const filename of filenames.sort()) {
      const stats = await lstat(filename);
      if (stats.size > 2 * 1024 * 1024) throw new Error(`Unexpectedly large license file: ${pkg.name}`);
      notices.push(`\n--- ${path.relative(directory, filename)} ---`, await readFile(filename, 'utf8'));
    }
    index.push({ name: pkg.name, version: pkg.version, license: pkg.license, source: pkg.source, repository: pkg.repository, authors: pkg.authors, files: names, supplemental });
  }
  const output = path.join(desktopRoot, 'stage/licenses');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'RUST-THIRD-PARTY-NOTICES.txt'), notices.join('\n') + '\n');
  await writeFile(path.join(output, 'RUST-LICENSE-INDEX.json'), JSON.stringify({ schemaVersion: 1, target, features: ['native'], packages: index }, null, 2) + '\n');
  return { target, packages: index.length, withPinnedSupplementalLicenseText: index.filter(pkg => pkg.supplemental.length).map(pkg => `${pkg.name}@${pkg.version}`) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--target')) throw new Error('Usage: node desktop/scripts/licenses.mjs [--target TARGET]');
    console.log(JSON.stringify(await collectLicenses({ target: args[1] || nativeTarget() }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
