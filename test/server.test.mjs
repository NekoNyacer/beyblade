import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {WebSocket} from 'ws';
import {createApp} from '../server.mjs';
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
function connect(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));ws.once('open',()=>resolve(ws));ws.once('error',reject);});}
test('HTTP/WS authority, pull validation, snapshots and persisted recovery',async()=>{const dir=mkdtempSync(path.resolve('test','event-'));let app=createApp({port:0,dataDir:dir});let conns=[];try{await app.listen();const port=app.server.address().port,base=`http://127.0.0.1:${port}`;const post=async(route,data)=>(await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();const created=await post('/api/create',{mode:'tournament'});assert.ok(created.hostToken);const a=await post('/api/join',{roomId:created.roomId,accessToken:created.accessToken,name:'A'}),b=await post('/api/join',{roomId:created.roomId,accessToken:created.accessToken,name:'B'});const rejoined=await post('/api/join',{roomId:created.roomId,token:a.token});assert.equal(rejoined.playerId,a.playerId);const wsBase=`ws://127.0.0.1:${port}/ws?room=${created.roomId}`;const host=await connect(wsBase+'&role=host&token='+created.hostToken),player=await connect(wsBase+'&role=player&token='+a.token),display=await connect(wsBase+'&role=display&accessToken='+created.accessToken);conns=[host,player,display];player.send(JSON.stringify({type:'action',action:'prepare'}));await wait(50);assert.ok(player.messages.some(m=>m.type==='error'));assert.equal(app.rooms.get(created.roomId).phase,'lobby');host.send(JSON.stringify({type:'action',action:'prepare'}));await wait(50);const room=app.rooms.get(created.roomId),roundId=room.round.id;player.send(JSON.stringify({type:'pull',roundId,power:.9}));await wait(50);assert.equal(room.round.pulls[a.playerId],undefined);host.send(JSON.stringify({type:'action',action:'start'}));await wait(50);assert.equal(room.phase,'countdown');room.round.shootAt=Date.now()-1;room.round.startsAt=room.round.shootAt;room.round.deadline=room.round.shootAt+1200;await wait(80);assert.equal(room.phase,'shoot');assert.equal(room.battle,null);player.send(JSON.stringify({type:'pull',roundId,power:.9}));await wait(50);assert.equal(room.round.pulls[a.playerId],.9);room.round.deadline=Date.now()-1;await wait(100);assert.equal(room.phase,'running');assert.ok(display.messages.some(m=>m.type==='frame'));assert.ok(!JSON.stringify(display.messages).includes(created.hostToken));assert.ok(!JSON.stringify(display.messages).includes(a.token));assert.ok(!JSON.stringify(display.messages).includes(created.accessToken));assert.equal((await fetch(base+'/../server.mjs')).status,404);assert.equal((await fetch(base+'/api/network')).status,200);assert.equal((await fetch(base+'/api/qr?text='+encodeURIComponent(base+'/play'))).status,200);const cross=await fetch(base+'/api/create',{method:'POST',headers:{origin:'http://evil.invalid'},body:'{}'});assert.equal(cross.status,403);for(const ws of conns)ws.close();await app.close();app=createApp({port:0,dataDir:dir});await app.listen();const recovered=app.rooms.get(created.roomId);assert.equal(recovered.phase,'ready');assert.equal(recovered.round.id,roundId);assert.equal(recovered.recovered,true);assert.ok(recovered.battle.tick>0);assert.equal(recovered.players.length,2);
 }finally{for(const ws of conns)ws.terminate();await app.close();rmSync(dir,{recursive:true,force:true});}});


test('public deployment requires admin key and invite secrets',async()=>{
 assert.throws(()=>createApp({publicMode:true,adminKey:''}),/ADMIN_KEY/);
 assert.throws(()=>createApp({publicMode:true,adminKey:'short'}),/ADMIN_KEY/);
 assert.throws(()=>createApp({publicUrl:'http://example.test'}),/HTTPS/);
 assert.throws(()=>createApp({publicUrl:'https://example.test/path'}),/HTTPS/);
 const dir=mkdtempSync(path.resolve('test','public-')),adminKey='test-only-admin-key-1234567890';
 const app=createApp({port:0,dataDir:dir,publicMode:true,adminKey,publicUrl:'https://party.example.test/'});
 try{await app.listen();const base=`http://127.0.0.1:${app.server.address().port}`;
 const post=(route,data,key)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-admin-key':key}:{})},body:JSON.stringify(data)});
 assert.equal((await post('/api/create',{})).status,403);assert.equal((await post('/api/create',{},'wrong-key')).status,403);
 const response=await post('/api/create',{mode:'brawl'},adminKey);assert.equal(response.status,200);const created=await response.json();assert.ok(created.accessToken);assert.notEqual(created.accessToken,created.hostToken);assert.ok(!JSON.stringify(created.state).includes(created.accessToken));
 assert.equal((await post('/api/join',{roomId:created.roomId,name:'Unauthorized'})).status,403);
 assert.equal((await post('/api/join',{roomId:created.roomId,name:'Unauthorized',accessToken:'wrong'})).status,403);
 const joined=await(await post('/api/join',{roomId:created.roomId,name:'Authorized',accessToken:created.accessToken})).json();assert.ok(joined.token);
 const resumed=await(await post('/api/join',{roomId:created.roomId,token:joined.token})).json();assert.equal(resumed.playerId,joined.playerId);
 const wsBase=base.replace('http:','ws:')+'/ws?room='+created.roomId;
 await assert.rejects(connect(wsBase+'&role=display'),/403/);await assert.rejects(connect(wsBase+'&role=display&accessToken=wrong'),/403/);await assert.rejects(connect(wsBase+'&role=host&token='+created.accessToken),/403/);
 const display=await connect(wsBase+'&role=display&accessToken='+created.accessToken);await wait(30);assert.ok(display.messages.some(m=>m.type==='state'));assert.ok(!JSON.stringify(display.messages).includes(created.accessToken));display.close();
 assert.deepEqual((await(await fetch(base+'/api/network')).json()).urls,['https://party.example.test']);
 assert.deepEqual(await(await fetch(base+'/healthz')).json(),{ok:true});
 assert.equal(app.rooms.get(created.roomId).players.length,1);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('public mode without canonical URL does not disclose internal network addresses',async()=>{const dir=mkdtempSync(path.resolve('test','no-url-'));const app=createApp({port:0,dataDir:dir,publicMode:true,adminKey:'test-only-admin-key-1234567890',publicUrl:''});try{await app.listen();const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/network`);assert.deepEqual((await response.json()).urls,[]);}finally{await app.close();rmSync(dir,{recursive:true,force:true});}});

test('paired browser is required for public host sockets and checked on every action',async()=>{
 const dir=mkdtempSync(path.resolve('test','pair-ws-'));let now=100000;const adminKey='test-only-admin-key-1234567890';const app=createApp({port:0,dataDir:dir,publicMode:true,adminKey,hostTTL:1000,authNow:()=>now});const sockets=[];
 try{await app.listen();const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=(route,{method='GET',body,cookie='',admin=false}={})=>fetch(base+route,{method,headers:{'Content-Type':'application/json',cookie,...(admin?{'x-admin-key':adminKey}:{})},...(body?{body:JSON.stringify(body)}:{})});
 async function authorize(){const response=await call('/api/pair/request',{method:'POST',body:{label:'Test-only browser'}}),requested=await response.json();const pair=response.headers.getSetCookie()[0].split(';')[0];await call('/api/pair/approve',{method:'POST',admin:true,body:{code:requested.code}});const claim=await call('/api/pair/status',{cookie:pair});assert.equal((await claim.json()).authenticated,true);return claim.headers.getSetCookie().find(c=>c.startsWith('bp_host=')).split(';')[0];}
 const cookie=await authorize();const created=await(await call('/api/create',{method:'POST',body:{},cookie})).json();assert.ok(created.hostToken);const other=await(await call('/api/create',{method:'POST',body:{},cookie})).json();
 const url=base.replace('http:','ws:')+`/ws?room=${created.roomId}&role=host&token=${created.hostToken}`;
 await assert.rejects(connect(url),/403/);
 const open=(target,auth)=>new Promise((resolve,reject)=>{const ws=new WebSocket(target,{headers:{cookie:auth}});ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));ws.once('open',()=>{sockets.push(ws);resolve(ws);});ws.once('error',reject);});
 await assert.rejects(open(url.replace(created.hostToken,other.hostToken),cookie),/403/);
 const ws=await open(url,cookie);ws.send(JSON.stringify({type:'action',action:'demo'}));await wait(40);assert.equal(app.rooms.get(created.roomId).players.length,10);
 now+=1001;const closed=new Promise(resolve=>ws.once('close',resolve));ws.send(JSON.stringify({type:'action',action:'prepare'}));assert.equal(await closed,4001);assert.equal(app.rooms.get(created.roomId).phase,'lobby');assert.equal((await call('/api/create',{method:'POST',body:{},cookie})).status,403);
 const cookie2=await authorize(),ws2=await open(url,cookie2),ws3=await open(url,cookie2);const closed2=new Promise(resolve=>ws2.once('close',resolve)),closed3=new Promise(resolve=>ws3.once('close',resolve));const listed=await(await call('/api/pair/admin/list',{admin:true})).json();await call('/api/pair/revoke',{method:'POST',admin:true,body:{id:listed.sessions[0].id}});assert.equal(await closed2,4001);assert.equal(await closed3,4001);
 const cookie3=await authorize(),ws4=await open(url,cookie3);const closed4=new Promise(resolve=>ws4.once('close',resolve));await call('/api/pair/logout',{method:'POST',cookie:cookie3});assert.equal(await closed4,4001);
 }finally{for(const ws of sockets)ws.terminate();await app.close();rmSync(dir,{recursive:true,force:true});}
});
