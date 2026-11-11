import { isRingOutAngle } from './public/assets/rail-config.js';
import { launchBattle, rng } from './public/assets/battle-physics.js';
export { createBattle, stepBattle, launchBattle, rng } from './public/assets/battle-physics.js';
import { randomBytes } from 'node:crypto';
export const COLORS=['#ff486a','#37d9ff','#ffd05b','#ac7cff','#50e6ac','#ff904c','#e270ff','#62a3ff','#b2e65e','#ff74a5','#48dac6','#efb172','#9695ff','#f4e66b','#a0daff','#e3b4e8'];
export const id=()=>randomBytes(12).toString('hex');
export function shuffle(values,seed){const r=rng(seed),a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function newRoom(mode='brawl'){return {roomId:randomBytes(3).toString('hex').toUpperCase(),hostToken:id(),accessToken:id(),mode,phase:'lobby',locked:false,players:[],matches:[],round:null,championId:null,seed:randomBytes(4).readUInt32LE(),revision:0};}
export function joinRoom(room,name,token){if(token){const p=room.players.find(p=>p.token===token);if(!p)throw Error('連線身分已失效，請重新加入');return p;}if(room.locked||room.phase!=='lobby')throw Error('報名已鎖定');if(room.players.length>=16)throw Error('最多 16 位選手');name=String(name??'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,20);if(!name)throw Error('請輸入名字');const p={id:id(),token:id(),name,color:COLORS.find(c=>!room.players.some(p=>p.color===c)),connected:false};room.players.push(p);return p;}
function addBracketStage(room,entrants,stage,sources=[]){
 const remaining=[...entrants],previous=new Map(sources.map(m=>[m.winnerId,m.id]));
 let seedPlayer=null;
 if(remaining.length%2){
  const byes=new Map();
  for(const m of room.matches)if(m.playerIds.length===1)byes.set(m.playerIds[0],(byes.get(m.playerIds[0])||0)+1);
  const fewest=Math.min(...remaining.map(p=>byes.get(p)||0));
  const candidates=remaining.filter(p=>(byes.get(p)||0)===fewest);
  seedPlayer=shuffle(candidates,(room.seed^Math.imul(stage,0x9e3779b9))>>>0)[0];
  remaining.splice(remaining.indexOf(seedPlayer),1);
 }
 const add=playerIds=>room.matches.push({id:id(),playerIds,winnerId:playerIds.length===1?playerIds[0]:null,stage,sourceMatchIds:playerIds.map(p=>previous.get(p)).filter(Boolean)});
 for(let i=0;i<remaining.length;i+=2)add(remaining.slice(i,i+2));
 if(seedPlayer!==null)add([seedPlayer]);
}
function initialBracket(room){room.matches=[];addBracketStage(room,shuffle(room.players.map(p=>p.id),room.seed),1);}
function advanceBracket(room){
 const stage=Math.max(...room.matches.map(m=>m.stage)),matches=room.matches.filter(m=>m.stage===stage);
 if(matches.some(m=>!m.winnerId))return;
 if(matches.length===1){room.championId=matches[0].winnerId;room.phase='finished';return;}
 addBracketStage(room,matches.map(m=>m.winnerId),stage+1,matches);
}
function nextMatch(room){
 advanceBracket(room);
 return room.matches.find(m=>!m.winnerId)??null;
}
export function prepare(room,now=Date.now()){
 if(!['lobby','result'].includes(room.phase))throw Error('目前無法準備下一場');if(room.players.length<2)throw Error('至少需要 2 位選手');room.locked=true;
 let match;if(room.mode==='tournament'){if(!room.matches.length)initialBracket(room);match=nextMatch(room);if(!match)return;}else if(room.phase==='result'){room.phase='finished';room.championId=room.round.winnerId;return;}
 room.round={id:id(),playerIds:match?.playerIds??room.players.map(p=>p.id),matchId:match?.id??null,seed:(room.seed+room.revision++)>>>0,pulls:{},pulledIds:[],deadline:0,winnerId:null};room.phase='ready';room.battle=null;
}
export function pull(room,playerId,roundId,power,now=Date.now(),angle=0){
 const round=room.round;
 if(!round||round.id!==roundId||!round.playerIds.includes(playerId)||!['countdown','shoot'].includes(room.phase)||!Number.isFinite(round.shootAt)||now<round.shootAt||now>=round.deadline||round.launchResumed||round.autoReleasedIds?.includes(playerId))throw Error('本場拉環時間已結束');
 if(Object.hasOwn(round.pulls,playerId))throw Error('本場已完成拉環');
 if(typeof power!=='number'||!Number.isFinite(power)||power<0||power>1)throw Error('拉環資料無效');
 if(typeof angle!=='number'||!Number.isFinite(angle)||angle<0||angle>25)throw Error('發射角度無效');
 round.angles??={};round.angles[playerId]=angle;round.pulls[playerId]=power;round.pulledIds.push(playerId);
 advanceLaunch(room,now);
}
export function start(room){if(!['ready','shoot'].includes(room.phase))throw Error('請先準備比賽');room.battle=launchBattle(room.round.playerIds.map(id=>room.players.find(p=>p.id===id)),room.round.seed,room.round.pulls,room.round.angles);room.phase='running';}
export function finish(room){
 if(room.round.winnerId)return;
 room.round.winnerId=room.battle.winnerId;room.round.rankings=[room.battle.winnerId,...room.battle.eliminated.slice().reverse()];
 const match=room.matches.find(m=>m.id===room.round.matchId);if(match)match.winnerId=room.battle.winnerId;
 room.phase='result';if(room.mode==='brawl')room.championId=room.battle.winnerId;else advanceBracket(room);
}
export function reset(room){room.phase='lobby';room.locked=false;room.matches=[];room.round=null;room.battle=null;room.championId=null;room.seed=randomBytes(4).readUInt32LE();}
export function publicState(room){const {hostToken,accessToken,battle,...state}=room;state.players=room.players.map(({token,...p})=>p);if(state.round){const {pulls,...round}=state.round;state.round=round;}return state;}







export function isExit(x,z){return isRingOutAngle(Math.atan2(z,x));}
export function assemble(room,playerId,parts){
 if(!['lobby','ready','result'].includes(room.phase))throw Error('倒數開始後不能更換零件');
 const p=room.players.find(p=>p.id===playerId);if(!p)throw Error('選手不存在');
 if(!parts||Object.keys(parts).length!==3||!['blade','ratchet','bit'].every(k=>Number.isInteger(parts[k])&&parts[k]>=0&&parts[k]<3))throw Error('零件選擇無效');
 p.parts={blade:parts.blade,ratchet:parts.ratchet,bit:parts.bit};
}
export function beginCountdown(room,now=Date.now()){
 if(room.phase!=='ready')throw Error('請先準備比賽');
 // Give the audience time to see both competitors before the synchronized countdown.
 const intro=room.mode==='tournament'&&room.round.playerIds.length===2&&!room.recovered?4000:0;
 room.phase='countdown';room.round.countdownAt=now+intro;room.round.shootAt=room.round.countdownAt+3000;room.round.startsAt=room.round.shootAt+1200;room.round.deadline=room.round.shootAt+1200;room.round.launchResumed=!!(room.recovered&&room.battle);
 room.round.autoReleasedIds=room.players.filter(p=>(p.practice||p.demo)&&room.round.playerIds.includes(p.id)&&!room.round.pulledIds.includes(p.id)).map(p=>p.id);
 if(room.round.launchResumed)room.round.startsAt=room.round.shootAt;
}
export function advanceLaunch(room,now=Date.now()){
 const round=room.round;
 if(room.phase==='countdown'&&now>=round.shootAt)room.phase='shoot';
 if(room.phase!=='shoot')return;
 const allReady=round.playerIds.every(id=>round.pulledIds.includes(id)||round.autoReleasedIds.includes(id));
 if(!round.launchResumed&&!allReady&&now<round.deadline)return;
 round.startsAt=round.launchResumed?round.shootAt:Math.min(now,round.deadline);
 round.autoReleasedIds=round.playerIds.filter(id=>!round.pulledIds.includes(id));
 if(round.launchResumed)room.phase='running';else start(room);
 room.recovered=false;
}
