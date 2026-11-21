import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readZip, extractZip } from '../../integration/package/zip.mjs';
import { GRAVITY_BROWSER_FILES, GRAVITY_ASSET_FILES, GRAVITY_HOST_FILES } from '../../../server/gravity-orchard-delivery.mjs';
import { runtimeModuleSpecifiers, stageRuntime } from '../../../desktop/scripts/runtime-files.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await readFile(path.join(root,file),'utf8'));

test('private bundle exactly records reviewed component bytes and locked runtime dependencies', async () => {
  const inventory = await json('server/runtime/dependency-inventory.json');
  const bundle = await readFile(path.join(root,inventory.output.path));
  assert.equal(digest(bundle),inventory.output.sha256);
  assert.equal(bundle.length,inventory.output.bytes);
  const versions = Object.fromEntries(inventory.dependencies.map(item=>[item.name,item.version]));
  assert.equal(versions.ws,'8.23.0');
  assert.equal(versions['@peculiar/x509'],'3.1.0');
  assert.equal(versions['reflect-metadata'],'0.2.2');
  const locked = await json('package-lock.json');
  for (const input of inventory.inputs) {
    assert.equal(digest(await readFile(path.join(root,input.path))),input.sha256,`Unreviewed bundle input: ${input.path}`);
  }
  for (const dependency of inventory.dependencies) {
    assert.ok(dependency.license && dependency.integrity, `License and integrity required: ${dependency.name}`);
    assert.ok(Object.entries(locked.packages).some(([key,value])=>key.endsWith('node_modules/'+dependency.name) && value.version===dependency.version && value.integrity===dependency.integrity));
  }
  const source = bundle.toString('utf8');
  assert.ok(!runtimeModuleSpecifiers(source,inventory.output.path).some(name=>!name.startsWith('node:')),'All required bundle imports are Node built-ins.');
  const notices = await readFile(path.join(root,'server/runtime/THIRD-PARTY-LICENSES.txt'),'utf8');
  for (const dependency of inventory.dependencies) assert.ok(notices.includes(`${dependency.name}@${dependency.version}`));
});

test('runtime staging parses real imports, preserves bounded roots, and ignores code-like text', () => {
  assert.deepEqual(runtimeModuleSpecifiers('const notice = `Please add import "reflect-metadata"`; class A { import(data, options) {} }'),[]);
  assert.deepEqual(runtimeModuleSpecifiers('import "./a.mjs"; export {x} from "./b.mjs"; await import("./c.mjs");'),['./a.mjs','./b.mjs','./c.mjs']);
  assert.throws(()=>runtimeModuleSpecifiers('import(userInput)'),/Unbounded dynamic/);
  assert.throws(()=>runtimeModuleSpecifiers("import(pathToFileURL(path.join(options.root, 'evil.mjs')).href)",'desktop/host/entry.mjs'),/Unbounded dynamic/);
  assert.deepEqual(runtimeModuleSpecifiers("import(pathToFileURL(path.join(options.root, 'server/lan.mjs')).href)",'desktop/host/entry.mjs'),['../../server/lan.mjs']);
});

test('declared public closure matches component inventories and excludes authority/setup capabilities', async () => {
  const sources = GRAVITY_BROWSER_FILES.map(item=>item.source);
  assert.equal(new Set(sources).size,sources.length);
  assert.equal(new Set(GRAVITY_BROWSER_FILES.map(item=>item.url)).size,sources.length);
  const engine = await json('games/gravity-orchard/runtime-files.json');
  const phone = await json('ui/games/gravity-orchard/phone/runtime-files.json');
  const tv = await json('ui/games/gravity-orchard/tv/runtime-files.json');
  const media = await json('ui/media/gravity-orchard/runtime-files.json');
  const secure = await json('desktop/secure-lan/runtime-files.json');
  const required = [...engine.browserFiles,...phone.browserFiles.map(item=>item.source),...tv.browserFiles,
    ...media.runtimeFiles.filter(item=>item.startsWith('ui/')),...secure.hostViewFiles,...secure.publicDiagnosticFiles];
  for (const file of required) assert.ok(sources.includes(file),`Missing public component file: ${file}`);
  assert.deepEqual(GRAVITY_ASSET_FILES,media.runtimeFiles.filter(item=>item.startsWith('public/')));
  for (const file of engine.authorityFiles) assert.ok(GRAVITY_HOST_FILES.includes(file));
  for (const file of sources) assert.ok(!/^server\//.test(file) && !/(?:engine|physics|supply|host-capabilities|native-bridge|certificate[s]?)\./.test(file));
});

test('extracted portable package starts both shared listeners without installed runtime packages', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(),'go7-portable-'));
  let host, secure;
  try {
    await extractZip(readZip(await readFile(path.join(root,'public/downloads/sofa-arcade-local.zip'))),temporary);
    const extracted = path.join(temporary,'sofa-arcade-local');
    const {startLanServer} = await import(pathToFileURL(path.join(extracted,'server/lan.mjs')));
    const {createCertificateStore,createSecureLanServer} = await import(pathToFileURL(path.join(extracted,'server/runtime/gravity-orchard-dependencies.mjs')));
    host = await startLanServer({root:extracted,databasePath:path.join(temporary,'rooms.sqlite'),host:'127.0.0.1',port:0,enableGravityOrchard:true});
    await mkdir(path.join(temporary,'app-data'),{mode:0o700});
    const store=createCertificateStore({appDataDir:path.join(temporary,'app-data')});
    await store.provision({identities:['127.0.0.1']});
    secure=await createSecureLanServer({tlsMaterial:await store.loadTlsMaterial({identities:['127.0.0.1']}),host:'127.0.0.1',port:0,requestHandler:host.requestHandler,onUpgrade:host.handleUpgrade});
    host.setSecureControllerStatus({...secure.status,enabled:true,status:'ready',controllerOrigins:secure.origins,requiresPhoneTrust:true});
    for (const entry of GRAVITY_BROWSER_FILES) {
      const response=await fetch(host.origin+entry.url);
      assert.equal(response.status,200,entry.url);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(path.join(extracted,entry.source)));
    }
    const canary='GO7_PRIVATE_CANARY_NEVER_SERVE';
    for (const file of ['public/assets/gravity-orchard/sources/private.json','games/gravity-orchard/fixtures/private.json','server/runtime/private.key']) {
      await mkdir(path.dirname(path.join(extracted,file)),{recursive:true}); await writeFile(path.join(extracted,file),canary);
    }
    for (const url of ['/games/gravity-orchard/engine.mjs','/games/gravity-orchard/physics.mjs','/games/gravity-orchard/supply.mjs',
      '/games/gravity-orchard/fixtures/private.json','/assets/gravity-orchard/sources/private.json','/server/runtime/gravity-orchard-dependencies.mjs',
      '/server/runtime/private.key','/server/secure-lan/certificates/index.mjs','/desktop/native-bridge.js','/api/secure-lan/provision']) {
      const response=await fetch(host.origin+url); assert.equal(response.status,404,url); assert.ok(!(await response.text()).includes(canary));
    }
    const created=await fetch(host.origin+'/api/rooms',{method:'POST',headers:{Origin:host.origin,'Content-Type':'application/json'},body:JSON.stringify({gameId:'gravity-orchard'})});
    assert.equal(created.status,201); const room=await created.json(); assert.equal(room.gameId,'gravity-orchard');
  } finally {await secure?.close();await host?.close();await rm(temporary,{recursive:true,force:true});}
});

test('native staging includes all final private/public runtime inputs and no developer tools',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'go7-stage-'));
  try {
    const files=await stageRuntime({destination:path.join(temporary,'runtime')});
    const paths=new Set(files.map(item=>item.path));
    for(const file of [...GRAVITY_HOST_FILES,...GRAVITY_ASSET_FILES,...GRAVITY_BROWSER_FILES.map(item=>item.source),'desktop/host/secure-lan.mjs']) assert.ok(paths.has(file),file);
    for(const file of paths) assert.ok(!/(^|\/)(node_modules|tests|fixtures|sources|evidence)(\/|$)|native-bridge\.js$/.test(file),file);
  } finally {await rm(temporary,{recursive:true,force:true});}
});
