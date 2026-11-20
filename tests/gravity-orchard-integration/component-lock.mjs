/** Immutable component heads and exact reviewed post-handoff changes. */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const checkout = fileURLToPath(new URL('../../', import.meta.url));
const SHA = /^[0-9a-f]{40}$/;
const safe = value => typeof value === 'string' && /^[A-Za-z0-9._/-]+$/.test(value) && !value.startsWith('/') && value.split('/').every(part => part && !['.','..'].includes(part));
export async function checkGravityComponents({ root = checkout } = {}) {
  const errors = [];
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
  const lock = JSON.parse(await readFile(path.join(root,'tests/gravity-orchard-integration/components.json'),'utf8'));
  const head = git('rev-parse','HEAD');
  if (lock.schemaVersion !== 1 || lock.repository !== 'jonathanjie/sofa-arcade' || !SHA.test(lock.base)) errors.push('Invalid component lock identity.');
  if (JSON.stringify(lock.components?.map(c => c.id)) !== JSON.stringify(['GO1','GO2','GO3','GO4','GO5','GO6'])) errors.push('Expected GO1–GO6 once in merge order.');
  const ancestor = (revision,label) => {try {git('merge-base','--is-ancestor',revision,head);} catch {errors.push(`${label} is not an available ancestor.`);}};
  ancestor(lock.base,'The recorded base');
  for (const component of lock.components || []) {
    if (!SHA.test(component.head) || !SHA.test(component.base) || !Number.isInteger(component.pr) || component.pr < 1 || !safe(component.report) || !component.protectedPaths?.length || component.protectedPaths.some(p=>!safe(p))) {errors.push(`${component.id}: invalid immutable handoff.`);continue;}
    ancestor(component.head,component.id);
    const scope=[...component.protectedPaths,component.report];
    const corrections=new Map();
    for (const item of component.postHandoffCorrections || []) {
      if (!safe(item.path) || !SHA.test(item.blob) || !['100644','100755'].includes(item.mode) || !item.reason?.trim() || !item.verification?.trim() || corrections.has(item.path)) errors.push(`${component.id}: invalid exact correction.`);
      else corrections.set(item.path,item);
    }
    try {
      git('cat-file','-e',`${component.head}:${component.report}`);
      git('cat-file','-e',`${head}:${component.report}`);
      const changed=git('diff','--no-renames','--name-only',component.head,head,'--',...scope).split('\n').filter(Boolean);
      for (const filename of changed) {
        const correction=corrections.get(filename);
        if (!correction) {errors.push(`${component.id}: unrecorded correction ${filename}`);continue;}
        const entry=git('ls-tree',head,'--',filename);
        if (entry !== `${correction.mode} blob ${correction.blob}\t${filename}`) errors.push(`${component.id}: correction no longer matches ${filename}`);
      }
      for (const filename of corrections.keys()) if (!changed.includes(filename)) errors.push(`${component.id}: redundant correction ${filename}`);
      const dirty=git('status','--porcelain=v1','--untracked-files=all','--',...scope);
      if (dirty) errors.push(`${component.id}: protected worktree differs from committed candidate: ${dirty}`);
    } catch {errors.push(`${component.id}: handoff/source unavailable.`);}
  }
  if (git('rev-parse','HEAD') !== head) errors.push('HEAD changed during verification.');
  return {schemaVersion:1,head,base:lock.base,components:lock.components.length,passed:errors.length===0,errors};
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const result=await checkGravityComponents(); console.log(JSON.stringify(result,null,2)); process.exitCode=result.passed?0:1;
}
