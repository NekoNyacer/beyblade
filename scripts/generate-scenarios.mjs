import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {COLORS,createBattle,stepBattle} from '../game.mjs';
import {battleFrame} from '../battle-frame.mjs';
export function clip(players,seed,sampleTicks=2,pulls={}){
 const battle=createBattle(players,seed,pulls),frames=[battleFrame(battle,'demo-round')];let pending=[];
 while(!battle.done){stepBattle(battle);pending.push(...battle.events);if(battle.tick%sampleTicks===0||battle.done){frames.push(battleFrame(battle,'demo-round',pending));pending=[];}if(battle.tick>1500)throw Error('Scenario did not settle within60s');}
 return {frames,winnerId:battle.winnerId,rankings:[battle.winnerId,...battle.eliminated.slice().reverse()]};
}
function recoversFromHit(events){
 const entryIndex=events.findIndex(e=>e.type==='pocket'&&e.phase==='enter');
 if(entryIndex<0)return false;
 const entry=events[entryIndex];
 const lastContact=events.slice(0,entryIndex).findLast(e=>e.aId===entry.id||e.bId===entry.id||
  (e.id===entry.id&&['rail','rail-bounce','land'].includes(e.type)));
 return lastContact?.type==='hit'&&entry.t-lastContact.t<1&&
  events.slice(entryIndex+1).some(e=>e.type==='pocket'&&e.phase==='exit'&&e.id===entry.id);
}
export function generateScenarios(){
 const players=Array.from({length:16},(_,i)=>({id:`demo-${i+1}`,name:i===0?'紅焰':i===1?'藍霆':`選手 ${String(i+1).padStart(2,'0')}`,color:COLORS[i],connected:true,parts:{blade:i%3,ratchet:Math.floor(i/3)%3,bit:i%3}}));
 const brawl=clip(players.slice(0,10),32451),dense=clip(players,123);
 let rail,pocket,stall;
 const duelPlayers=players.slice(0,2),fullPower=Object.fromEntries(duelPlayers.map(p=>[p.id,1]));
 const launches=[{}, {[duelPlayers[0].id]:1,[duelPlayers[1].id]:.5}, fullPower];
 // The blue top rebounds off a tooth, widens and tightens its laps, then meets red again.
 const duel=clip(duelPlayers,89,2,fullPower);
 for(let seed=1;seed<=180&&(!rail||!pocket||!stall);seed++)for(const pulls of launches){
  const candidate=clip(duelPlayers,seed,2,pulls),events=candidate.frames.flatMap(f=>f.events);
  if(!rail&&events.some(e=>e.type==='rail-bounce')&&events.some(e=>e.type==='rail'&&e.reason==='port'))rail=candidate;
  if(!pocket&&recoversFromHit(events))pocket=candidate;
  if(!stall&&events.some(e=>e.type==='out'&&e.reason==='pocket'))stall=candidate;
  if(rail&&pocket&&stall)break;
 }
 if(!rail||!pocket||!stall)throw Error('Required physical scenario missing: '+Object.entries({rail,pocket,stall}).filter(([,v])=>!v).map(([k])=>k).join(', '));
 return {players,brawl,duel,dense,rail,pocket,stall,ringout:pocket};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){writeFileSync('public/assets/scenario-data.json',JSON.stringify(generateScenarios()));console.log('Generated complete clips from production physics with every event.');}
