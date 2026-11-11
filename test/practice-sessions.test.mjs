import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import path from 'node:path';import {createApp} from '../server.mjs';
test('phone pulls animate only the paired host and remain repeatable after reconnect',async()=>{
 const app=createApp({port:0,dataDir:mkdtempSync(path.resolve('.qa','paired-practice-'))});await app.listen();const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(url,data)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
 const streams=[];async function stream(s,key,role){const abort=new AbortController(),r=await fetch(base+'/api/practice-session/events?'+new URLSearchParams({session:s.session,token:key,role}),{signal:abort.signal});assert.equal(r.status,200);const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';const next=async type=>{for(;;){const end=buffer.indexOf('\n\n');if(end>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);if(block.startsWith('data: ')){const value=JSON.parse(block.slice(6));if(value.type===type)return value;}continue;}const {value,done}=await reader.read();if(done)throw Error('stream ended');buffer+=decoder.decode(value,{stream:true});}};const result={next,close:()=>abort.abort()};streams.push(result);return result;}
 try{
 const s=(await post('/api/practice-session',{})).data;assert.equal((await post('/api/practice-session',{session:s.session,hostToken:s.hostToken})).data.session,s.session);
 const input={session:s.session,token:s.phoneToken,power:.2,angle:-20,speed:2.2};assert.equal((await post('/api/practice-session/pull',input)).status,400);
 const host=await stream(s,s.hostToken,'host'),phone=await stream(s,s.phoneToken,'phone');assert.equal((await phone.next('connection')).hostOnline,true);
 for(let i=1;i<=3;i++){const response=await post('/api/practice-session/pull',{...input,power:i/4});assert.equal(response.status,200);assert.equal(response.data.count,i);assert.equal(response.data.frames,undefined);const launch=await host.next('launch');assert.equal(launch.count,i);assert.equal(launch.input.angle,-20);assert.equal(launch.run.initial.power,i/4);assert.ok(launch.run.frames.length>20);}
 assert.equal((await post('/api/practice-session/pull',{...input,token:s.hostToken})).status,400);
 host.close();let status;do{status=await phone.next('connection');}while(status.hostOnline);assert.equal(status.hostOnline,false);assert.equal((await post('/api/practice-session/pull',input)).status,400);
 const reconnected=await stream(s,s.hostToken,'host');assert.equal((await reconnected.next('launch')).count,3);assert.equal((await post('/api/practice-session/pull',input)).data.count,4);
 }finally{for(const s of streams)s.close();await app.close();}
});
