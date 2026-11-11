import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {createApp} from '../server.mjs';
const connect=url=>new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.once('open',()=>resolve(ws));ws.once('error',reject);});
test('opt-in public creation keeps room secrets, admin protection, origins and rate limit',async()=>{
 const dataDir=mkdtempSync(path.join(os.tmpdir(),'beyblade-open-'));
 const app=createApp({port:0,host:'127.0.0.1',dataDir,publicMode:true,allowPublicCreate:true,adminKey:'test-only-public-create-admin-key',publicUrl:'https://party.example.test'});
 const sockets=[];
 try{
  await app.listen();const base=`http://127.0.0.1:${app.server.address().port}`;
  const post=(route,body={},headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const info=await(await fetch(base+'/api/pair/status')).json();
  assert.equal(info.publicMode,true);assert.equal(info.allowPublicCreate,true);assert.equal(info.authenticated,false);
  assert.equal((await fetch(base+'/api/pair/admin/list')).status,403);
  assert.equal((await post('/api/pair/approve',{code:'fixture'})).status,403);
  assert.equal((await post('/api/create',{}, {origin:'https://evil.example.test'})).status,403);
  assert.equal((await post('/api/create',{}, {'sec-fetch-site':'cross-site'})).status,403);
  const response=await post('/api/create',{mode:'brawl'});assert.equal(response.status,200);const room=await response.json();
  assert.ok(room.hostToken);assert.ok(room.accessToken);assert.notEqual(room.hostToken,room.accessToken);
  assert.equal((await post('/api/join',{roomId:room.roomId,name:'Not invited'})).status,403);
  const player=await(await post('/api/join',{roomId:room.roomId,name:'Fixture',accessToken:room.accessToken})).json();assert.ok(player.token);
  const wsBase=base.replace('http:','ws:')+'/ws?room='+room.roomId;
  await assert.rejects(connect(wsBase+'&role=host&token='+room.accessToken),/403/);
  await assert.rejects(connect(wsBase+'&role=display&accessToken=wrong'),/403/);
  const host=await connect(wsBase+'&role=host&token='+room.hostToken);sockets.push(host);
  const display=await connect(wsBase+'&role=display&accessToken='+room.accessToken);sockets.push(display);
  host.send(JSON.stringify({type:'action',action:'lock',value:true}));
  const until=Date.now()+2000;while(!app.rooms.get(room.roomId).locked&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
  assert.equal(app.rooms.get(room.roomId).locked,true,'room host works without browser pairing');
  for(const secret of [room.hostToken,room.accessToken,player.token])assert.ok(!JSON.stringify(room.state).includes(secret));
  for(let i=0;i<4;i++)assert.equal((await post('/api/create')).status,200);
  assert.equal((await post('/api/create')).status,429);
 }finally{for(const ws of sockets)ws.terminate();await app.close();rmSync(dataDir,{recursive:true,force:true});}
});
test('Docker includes all root runtime modules',()=>{
 const docker=readFileSync('Dockerfile','utf8');
 for(const file of ['server.mjs','game.mjs','auth.mjs','battle-frame.mjs','launch-practice.mjs','practice-sessions.mjs'])assert.match(docker,new RegExp(file.replace('.','\\.')));
});