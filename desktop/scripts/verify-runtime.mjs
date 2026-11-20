#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { desktopRoot, verifyRuntime, sha256 } from './runtime-files.mjs';
import { nativeTarget, verifyNode } from './prepare.mjs';
try {
  const target = process.argv[2] || nativeTarget();
  const pin = JSON.parse(await readFile(path.join(desktopRoot, 'node-runtime.json'), 'utf8'));
  const provenance = JSON.parse(await readFile(path.join(desktopRoot, 'stage/licenses/NODE-PROVENANCE.json'), 'utf8'));
  if (provenance.target !== target) throw new Error('Staged runtime target does not match requested verification.');
  const binary = path.join(desktopRoot, 'src-tauri/binaries', `node-${target}`);
  if (sha256(await readFile(binary)) !== provenance.binarySha256) throw new Error('Bundled Node binary changed after verification.');
  const files = await verifyRuntime();
  const node = await verifyNode(binary, { version: pin.version, ...pin.targets[target] });
  console.log(JSON.stringify({ ...files, target, node }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
