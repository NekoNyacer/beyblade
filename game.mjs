import { railConfigForCount, isRingOutAngle, surfaceHeight, surfaceSlope, shoulderHeight, spinSpeed } from './public/assets/rail-config.js';
import {physicsForParts} from './public/assets/part-catalog.js';
import { randomBytes } from 'node:crypto';
export const COLORS=['#ff486a','#37d9ff','#ffd05b','#ac7cff','#50e6ac','#ff904c','#e270ff','#62a3ff','#b2e65e','#ff74a5','#48dac6','#efb172','#9695ff','#f4e66b','#a0daff','#e3b4e8'];
export const id=()=>randomBytes(12).toString('hex');
export function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function shuffle(values,seed){const r=rng(seed),a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Local arcade physics: measured swipe power and launch tilt seed the actual motion.
// Integrate at <=10ms: even the 14-unit/s safety cap cannot tunnel through a 1.02 diameter.
const TOP_DIAMETER=1.02, MAX_SPEED=14;
const LAUNCH_SKID_SECONDS=5, GRIP_TRANSITION_SECONDS=1.25;

// Sample the center-of-mass offset in arena units, independently of the launch draw.
function massOffsetFor(seed,slot){
 const random=rng(seed^Math.imul(slot+1,0x9e3779b9));
 return .025+.035*random();
}
function precessionRate(top){
 return (1.3+12*top.massOffset)*(1+.55/(1+top.angularSpeed/120));
}

// A rolling tip trades spin for travel along its current heading. A rebound
// keeps its new direction, and a spent top has no spin left to drive its tip.
function rollOnTip(top,grip,h){
 const speed=Math.hypot(top.vx,top.vz);
 const rollingSpeed=6.8*top.physics.drive*Math.max(0,Math.min(1,(top.energy-12)/46));
 if(speed<.02||speed>=rollingSpeed)return;
 const gain=Math.min(1.8*top.physics.grip*grip*h,(rollingSpeed-speed)*(-Math.expm1(-.8*top.physics.grip*grip*h)));
 const scale=1+gain/speed;
 top.vx*=scale;top.vz*=scale;
 top.energy-=.035*gain*(speed+.5*gain);
}

// During rolling contact the energy lost to an impact scales with normal speed squared.
function impactSpinLoss(speed,skidLoss,rollingCoefficient,grip){
 return skidLoss+grip*(rollingCoefficient*speed*speed-skidLoss);
}

export function createBattle(players,seed,pulls={},angles={}){
 const random=rng(seed),phase=random()*Math.PI*2,rail=railConfigForCount(players.length);
 return {arenaRadius:rail.arenaRadius,railRadius:rail.railRadius,seed,t:0,tick:0,eventSequence:0,done:false,winnerId:null,eliminated:[],hitTicks:{},hitTimes:{},events:[],tops:players.map((p,i)=>{
  const physics=physicsForParts(p.parts);
  const angle=phase+i/players.length*Math.PI*2+random()*.2,power=pulls[p.id]??.5,tilt=(angles[p.id]??0)*Math.PI/180;
  let tangent=(7+random()*2)*(i%2?-1:1)*(1+.4*Math.sin(tilt)),inward=(.35+random()*.65)*(1+Math.sin(tilt));
  const speed=5+8*power,scale=speed/Math.hypot(tangent,inward);tangent*=scale;inward*=scale;
  const x=Math.cos(angle)*(rail.railRadius-.18),z=Math.sin(angle)*(rail.railRadius-.18);
  return{id:p.id,parts:{...(p.parts??{blade:0,ratchet:0,bit:0})},physics,launchPower:power,launchTilt:tilt,motionPhase:angle,orbitDir:Math.sign(tangent),tilt,y:surfaceHeight(x,z,rail.arenaRadius),vy:0,railTravel:0,dashUntil:0,
   massOffset:massOffsetFor(seed,i)*physics.balance,precessionPhase:angle,
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
 const bankCurvature=2*rail.rimHeight/(rail.arenaRadius-rail.flatRadius)**2;
 const floorAt=(x,z,radius=Math.hypot(x,z))=>radius<=rail.arenaRadius?surfaceHeight(x,z,rail.arenaRadius):shoulderHeight(x,z,rail.arenaRadius)??.18;
 b.arenaRadius=rail.arenaRadius;b.railRadius=rail.railRadius;
 for(const [slot,a] of b.tops.entries()){
  a.physics=physicsForParts(a.parts);
  a.railActive??=false;a.railDir??=0;a.railCooldown??=0;a.railEntered??=b.t;a.railUntil??=b.t;
  a.railTouching??=false;a.railTravel??=0;a.dashUntil??=0;
  a.pocketActive??=false;a.pocketIndex??=null;a.pocketDepth??=0;a.pocketEntered??=0;a.pocketCooldown??=0;
  a.onApron??=!a.pocketActive&&Math.hypot(a.x,a.z)>rail.arenaRadius;
  a.y??=a.pocketActive?surfaceHeight(a.x,a.z,rail.arenaRadius)-a.pocketDepth:floorAt(a.x,a.z);a.vy??=0;
  a.tilt??=0;a.launchTilt??=0;a.launchPower??=.5;a.motionPhase??=Math.atan2(a.z,a.x);
  a.orbitDir??=Math.sign(a.x*a.vz-a.z*a.vx)||1;a.angularSpeed??=spinSpeed(a.energy);a.settling??=false;
  a.massOffset??=massOffsetFor(b.seed,slot)*a.physics.balance;
  a.precessionPhase??=a.motionPhase+b.t*precessionRate(a);
 }
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
  }else if(reason==='overload'){
   // The teeth kick the slipping bit upward, diverting part of its tangential velocity into flight.
   const tangent=-a.vx*nz+a.vz*nx;
   const redirected=tangent*(1-Math.cos(Math.PI/6));
   a.vx+=nz*redirected;a.vz-=nx*redirected;
   takeoff(a,Math.abs(tangent)*.5);
  }
  a.railActive=false;a.railTouching=false;a.railCooldown=b.t+rail.cooldown;
  railEvent(a,'exit',reason,exitIndex,before);
 };
 const guideRail=(a,h)=>{
  const r=Math.hypot(a.x,a.z)||1,nx=a.x/r,nz=a.z/r,radial=a.vx*nx+a.vz*nz,tangent=-a.vx*nz+a.vz*nx;
  const angle=Math.atan2(a.z,a.x),port=rail.exitAngles.findIndex(p=>Math.abs(Math.atan2(Math.sin(angle-p),Math.cos(angle-p)))<rail.exitHalfWidth);
  if(a.y>surfaceHeight(a.x,a.z,rail.arenaRadius)+.055||a.vy>.1)return false;
  if(!a.railActive){
   const innerFace=rail.railRadius-rail.captureWidth;
   if(port>=0||r<innerFace-.06){a.railTouching=false;return false;}
   const along=Math.abs(tangent);
   if(a.railTouching||b.t<a.railCooldown||r<innerFace||r>WALL_RADIUS+1e-8||radial<-.18*along)return false;
   if(radial<.02&&along<.02)return false;
   a.railTouching=true;
   // Test the bit's tooth orientation once on contact. It must leave the teeth before another try.
   const toothPhase=a.physics.gearTeeth*(a.spin-angle);
   const aligned=Math.cos(toothPhase)>a.physics.meshThreshold;
   const canMesh=aligned&&along>rail.minTangent&&radial<=.75*along&&a.energy>rail.minEnergy&&a.tilt<.44;
   if(!canMesh){
    // A grazing bit meets the leading flank. On a square strike the exposed
    // side of the spinning tooth determines the sideways part of the rebound.
    const flankTangent=(.24*tangent+.36*Math.max(0,radial)*Math.sin(toothPhase))/Math.hypot(tangent,radial);
    const flankRadial=Math.sqrt(1-flankTangent*flankTangent);
    const normalX=flankRadial*nx-flankTangent*nz,normalZ=flankRadial*nz+flankTangent*nx;
    const incoming=a.vx*normalX+a.vz*normalZ;
    const impulse=1.72*incoming;
    a.vx-=impulse*normalX;a.vz-=impulse*normalZ;
    a.energy=Math.max(0,a.energy-.035*incoming*incoming);
    contactEvent(a,'rail-bounce',incoming,{nx:normalX,nz:normalZ});
    return false;
   }
   a.railTravel=0;a.railActive=true;a.railDir=Math.sign(tangent);a.railEntered=b.t;a.railUntil=b.t+rail.maxDuration;
   railEvent(a,'enter','contact');
  }
  a.railTravel+=Math.abs(tangent)*h/r;
  if(port>=0){leaveRail(a,'port',port);return false;}
  if(b.t>=a.railUntil){leaveRail(a,'timeout');return false;}
  if(a.energy<=rail.minEnergy||Math.abs(r-rail.railRadius)>.38){leaveRail(a,'lost-contact');return false;}
  if(Math.abs(tangent)>11.2&&a.launchPower>.82&&b.t-a.railEntered>.22){leaveRail(a,'overload');return true;}
  // Finite radial guide force: the top remains freely integrated, not position-locked.
  const radialForce=Math.max(-52,Math.min(52,-tangent*tangent/r-95*(r-rail.railRadius)-16*radial));
  const drive=Math.max(0,rail.boostAcceleration*a.physics.drive*(1-Math.abs(tangent)/rail.maxSpeed)*(a.energy/95));
  a.vx+=(nx*radialForce-nz*a.railDir*drive)*h;
  a.vz+=(nz*radialForce+nx*a.railDir*drive)*h;
  a.energy-=rail.energyCost*a.physics.drive*h;
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
 const wall=(a,grip)=>{
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
  if(approach>0){
   a.vx-=1.72*approach*nx;a.vz-=1.72*approach*nz;
   a.energy=Math.max(0,a.energy-grip*.04*approach*approach);
  }
 };
 for(let step=0;step<steps&&!b.done;step++){
  b.t=startTime+(step+1)*h;
  // Blend out of the launch skid. Subsequent wear depends on each top's spin and impacts.
  const grip=Math.max(0,Math.min(1,(b.t-h-LAUNCH_SKID_SECONDS)/GRIP_TRANSITION_SECONDS));
  const living=b.tops.filter(t=>t.alive);
  for(const a of living){
   a.precessionPhase+=precessionRate(a)*h;
   if(a.pocketActive){pocketStep(a,h);}else{
   const radius=Math.hypot(a.x,a.z),nx=radius?a.x/radius:0,nz=radius?a.z/radius:0;
   const grounded=a.y<=floorAt(a.x,a.z,radius)+.055&&a.vy<=.1;
   if(!grounded)a.railTouching=false;
   if(grounded&&!guideRail(a,h)){
    const dash=b.t<a.dashUntil,high=dash?0:Math.max(0,Math.min(1,(a.energy-55)/30)),medium=dash?0:Math.max(0,Math.min(1,(a.energy-20)/30))*(1-high);
    const radial=a.vx*nx+a.vz*nz,tangent=-a.vx*nz+a.vz*nx;
    const slope=radius<rail.arenaRadius?surfaceSlope(a.x,a.z,rail.arenaRadius):0;
    // The normal reaction on the curved bank redirects horizontal momentum downhill.
    // Its load includes gravity and the curvature along the top's actual path.
    const load=24+(slope>0?bankCurvature*radial*radial+slope*tangent*tangent/radius:0);
    const downhill=-slope*load/(1+slope*slope);
    // The tip scrubs off tangential speed on the bank, up to the sliding friction limit.
    const bankContact=Math.min(1,slope);
    const bankFriction=a.physics.grip*bankContact*Math.max(-5.7,Math.min(5.7,.95*tangent));
    const radialDrag=.35*bankContact*radial;
    a.vx+=(nx*(downhill-radialDrag)+nz*bankFriction)*h;
    a.vz+=(nz*(downhill-radialDrag)-nx*bankFriction)*h;
    // An off-center tip rolls in an arc. Precession varies the lean over a
    // turn, opening and tightening the arc while preserving the current speed.
    if((high+medium)>0&&a.vy<=.1&&!a.onApron){
     const tipTurn=a.massOffset*(18*a.orbitDir+28*Math.sin(a.precessionPhase));
     // Across a bank the contact shifts sideways on the spinning tip. Its
     // leverage depends on where the lean points relative to the local slope.
     const leanOnBank=nx*Math.cos(a.precessionPhase)+nz*Math.sin(a.precessionPhase);
     const bankTurn=a.orbitDir*(1.35+leanOnBank)*bankContact*radial/Math.max(1,Math.hypot(a.vx,a.vz));
     const turn=((high+medium)*(tipTurn+bankTurn)+medium*a.launchTilt)*h;
     const cos=Math.cos(turn),sin=Math.sin(turn),vx=a.vx;
     a.vx=cos*vx-sin*a.vz;a.vz=sin*vx+cos*a.vz;
    }
    if(!dash&&!a.onApron&&a.vy<=.1)rollOnTip(a,(.5+.5*grip)/(1+slope*slope),h);
   }
   // A leaning tip loses travel speed progressively as its spin winds down.
   const low=Math.max(0,1-a.energy/(grounded?48:30));
   const damping=Math.exp(-(.025+3.8*low*low+(grounded?grip*.55*(1-a.physics.drive):0))*h);
   a.vx*=damping;a.vz*=damping;
   const speed=Math.hypot(a.vx,a.vz);if(speed>MAX_SPEED){a.vx*=MAX_SPEED/speed;a.vz*=MAX_SPEED/speed;}
   const followsFloor=grounded&&a.vy===0&&!a.onApron;
   a.x+=a.vx*h;a.z+=a.vz*h;
   if(!followsFloor){a.vy-=24*h;a.y+=a.vy*h;}
   wall(a,grip);
   if(!a.pocketActive){const radius=Math.hypot(a.x,a.z),floor=floorAt(a.x,a.z,radius);
    if(followsFloor)a.y=floor;
    else if(a.y<floor){
     const landing=-a.vy;a.y=floor;a.vy=0;
     if(landing>2){a.energy-=impactSpinLoss(landing,landing*.27,.02,grip);contactEvent(a,'land',landing);}
     if(radius>rail.arenaRadius){const nx=a.x/radius,nz=a.z/radius,approach=a.vx*nx+a.vz*nz;if(approach>0){a.vx-=1.5*approach*nx;a.vz-=1.5*approach*nz;}}
    }
    if(a.y>rail.shieldHeight){a.y=rail.shieldHeight;if(a.vy>0){a.energy-=a.vy*.8;contactEvent(a,'shield',a.vy,{nx:0,nz:0});a.vy*=-.45;}}
   }
   }
   const wobble=Math.max(0,1-a.energy/40);
   const rollingDrag=.72+(a.energy/120)**2+5*wobble*wobble;
   a.energy=Math.max(0,a.energy-a.drag*a.physics.spinLoss*(1+grip*(rollingDrag-1))*h);
   if(a.energy===0&&!a.settling)a.settleStartSpeed=Math.max(.12,a.angularSpeed);
   a.settling=a.energy===0;
   const targetSpin=spinSpeed(a.energy);
   a.angularSpeed=a.settling?a.angularSpeed*Math.exp(-2.6*h):targetSpin+(a.angularSpeed-targetSpin)*Math.exp(-3*h);
   a.spin+=h*a.angularSpeed;a.tilt*=Math.exp(-(a.settling?4:.08)*h);
  }
  // Iterative separation also handles simultaneous contacts in a crowded 16-player bowl.
  for(let pass=0;pass<8;pass++){for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++){
   const a=living[i],c=living[j];if(!a.alive||!c.alive||a.pocketActive||c.pocketActive||Math.abs(a.y+a.physics.heightOffset-c.y-c.physics.heightOffset)>.42)continue;
   const dx=c.x-a.x,dz=c.z-a.z,d=Math.hypot(dx,dz);
   if(d>=TOP_DIAMETER)continue;
   const nx=d?dx/d:1,nz=d?dz/d:0,overlap=(TOP_DIAMETER-d)/2;
   a.x-=nx*overlap;a.z-=nz*overlap;c.x+=nx*overlap;c.z+=nz*overlap;
   // Separating on the slope can move a tip uphill. Start its rebound at the corrected floor.
   for(const top of [a,c])top.y=Math.max(top.y,floorAt(top.x,top.z));
   const approach=(a.vx-c.vx)*nx+(a.vz-c.vz)*nz;
   if(approach<=0)continue;
   a.lastHit=c.lastHit=b.tick;a.lastHitTime=c.lastHitTime=b.t;
   const impulse=approach*(1+(a.physics.restitution+c.physics.restitution)/2)/(1/a.physics.mass+1/c.physics.mass);
   a.vx-=impulse*nx/a.physics.mass;a.vz-=impulse*nz/a.physics.mass;c.vx+=impulse*nx/c.physics.mass;c.vz+=impulse*nz/c.physics.mass;
   // A hard contact on a blade's bevel redirects the outgoing normal speed upward.
   // The higher blade rides up over the lower one; a grazing hit keeps its tangential motion.
   if(approach>4.5){
    const engagement=Math.min(1,(approach-4.5)/4.5);
    for(const [top,other,sign] of [[a,c,-1],[c,a,1]]){
     const outgoing=sign*(top.vx*nx+top.vz*nz);
     if(outgoing<=0)continue;
     const radius=Math.hypot(top.x,top.z);
     const uphill=radius?surfaceSlope(top.x,top.z,rail.arenaRadius)*sign*(nx*top.x+nz*top.z)/radius:0;
     const bevel=Math.max(0,Math.min(1.26,top.physics.lift+.65*Math.atan(uphill)+.9*(top.y+top.physics.heightOffset-other.y-other.physics.heightOffset)+.22*Math.abs(top.tilt)));
     if(bevel===0)continue;
     const angle=bevel*engagement,redirected=outgoing*(1-Math.cos(angle));
     top.vx-=sign*nx*redirected;top.vz-=sign*nz*redirected;
     const lift=outgoing*Math.sin(angle);
     // A spinning blade catching on the bevel can contribute part of its spin energy.
     const spinLift=engagement*Math.min(1.35,top.energy/95)*.18*outgoing;
     takeoff(top,lift+spinLift);
     top.energy=Math.max(0,top.energy-.035*spinLift*(lift+.5*spinLift));
    }
   }
   // Contact impulse can overwhelm the rail retaining force in either direction.
   for(const top of [a,c])if(top.railActive){
    const r=Math.hypot(top.x,top.z)||1,radial=(top.vx*top.x+top.vz*top.z)/r,tangent=(-top.vx*top.z+top.vz*top.x)/r;
    if(top.vy>.1||Math.abs(radial)>2.2||tangent*top.railDir<1.5)leaveRail(top,'collision');
   }
   const key=JSON.stringify([a.id,c.id].sort());
   if(approach>.5&&b.t-(b.hitTimes[key]??-Infinity)>.12){
    b.hitTimes[key]=b.t;b.hitTicks[key]=b.tick;
    const loss=impactSpinLoss(approach,approach*(.035+.010*approach),.009,grip),ae=a.energy,ce=c.energy;
    a.energy=Math.max(0,ae-loss*(1+(100-ce)*.002)/a.physics.inertia);
    c.energy=Math.max(0,ce-loss*(1+(100-ae)*.002)/c.physics.inertia);
    emit({type:'hit',aId:a.id,bId:c.id,nx,nz,x:(a.x+c.x)/2,z:(a.z+c.z)/2,y:(a.y+c.y)/2,power:approach});
   }
  }
  for(const a of living)wall(a,grip);
  }
  for(const a of living){if(!a.alive)continue;wall(a,grip);const speed=Math.hypot(a.vx,a.vz);if(speed>MAX_SPEED){a.vx*=MAX_SPEED/speed;a.vz*=MAX_SPEED/speed;}}
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
 room.phase='countdown';room.round.countdownAt=now+intro;room.round.shootAt=room.round.countdownAt+5000;room.round.startsAt=room.round.shootAt;room.round.deadline=room.round.shootAt+1200;room.round.launchResumed=!!(room.recovered&&room.battle);
}
export function advanceLaunch(room,now=Date.now()){
 if(room.phase==='countdown'&&now>=room.round.shootAt)room.phase='shoot';
 if(room.phase==='shoot'&&now>=room.round.shootAt){if(room.recovered&&room.battle)room.phase='running';else start(room);room.recovered=false;}
}
