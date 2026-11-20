import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const files=[];
for(const folder of ['protocol','ui','native','package']) {
  const directory=path.join(root,'tests/gravity-orchard-integration',folder);
  for(const entry of (await readdir(directory)).sort()) if(entry.endsWith('.test.mjs')) files.push(path.join(directory,entry));
}
if(!files.length) throw new Error('GO7 acceptance tests must be present.');
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
if(result.error) throw result.error;
process.exitCode=result.status??1;
