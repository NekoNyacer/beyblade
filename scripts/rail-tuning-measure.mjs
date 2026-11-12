import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Optional checkout path permits the same measurement against an untouched
// baseline: node scripts/rail-tuning-measure.mjs /path/to/baseline > baseline.json
const root=path.resolve(process.argv[2]??'.');
const asset=name=>import(pathToFileURL(path.join(root,'public/assets',name)));
const {launchBattle,stepBattle}=await asset('battle-physics.js');
const {railConfigForCount,surfaceSlope}=await asset('rail-config.js');
const {applyLaunchPull}=await asset('ripcord.js');
const players=[{id:'player',parts:{blade:0,ratchet:0,bit:0}},{id:'opponent',parts:{blade:1,ratchet:0,bit:1}}];
const round=n=>Math.round(n*1000)/1000;
const report={seeds:{first:1,last:80},dt:.04,geometry:[],cases:[]};
for(const count of [2,10,16]){
 const c=railConfigForCount(count);
 report.geometry.push({count,arenaRadius:c.arenaRadius,rimHeight:c.rimHeight,
  contactSlopeDegrees:round(Math.atan(surfaceSlope(c.railRadius-c.captureWidth,0,c.arenaRadius))*180/Math.PI),
  railSlopeDegrees:round(Math.atan(surfaceSlope(c.railRadius,0,c.arenaRadius))*180/Math.PI)});
}
for(const [name,power,angle] of [['standard',null,0],['practice-slow',0,0],['practice-medium',.5,0],['practice-fast',1,0],['practice-left',.5,-20],['practice-right',.5,20]]){
 const totals={name,power,angle,rounds:80,roundsWithEntry:0,roundsWithPort:0,playerEntryRounds:0,playerPortRounds:0,
  entries:0,ports:0,bounces:0,entriesAfter5:0,portsAfter5:0,positiveDirectionEntries:0,negativeDirectionEntries:0,
  finished:0,meanDuration:0,maxDuration:0};
 for(let seed=1;seed<=80;seed++){
  const battle=launchBattle(players,seed,power===null?{}:{player:.5});
  if(power!==null)applyLaunchPull(battle.tops[0],power,angle);
  let entry=false,port=false,playerEntry=false,playerPort=false;
  while(!battle.done&&battle.t<60){
   stepBattle(battle,.04);
   for(const e of battle.events){
    if(e.type==='rail-bounce')totals.bounces++;
    if(e.type==='rail'&&e.phase==='enter'){
     totals.entries++;entry=true;playerEntry ||= e.id==='player';totals.entriesAfter5+=Number(e.t>5);
     totals[e.direction<0?'negativeDirectionEntries':'positiveDirectionEntries']++;
    }
    if(e.type==='rail'&&e.reason==='port'){
     totals.ports++;port=true;playerPort ||= e.id==='player';totals.portsAfter5+=Number(e.t>5);
    }
   }
  }
  totals.roundsWithEntry+=Number(entry);totals.roundsWithPort+=Number(port);
  totals.playerEntryRounds+=Number(playerEntry);totals.playerPortRounds+=Number(playerPort);
  totals.finished+=Number(battle.done);totals.meanDuration+=battle.t/80;totals.maxDuration=Math.max(totals.maxDuration,battle.t);
 }
 totals.meanDuration=round(totals.meanDuration);totals.maxDuration=round(totals.maxDuration);report.cases.push(totals);
}
console.log(JSON.stringify(report,null,2));
