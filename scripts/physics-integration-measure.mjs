import {pathToFileURL} from 'node:url';
const {launchBattle,stepBattle}=await import(pathToFileURL(process.argv[2]).href);
const count=Number(process.env.SEEDS??120);
const totals={duels:count,finished:0,ports:0,counterclockwisePorts:0,hits:0,dashHits:0,sideShields:0,defenderShields:0,centerReturns:0,remeshes:0,counterPorts:0,counterHits:0};
const examples=[];
for(let seed=1;seed<=count;seed++){
 const b=launchBattle([{id:'0'},{id:'1'}],seed),states={},dash={};
 while(!b.done&&b.t<60){
  stepBattle(b);
  for(const e of b.events){
   if(e.type==='rail'&&e.phase==='enter'&&states[e.id]?.stage===2){states[e.id].stage=3;totals.remeshes++;}
   if(e.type==='rail'&&e.reason==='port'){
    totals.ports++;if(e.direction<0)totals.counterclockwisePorts++;dash[e.id]=e.t+.75;
    if(states[e.id]?.stage===3){states[e.id].stage=4;totals.counterPorts++;}
   }
   if(e.type==='hit'){
    totals.hits++;
    const attacker=process.env.EXACT==='1'?e.dashAttackerId:([e.aId,e.bId].find(id=>e.t<(dash[id]??0)));
    if(attacker!==undefined){
     totals.dashHits++;const defender=e.aId===attacker?e.bId:e.aId;
     if(states[attacker]?.stage===4){totals.counterHits++;examples.push({seed,t:e.t});}
     states[defender]={stage:0,t:e.t};
    }
    dash[e.aId]=dash[e.bId]=0;
   }
   if(e.type==='shield'&&(e.nx||e.nz)){
    totals.sideShields++;dash[e.id]=0;
    if(states[e.id]?.stage===0&&e.t-states[e.id].t<2){states[e.id].stage=1;totals.defenderShields++;}
   }
  }
  for(const top of b.tops)if(states[top.id]?.stage===1&&Math.hypot(top.x,top.z)<.6*b.arenaRadius){states[top.id].stage=2;totals.centerReturns++;}
 }
 totals.finished+=b.done?1:0;
}
console.log(JSON.stringify({mode:process.env.EXACT==='1'?'exact dash metadata':'same 0.75-second post-exit window',totals,examples},null,2));
