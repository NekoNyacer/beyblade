import { railConfigForCount, isRingOutAngle, surfaceHeight, surfaceSlope, spinSpeed } from './public/assets/rail-config.js';
import { randomBytes } from 'node:crypto';
export const COLORS=['#ff486a','#37d9ff','#ffd05b','#ac7cff','#50e6ac','#ff904c','#e270ff','#62a3ff','#b2e65e','#ff74a5','#48dac6','#efb172','#9695ff','#f4e66b','#a0daff','#e3b4e8'];
export const id=()=>randomBytes(12).toString('hex');
export function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function shuffle(values,seed){const r=rng(seed),a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Local arcade physics: measured swipe power and launch tilt seed the actual motion.
// Integrate at <=10ms: even the 14-unit/s safety cap cannot tunnel through a 1.02 diameter.
const TOP_DIAMETER=1.02, MAX_SPEED=14;
export function createBattle(players,seed,pulls={},angles={}){
 const random=rng(seed),phase=random()*Math.PI*2,rail=railConfigForCount(players.length);
 return {arenaRadius:rail.arenaRadius,railRadius:rail.railRadius,seed,t:0,tick:0,eventSequence:0,done:false,winnerId:null,eliminated:[],hitTicks:{},hitTimes:{},events:[],tops:players.map((p,i)=>{
  const angle=phase+i/players.length*Math.PI*2+random()*.2,power=pulls[p.id]??.5,tilt=(angles[p.id]??0)*Math.PI/180;
  let tangent=(7+random()*2)*(i%2?-1:1)*(1+.4*Math.sin(tilt)),inward=(.35+random()*.65)*(1+Math.sin(tilt));
  const speed=5+8*power,scale=speed/Math.hypot(tangent,inward);tangent*=scale;inward*=scale;
  const x=Math.cos(angle)*(rail.railRadius-.18),z=Math.sin(angle)*(rail.railRadius-.18);
  return{id:p.id,parts:p.parts??{blade:0,ratchet:0,bit:0},launchPower:power,launchTilt:tilt,motionPhase:angle,orbitDir:Math.sign(tangent),tilt,y:surfaceHeight(x,z,rail.arenaRadius),vy:0,railTravel:0,dashUntil:0,
   railActive:false,railDir:0,railUntil:0,railCooldown:0,railEntered:0,pocketActive:false,pocketIndex:null,pocketDepth:0,pocketEntered:0,pocketCooldown:0,
   x,z,vx:-Math.sin(angle)*tangent-Math.cos(angle)*inward,vz:Math.cos(angle)*tangent-Math.sin(angle)*inward,energy:65+60*power,angularSpeed:spinSpeed(65+60*power),settling:false,alive:true,spin:random()*6.28,drag:2.2+random()*.8};
 })};
}
export function stepBattle(b,dt=1/25){
 if(b.done)return b;
 if(!Number.isFinite(dt)||dt<=0)throw new RangeError('dt must be a positive finite number');
 // Older saved metal battles recorded contact ticks at the fixed 25Hz server rate.
 for(const a of b.tops)if(!Number.isFinite(a.lastHitTime)&&Number.isFinite(a.lastHit))a.lastHitTime=b.t-Math.max(0,b.tick-a.lastHit)/25;
 b.tick++;b.events=[];b.hitTicks??={};b.hitTimes??={};b.eventSequence??=0;
 const rail=railConfigForCount(b.tops.length),WALL_RADIUS=rail.railRadius+.07;
 b.arenaRadius=rail.arenaRadius;b.railRadius=rail.railRadius;
 for(const a of b.tops){a.railActive??=false;a.railDir??=0;a.railCooldown??=0;a.railEntered??=b.t;a.railUntil??=b.t;a.pocketActive??=false;a.pocketIndex??=null;a.pocketDepth??=0;a.pocketEntered??=0;a.pocketCooldown??=0;a.y??=surfaceHeight(a.x,a.z,rail.arenaRadius)-a.pocketDepth;a.vy??=0;a.tilt??=0;a.launchTilt??=0;a.launchPower??=.5;a.railTravel??=0;a.dashUntil??=0;a.motionPhase??=Math.atan2(a.z,a.x);a.orbitDir??=Math.sign(a.x*a.vz-a.z*a.vx)||1;a.angularSpeed??=spinSpeed(a.energy);a.settling??=false;}
 const startTime=b.t,steps=Math.ceil(dt/.01),h=dt/steps;
 let remaining=b.tops.filter(t=>t.alive).length;
 const emit=event=>b.events.push({...event,eventId:`${b.seed}:${++b.eventSequence}`,t:b.t});
 const contactEvent=(a,type,power,extra={})=>emit({type,id:a.id,x:a.x,y:a.y,z:a.z,power,...extra});
 const takeoff=(a,speed)=>{a.vy=Math.max(a.vy,speed);};
 const railEvent=(a,phase,reason,exitIndex=-1,speedBefore=Math.hypot(a.vx,a.vz))=>{
  const r=Math.hypot(a.x,a.z)||1;
  emit({type:'rail',phase,id:a.id,x:a.x,z:a.z,nx:a.x/r,nz:a.z/r,direction:a.railDir,
   reason,exitIndex,railTravel:a.railTravel,speedBefore,speedAfter:Math.hypot(a.vx,a.vz)});
 };
 const leaveRail=(a,reason,exitIndex=-1)=>{
  const before=Math.hypot(a.vx,a.vz),r=Math.hypot(a.x,a.z)||1,nx=a.x/r,nz=a.z/r;
  if(reason==='port'){
   a.dashUntil=b.t+.55;
   // A fixed local exit ramp redirects momentum inward, never toward another top.
   const speed=Math.min(rail.maxSpeed,before);
   a.vx=speed*(-nx*.82-nz*a.railDir*Math.sqrt(1-.82**2));
   a.vz=speed*(-nz*.82+nx*a.railDir*Math.sqrt(1-.82**2));
  }
  a.railActive=false;a.railCooldown=b.t+rail.cooldown;
  railEvent(a,'exit',reason,exitIndex,before);
 };
 const guideRail=(a,h)=>{
  const r=Math.hypot(a.x,a.z)||1,nx=a.x/r,nz=a.z/r,radial=a.vx*nx+a.vz*nz,tangent=-a.vx*nz+a.vz*nx;
  const angle=Math.atan2(a.z,a.x),port=rail.exitAngles.findIndex(p=>Math.abs(Math.atan2(Math.sin(angle-p),Math.cos(angle-p)))<rail.exitHalfWidth);
  if(a.y>surfaceHeight(a.x,a.z,rail.arenaRadius)+.055||a.vy>.1)return false;
  if(!a.railActive){
   const meshed=Math.abs(tangent)>rail.minTangent;
   if(meshed&&port<0&&b.t>=a.railCooldown&&a.energy>rail.minEnergy&&Math.abs(r-rail.railRadius)<rail.captureWidth&&radial>=-.4&&radial<Math.abs(tangent)*.4&&Math.abs(tangent)>=rail.minTangent&&a.tilt<.44){
    a.railTravel=0;a.railActive=true;a.railDir=Math.sign(tangent);a.railEntered=b.t;a.railUntil=b.t+rail.maxDuration;
    railEvent(a,'enter','contact');
   }else return false;
  }
  a.railTravel+=Math.abs(tangent)*h/r;
  if(port>=0){leaveRail(a,'port',port);return false;}
  if(b.t>=a.railUntil){leaveRail(a,'timeout');return false;}
  if(a.energy<=rail.minEnergy||Math.abs(r-rail.railRadius)>.38){leaveRail(a,'lost-contact');return false;}
  if(Math.abs(tangent)>11.2&&a.launchPower>.82&&b.t-a.railEntered>.22){leaveRail(a,'overload');a.vx+=nx*2.4;a.vz+=nz*2.4;takeoff(a,4.8);return false;}
  // Finite radial guide force: the top remains freely integrated, not position-locked.
  const radialForce=Math.max(-52,Math.min(52,-tangent*tangent/r-95*(r-rail.railRadius)-16*radial));
  const drive=Math.max(0,rail.boostAcceleration*(1-Math.abs(tangent)/rail.maxSpeed)*(a.energy/95));
  a.vx+=(nx*radialForce-nz*a.railDir*drive)*h;
  a.vz+=(nz*radialForce+nx*a.railDir*drive)*h;
  a.energy-=rail.energyCost*h;
  return true;
 };
 const pocketEvent=(a,phase)=>emit({type:'pocket',phase,id:a.id,pocketIndex:a.pocketIndex,x:a.x,y:a.y,z:a.z,pocketDepth:a.pocketDepth,energy:a.energy});
 const enterPocket=(a,index)=>{
  if(a.railActive)leaveRail(a,'pocket');
  a.pocketActive=true;a.pocketIndex=index;a.pocketEntered=b.t;
  pocketEvent(a,'enter');
 };
 const pocketStep=(a,h)=>{
  const angle=rail.ringOutAngles[a.pocketIndex],nx=Math.cos(angle),nz=Math.sin(angle);
  let radial=a.x*nx+a.z*nz,lateral=-a.x*nz+a.z*nx,vr=a.vx*nx+a.vz*nz,vt=-a.vx*nz+a.vz*nx;
  const damping=Math.exp(-(a.settling?4:.18)*h);vr*=damping;vt*=damping;
  radial+=vr*h;lateral+=vt*h;a.vy-=24*h;a.y+=a.vy*h;
  // The angled end wall redirects existing momentum upward and inward, without a spring.
  const outer=rail.arenaRadius+rail.pocketOuterOffset-Math.max(0,a.y-rail.rimHeight-.4)*.28;
  if(radial>outer){radial=outer;if(vr>0){const impact=Math.hypot(vr,a.vy),rebound=impact*.9;vr=-.5*rebound;a.vy=.8660254*rebound;a.energy-=1+impact*.7;contactEvent(a,'pocket-impact',impact);}}
  if(Math.abs(lateral)>rail.pocketHalfWidth){lateral=Math.sign(lateral)*rail.pocketHalfWidth;if(vt*lateral>0){a.energy-=Math.abs(vt)*.35;vt*=-.68;}}
  if(a.y>rail.shieldHeight){a.y=rail.shieldHeight;if(a.vy>0){a.energy-=a.vy*.8;contactEvent(a,'shield',a.vy,{nx,nz});a.vy*=-.45;}}
  const floor=rail.pocketFloor;
  if(a.y<floor){a.y=floor;if(a.vy<0){const impact=-a.vy;a.vy=impact>1?impact*.36:0;vr*=.82;vt*=.82;if(impact>1){a.energy-=1+impact*.8;contactEvent(a,'pocket-impact',impact);}}}
  if(radial<rail.arenaRadius&&vr<0){
   if(a.y>=rail.rimHeight+.04){
    a.pocketActive=false;a.pocketCooldown=b.t+.5;a.railCooldown=b.t+.15;a.pocketDepth=0;
    a.x=nx*radial-nz*lateral;a.z=nz*radial+nx*lateral;a.vx=nx*vr-nz*vt;a.vz=nz*vr+nx*vt;
    pocketEvent(a,'exit');a.pocketIndex=null;return;
   }
   radial=rail.arenaRadius+.005;vr=Math.abs(vr)*.45;
  }
  a.x=nx*radial-nz*lateral;a.z=nz*radial+nx*lateral;a.vx=nx*vr-nz*vt;a.vz=nz*vr+nx*vt;
  a.pocketDepth=Math.max(0,surfaceHeight(a.x,a.z,rail.arenaRadius)-a.y);a.energy-=11*h;
 };
 const wall=a=>{
  if(!a.alive||a.pocketActive)return;
  const d=Math.hypot(a.x,a.z);if(d<=WALL_RADIUS){a.onApron=false;return;}
  const nx=a.x/d,nz=a.z/d,approach=a.vx*nx+a.vz*nz;
  // Only an actual flight above the crest can reach the external catch wells.
  if((a.y>=rail.rimHeight+.04&&approach>0)||a.onApron){
   a.onApron=true;
   const angle=Math.atan2(a.z,a.x),index=rail.ringOutAngles.findIndex(port=>Math.abs(Math.atan2(Math.sin(angle-port),Math.cos(angle-port)))<rail.ringOutHalfWidth);
   const occupied=b.tops.some(other=>other!==a&&other.alive&&other.pocketActive&&other.pocketIndex===index);
   if(d>rail.arenaRadius+.02&&index>=0&&!occupied&&b.t>=a.pocketCooldown){enterPocket(a,index);return;}
   const shieldRadius=rail.arenaRadius+.58-Math.max(0,a.y-rail.rimHeight-.4)*.28;
   if(d>shieldRadius){a.x=nx*shieldRadius;a.z=nz*shieldRadius;if(approach>0){a.vx-=1.72*approach*nx;a.vz-=1.72*approach*nz;a.energy-=2+.10*approach*approach;a.tilt=Math.min(.6,a.tilt+.16);contactEvent(a,'shield',approach,{nx,nz});}}
   return;
  }
  a.x=nx*WALL_RADIUS;a.z=nz*WALL_RADIUS;
  if(approach>0){a.vx-=1.72*approach*nx;a.vz-=1.72*approach*nz;}
 };
 for(let step=0;step<steps&&!b.done;step++){
  b.t=startTime+(step+1)*h;
  const living=b.tops.filter(t=>t.alive);
  for(const a of living){
   // A slightly oval, curved basin bends free trajectories without selecting opponents.
   if(a.pocketActive){pocketStep(a,h);}else{
   const radius=Math.hypot(a.x,a.z),nx=radius?a.x/radius:0,nz=radius?a.z/radius:0;
   const grounded=a.y<=surfaceHeight(a.x,a.z,rail.arenaRadius)+.055&&a.vy<=.1;
   if(grounded&&!guideRail(a,h)){
    const dash=b.t<a.dashUntil,high=dash?0:Math.max(0,Math.min(1,(a.energy-55)/30)),medium=dash?0:Math.max(0,Math.min(1,(a.energy-20)/30))*(1-high);
    const radial=a.vx*nx+a.vz*nz,tangent=-a.vx*nz+a.vz*nx,slope=surfaceSlope(a.x,a.z,rail.arenaRadius);
    const downhill=-24*slope/(1+slope*slope),orbitRadius=rail.railRadius-.08;
    const orbit=-tangent*tangent/Math.max(.6,radius)-18*(radius-orbitRadius)-4*radial;
    const force=downhill*(1-high)+orbit*high;
    a.vx+=nx*force*h;a.vz+=nz*force*h;
    // Local precession breaks medium-speed paths into crossings without chasing opponents.
    const phase=b.t*1.7+a.motionPhase,curve=medium*(.9*Math.sin(phase)+a.launchTilt);
    a.vx+=(-a.x*.7*medium-a.vz*curve+nz*tangent*medium*.55)*h;
    a.vz+=(-a.z*.9*medium+a.vx*curve-nx*tangent*medium*.55)*h;
   }
   const low=Math.max(0,1-a.energy/30);
   const damping=Math.exp(-(.025+3.8*low*low)*h);
   a.vx*=damping;a.vz*=damping;
   const speed=Math.hypot(a.vx,a.vz);if(speed>MAX_SPEED){a.vx*=MAX_SPEED/speed;a.vz*=MAX_SPEED/speed;}
   a.x+=a.vx*h;a.z+=a.vz*h;a.vy-=24*h;a.y+=a.vy*h;wall(a);
   if(!a.pocketActive){const radius=Math.hypot(a.x,a.z),floor=radius<=rail.arenaRadius?surfaceHeight(a.x,a.z,rail.arenaRadius):.18;
    if(a.y<floor){const landing=-a.vy;a.y=floor;a.vy=0;if(landing>2){a.energy-=landing*.38;contactEvent(a,'land',landing);}if(radius>rail.arenaRadius){const nx=a.x/radius,nz=a.z/radius,approach=a.vx*nx+a.vz*nz;if(approach>0){a.vx-=1.5*approach*nx;a.vz-=1.5*approach*nz;}}}
    if(a.y>rail.shieldHeight){a.y=rail.shieldHeight;if(a.vy>0){a.energy-=a.vy*.8;contactEvent(a,'shield',a.vy,{nx:0,nz:0});a.vy*=-.45;}}
   }
   }
   a.energy=Math.max(0,a.energy-a.drag*(1+Math.max(0,b.t-8)*.1)*h);
   if(a.energy===0&&!a.settling)a.settleStartSpeed=Math.max(.12,a.angularSpeed);
   a.settling=a.energy===0;
   const targetSpin=spinSpeed(a.energy);
   a.angularSpeed=a.settling?a.angularSpeed*Math.exp(-2.6*h):targetSpin+(a.angularSpeed-targetSpin)*Math.exp(-3*h);
   a.spin+=h*a.angularSpeed;a.tilt*=Math.exp(-(a.settling?4:.08)*h);
  }
  // Iterative separation also handles simultaneous contacts in a crowded 16-player bowl.
  for(let pass=0;pass<8;pass++){for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++){
   const a=living[i],c=living[j];if(!a.alive||!c.alive||a.pocketActive||c.pocketActive||Math.abs(a.y-c.y)>.42)continue;
   const dx=c.x-a.x,dz=c.z-a.z,d=Math.hypot(dx,dz);
   if(d>=TOP_DIAMETER)continue;
   const nx=d?dx/d:1,nz=d?dz/d:0,overlap=(TOP_DIAMETER-d)/2;
   a.x-=nx*overlap;a.z-=nz*overlap;c.x+=nx*overlap;c.z+=nz*overlap;
   const approach=(a.vx-c.vx)*nx+(a.vz-c.vz)*nz;
   if(approach<=0)continue;
   a.lastHit=c.lastHit=b.tick;a.lastHitTime=c.lastHitTime=b.t;
   if(approach>8)for(const top of [a,c])takeoff(top,Math.min(5.8,(approach-7)*.34+top.tilt*1.4));
   const impulse=approach*.98;
   a.vx-=impulse*nx;a.vz-=impulse*nz;c.vx+=impulse*nx;c.vz+=impulse*nz;
   // Contact impulse can overwhelm the rail retaining force in either direction.
   for(const top of [a,c])if(top.railActive){
    const r=Math.hypot(top.x,top.z)||1,radial=(top.vx*top.x+top.vz*top.z)/r,tangent=(-top.vx*top.z+top.vz*top.x)/r;
    if(Math.abs(radial)>2.2||tangent*top.railDir<1.5)leaveRail(top,'collision');
   }
   const key=JSON.stringify([a.id,c.id].sort());
   if(approach>.5&&b.t-(b.hitTimes[key]??-Infinity)>.12){
    b.hitTimes[key]=b.t;b.hitTicks[key]=b.tick;
    const loss=.4+approach*.2,ae=a.energy,ce=c.energy;
    a.energy-=loss*(1+(100-ce)*.002);c.energy-=loss*(1+(100-ae)*.002);
    emit({type:'hit',aId:a.id,bId:c.id,nx,nz,x:(a.x+c.x)/2,z:(a.z+c.z)/2,y:(a.y+c.y)/2,power:approach});
   }
  }
  for(const a of living)wall(a);
  }
  for(const a of living){if(!a.alive)continue;wall(a);const speed=Math.hypot(a.vx,a.vz);if(speed>MAX_SPEED){a.vx*=MAX_SPEED/speed;a.vz*=MAX_SPEED/speed;}}
  // Resolve simultaneous exhaustion in energy order, retaining one physical survivor.
  for(const a of [...living].sort((a,c)=>a.energy-c.energy)){
   if(a.alive&&a.settling&&a.angularSpeed<.12&&Math.hypot(a.vx,a.vz)<.08&&Math.abs(a.vy)<.08&&remaining>1){if(a.railActive)leaveRail(a,'exhausted');a.alive=false;a.outReason=a.pocketActive?'pocket':'spinout';a.energy=0;a.angularSpeed=0;a.vx=0;a.vz=0;a.vy=0;remaining--;b.eliminated.push(a.id);emit({type:'out',id:a.id,x:a.x,z:a.z,reason:a.outReason});}
  }
  if(remaining===1){b.done=true;b.winnerId=b.tops.find(t=>t.alive).id;}
 }
 return b;
}
export function newRoom(mode='brawl'){return {roomId:randomBytes(3).toString('hex').toUpperCase(),hostToken:id(),accessToken:id(),mode,phase:'lobby',locked:false,players:[],matches:[],round:null,championId:null,seed:randomBytes(4).readUInt32LE(),revision:0};}
export function joinRoom(room,name,token){if(token){const p=room.players.find(p=>p.token===token);if(!p)throw Error('連線身分已失效，請重新加入');return p;}if(room.locked||room.phase!=='lobby')throw Error('報名已鎖定');if(room.players.length>=16)throw Error('最多 16 位選手');name=String(name??'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,20);if(!name)throw Error('請輸入名字');const p={id:id(),token:id(),name,color:COLORS.find(c=>!room.players.some(p=>p.color===c)),connected:false};room.players.push(p);return p;}
function initialBracket(room){const entrants=shuffle(room.players.map(p=>p.id),room.seed);let size=2;while(size<entrants.length)size*=2;const byes=size-entrants.length;room.matches=[];let at=0;for(let i=0;i<size/2;i++){const playerIds=i<byes?[entrants[at++]]:[entrants[at++],entrants[at++]];room.matches.push({id:id(),playerIds,winnerId:playerIds.length===1?playerIds[0]:null,stage:1});}}
function nextMatch(room){let stage=Math.max(...room.matches.map(m=>m.stage));let matches=room.matches.filter(m=>m.stage===stage);let pending=matches.find(m=>!m.winnerId);if(pending)return pending;const winners=matches.map(m=>m.winnerId);if(winners.length===1){room.championId=winners[0];room.phase='finished';return null;}stage++;for(let i=0;i<winners.length;i+=2)room.matches.push({id:id(),playerIds:winners.slice(i,i+2),winnerId:null,stage});return room.matches.find(m=>m.stage===stage);}
export function prepare(room,now=Date.now()){
 if(!['lobby','result'].includes(room.phase))throw Error('目前無法準備下一場');if(room.players.length<2)throw Error('至少需要 2 位選手');room.locked=true;
 let match;if(room.mode==='tournament'){if(!room.matches.length)initialBracket(room);match=nextMatch(room);if(!match)return;}else if(room.phase==='result'){room.phase='finished';room.championId=room.round.winnerId;return;}
 room.round={id:id(),playerIds:match?.playerIds??room.players.map(p=>p.id),matchId:match?.id??null,seed:(room.seed+room.revision++)>>>0,pulls:{},pulledIds:[],deadline:0,winnerId:null};room.phase='ready';room.battle=null;
}
export function pull(room,playerId,roundId,power,now=Date.now(),angle=0){
 const round=room.round;
 if(!round||round.id!==roundId||!round.playerIds.includes(playerId)||!['countdown','shoot','running'].includes(room.phase)||!Number.isFinite(round.shootAt)||now<round.shootAt||now>=round.deadline||round.launchResumed)throw Error('本場拉環時間已結束');
 if(Object.hasOwn(round.pulls,playerId))throw Error('本場已完成拉環');
 if(typeof power!=='number'||!Number.isFinite(power)||power<0||power>1)throw Error('拉環資料無效');
 if(typeof angle!=='number'||!Number.isFinite(angle)||angle<0||angle>25)throw Error('發射角度無效');
 advanceLaunch(room,now);
 const top=room.battle?.tops.find(t=>t.id===playerId);
 if(!top?.alive||room.battle.done)throw Error('本場拉環時間已結束');
 round.angles??={};round.angles[playerId]=angle;round.pulls[playerId]=power;round.pulledIds.push(playerId);
 // Correct the current motion once; network delay must never rewind contacts or position.
 const strength=(power-.5)*2,rotation=angle*Math.PI/180*.2*(top.orbitDir||1),scale=1+strength*.1;
 const vx=top.vx,vz=top.vz;
 top.vx=(vx*Math.cos(rotation)-vz*Math.sin(rotation))*scale;
 top.vz=(vx*Math.sin(rotation)+vz*Math.cos(rotation))*scale;
 top.energy=Math.max(.01,top.energy+strength*11.4);
 top.launchPower=power;top.launchTilt=angle*Math.PI/180;
}
export function start(room){if(!['ready','shoot'].includes(room.phase))throw Error('請先準備比賽');room.battle=createBattle(room.round.playerIds.map(id=>room.players.find(p=>p.id===id)),room.round.seed,room.round.pulls,room.round.angles);for(const top of room.battle.tops){const radius=Math.hypot(top.x,top.z),inset=room.battle.arenaRadius*.55/radius;top.x*=inset;top.z*=inset;top.y=surfaceHeight(top.x,top.z,room.battle.arenaRadius)+1.3;top.vy=-.5;}room.phase='running';}
export function finish(room){room.round.winnerId=room.battle.winnerId;room.round.rankings=[room.battle.winnerId,...room.battle.eliminated.slice().reverse()];const match=room.matches.find(m=>m.id===room.round.matchId);if(match)match.winnerId=room.battle.winnerId;room.phase='result';if(room.mode==='brawl')room.championId=room.battle.winnerId;else if(room.matches.filter(m=>m.stage===match.stage).length===1){room.championId=match.winnerId;room.phase='finished';}}
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
 room.phase='countdown';room.round.countdownAt=now;room.round.shootAt=now+5000;room.round.startsAt=room.round.shootAt;room.round.deadline=room.round.shootAt+1200;room.round.launchResumed=!!(room.recovered&&room.battle);
}
export function advanceLaunch(room,now=Date.now()){
 if(room.phase==='countdown'&&now>=room.round.shootAt)room.phase='shoot';
 if(room.phase==='shoot'&&now>=room.round.shootAt){if(room.recovered&&room.battle)room.phase='running';else start(room);room.recovered=false;}
}
