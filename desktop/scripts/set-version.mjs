#!/usr/bin/env node
/**
 * Sets the desktop app version everywhere it must match before a release:
 * desktop/package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml and the
 * app's own entry in src-tauri/Cargo.lock. The updater compares this version
 * with the newest release, so every release needs a higher one.
 *
 *   node desktop/scripts/set-version.mjs 0.2.0
 *   node desktop/scripts/set-version.mjs --check 0.2.0   # exit 1 if any file differs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('../', import.meta.url));
const SEMVER = /^\d+\.\d+\.\d+$/;
const CRATE_NAME = 'sofa-arcade-desktop';

const files = {
  packageJson: path.join(desktop, 'package.json'),
  tauriConf: path.join(desktop, 'src-tauri/tauri.conf.json'),
  cargoToml: path.join(desktop, 'src-tauri/Cargo.toml'),
  cargoLock: path.join(desktop, 'src-tauri/Cargo.lock'),
};

/** The `version = "…"` line inside the [package] table of Cargo.toml. */
const cargoTomlVersion = /(\[package\][^[]*?\nversion\s*=\s*")([^"]+)(")/;
/** The version line that follows this crate's `name = "…"` line in Cargo.lock. */
const cargoLockVersion = new RegExp(`(\\[\\[package\\]\\]\\nname = "${CRATE_NAME}"\\nversion = ")([^"]+)(")`);

export async function readVersions() {
  const packageJson = JSON.parse(await readFile(files.packageJson, 'utf8'));
  const tauriConf = JSON.parse(await readFile(files.tauriConf, 'utf8'));
  const cargoToml = (await readFile(files.cargoToml, 'utf8')).match(cargoTomlVersion)?.[2];
  const cargoLock = (await readFile(files.cargoLock, 'utf8')).match(cargoLockVersion)?.[2];
  return { packageJson: packageJson.version, tauriConf: tauriConf.version, cargoToml, cargoLock };
}

export async function setVersion(version) {
  if (!SEMVER.test(version)) throw new Error(`Use a plain version such as 0.2.0, not "${version}".`);
  const packageJson = JSON.parse(await readFile(files.packageJson, 'utf8'));
  packageJson.version = version;
  await writeFile(files.packageJson, `${JSON.stringify(packageJson, null, 2)}\n`);
  const tauriConf = JSON.parse(await readFile(files.tauriConf, 'utf8'));
  tauriConf.version = version;
  await writeFile(files.tauriConf, `${JSON.stringify(tauriConf, null, 2)}\n`);
  for (const [file, pattern] of [[files.cargoToml, cargoTomlVersion], [files.cargoLock, cargoLockVersion]]) {
    const text = await readFile(file, 'utf8');
    if (!pattern.test(text)) throw new Error(`Could not find the app version in ${path.relative(desktop, file)}.`);
    await writeFile(file, text.replace(pattern, `$1${version}$3`));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const version = process.argv.filter(argument => !argument.startsWith('--')).at(2);
  if (!version) {
    console.error('Usage: node desktop/scripts/set-version.mjs [--check] <version>');
    process.exit(2);
  }
  if (check) {
    const versions = await readVersions();
    const wrong = Object.entries(versions).filter(([, value]) => value !== version);
    if (wrong.length) {
      console.error(`Version mismatch for ${version}: ${JSON.stringify(versions)}`);
      process.exit(1);
    }
    console.log(`All desktop version fields are ${version}.`);
  } else {
    await setVersion(version);
    console.log(`Desktop version set to ${version}. Commit, then tag v${version}.`);
  }
}
