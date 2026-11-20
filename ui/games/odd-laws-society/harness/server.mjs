/** Loopback-only UI fixture server with an explicit public harness allowlist. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const files=new Set(['index.mjs','shared.mjs','graphics.mjs','motion.mjs','drawers.mjs','tv.mjs','phone.mjs','tutorial.mjs','view.css','tv.css','phone.css','tutorial.css','fixtures.mjs','fixtures/catalog.mjs','fixtures/rules.mjs','fixtures/scenarios.mjs','harness/index.html','harness/app.mjs','harness/harness.css','harness/controller.mjs']);
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1');let path;try{path=decodeURIComponent(url.pathname).replace(/^\/+/, '');}catch{res.writeHead(400);res.end();return;}if(path==='')path='harness/index.html';if(path==='app.mjs'||path==='harness.css')path='harness/'+path;if(!files.has(path)){res.writeHead(404);res.end('Not in the fixture allowlist');return;}try{const data=await readFile(new URL(path,root));res.writeHead(200,{'Content-Type':path.endsWith('.mjs')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(500);res.end('Fixture file unavailable');}});
const arg=process.argv.find(a=>a.startsWith('--port='));const port=Number(arg?.split('=')[1]||process.env.OLS_FIXTURE_PORT||4183);
server.listen(port,'127.0.0.1',()=>process.stdout.write(`Odd Laws UI fixture: http://127.0.0.1:${server.address().port}/ (not multiplayer)\n`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
export {files};
