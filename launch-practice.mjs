import {launchBattle,stepBattle} from './game.mjs';
import {battleFrame} from './battle-frame.mjs';
import {surfaceHeight,spinSpeed,STANDARD_LAUNCH_ENERGY} from './public/assets/rail-config.js';
export const practicePlayers=[{id:'pull',name:'你的拉環',color:'#ef243d',parts:{blade:0,ratchet:0,bit:0}},{id:'reference',name:'標準對手',color:'#167cff',parts:{blade:1,ratchet:0,bit:1}}];
// Fixed seed, assemblies and launch positions isolate the gesture for repeatable comparisons.
export function launchPractice(power,angle,roundId='practice',standard=false){
 if(!Number.isFinite(power)||power<0||power>1||!Number.isFinite(angle)||Math.abs(angle)>25)throw new RangeError('拉環數據無效，請重新拉動。');
 const battle=launchBattle(practicePlayers,84211,{pull:power},{pull:Math.abs(angle),reference:0});
 battle.settleAll=true;
 const energy=standard?STANDARD_LAUNCH_ENERGY:45+80*power;
 const top=battle.tops[0],speed=3+9*power,heading=(-24+angle*1.5)*Math.PI/180;
 Object.assign(top,{x:-2.9,z:2.1,y:surfaceHeight(-2.9,2.1,battle.arenaRadius)+1.55,vy:.8+Math.abs(angle)/25*1.7,vx:Math.cos(heading)*speed,vz:Math.sin(heading)*speed,energy,angularSpeed:spinSpeed(energy),motionPhase:heading});
 const reference=battle.tops[1];Object.assign(reference,{x:2.8,z:-2.2,y:1.55,vy:.8,vx:-5.2,vz:3.1,motionPhase:2.6});
 const initial={speed,heading:heading*180/Math.PI,rpm:top.angularSpeed*60/(2*Math.PI),angle,power};
 const frames=[battleFrame(battle,roundId)];
 // Bound CPU and retained frames, but never present a truncated run as a finished one.
 for(let i=0;i<3000&&!battle.done;i++){stepBattle(battle,.04);frames.push(battleFrame(battle,roundId));}
 if(!battle.done)throw Error('陀螺模擬未能正常停止，請重新拉環。');
 return {players:practicePlayers,initial,frames};
}
