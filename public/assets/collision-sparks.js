import {BOWL_SKIN_OFFSET, RING_OUT_ANGLES, RING_OUT_HALF_WIDTHS, shoulderHeightAtOffset, surfaceHeight, surfaceGradient} from './rail-config.js';

export const SPARK_CAPACITY=24;
export const NEUTRAL_SPARK_COLOR='#dfe8ee';
export function sparkColorsForEvent(event,players){
  const color=id=>id==null?NEUTRAL_SPARK_COLOR:(players.find(player=>player.id===id)?.color||NEUTRAL_SPARK_COLOR);
  return event.type==='hit'?[color(event.aId),color(event.bId)]:[color(event.id),color(event.id)];
}
export const SPARK_CLEARANCE=.026;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

export function sparkFloorHeight(x,z,r,pocketFloor=.85){
  const radius=Math.hypot(x,z),offset=radius-r;
  if(offset<=0)return surfaceHeight(x,z,r)+BOWL_SKIN_OFFSET;
  const shoulder=shoulderHeightAtOffset(offset);
  if(shoulder===null)return null;
  const angle=Math.atan2(z,x),index=RING_OUT_ANGLES.findIndex((a,i)=>Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a)))<RING_OUT_HALF_WIDTHS[i]);
  if(index<0)return shoulder;
  // Match the molded catch profile, including its raised side seams, rather than an infinite flat floor.
  const profile=[[0,1.3+BOWL_SKIN_OFFSET],[.002,1.3+BOWL_SKIN_OFFSET],[.005,pocketFloor],[.60,pocketFloor],[.69,pocketFloor+.025],[.81,pocketFloor+.075],[.88,shoulderHeightAtOffset(.88)],[.97,shoulderHeightAtOffset(.97)]];
  const row=profile.findIndex(([end])=>end>=offset),[start,y0]=profile[row-1],[end,y1]=profile[row];
  const floor=y0+(y1-y0)*(offset-start)/(end-start);
  const distance=Math.abs(Math.atan2(Math.sin(angle-RING_OUT_ANGLES[index]),Math.cos(angle-RING_OUT_ANGLES[index])))/RING_OUT_HALF_WIDTHS[index];
  const t=clamp((distance-.68)/.32,0,1),blend=t*t*(3-2*t);
  return floor+(shoulder-floor)*blend;
}

export function createSparkBurst(){
  return {age:0,count:0,duration:0,particles:Array.from({length:SPARK_CAPACITY},()=>({}))};
}

export function resetSparkBurst(burst,event,origin,strength){
  let seed=2166136261;
  for(const c of String(event.eventId??`${event.type}:${event.x}:${event.z}:${event.power}`))seed=Math.imul(seed^c.charCodeAt(0),16777619);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const nx=Number.isFinite(event.nx)?event.nx:0,nz=Number.isFinite(event.nz)?event.nz:0;
  const normal=Math.hypot(nx,nz)>1e-4?Math.atan2(nz,nx):random()*Math.PI*2;
  burst.age=0;burst.duration=.78+strength*.40;burst.count=Math.round(10+strength*14);
  for(let i=0;i<SPARK_CAPACITY;i++){
    const p=burst.particles[i],side=i%2?1:-1;
    const angle=normal+(side<0?Math.PI:0)+(random()-.5)*.9+(i%6===0?Math.PI/2:0);
    const speed=(2.4+strength*5.6)*(.58+random()*.42);
    Object.assign(p,{x:origin.x,y:origin.y,z:origin.z,vx:Math.cos(angle)*speed,vy:1.25+random()*1.4+strength*.8,vz:Math.sin(angle)*speed,
      settled:false,life:burst.duration*(.78+random()*.22),bounces:0,active:i<burst.count,color:i%2,ownerId:event.type==='hit'?(i%2?event.bId:event.aId):event.id,width:.7+random()*.55});
  }
  return burst;
}

export function advanceSparkBurst(burst,targetAge,r,pocketFloor=.85){
  const target=clamp(targetAge,burst.age,burst.duration);
  while(burst.age<target-1e-8){
    const dt=Math.min(1/120,target-burst.age),drag=Math.exp(-.65*dt);
    for(let i=0;i<burst.count;i++){
      const p=burst.particles[i];if(!p.active)continue;
      if(burst.age+dt>=p.life){p.active=false;continue;}
      if(p.settled)continue;
      p.vx*=drag;p.vz*=drag;p.vy-=18*dt;
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      const floor=sparkFloorHeight(p.x,p.z,r,pocketFloor);
      if(floor===null||burst.age+dt>=p.life){p.active=false;continue;}
      if(p.y<floor+SPARK_CLEARANCE){
        p.y=floor+SPARK_CLEARANCE;
        const inside=Math.hypot(p.x,p.z)<=r;
        const gradient=inside?surfaceGradient(p.x,p.z,r):{x:((sparkFloorHeight(p.x+.002,p.z,r,pocketFloor)??floor)-(sparkFloorHeight(p.x-.002,p.z,r,pocketFloor)??floor))/.004,z:((sparkFloorHeight(p.x,p.z+.002,r,pocketFloor)??floor)-(sparkFloorHeight(p.x,p.z-.002,r,pocketFloor)??floor))/.004};
        const length=Math.hypot(gradient.x,1,gradient.z),nx=-gradient.x/length,ny=1/length,nz=-gradient.z/length;
        const incoming=p.vx*nx+p.vy*ny+p.vz*nz;
        if(incoming<0){
          const bounce=-incoming*.30;
          p.vx=(p.vx-incoming*nx)*.64+bounce*nx;p.vy=(p.vy-incoming*ny)*.64+bounce*ny;p.vz=(p.vz-incoming*nz)*.64+bounce*nz;
          p.bounces++;
          if(p.bounces>=3||bounce<.28){p.settled=true;p.vx=0;p.vy=0;p.vz=0;p.life=Math.min(p.life,burst.age+.12);}
        }
      }
    }
    burst.age+=dt;
  }
  return burst;
}
