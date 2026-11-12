import { railConfigForCount, pocketIndexAtAngle, isRingOutAngle, surfaceHeight, surfaceSlope, GROOVE_RADIUS_RATIO, GROOVE_HALF_WIDTH_RATIO, grooveCurvature, surfaceGradient, touchesDashBank, shoulderHeight, spinSpeed, STANDARD_LAUNCH_ENERGY } from './rail-config.js';
import {physicsForParts} from './part-catalog.js';

export function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
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
 const random=rng(seed),phase=random()*Math.PI*2,rail=railConfigForCount(players.length),firstDir=random()<.5?-1:1;
 return {arenaRadius:rail.arenaRadius,railRadius:rail.railRadius,seed,t:0,tick:0,eventSequence:0,done:false,winnerId:null,eliminated:[],hitTicks:{},hitTimes:{},events:[],tops:players.map((p,i)=>{
  const physics=physicsForParts(p.parts);
  const angle=phase+i/players.length*Math.PI*2+random()*.2,power=pulls[p.id]??.5,tilt=(angles[p.id]??0)*Math.PI/180;
  let tangent=(7+random()*2)*(i%2?-firstDir:firstDir)*(1+.4*Math.sin(tilt)),inward=(.35+random()*3)*(1+Math.sin(tilt));
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
 const grooveRadius=rail.arenaRadius*GROOVE_RADIUS_RATIO,grooveHalfWidth=rail.arenaRadius*GROOVE_HALF_WIDTH_RATIO;
 const bankCurvature=2*rail.rimHeight/(rail.arenaRadius-rail.flatRadius)**2;
 const floorAt=(x,z,radius=Math.hypot(x,z))=>radius<=rail.arenaRadius?surfaceHeight(x,z,rail.arenaRadius):shoulderHeight(x,z,rail.arenaRadius)??rail.pocketFloor;
 b.arenaRadius=rail.arenaRadius;b.railRadius=rail.railRadius;
 for(const [slot,a] of b.tops.entries()){
  a.physics=physicsForParts(a.parts);
  a.railActive??=false;a.railDir??=0;a.railCooldown??=0;a.railEntered??=b.t;a.railUntil??=b.t;
  a.railTouching??=false;a.railTravel??=0;a.dashUntil??=0;a.centerRollUntil??=0;
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
 const dashLift=(top,charge)=>{
  if(!charge)return 0;
  const kick=10.2*charge*Math.sqrt(top.physics.lift/.66)/Math.sqrt(top.physics.mass);
  const floor=surfaceHeight(top.x,top.z,rail.arenaRadius);
  if(top.y>floor+.08)return kick;
  const gradient=surfaceGradient(top.x,top.z,rail.arenaRadius),speed=Math.hypot(top.vx,top.vz);
  const slope=speed?(top.vx*gradient.x+top.vz*gradient.z)/speed:0;
  if(slope<=0)return kick;
  // A hit going uphill carries its travel speed along the bank before the blade lifts off.
  top.y=Math.max(top.y,floor);
  const horizontal=1/Math.hypot(1,slope);
  top.vx*=horizontal;top.vz*=horizontal;
  return Math.min(MAX_SPEED,kick+Math.min(MAX_SPEED,speed)*slope*horizontal);
 };
 const railEvent=(a,phase,reason,exitIndex=-1,speedBefore=Math.hypot(a.vx,a.vz))=>{
  const r=Math.hypot(a.x,a.z)||1;
  emit({type:'rail',phase,id:a.id,x:a.x,z:a.z,nx:a.x/r,nz:a.z/r,direction:a.railDir,
   reason,exitIndex,railTravel:a.railTravel,speedBefore,speedAfter:Math.hypot(a.vx,a.vz)});
 };
 const leaveRail=(a,reason,exitIndex=-1)=>{
  const before=Math.hypot(a.vx,a.vz),r=Math.hypot(a.x,a.z)||1,nx=a.x/r,nz=a.z/r;
  if(reason==='port'){
   const speed=Math.min(rail.maxSpeed,before+2.6);
   a.dashUntil=b.t+Math.min(.75,2*rail.railRadius/speed+.08);
   const tangent=Math.min(.42,.12+.48*Math.abs(a.tilt)),inward=Math.sqrt(1-tangent**2);
   a.vx=speed*(-nx*inward-nz*a.railDir*tangent);
   a.vz=speed*(-nz*inward+nx*a.railDir*tangent);
   a.vy=0;
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
   if(a.railTouching||b.t<a.railCooldown||r<innerFace||r>WALL_RADIUS+1e-8||radial<-.35*along)return false;
   if(radial<.02&&along<.02)return false;
   a.railTouching=true;
   // Test the bit's tooth orientation once on contact. It must leave the teeth before another try.
   const toothPhase=a.physics.gearTeeth*(a.spin-angle);
   const aligned=Math.cos(toothPhase)>a.physics.meshThreshold-rail.meshAllowance;
   const lean=Math.min(1,Math.abs(a.tilt)/.16);
   const captureEnergy=Math.max(rail.releaseEnergy+1,rail.minEnergy-.32*lean*Math.max(0,along-2)**2);
   // Both travel directions can mesh on contact, up to about 51 degrees from
   // the tangent. A square strike, bad tooth phase or spent bit still rebounds.
   const canMesh=aligned&&along>rail.minTangent&&radial<=rail.maxEntryRadialRatio*along&&a.energy>captureEnergy&&Math.abs(a.tilt)<.62;
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
   a.dashUntil=0;a.centerRollUntil=0;a.railTravel=0;a.railActive=true;a.railDir=Math.sign(tangent);a.railEntered=b.t;a.railUntil=b.t+rail.maxDuration;
   railEvent(a,'enter','contact');
  }
  a.railTravel+=Math.abs(tangent)*h/r;
  if(port>=0){leaveRail(a,'port',port);return false;}
  if(b.t>=a.railUntil){leaveRail(a,'timeout');return false;}
  if(a.energy<=rail.releaseEnergy||Math.abs(r-rail.railRadius)>.38){leaveRail(a,'lost-contact');return false;}
  if(Math.abs(tangent)>11.2&&a.launchPower>.9&&a.energy>106&&b.t-a.railEntered>.22){leaveRail(a,'overload');return true;}
  // Finite radial guide force: the top remains freely integrated, not position-locked.
  const radialForce=Math.max(-78,Math.min(78,-tangent*tangent/r-95*(r-rail.railRadius)-16*radial));
  const drive=Math.max(0,rail.boostAcceleration*a.physics.drive*(1-Math.abs(tangent)/rail.maxSpeed)*(a.energy/95));
  a.vx+=(nx*radialForce-nz*a.railDir*drive)*h;
  a.vz+=(nz*radialForce+nx*a.railDir*drive)*h;
  a.energy-=rail.energyCost*a.physics.drive*h;
  return true;
 };
 const pocketEvent=(a,phase)=>emit({type:'pocket',phase,id:a.id,pocketIndex:a.pocketIndex,x:a.x,y:a.y,z:a.z,pocketDepth:a.pocketDepth,energy:a.energy});
 const enterPocket=(a,index)=>{
  if(a.railActive)leaveRail(a,'pocket');
  a.dashUntil=0;a.centerRollUntil=0;
  a.pocketActive=true;a.pocketIndex=index;a.pocketEntered=b.t;
  pocketEvent(a,'enter');
 };
 const pocketStep=(a,h)=>{
  const angle=rail.ringOutAngles[a.pocketIndex],nx=Math.cos(angle),nz=Math.sin(angle);
  let radial=a.x*nx+a.z*nz,lateral=-a.x*nz+a.z*nx,vr=a.vx*nx+a.vz*nz,vt=-a.vx*nz+a.vz*nx;
  const damping=Math.exp(-(a.settling?4:.18)*h);vr*=damping;vt*=damping;
  radial+=vr*h;lateral+=vt*h;a.vy-=24*h;a.y+=a.vy*h;
  // The angled end wall redirects existing momentum upward and inward, without a spring.
  const halfWidth=rail.pocketHalfWidth*Math.tan(rail.ringOutHalfWidths[a.pocketIndex])/Math.tan(rail.ringOutHalfWidth);
  if(Math.abs(lateral)>halfWidth){lateral=Math.sign(lateral)*halfWidth;if(vt*lateral>0){a.energy-=Math.abs(vt)*.35;vt*=-.68;}}
  const shieldRadius=rail.arenaRadius+rail.pocketOuterOffset-Math.max(0,a.y-rail.rimHeight-.4)*.28;
  const outer=Math.sqrt(shieldRadius**2-lateral**2);
  if(radial>outer){radial=outer;if(vr>0){const impact=Math.hypot(vr,a.vy),rebound=impact*.9;vr=-.5*rebound;a.vy=.8660254*rebound;a.energy-=1+impact*.7;contactEvent(a,'pocket-impact',impact);}}
  if(a.y>rail.shieldHeight){a.y=rail.shieldHeight;if(a.vy>0){a.energy-=a.vy*.45;contactEvent(a,'shield',a.vy,{nx:0,nz:0});a.vy*=-.45;}}
  const floor=rail.pocketFloor;
  if(a.y<floor){a.y=floor;if(a.vy<0){const impact=-a.vy;a.vy=impact>1?impact*.36:0;vr*=.82;vt*=.82;if(impact>1){a.energy-=1+impact*.8;contactEvent(a,'pocket-impact',impact);}}}
  const inner=Math.sqrt(rail.arenaRadius**2-lateral**2);
  if(radial<inner&&vr<0){
   if(a.y>=rail.rimHeight+.04){
    a.pocketActive=false;a.pocketCooldown=b.t+.5;a.railCooldown=b.t+.15;a.pocketDepth=0;
    a.x=nx*radial-nz*lateral;a.z=nz*radial+nx*lateral;a.vx=nx*vr-nz*vt;a.vz=nz*vr+nx*vt;
    pocketEvent(a,'exit');a.pocketIndex=null;return;
   }
   radial=inner+.005;vr=Math.abs(vr)*.45;
  }
  a.x=nx*radial-nz*lateral;a.z=nz*radial+nx*lateral;a.vx=nx*vr-nz*vt;a.vz=nz*vr+nx*vt;
  a.pocketDepth=Math.max(0,surfaceHeight(a.x,a.z,rail.arenaRadius)-a.y);a.energy-=11*h;
 };
 const reflectWall=(a,nx,nz,approach,factor)=>{
  a.vx-=factor*approach*nx;a.vz-=factor*approach*nz;
  a.dashUntil=0;a.centerRollUntil=0;
 };
 const wall=(a,grip)=>{
  if(!a.alive||a.pocketActive)return;
  const d=Math.hypot(a.x,a.z);if(d<=WALL_RADIUS){a.onApron=false;return;}
  const nx=a.x/d,nz=a.z/d,approach=a.vx*nx+a.vz*nz;
  if(d<rail.arenaRadius&&a.vy>5&&approach>0)return;
  // Only an actual flight above the crest can reach the external catch wells.
  if((a.y>=rail.rimHeight+.04&&approach>0)||a.onApron){
   a.onApron=true;
   const index=pocketIndexAtAngle(Math.atan2(a.z,a.x));
   const occupied=b.tops.some(other=>other!==a&&other.alive&&other.pocketActive&&other.pocketIndex===index);
   const shieldRadius=rail.arenaRadius+rail.pocketOuterOffset-Math.max(0,a.y-rail.rimHeight-.4)*.28;
   if(d>shieldRadius){a.x=nx*shieldRadius;a.z=nz*shieldRadius;}
   if(approach>0&&d>rail.arenaRadius+.02&&index>=0&&!occupied&&b.t>=a.pocketCooldown){enterPocket(a,index);return;}
   if(d>shieldRadius&&approach>0){
    const tangent=-a.vx*nz+a.vz*nx;
    a.vx+=.35*tangent*nz;a.vz-=.35*tangent*nx;
    reflectWall(a,nx,nz,approach,1.88);
    a.energy-=1+.032*approach*approach;a.tilt=Math.min(.6,a.tilt+.16);contactEvent(a,'shield',approach,{nx,nz});
   }
   return;
  }
  a.x=nx*WALL_RADIUS;a.z=nz*WALL_RADIUS;
  if(approach>0){
   reflectWall(a,nx,nz,approach,1.72);
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
   const radius=Math.hypot(a.x,a.z);
   const nearGroove=Math.abs(radius-grooveRadius)<=grooveHalfWidth+MAX_SPEED*h;
   const contactTolerance=nearGroove&&a.vy!==0?.0001:.055;
   const grounded=a.y<=floorAt(a.x,a.z,radius)+contactTolerance&&a.vy<=.1;
   if(!grounded)a.railTouching=false;
   if(grounded&&b.t<a.dashUntil&&radius<rail.flatRadius*.45&&a.centerRollUntil===0){
    // The tip grips after the central crossing; retain heading and spend travel speed before rolling in an arc.
    a.vx*=.72;a.vz*=.72;a.centerRollUntil=b.t+.7+.004*a.energy;
    a.dashUntil=Math.min(a.dashUntil,b.t+.36);
   }
   if(grounded&&!guideRail(a,h)){
    const dash=b.t<a.dashUntil,centerGrip=Math.max(0,Math.min(1,(a.centerRollUntil-b.t)/.65,a.energy/30)),high=dash&&!centerGrip?0:Math.max(0,Math.min(1,(a.energy-55)/30)),medium=dash?0:Math.max(0,Math.min(1,(a.energy-20)/30))*(1-high);
    const rim=rail.arenaRadius,molded=radius<rim&&touchesDashBank(a.x,a.z,rim);
    let nx=radius?a.x/radius:0,nz=radius?a.z/radius:0,slope;
    if(molded){
     const gradient=surfaceGradient(a.x,a.z,rim);
     slope=Math.hypot(gradient.x,gradient.z);
     if(slope>0){nx=gradient.x/slope;nz=gradient.z/slope;}
    }else slope=radius<rim?surfaceSlope(a.x,a.z,rim):0;
    const radial=a.vx*nx+a.vz*nz,tangent=-a.vx*nz+a.vz*nx;
    // Normal load includes the curvature along the path. In the molded outlet
    // the changing cross-slope also contributes when the tip travels sideways.
    const curvature=radius<rail.flatRadius?grooveCurvature(radius,rim):bankCurvature;
    let load=24+(slope!==0?curvature*radial*radial+slope*tangent*tangent/radius:0);
    if(molded&&slope>0){
     const sampleTime=.01,dx=a.vx*sampleTime,dz=a.vz*sampleTime;
     const before=surfaceHeight(a.x-dx,a.z-dz,rim),after=surfaceHeight(a.x+dx,a.z+dz,rim);
     load=Math.max(0,24+(before+after-2*surfaceHeight(a.x,a.z,rim))/(sampleTime*sampleTime));
    }
    const downhill=-slope*Math.max(0,load)/(1+slope*slope);
    // The tip scrubs off tangential speed on the bank, up to the sliding friction limit.
    const bankContact=Math.min(1,Math.abs(slope));
    const bankFriction=a.physics.grip*bankContact*Math.max(-rail.maxBankFriction,Math.min(rail.maxBankFriction,rail.bankFriction*tangent));
    const radialDrag=rail.bankRadialDrag*bankContact*radial;
    a.vx+=(nx*(downhill-radialDrag)+nz*bankFriction)*h;
    a.vz+=(nz*(downhill-radialDrag)-nx*bankFriction)*h;
    // An off-center tip rolls in an arc. Precession varies the lean over a
    // turn, opening and tightening the arc while preserving the current speed.
    if((high+medium)>0&&a.vy<=.1&&!a.onApron){
     const tipTurn=a.massOffset*(18*a.orbitDir+42*Math.sin(a.precessionPhase));
     // Across a bank the contact shifts sideways on the spinning tip. Its
     // leverage depends on where the lean points relative to the local slope.
     const leanOnBank=nx*Math.cos(a.precessionPhase)+nz*Math.sin(a.precessionPhase);
     const bankTurn=a.orbitDir*(1.35+leanOnBank)*bankContact*radial/Math.max(1,Math.hypot(a.vx,a.vz));
     const freeTurn=(high+medium)*(tipTurn+bankTurn)+medium*a.launchTilt;
     const centerTurn=a.orbitDir*Math.hypot(a.vx,a.vz)/(rail.flatRadius*.43);
     const turn=(freeTurn+(centerTurn-freeTurn)*centerGrip)*h;
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
   let followsFloor=grounded&&a.vy===0&&!a.onApron;
   if(followsFloor&&nearGroove){
    // A fast crossing can clear the dip in free flight. Compare the next
    // floor to the tip continuing along its tangent under gravity.
    const radial=(a.x*a.vx+a.z*a.vz)/radius;
    const vertical=surfaceSlope(a.x,a.z,rail.arenaRadius)*radial;
    const nextFloor=floorAt(a.x+a.vx*h,a.z+a.vz*h);
    if(a.y+(vertical-24*h)*h>nextFloor+.0001){a.vy=vertical;followsFloor=false;}
   }
   a.x+=a.vx*h;a.z+=a.vz*h;
   if(!followsFloor){a.vy-=24*h;a.y+=a.vy*h;}
   wall(a,grip);
   if(!a.pocketActive){const radius=Math.hypot(a.x,a.z),floor=floorAt(a.x,a.z,radius);
    if(followsFloor)a.y=floor;
    else if(a.y<floor){
     const landing=-a.vy;a.y=floor;a.vy=0;
     if(landing>2){a.energy-=impactSpinLoss(landing,landing*.2,.008,grip);contactEvent(a,'land',landing);}
     if(radius>rail.arenaRadius){const nx=a.x/radius,nz=a.z/radius,approach=a.vx*nx+a.vz*nz;if(approach>0){reflectWall(a,nx,nz,approach,1.5);}}
    }
    if(a.y>rail.shieldHeight){a.y=rail.shieldHeight;if(a.vy>0){a.energy-=a.vy*.45;contactEvent(a,'shield',a.vy,{nx:0,nz:0});a.vy*=-.45;}}
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
   const aNormal=a.vx*nx+a.vz*nz,cNormal=-c.vx*nx-c.vz*nz,approach=aNormal+cNormal;
   if(approach<=0)continue;
   a.lastHit=c.lastHit=b.tick;a.lastHitTime=c.lastHitTime=b.t;
   const key=JSON.stringify([a.id,c.id].sort());
   const fresh=approach>.5&&b.t-(b.hitTimes[key]??-Infinity)>.12;
   const spinLoad=Math.max(0,Math.min(1,((a.angularSpeed+c.angularSpeed)/2-240)/260));
   const angle=Math.atan2(nz,nx),bite=(2+Math.cos(3*(a.spin-angle))+Math.cos(3*(c.spin-angle-Math.PI)))/4;
   const biteLoad=Math.max(0,Math.min(1,(bite-.36)/.40));
   const spinKick=fresh?spinLoad*biteLoad*Math.min(9,approach*.9):0;
   const dashA=fresh&&b.t<a.dashUntil?Math.max(0,Math.min(1,aNormal/7,approach/6)):0;
   const dashC=fresh&&b.t<c.dashUntil?Math.max(0,Math.min(1,cNormal/7,approach/6)):0;
   const impulse=approach*(1+(a.physics.restitution+c.physics.restitution)/2)*(1-.38/.98*spinLoad)/(1/a.physics.mass+1/c.physics.mass);
   a.vx-=impulse*nx/a.physics.mass;a.vz-=impulse*nz/a.physics.mass;c.vx+=impulse*nx/c.physics.mass;c.vz+=impulse*nz/c.physics.mass;
   a.vx-=(spinKick+dashC*8)*nx/a.physics.mass;a.vz-=(spinKick+dashC*8)*nz/a.physics.mass;
   c.vx+=(spinKick+dashA*8)*nx/c.physics.mass;c.vz+=(spinKick+dashA*8)*nz/c.physics.mass;
   // A hard contact on a blade's bevel redirects the outgoing normal speed upward.
   // The higher blade rides up over the lower one; a grazing hit keeps its tangential motion.
   if(approach>4.5){
    const engagement=Math.min(1,(approach-4.5)/4.5);
    for(const [top,other,sign] of [[a,c,-1],[c,a,1]]){
     const outgoing=sign*(top.vx*nx+top.vz*nz);
     if(outgoing<=0)continue;
     const radius=Math.hypot(top.x,top.z);
     let uphill;
     if(touchesDashBank(top.x,top.z,rail.arenaRadius)){
      const gradient=surfaceGradient(top.x,top.z,rail.arenaRadius);
      uphill=sign*(nx*gradient.x+nz*gradient.z);
     }else uphill=radius?surfaceSlope(top.x,top.z,rail.arenaRadius)*sign*(nx*top.x+nz*top.z)/radius:0;
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
   if(fresh){
    takeoff(a,dashLift(a,dashC));takeoff(c,dashLift(c,dashA));
   }
   // Contact impulse can overwhelm the rail retaining force in either direction.
   for(const top of [a,c])if(top.railActive){
    const r=Math.hypot(top.x,top.z)||1,radial=(top.vx*top.x+top.vz*top.z)/r,tangent=(-top.vx*top.z+top.vz*top.x)/r;
    if(top.vy>.1||Math.abs(radial)>2.2||tangent*top.railDir<1.5)leaveRail(top,'collision');
   }
   if(fresh){
    b.hitTimes[key]=b.t;b.hitTicks[key]=b.tick;
    const loss=impactSpinLoss(approach,.25+approach*.13,.004,grip)+spinKick*.06,ae=a.energy,ce=c.energy;
    a.energy=Math.max(0,ae-(loss*(1+(100-ce)*.002)+dashC*2.5)/a.physics.inertia);
    c.energy=Math.max(0,ce-(loss*(1+(100-ae)*.002)+dashA*2.5)/c.physics.inertia);
    a.dashUntil=c.dashUntil=0;a.centerRollUntil=c.centerRollUntil=0;
    const attacker=dashA&&!dashC?a:dashC&&!dashA?c:null;
    emit({type:'hit',aId:a.id,bId:c.id,nx,nz,x:(a.x+c.x)/2,z:(a.z+c.z)/2,y:(a.y+c.y)/2,power:approach+2*spinKick+8*(dashA+dashC),...(attacker?{dashAttackerId:attacker.id}:{})});
   }
  }
  for(const a of living)wall(a,grip);
  }
  for(const a of living){if(!a.alive)continue;wall(a,grip);const speed=Math.hypot(a.vx,a.vz);if(speed>MAX_SPEED){a.vx*=MAX_SPEED/speed;a.vz*=MAX_SPEED/speed;}}
  // Resolve simultaneous exhaustion in energy order, retaining one physical survivor.
  for(const a of [...living].sort((a,c)=>a.energy-c.energy)){
   if(a.alive&&a.settling&&a.angularSpeed<.12&&Math.hypot(a.vx,a.vz)<.08&&Math.abs(a.vy)<.08&&remaining>1){if(a.railActive)leaveRail(a,'exhausted');a.alive=false;a.outReason=a.pocketActive?'pocket':'spinout';a.energy=0;a.angularSpeed=0;a.vx=0;a.vz=0;a.vy=0;remaining--;b.eliminated.push(a.id);emit({type:'out',id:a.id,x:a.x,z:a.z,reason:a.outReason});}
  }
  if(remaining===1){
    const survivor=b.tops.find(t=>t.alive);b.winnerId=survivor.id;
    // The feel test keeps its last top moving until it physically settles.
    const stopped=survivor.settling&&survivor.angularSpeed<.12&&Math.hypot(survivor.vx,survivor.vz)<.08&&Math.abs(survivor.vy)<.08;
    if(!b.settleAll||stopped){
     if(b.settleAll)Object.assign(survivor,{energy:0,angularSpeed:0,vx:0,vz:0,vy:0});
     b.done=true;
    }
   }
 }
 return b;
}

export function launchBattle(players,seed,pulls={},angles){
 const battle=createBattle(players,seed,pulls,angles);
 for(const top of battle.tops){
  // Missing phone input uses the standard launch, without changing measured pulls.
  if(pulls[top.id]==null){top.energy=STANDARD_LAUNCH_ENERGY;top.angularSpeed=spinSpeed(top.energy);}
  const radius=Math.hypot(top.x,top.z),inset=battle.arenaRadius*.55/radius;top.x*=inset;top.z*=inset;top.y=surfaceHeight(top.x,top.z,battle.arenaRadius)+1.3;top.vy=-.5;}
 return battle;
}
