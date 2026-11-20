import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = new URL('../../../../',import.meta.url);
const base='/ui/media/gravity-orchard/';
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',js:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',webp:'image/webp',png:'image/png',mp3:'audio/mpeg'};
/** Local review fixture. Explicit allowlist; never serves authoring trees recursively. */
export async function startPreview({port=0}={}){
  const manifest=JSON.parse(await readFile(new URL('public/assets/gravity-orchard/manifest.json',repo),'utf8'));
  const routes=new Map([['/',new URL('ui/media/gravity-orchard/sources/gallery.html',repo)]]);
  for(const asset of Object.values(manifest.assets))routes.set(asset.src,new URL(`public${asset.src}`,repo));
  routes.set('/assets/gravity-orchard/manifest.json',new URL('public/assets/gravity-orchard/manifest.json',repo));
  for(const file of ['manifest.mjs','manifest-data.mjs','fallbacks.mjs','score.mjs','events.mjs','audio-preview.mjs',
    'sources/gallery.html','sources/gallery.css','sources/gallery.mjs',
    'sources/audio/previews/over-the-little-bridge-stage1.mp3',
    'sources/audio/previews/over-the-little-bridge-stage3.mp3','sources/audio/previews/orchard-cues.mp3'])
    routes.set(base+file,new URL(`ui/media/gravity-orchard/${file}`,repo));
  for(const file of ['ui/audio.js','ui/score.mjs','ui/media/sofa-menu/score.mjs','ui/media/sofa-menu/effects.mjs'])routes.set('/'+file,new URL(file,repo));
  const server=createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
      const path=new URL(req.url,'http://127.0.0.1').pathname, target=routes.get(path);
      if(!target){res.writeHead(404);res.end('Not part of the media review.');return;}
      const {size}=await stat(target), extension=target.pathname.split('.').at(-1);
      const headers={'Content-Type':types[extension]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes',
        'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"};
      let start=0,end=size-1,status=200;
      if(req.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
        if(!match[1])start=Math.max(0,size-Number(match[2]));else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
      }
      headers['Content-Length']=end-start+1;res.writeHead(status,headers);
      if(req.method==='HEAD')res.end();else{const stream=createReadStream(target,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);}
    }catch{if(!res.headersSent)res.writeHead(404);res.end('Media unavailable.');}
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});
  return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((done,fail)=>server.close(e=>e?fail(e):done()))};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const port=Number(process.argv[2]||4195);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid preview port');
  const server=await startPreview({port});console.log(`Gravity Orchard media gallery: ${server.origin}`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
}
