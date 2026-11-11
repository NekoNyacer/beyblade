import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {WebSocket} from 'ws';
import {createApp} from '../server.mjs';
import {start} from '../game.mjs';
const until=async(fn)=>{const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw Error('Condition timed out');await new Promise(r=>setTimeout(r,15));}};
const open=url=>new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));ws.once('error',reject);ws.once('open',()=>resolve(ws));});
test('removal revokes every player session, preserves live rounds, and safely resets idle test rounds',async()=>{
 const root=path.resolve('.qa');mkdirSync(root,{recursive:true});const dir=mkdtempSync(path.join(root,'remove-test-'));
 const app=createApp({host:'127.0.0.1',port:0,dataDir:dir}),sockets=[];
 try{
  await app.listen();const base='http://127.0.0.1:'+app.server.address().port;
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,...await response.json()};};
  const created=await post('/api/create',{mode:'brawl'}),room=app.rooms.get(created.roomId);
  const join=name=>post('/api/join',{roomId:created.roomId,accessToken:created.accessToken,name});
  const a=await join('A'),b=await join('B');
  const wsUrl=base.replace('http:','ws:')+'/ws?room='+created.roomId;
  const connect=async(query)=>{const ws=await open(wsUrl+query);sockets.push(ws);return ws;};
  const host=await connect('&role=host&token='+created.hostToken),p1=await connect('&role=player&token='+a.token),p2=await connect('&role=player&token='+a.token),display=await connect('&role=display&accessToken='+created.accessToken);
  const action=(socket,action,value,extra={})=>socket.send(JSON.stringify({type:'action',action,value,...extra}));
  action(p1,'remove',b.playerId);await until(()=>p1.messages.some(m=>m.type==='error'));assert.equal(room.players.length,2);
  const closed1=new Promise(r=>p1.once('close',(code,reason)=>r([code,reason.toString()]))),closed2=new Promise(r=>p2.once('close',(code,reason)=>r([code,reason.toString()])));
  action(host,'remove',a.playerId);assert.deepEqual(await closed1,[1008,'Removed']);assert.deepEqual(await closed2,[1008,'Removed']);
  assert.deepEqual(room.players.map(p=>p.id),[b.playerId]);await until(()=>display.messages.some(m=>m.type==='state'&&m.state.players.length===1));
  assert.equal((await post('/api/join',{roomId:created.roomId,token:a.token})).status,400);
  await assert.rejects(open(wsUrl+'&role=player&token='+a.token),/403/);
  const fresh=await join('A again');assert.notEqual(fresh.playerId,a.playerId);
  action(host,'prepare');await until(()=>room.phase==='ready');const round=room.round;
  action(host,'remove',b.playerId);await until(()=>host.messages.some(m=>m.type==='error'&&m.message==='比賽中無法移除'));assert.equal(room.round,round);assert.equal(room.players.length,2);
  action(host,'start');await until(()=>room.phase==='countdown');const count=host.messages.length;action(host,'remove',b.playerId,{reset:true});await until(()=>host.messages.length>count);assert.equal(room.phase,'countdown');assert.equal(room.players.length,2);
  // Isolated fixtures exercise all idle phases without waiting for the battle simulation.
  room.phase='ready';start(room);
  for(const phase of ['running','shoot']){room.phase=phase;const n=host.messages.length;action(host,'remove',b.playerId,{reset:true});await until(()=>host.messages.length>n);assert.equal(room.players.length,2);}
  room.phase='result';room.championId=b.playerId;
  action(host,'remove','missing-player',{reset:true});await until(()=>host.messages.some(m=>m.type==='error'&&m.message==='選手不存在'));assert.equal(room.phase,'result');assert.equal(room.round,round);
  action(host,'remove',b.playerId,{reset:true});await until(()=>room.players.length===1);assert.equal(room.phase,'lobby');assert.equal(room.round,null);assert.equal(room.battle,null);assert.equal(room.championId,null);assert.equal(room.locked,false);
  action(host,'practice');await until(()=>room.players.some(p=>p.practice));const bot=room.players.find(p=>p.practice);
  action(host,'remove',bot.id);await until(()=>room.players.length===1);assert.ok(!room.players.some(p=>p.practice));
  const c=await join('C');room.phase='finished';action(host,'remove',c.playerId,{reset:true});await until(()=>room.players.length===1);assert.equal(room.phase,'lobby');
  const d=await join('D');room.phase='ready';room.mode='tournament';const n=host.messages.length;action(host,'remove',d.playerId,{reset:true});await until(()=>host.messages.length>n);assert.equal(room.players.length,2);assert.equal(room.phase,'ready');
 }finally{for(const ws of sockets)ws.terminate();await app.close();if(dir.startsWith(root+path.sep))rmSync(dir,{recursive:true,force:true});}
});
