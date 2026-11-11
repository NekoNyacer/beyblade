import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const port=Number(process.env.SOUND_LAB_PORT||3216);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid SOUND_LAB_PORT');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wav':'audio/wav','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const relative=pathname==='/'?'sound-lab.html':pathname.replace(/^\//,'');
  const target=path.resolve(root,relative);
  const allowed=relative==='assets/fonts/BarlowCondensed-BlackItalic.ttf'||relative==='sound-lab.html'||relative==='assets/sound-lab.js'||relative==='assets/sound-lab.css'||relative.startsWith('assets/sound-packs/');
  if(!allowed||!target.startsWith(root)||!types[path.extname(target)]){res.writeHead(404);res.end('Not found');return;}
  const data=fs.readFileSync(target);res.writeHead(200,{'Content-Type':types[path.extname(target)],'Content-Length':data.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; object-src 'none'; base-uri 'none'"});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Sound preview only: http://localhost:${port}/sound-lab.html`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close());
